-- Investor updates: recipient lists, update emails, and a record of every delivery.
--
--   recipient_lists          named lists of people an organization sends updates to
--   recipient_list_members   the people on a list (email, name, firm; optionally linked to a pipeline investor)
--   investor_updates         one update email: subject and HTML body; a draft until it's sent
--   update_deliveries        one row per recipient of a sent update: who, and whether Gmail accepted it
--
-- Emails are sent from the browser through the Gmail API with the sender's own Google account,
-- so nothing here holds a Google token. The database only keeps the content and the outcome.
--
-- Access follows the organization roles: everyone in the organization reads; editors and owners
-- write lists, write drafts and send. Once an update starts sending its content is frozen.
-- Editors delete drafts; only owners delete sent updates (and with them, their delivery history).

-------------------------------------------------------------------------------
-- Recipient lists
-------------------------------------------------------------------------------
create table public.recipient_lists (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 80),
  description  text not null default '' check (length(description) <= 500),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index recipient_lists_org_idx on public.recipient_lists (org_id, name);

create trigger recipient_lists_touch before update on public.recipient_lists
  for each row execute function public.touch_updated_at();

create function public.recipient_lists_lock_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'A list cannot be moved to another organization.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger recipient_lists_lock_org before update of org_id on public.recipient_lists
  for each row execute function public.recipient_lists_lock_org();

create table public.recipient_list_members (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.recipient_lists (id) on delete cascade,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  name         text not null default '' check (length(name) <= 200),
  firm         text not null default '' check (length(firm) <= 200),
  -- The pipeline investor this person was picked from, if any. Kept when the investor is removed.
  investor_id  uuid references public.investors (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (list_id, email)
);
create index recipient_list_members_list_idx on public.recipient_list_members (list_id, email);

-- A member always belongs to its list's organization, whatever the client sends; emails are lower-cased.
create function public.recipient_list_members_set_org()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.list_id is distinct from old.list_id then
    raise exception 'A recipient cannot be moved to another list.' using errcode = 'P0001';
  end if;
  select l.org_id into new.org_id from public.recipient_lists l where l.id = new.list_id;
  if new.org_id is null then
    raise exception 'That list does not exist.' using errcode = '23503';
  end if;
  new.email := lower(trim(new.email));
  new.name := trim(new.name);
  new.firm := trim(new.firm);
  return new;
end $$;

create trigger recipient_list_members_set_org before insert or update on public.recipient_list_members
  for each row execute function public.recipient_list_members_set_org();

-------------------------------------------------------------------------------
-- Updates and deliveries
-------------------------------------------------------------------------------
-- status: draft → sending → sent (every recipient accepted), partial (some failed) or failed (none accepted).
-- A partial or failed update can be retried; it goes back to sending while that runs.
create table public.investor_updates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  subject       text not null default '' check (length(subject) <= 300),
  body_html     text not null default '' check (length(body_html) <= 400000),
  status        text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'partial', 'failed')),
  -- The list chosen for the draft; once sent, list_name keeps what it was called.
  list_id       uuid references public.recipient_lists (id) on delete set null,
  list_name     text,
  sender_email  text,
  author_email  text default public.jwt_email(),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index investor_updates_org_idx on public.investor_updates (org_id, created_at desc);

-- Drafts can change freely. Once sending starts, the content, list and sender are fixed;
-- only begin_update_send / finish_update_send move the status.
create function public.investor_updates_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.author_email := nullif(public.jwt_email(), '');
    new.sender_email := null;
    new.list_name := null;
    new.sent_at := null;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.author_email is distinct from old.author_email then
    raise exception 'That part of an update cannot be changed.' using errcode = 'P0001';
  end if;
  if current_setting('venture.update_send', true) is distinct from 'on' then
    -- Deleting a list clears list_id on the updates sent to it (list_name keeps its name).
    if old.status <> 'draft' and new.list_id is null
       and (new.subject, new.body_html, new.status, new.sender_email, new.list_name, new.sent_at)
           is not distinct from (old.subject, old.body_html, old.status, old.sender_email, old.list_name, old.sent_at) then
      return new;
    end if;
    if old.status <> 'draft' then
      raise exception 'This update has already been sent and can''t be changed.' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status or new.sender_email is distinct from old.sender_email
       or new.list_name is distinct from old.list_name or new.sent_at is distinct from old.sent_at then
      raise exception 'Use Send to send an update.' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger investor_updates_guard before insert or update on public.investor_updates
  for each row execute function public.investor_updates_guard();

