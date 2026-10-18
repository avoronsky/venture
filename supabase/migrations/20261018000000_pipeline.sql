-- Mars Rovers raise pipeline: multi-organization schema, access rules and realtime.
--
-- Access model
--   * Any signed-in user can create organizations (the company they are raising for).
--   * A new user belongs to no organization until they create one or someone adds their email.
--   * Membership is per organization and keyed by the member's verified email, so an owner can
--     add people before they have ever signed in (email link or Google).
--   * Roles per organization: owner (everything, incl. members and deleting the org),
--     editor (read + change pipeline data), viewer (read only).

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create or replace function public.jwt_email()
returns text language sql stable set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

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
create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.org_id = p_org and m.email = public.jwt_email()
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.org_role(p_org) is not null $$;

create or replace function public.can_edit_org(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.org_role(p_org) in ('owner', 'editor'), false) $$;

create or replace function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.org_role(p_org) = 'owner', false) $$;

-- Every organization keeps at least one owner. Cascading deletes of the whole org are allowed.
create or replace function public.keep_an_owner()
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
-- Round (one per organization)
-------------------------------------------------------------------------------
create table public.fund_round (
  org_id      uuid primary key references public.organizations (id) on delete cascade,
  name        text not null default '',
  target      numeric(14, 2) not null default 0 check (target >= 0),
  instrument  text not null default '',
  cap         numeric(16, 2) not null default 0 check (cap >= 0),
  close_date  date,
  updated_at  timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Investors
-------------------------------------------------------------------------------
create table public.investors (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  partner       text not null default '',
  email         text not null default '',
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
create index investors_next_date_idx on public.investors (org_id, next_date) where next_date is not null;

-------------------------------------------------------------------------------
-- Activity log
-------------------------------------------------------------------------------
create table public.investor_activity (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  investor_id  uuid not null references public.investors (id) on delete cascade,
  kind         text not null default 'note' check (kind in ('note', 'stage', 'system')),
  body         text not null check (length(trim(body)) > 0),
  occurred_on  date not null default current_date,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index investor_activity_investor_idx on public.investor_activity (investor_id, created_at desc);
create index investor_activity_org_idx on public.investor_activity (org_id);

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger investors_touch before update on public.investors
  for each row execute function public.touch_updated_at();
create trigger fund_round_touch before update on public.fund_round
  for each row execute function public.touch_updated_at();

-- An investor never moves between organizations.
create or replace function public.investors_lock_org()
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

-- Activity always belongs to its investor's organization, whatever the client sends.
create or replace function public.activity_set_org()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select i.org_id into new.org_id from public.investors i where i.id = new.investor_id;
  return new;
end $$;

create trigger investor_activity_set_org before insert on public.investor_activity
  for each row execute function public.activity_set_org();

create or replace function public.stage_label(s text)
returns text language sql immutable set search_path = ''
as $$
  select case s
    when 'target' then 'Target' when 'contacted' then 'Contacted'
    when 'meeting' then 'First meeting' when 'diligence' then 'Diligence'
    when 'ic' then 'Partner / IC' when 'termsheet' then 'Term sheet'
    when 'committed' then 'Committed' when 'closed' then 'Closed'
    when 'passed' then 'Passed' else s end
$$;

-- Log creation and stage moves server-side, so every client gets the same history.
create or replace function public.log_investor_change()
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

-------------------------------------------------------------------------------
-- Creating an organization (the creator becomes its owner)
-------------------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
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
  insert into public.fund_round (org_id) values (v_org);
  return v_org;
end $$;

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------
revoke all on function public.org_role(uuid), public.is_org_member(uuid), public.can_edit_org(uuid),
  public.is_org_owner(uuid), public.create_organization(text) from public, anon;
grant execute on function public.org_role(uuid), public.is_org_member(uuid), public.can_edit_org(uuid),
  public.is_org_owner(uuid), public.create_organization(text) to authenticated;

revoke all on public.organizations, public.organization_members, public.fund_round,
  public.investors, public.investor_activity from anon;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.fund_round           enable row level security;
alter table public.investors            enable row level security;
alter table public.investor_activity    enable row level security;

-- Organizations: created only through create_organization().
create policy "orgs: members read"    on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "orgs: owners rename"   on public.organizations for update to authenticated using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy "orgs: owners delete"   on public.organizations for delete to authenticated using (public.is_org_owner(id));

-- Members: everyone in the org sees the list; owners manage it; anyone can leave.
create policy "members: members read"  on public.organization_members for select to authenticated using (public.is_org_member(org_id));
create policy "members: owners add"    on public.organization_members for insert to authenticated with check (public.is_org_owner(org_id));
create policy "members: owners change" on public.organization_members for update to authenticated using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));
create policy "members: owners remove or self leave" on public.organization_members for delete to authenticated
  using (public.is_org_owner(org_id) or email = public.jwt_email());

create policy "round: members read"    on public.fund_round for select to authenticated using (public.is_org_member(org_id));
create policy "round: editors update"  on public.fund_round for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));

create policy "investors: members read"   on public.investors for select to authenticated using (public.is_org_member(org_id));
create policy "investors: editors insert" on public.investors for insert to authenticated with check (public.can_edit_org(org_id));
create policy "investors: editors update" on public.investors for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "investors: editors delete" on public.investors for delete to authenticated using (public.can_edit_org(org_id));

create policy "activity: members read"   on public.investor_activity for select to authenticated using (public.is_org_member(org_id));
create policy "activity: editors insert" on public.investor_activity for insert to authenticated with check (public.can_edit_org(org_id));
create policy "activity: editors delete" on public.investor_activity for delete to authenticated using (public.can_edit_org(org_id));

-------------------------------------------------------------------------------
-- Realtime (postgres_changes respects the policies above)
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.investors, public.investor_activity, public.fund_round, public.organization_members, public.organizations;
  end if;
end $$;
