-- Multiple fundraising rounds per organization, each with its own pipeline.
--
-- Before: one fund_round row per organization; investors belonged to the organization.
-- After:  an organization has any number of rounds; every investor belongs to exactly one round.
--
-- Existing data is kept: each organization's current round settings become its first round,
-- and all of its investors (with their comments and history) move into that round.
-- Run after 20261018000000_pipeline.sql and 20261020000000_investor_comments.sql.

-------------------------------------------------------------------------------
-- Rounds
-------------------------------------------------------------------------------
create table if not exists public.rounds (
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
create index if not exists rounds_org_idx on public.rounds (org_id, created_at);

drop trigger if exists rounds_touch on public.rounds;
create trigger rounds_touch before update on public.rounds
  for each row execute function public.touch_updated_at();

-- A round never moves between organizations.
create or replace function public.rounds_lock_org()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'A round cannot be moved to another organization.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists rounds_lock_org on public.rounds;
create trigger rounds_lock_org before update of org_id on public.rounds
  for each row execute function public.rounds_lock_org();

-------------------------------------------------------------------------------
-- Move existing data into rounds (only runs while the old table exists)
-------------------------------------------------------------------------------
alter table public.investors add column if not exists round_id uuid references public.rounds (id) on delete cascade;

do $$
begin
  if to_regclass('public.fund_round') is not null then
    -- Each organization's current round settings become its first round.
    insert into public.rounds (org_id, name, target, instrument, cap, close_date, created_at)
    select f.org_id,
           coalesce(nullif(trim(f.name), ''), 'First round'),
           f.target, f.instrument, f.cap, f.close_date, o.created_at
    from public.fund_round f
    join public.organizations o on o.id = f.org_id
    where not exists (select 1 from public.rounds r where r.org_id = f.org_id);
  end if;

  -- Any organization that has investors but somehow no round gets one.
  insert into public.rounds (org_id, name)
  select distinct i.org_id, 'First round'
  from public.investors i
  where i.round_id is null
    and not exists (select 1 from public.rounds r where r.org_id = i.org_id);

  -- Existing investors join their organization's first round.
  update public.investors i
     set round_id = (select r.id from public.rounds r where r.org_id = i.org_id order by r.created_at, r.id limit 1)
   where i.round_id is null;
end $$;

alter table public.investors alter column round_id set not null;
create index if not exists investors_round_idx on public.investors (round_id, stage);

drop table if exists public.fund_round;

-- An investor always belongs to a round of its own organization; org_id follows the round.
create or replace function public.investors_round_org()
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

drop trigger if exists investors_round_org on public.investors;
create trigger investors_round_org before insert or update of round_id, org_id on public.investors
  for each row execute function public.investors_round_org();

-------------------------------------------------------------------------------
-- Creating organizations and rounds
-------------------------------------------------------------------------------
drop function if exists public.create_organization(text);

create or replace function public.create_organization(p_name text, p_round_name text default 'First round')
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

-- Creates a round. With p_copy_from, the investors of that round are added to the new one as
-- fresh targets: contact details, type, priority, mandate and notes carry over; stage, amounts,
-- next steps and comments do not.
create or replace function public.create_round(p_org uuid, p_name text, p_copy_from uuid default null)
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
    insert into public.investors (org_id, round_id, name, partner, email, type, priority, mandate,
                                  check_min, check_max, can_lead, via, geo, notes, stage)
    select p_org, v_round, i.name, i.partner, i.email, i.type, i.priority, i.mandate,
           i.check_min, i.check_max, i.can_lead, i.via, i.geo, i.notes, 'target'
    from public.investors i
    where i.round_id = p_copy_from
    order by i.created_at;
  end if;

  return v_round;
end $$;

revoke all on function public.create_organization(text, text), public.create_round(uuid, text, uuid) from public, anon;
grant execute on function public.create_organization(text, text), public.create_round(uuid, text, uuid) to authenticated;
revoke all on public.rounds from anon;

-------------------------------------------------------------------------------
-- Access rules for rounds
-------------------------------------------------------------------------------
alter table public.rounds enable row level security;

drop policy if exists "rounds: members read" on public.rounds;
drop policy if exists "rounds: editors update" on public.rounds;
drop policy if exists "rounds: owners delete" on public.rounds;

-- Rounds are created through create_round() so copying stays atomic.
create policy "rounds: members read"   on public.rounds for select to authenticated using (public.is_org_member(org_id));
create policy "rounds: editors update" on public.rounds for update to authenticated
  using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
-- Deleting a round deletes its investors and their comments, so only owners can do it.
create policy "rounds: owners delete"  on public.rounds for delete to authenticated using (public.is_org_owner(org_id));

-------------------------------------------------------------------------------
-- Realtime
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds') then
    alter publication supabase_realtime add table public.rounds;
  end if;
end $$;