-- The list on a draft must belong to the same organization.
create function public.investor_updates_check_list()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.list_id is not null and not exists (
       select 1 from public.recipient_lists l where l.id = new.list_id and l.org_id = new.org_id) then
    raise exception 'That list belongs to another organization.' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger investor_updates_check_list before insert or update of list_id on public.investor_updates
  for each row execute function public.investor_updates_check_list();

create table public.update_deliveries (
  id                bigint generated always as identity primary key,
  update_id         uuid not null references public.investor_updates (id) on delete cascade,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  email             text not null,
  name              text not null default '',
  firm              text not null default '',
  status            text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error             text check (length(error) <= 1000),
  gmail_message_id  text check (length(gmail_message_id) <= 200),
  attempts          int not null default 0,
  sent_at           timestamptz,
  updated_at        timestamptz not null default now(),
  unique (update_id, email)
);
create index update_deliveries_update_idx on public.update_deliveries (update_id, email);

-------------------------------------------------------------------------------
-- Sending (the only way to change status and write deliveries)
-------------------------------------------------------------------------------
-- Freezes the draft, records who sends it, and snapshots the list into deliveries (status pending).
-- The browser then sends each email through Gmail and reports back with record_delivery.
-- Calling it again on a partial or failed update re-opens the deliveries that didn't go through.
-- Returns the deliveries still to send.
create function public.begin_update_send(p_update uuid, p_sender text)
returns setof public.update_deliveries
language plpgsql security definer set search_path = ''
as $$
declare
  u public.investor_updates;
  v_list public.recipient_lists;
  v_sender text := lower(trim(coalesce(p_sender, '')));
begin
  select * into u from public.investor_updates where id = p_update for update;
  if u.id is null or not public.can_edit_org(u.org_id) then
    raise exception 'Only editors and owners can send updates.' using errcode = '42501';
  end if;
  if v_sender !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The sending Gmail address is missing.' using errcode = '22023';
  end if;

  perform set_config('venture.update_send', 'on', true);

  if u.status = 'draft' then
    if length(trim(u.subject)) = 0 then
      raise exception 'Add a subject before sending.' using errcode = '22023';
    end if;
    if length(trim(u.body_html)) = 0 then
      raise exception 'Write the update before sending.' using errcode = '22023';
    end if;
    select * into v_list from public.recipient_lists where id = u.list_id and org_id = u.org_id;
    if v_list.id is null then
      raise exception 'Choose who to send the update to.' using errcode = '22023';
    end if;

    insert into public.update_deliveries (update_id, org_id, email, name, firm)
    select u.id, u.org_id, m.email, m.name, m.firm
    from public.recipient_list_members m
    where m.list_id = v_list.id
    order by m.email;
    if not found then
      raise exception 'The list "%" has nobody on it.', v_list.name using errcode = '22023';
    end if;

    update public.investor_updates
       set status = 'sending', sender_email = v_sender, list_name = v_list.name, sent_at = now()
     where id = u.id;
  elsif u.status in ('partial', 'failed', 'sending') then
    -- Retry: the same sender, the same recipients; only those that didn't go through.
    update public.update_deliveries set status = 'pending'
     where update_id = u.id and status = 'failed';
    update public.investor_updates set status = 'sending' where id = u.id;
  else
    raise exception 'This update has already been sent to everyone.' using errcode = 'P0001';
  end if;

  return query select d.* from public.update_deliveries d where d.update_id = u.id and d.status = 'pending' order by d.email;
end $$;

