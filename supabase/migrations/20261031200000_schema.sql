-- Venture: the complete database schema.
--
-- Run once on a new, empty Supabase project (SQL Editor: paste this file's contents and run).
-- It replaces the earlier step-by-step migrations; a project that already ran those has
-- exactly this schema and doesn't need to run it.
--
-- Data model
--   organizations         a company that is raising
--   organization_members  who has access, by email, with a role: owner, editor or viewer
--   rounds                fundraising rounds of an organization (Seed, Series A, ...)
--   investors             the pipeline: every investor belongs to one round
--   investor_activity     dated comments, plus stage changes and other history
--   my_investors          each user's private investor database
--   my_investor_comments  dated comments in that private database
-- Users themselves are Supabase's auth.users. Organization data is linked to people by email
-- (so access can be granted before someone first signs in); the private database by user id.
--
-- Every table has row level security. Roles per organization: owner (everything, including
-- members and deleting the organization), editor (read and change pipeline data), viewer (read).

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create function public.jwt_email()
returns text language sql stable set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create function public.stage_label(s text)
returns text language sql immutable set search_path = ''
as $$
  select case s
    when 'target' then 'Target' when 'contacted' then 'Contacted'
    when 'meeting' then 'First meeting' when 'diligence' then 'Diligence'
    when 'ic' then 'Partner / IC' when 'termsheet' then 'Term sheet'
    when 'committed' then 'Committed' when 'closed' then 'Closed'
    when 'passed' then 'Passed' else s end
$$;

-- Contacts are a JSON list on the investor:
-- [{"name": "...", "role": "...", "email": "...", "linkedin": "..."}, ...], at most 20.
-- Every key is optional text; a contact needs at least a name, email or LinkedIn page.
create function public.valid_contacts(c jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select jsonb_typeof(c) = 'array'
     and jsonb_array_length(c) <= 20
     and not exists (
       select 1
       from jsonb_array_elements(c) e
       where jsonb_typeof(e) <> 'object'
          or exists (select 1 from jsonb_each(e) kv
                     where kv.key not in ('name', 'role', 'email', 'linkedin') or jsonb_typeof(kv.value) <> 'string')
          or length(coalesce(e ->> 'name', '')) > 200
          or length(coalesce(e ->> 'role', '')) > 100
          or length(coalesce(e ->> 'linkedin', '')) > 500
          or (coalesce(e ->> 'email', '') <> '' and (e ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
          or (trim(coalesce(e ->> 'name', '')) = '' and trim(coalesce(e ->> 'email', '')) = ''
              and trim(coalesce(e ->> 'linkedin', '')) = ''))
$$;

-- The same person is recognised by email, otherwise by name, otherwise by LinkedIn page.
create function public.contact_key(c jsonb)
returns text language sql immutable set search_path = ''
as $$
  select coalesce(nullif(lower(trim(c ->> 'email')), ''),
                  'name:' || nullif(lower(trim(c ->> 'name')), ''),
                  'li:' || nullif(lower(trim(c ->> 'linkedin')), ''))
$$;

-- base plus the contacts in extra that aren't in it yet (same person = same contact_key), capped at 20.
create function public.merge_contacts(base jsonb, extra jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb)
  from (
    select c, ord
    from (
      select c, ord, row_number() over (partition by coalesce(public.contact_key(c), 'row:' || ord) order by ord) as nth
      from (
        select b.c, b.ord from jsonb_array_elements(coalesce(base, '[]'::jsonb)) with ordinality as b(c, ord)
        union all
        select x.c, 1000 + x.ord from jsonb_array_elements(coalesce(extra, '[]'::jsonb)) with ordinality as x(c, ord)
      ) everyone
    ) ranked
    where nth = 1
    order by ord
    limit 20
  ) kept
$$;

-------------------------------------------------------------------------------
-- Organizations and members
-------------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.organization_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null check (email = lower(email) and position('@' in email) > 1),
  role        text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  invited_by  text,
  added_at    timestamptz not null default now(),
  primary key (org_id, email)
);
create index organization_members_email_idx on public.organization_members (email);

-- Role of the signed-in user in an organization (null = not a member).
-- security definer so policies can call it without recursing through RLS.
create function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.org_id = p_org and m.email = public.jwt_email()
$$;

create function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.org_role(p_org) is not null $$;

create function public.can_edit_org(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.org_role(p_org) in ('owner', 'editor'), false) $$;

create function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.org_role(p_org) = 'owner', false) $$;

-- Every organization keeps at least one owner. Cascading deletes of the whole org are allowed.
create function public.keep_an_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from public.organization_members m
       where m.org_id = old.org_id and m.role = 'owner' and m.email <> old.email)
  then
    raise exception 'An organization needs at least one owner. Make someone else an owner first.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger organization_members_keep_owner
  before update or delete on public.organization_members
  for each row execute function public.keep_an_owner();

-------------------------------------------------------------------------------
-- Rounds
-------------------------------------------------------------------------------
create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  status      text not null default 'active' check (status in ('active', 'closed')),
  target      numeric(14, 2) not null default 0 check (target >= 0),
  instrument  text not null default '',
  cap         numeric(16, 2) not null default 0 check (cap >= 0),
  close_date  date,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index rounds_org_idx on public.rounds (org_id, created_at);

create trigger rounds_touch before update on public.rounds
  for each row execute function public.touch_updated_at();

-- A round never moves between organizations.
create function public.rounds_lock_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'A round cannot be moved to another organization.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger rounds_lock_org before update of org_id on public.rounds
  for each row execute function public.rounds_lock_org();

-------------------------------------------------------------------------------
-- Investors (the pipeline of one round)
-------------------------------------------------------------------------------
create table public.investors (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  round_id      uuid not null references public.rounds (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  website       text not null default '' check (length(website) <= 500),
  contacts      jsonb not null default '[]'::jsonb constraint investors_contacts_valid check (public.valid_contacts(contacts)),
  type          text not null default 'VC',
  stage         text not null default 'target'
                check (stage in ('target', 'contacted', 'meeting', 'diligence', 'ic',
                                 'termsheet', 'committed', 'closed', 'passed')),
  priority      text not null default 'B' check (priority in ('A', 'B', 'C')),
  mandate       text not null default 'unknown' check (mandate in ('yes', 'open', 'no', 'unknown')),
  check_min     numeric(14, 2) not null default 0 check (check_min >= 0),
  check_max     numeric(14, 2) not null default 0 check (check_max >= 0),
  amount        numeric(14, 2) not null default 0 check (amount >= 0),
  can_lead      boolean not null default false,
  via           text not null default '',
  geo           text not null default '',
  next_step     text not null default '',
  next_date     date,
  last_contact  date,
  notes         text not null default '',
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index investors_org_idx on public.investors (org_id, stage);
create index investors_round_idx on public.investors (round_id, stage);
create index investors_next_date_idx on public.investors (org_id, next_date) where next_date is not null;

create trigger investors_touch before update on public.investors
  for each row execute function public.touch_updated_at();

-- An investor never moves between organizations.
create function public.investors_lock_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'An investor cannot be moved to another organization.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger investors_lock_org before update of org_id on public.investors
  for each row execute function public.investors_lock_org();

-- An investor always belongs to a round of its own organization; org_id follows the round.
create function public.investors_round_org()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  select r.org_id into v_org from public.rounds r where r.id = new.round_id;
  if v_org is null then
    raise exception 'That round does not exist.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and v_org is distinct from old.org_id then
    raise exception 'An investor can only move between rounds of the same organization.' using errcode = 'P0001';
  end if;
  new.org_id := v_org;
  return new;
end $$;

create trigger investors_round_org before insert or update of round_id, org_id on public.investors
  for each row execute function public.investors_round_org();

-------------------------------------------------------------------------------
-- Activity: dated comments, stage changes and other history
-------------------------------------------------------------------------------
-- Comments are rows with kind = 'note'. Their date is the day it happened (a call, a meeting),
-- not when it was typed. Stage changes and other history are written by triggers.
create table public.investor_activity (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  investor_id   uuid not null references public.investors (id) on delete cascade,
  kind          text not null default 'note' check (kind in ('note', 'stage', 'system')),
  body          text not null check (length(trim(body)) > 0)
                constraint investor_activity_body_length check (length(body) <= 10000),
  occurred_on   date not null default current_date
                constraint investor_activity_occurred_on_range check (occurred_on between date '2000-01-01' and date '2100-12-31'),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  author_email  text default public.jwt_email(),
  edited_at     timestamptz
);
create index investor_activity_investor_idx on public.investor_activity (investor_id, created_at desc);
create index investor_activity_org_idx on public.investor_activity (org_id);
create index investor_activity_org_kind_idx on public.investor_activity (org_id, kind, investor_id);

-- Realtime reports edits and deletes with the old row so clients can refresh.
alter table public.investor_activity replica identity full;

-- Activity always belongs to its investor's organization, whatever the client sends.
create function public.activity_set_org()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select i.org_id into new.org_id from public.investors i where i.id = new.investor_id;
  return new;
end $$;

create trigger investor_activity_set_org before insert on public.investor_activity
  for each row execute function public.activity_set_org();

-- The author is always the signed-in user; only a comment's text and date can change.
create function public.activity_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Never trust a client-supplied author. Triggers that log system events run as the
    -- user who caused them, so this also records who moved a stage.
    new.author_email := nullif(public.jwt_email(), '');
    new.edited_at := null;
    return new;
  end if;

  -- UPDATE
  if old.kind <> 'note' then
    raise exception 'Only comments can be edited.' using errcode = 'P0001';
  end if;
  if new.investor_id is distinct from old.investor_id
     or new.org_id is distinct from old.org_id
     or new.kind is distinct from old.kind
     or new.author_email is distinct from old.author_email
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the text and date of a comment can be changed.' using errcode = 'P0001';
  end if;
  if new.body is distinct from old.body or new.occurred_on is distinct from old.occurred_on then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger investor_activity_guard
  before insert or update on public.investor_activity
  for each row execute function public.activity_guard();

-- A dated comment counts as contact with the investor: it moves "last touch" forward.
create function public.comment_touches_investor()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'note' then
    update public.investors i
       set last_contact = greatest(coalesce(i.last_contact, new.occurred_on), new.occurred_on)
     where i.id = new.investor_id
       and (i.last_contact is null or i.last_contact < new.occurred_on);
  end if;
  return new;
end $$;

create trigger investor_activity_touch
  after insert or update of occurred_on on public.investor_activity
  for each row execute function public.comment_touches_investor();

-- New investors and stage moves are logged server-side, so every client gets the same history.
create function public.log_investor_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.investor_activity (org_id, investor_id, kind, body)
    values (new.org_id, new.id, 'system', 'Added to pipeline · ' || public.stage_label(new.stage));
  elsif new.stage is distinct from old.stage then
    insert into public.investor_activity (org_id, investor_id, kind, body)
    values (new.org_id, new.id, 'stage', 'Moved to ' || public.stage_label(new.stage));
  end if;
  return new;
end $$;

create trigger investors_log after insert or update of stage on public.investors
  for each row execute function public.log_investor_change();

-- Per-investor comment count and latest comment date, for the board and table.
-- security_invoker: runs with the caller's rights, so RLS decides which rows are counted.
create view public.investor_comment_stats
with (security_invoker = true) as
select org_id,
       investor_id,
       count(*)::int      as comment_count,
       max(occurred_on)   as last_comment_on
from public.investor_activity
where kind = 'note'
group by org_id, investor_id;

-------------------------------------------------------------------------------
-- Each user's private investor database
-------------------------------------------------------------------------------
create table public.my_investors (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 200),
  type        text not null default 'VC' check (length(type) <= 60),
  website     text not null default '' check (length(website) <= 500),
  contacts    jsonb not null default '[]'::jsonb constraint my_investors_contacts_valid check (public.valid_contacts(contacts)),
  min_check   numeric(14, 2) not null default 0 check (min_check >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index my_investors_owner_idx on public.my_investors (owner_id, name);

create table public.my_investor_comments (
  id           bigint generated always as identity primary key,
  investor_id  uuid not null references public.my_investors (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body         text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  occurred_on  date not null default current_date check (occurred_on between date '2000-01-01' and date '2100-12-31'),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);
create index my_investor_comments_investor_idx on public.my_investor_comments (investor_id, occurred_on desc, created_at desc);

-- Ownership is always the signed-in user, whatever the client sends.
create function public.my_investors_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- App users are always signed in; only maintenance SQL (no user) may set the owner itself.
    new.owner_id := coalesce(auth.uid(), new.owner_id);
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger my_investors_guard before insert or update on public.my_investors
  for each row execute function public.my_investors_guard();

create function public.my_investor_comments_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(auth.uid(), new.owner_id);
    new.edited_at := null;
  else
    if new.investor_id is distinct from old.investor_id then
      raise exception 'A comment cannot be moved to another investor.' using errcode = 'P0001';
    end if;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body or new.occurred_on is distinct from old.occurred_on then
      new.edited_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger my_investor_comments_guard before insert or update on public.my_investor_comments
  for each row execute function public.my_investor_comments_guard();

create view public.my_investor_comment_stats
with (security_invoker = true) as
select investor_id,
       count(*)::int    as comment_count,
       max(occurred_on) as last_comment_on
from public.my_investor_comments
group by investor_id;

-- Adding an investor to a pipeline saves it to the adding user's database (matched by name,
-- ignoring case). If it's already there, missing contacts and a missing website are added; nothing
-- the user entered is overwritten. Editing a pipeline investor's contacts or website does the same
-- for the editor's own database entry, if they have one. Teammates' databases are never touched.
create function public.save_pipeline_investor_to_database()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or length(trim(new.name)) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.contacts is not distinct from old.contacts and new.website is not distinct from old.website then
    return new;
  end if;

  update public.my_investors m
     set contacts = public.merge_contacts(m.contacts, new.contacts),
         website  = case when m.website = '' then left(trim(new.website), 500) else m.website end
   where m.owner_id = v_user and lower(trim(m.name)) = lower(trim(new.name))
     and (public.merge_contacts(m.contacts, new.contacts) <> m.contacts or (m.website = '' and trim(new.website) <> ''));

  if tg_op = 'INSERT' and not exists (
       select 1 from public.my_investors m where m.owner_id = v_user and lower(trim(m.name)) = lower(trim(new.name))) then
    insert into public.my_investors (owner_id, name, type, website, contacts, min_check)
    values (v_user,
            left(trim(new.name), 200),
            left(coalesce(nullif(new.type, ''), 'VC'), 60),
            left(trim(new.website), 500),
            new.contacts,
            greatest(new.check_min, 0));
  end if;
  return new;
end $$;

create trigger investors_save_to_database after insert or update of contacts, website, name on public.investors
  for each row execute function public.save_pipeline_investor_to_database();

-------------------------------------------------------------------------------
-- Creating organizations and rounds (the only way to insert them)
-------------------------------------------------------------------------------
-- The creator becomes the owner; the organization starts with one round.
create function public.create_organization(p_name text, p_round_name text default 'First round')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.jwt_email();
  v_org uuid;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Sign in to create an organization.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the organization a name.' using errcode = '22023';
  end if;

  insert into public.organizations (name, created_by) values (trim(p_name), auth.uid()) returning id into v_org;
  insert into public.organization_members (org_id, email, role, invited_by) values (v_org, v_email, 'owner', v_email);
  insert into public.rounds (org_id, name, created_by)
  values (v_org, coalesce(nullif(trim(p_round_name), ''), 'First round'), auth.uid());
  return v_org;
end $$;

-- With p_copy_from, that round's investors are added to the new one as fresh targets: website,
-- contacts, type, priority, mandate and notes carry over; stage, amounts, next steps and comments don't.
create function public.create_round(p_org uuid, p_name text, p_copy_from uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_round uuid;
begin
  if not public.can_edit_org(p_org) then
    raise exception 'Only editors and owners can create rounds.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Give the round a name.' using errcode = '22023';
  end if;
  if p_copy_from is not null and not exists (
       select 1 from public.rounds r where r.id = p_copy_from and r.org_id = p_org) then
    raise exception 'You can only copy investors from a round in the same organization.' using errcode = '22023';
  end if;

  insert into public.rounds (org_id, name, created_by) values (p_org, trim(p_name), auth.uid()) returning id into v_round;

  if p_copy_from is not null then
    insert into public.investors (org_id, round_id, name, website, contacts, type, priority, mandate,
                                  check_min, check_max, can_lead, via, geo, notes, stage)
    select p_org, v_round, i.name, i.website, i.contacts, i.type, i.priority, i.mandate,
           i.check_min, i.check_max, i.can_lead, i.via, i.geo, i.notes, 'target'
    from public.investors i
    where i.round_id = p_copy_from
    order by i.created_at;
  end if;

  return v_round;
end $$;

-------------------------------------------------------------------------------
-- Grants: nothing for signed-out visitors
-------------------------------------------------------------------------------
revoke all on function public.org_role(uuid), public.is_org_member(uuid), public.can_edit_org(uuid),
  public.is_org_owner(uuid), public.create_organization(text, text), public.create_round(uuid, text, uuid) from public, anon;
grant execute on function public.org_role(uuid), public.is_org_member(uuid), public.can_edit_org(uuid),
  public.is_org_owner(uuid), public.create_organization(text, text), public.create_round(uuid, text, uuid) to authenticated;

revoke all on public.organizations, public.organization_members, public.rounds, public.investors,
  public.investor_activity, public.my_investors, public.my_investor_comments from anon;
revoke all on public.investor_comment_stats, public.my_investor_comment_stats from anon;
grant select on public.investor_comment_stats, public.my_investor_comment_stats to authenticated;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.rounds               enable row level security;
alter table public.investors            enable row level security;
alter table public.investor_activity    enable row level security;
alter table public.my_investors         enable row level security;
alter table public.my_investor_comments enable row level security;

-- Organizations: created only through create_organization().
create policy "orgs: members read"  on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "orgs: owners rename" on public.organizations for update to authenticated using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy "orgs: owners delete" on public.organizations for delete to authenticated using (public.is_org_owner(id));

-- Members: everyone in the org sees the list; owners manage it; anyone can leave.
create policy "members: members read"  on public.organization_members for select to authenticated using (public.is_org_member(org_id));
create policy "members: owners add"    on public.organization_members for insert to authenticated with check (public.is_org_owner(org_id));
create policy "members: owners change" on public.organization_members for update to authenticated using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));
create policy "members: owners remove or self leave" on public.organization_members for delete to authenticated
  using (public.is_org_owner(org_id) or email = public.jwt_email());

-- Rounds: created only through create_round(); deleting one deletes its investors, so owners only.
create policy "rounds: members read"   on public.rounds for select to authenticated using (public.is_org_member(org_id));
create policy "rounds: editors update" on public.rounds for update to authenticated
  using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "rounds: owners delete"  on public.rounds for delete to authenticated using (public.is_org_owner(org_id));

create policy "investors: members read"   on public.investors for select to authenticated using (public.is_org_member(org_id));
create policy "investors: editors insert" on public.investors for insert to authenticated with check (public.can_edit_org(org_id));
create policy "investors: editors update" on public.investors for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "investors: editors delete" on public.investors for delete to authenticated using (public.can_edit_org(org_id));

-- Activity: members read; editors and owners comment (history rows come from triggers);
-- you edit your own comments; the author or an owner deletes one; history can't be deleted.
create policy "activity: members read" on public.investor_activity for select to authenticated using (public.is_org_member(org_id));
create policy "comments: editors add" on public.investor_activity for insert to authenticated
  with check (public.can_edit_org(org_id) and kind = 'note');
create policy "comments: authors edit" on public.investor_activity for update to authenticated
  using (kind = 'note' and author_email = public.jwt_email() and public.can_edit_org(org_id))
  with check (kind = 'note' and author_email = public.jwt_email() and public.can_edit_org(org_id));
create policy "comments: authors or owners delete" on public.investor_activity for delete to authenticated
  using (kind = 'note' and (
    (author_email = public.jwt_email() and public.can_edit_org(org_id))
    or public.is_org_owner(org_id)));

-- The private investor database: only its owner, for everything.
create policy "my investors: owner only" on public.my_investors for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "my investor comments: owner only" on public.my_investor_comments for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.my_investors i where i.id = investor_id and i.owner_id = auth.uid()));

-------------------------------------------------------------------------------
-- Realtime (postgres_changes respects the policies above)
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.organizations, public.organization_members, public.rounds, public.investors, public.investor_activity;
  end if;
end $$;