-- The outcome of one email. A delivery that went through stays that way.
create function public.record_delivery(p_delivery bigint, p_ok boolean, p_gmail_message_id text default null, p_error text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  d public.update_deliveries;
begin
  select * into d from public.update_deliveries where id = p_delivery for update;
  if d.id is null or not public.can_edit_org(d.org_id) then
    raise exception 'Only editors and owners can send updates.' using errcode = '42501';
  end if;
  if d.status = 'sent' then
    return;
  end if;
  update public.update_deliveries
     set status = case when p_ok then 'sent' else 'failed' end,
         gmail_message_id = case when p_ok then left(p_gmail_message_id, 200) end,
         error = case when p_ok then null else left(coalesce(nullif(trim(p_error), ''), 'Not sent'), 1000) end,
         attempts = attempts + 1,
         sent_at = case when p_ok then now() end,
         updated_at = now()
   where id = d.id;
end $$;

-- Settles the update's status from its deliveries. Deliveries still pending (the tab was closed
-- mid-send) count as failed so they can be retried.
create function public.finish_update_send(p_update uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  u public.investor_updates;
  v_sent int;
  v_total int;
  v_status text;
begin
  select * into u from public.investor_updates where id = p_update for update;
  if u.id is null or not public.can_edit_org(u.org_id) then
    raise exception 'Only editors and owners can send updates.' using errcode = '42501';
  end if;
  if u.status = 'draft' then
    return u.status;
  end if;

  update public.update_deliveries
     set status = 'failed', error = coalesce(error, 'Sending was interrupted'), updated_at = now()
   where update_id = u.id and status = 'pending';

  select count(*) filter (where status = 'sent'), count(*) into v_sent, v_total
  from public.update_deliveries where update_id = u.id;
  v_status := case when v_sent = v_total then 'sent' when v_sent = 0 then 'failed' else 'partial' end;

  perform set_config('venture.update_send', 'on', true);
  update public.investor_updates set status = v_status where id = u.id;
  return v_status;
end $$;

-------------------------------------------------------------------------------
-- Grants and row level security
-------------------------------------------------------------------------------
revoke all on function public.begin_update_send(uuid, text), public.record_delivery(bigint, boolean, text, text),
  public.finish_update_send(uuid) from public, anon;
grant execute on function public.begin_update_send(uuid, text), public.record_delivery(bigint, boolean, text, text),
  public.finish_update_send(uuid) to authenticated;

revoke all on public.recipient_lists, public.recipient_list_members, public.investor_updates, public.update_deliveries from anon;

alter table public.recipient_lists        enable row level security;
alter table public.recipient_list_members enable row level security;
alter table public.investor_updates       enable row level security;
alter table public.update_deliveries      enable row level security;

create policy "lists: members read"     on public.recipient_lists for select to authenticated using (public.is_org_member(org_id));
create policy "lists: editors insert"   on public.recipient_lists for insert to authenticated with check (public.can_edit_org(org_id));
create policy "lists: editors update"   on public.recipient_lists for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "lists: editors delete"   on public.recipient_lists for delete to authenticated using (public.can_edit_org(org_id));

create policy "list members: members read"   on public.recipient_list_members for select to authenticated using (public.is_org_member(org_id));
create policy "list members: editors insert" on public.recipient_list_members for insert to authenticated with check (public.can_edit_org(org_id));
create policy "list members: editors update" on public.recipient_list_members for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "list members: editors delete" on public.recipient_list_members for delete to authenticated using (public.can_edit_org(org_id));

create policy "updates: members read"    on public.investor_updates for select to authenticated using (public.is_org_member(org_id));
create policy "updates: editors insert"  on public.investor_updates for insert to authenticated with check (public.can_edit_org(org_id));
create policy "updates: editors update"  on public.investor_updates for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "updates: editors delete drafts, owners delete any" on public.investor_updates for delete to authenticated
  using ((status = 'draft' and public.can_edit_org(org_id)) or public.is_org_owner(org_id));

-- Deliveries are written only by the sending functions above.
create policy "deliveries: members read" on public.update_deliveries for select to authenticated using (public.is_org_member(org_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.investor_updates, public.update_deliveries;
  end if;
end $$;
