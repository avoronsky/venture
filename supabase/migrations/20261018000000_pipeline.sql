-- Mars Rovers raise pipeline: schema, access rules and realtime.
-- Access model: only emails listed in public.members can see anything.
--   owner  – everything, plus managing members
--   editor – read and change pipeline data
--   viewer – read only

-------------------------------------------------------------------------------
-- Members (allowlist)
-------------------------------------------------------------------------------
create table public.members (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  added_at   timestamptz not null default now()
);

-- Role of the signed-in user, looked up by the verified email in their JWT.
-- security definer so policies on members can call it without recursion.
create or replace function public.member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.members m
  where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.member_role() is not null $$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.member_role() in ('owner', 'editor'), false) $$;

revoke all on function public.member_role(), public.is_member(), public.can_edit() from public, anon;
grant execute on function public.member_role(), public.is_member(), public.can_edit() to authenticated;

-------------------------------------------------------------------------------
-- Round (single row)
-------------------------------------------------------------------------------
create table public.fund_round (
  id          boolean primary key default true check (id),
  name        text not null default '',
  target      numeric(14, 2) not null default 0 check (target >= 0),
  instrument  text not null default '',
  cap         numeric(16, 2) not null default 0 check (cap >= 0),
  close_date  date,
  updated_at  timestamptz not null default now()
);
insert into public.fund_round (id) values (true);

-------------------------------------------------------------------------------
-- Investors
-------------------------------------------------------------------------------
create table public.investors (
  id            uuid primary key default gen_random_uuid(),
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
create index investors_stage_idx on public.investors (stage);
create index investors_next_date_idx on public.investors (next_date) where next_date is not null;

-------------------------------------------------------------------------------
-- Activity log
-------------------------------------------------------------------------------
create table public.investor_activity (
  id           bigint generated always as identity primary key,
  investor_id  uuid not null references public.investors (id) on delete cascade,
  kind         text not null default 'note' check (kind in ('note', 'stage', 'system')),
  body         text not null check (length(trim(body)) > 0),
  occurred_on  date not null default current_date,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index investor_activity_investor_idx on public.investor_activity (investor_id, created_at desc);

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
    insert into public.investor_activity (investor_id, kind, body)
    values (new.id, 'system', 'Added to pipeline · ' || public.stage_label(new.stage));
  elsif new.stage is distinct from old.stage then
    insert into public.investor_activity (investor_id, kind, body)
    values (new.id, 'stage', 'Moved to ' || public.stage_label(new.stage));
  end if;
  return new;
end $$;

create trigger investors_log after insert or update of stage on public.investors
  for each row execute function public.log_investor_change();

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.members           enable row level security;
alter table public.fund_round        enable row level security;
alter table public.investors         enable row level security;
alter table public.investor_activity enable row level security;

create policy "members: members read"   on public.members for select to authenticated using (public.is_member());
create policy "members: owner inserts"  on public.members for insert to authenticated with check (public.member_role() = 'owner');
create policy "members: owner updates"  on public.members for update to authenticated using (public.member_role() = 'owner') with check (public.member_role() = 'owner');
create policy "members: owner deletes"  on public.members for delete to authenticated using (public.member_role() = 'owner');

create policy "round: members read"     on public.fund_round for select to authenticated using (public.is_member());
create policy "round: editors update"   on public.fund_round for update to authenticated using (public.can_edit()) with check (public.can_edit());

create policy "investors: members read"   on public.investors for select to authenticated using (public.is_member());
create policy "investors: editors insert" on public.investors for insert to authenticated with check (public.can_edit());
create policy "investors: editors update" on public.investors for update to authenticated using (public.can_edit()) with check (public.can_edit());
create policy "investors: editors delete" on public.investors for delete to authenticated using (public.can_edit());

create policy "activity: members read"   on public.investor_activity for select to authenticated using (public.is_member());
create policy "activity: editors insert" on public.investor_activity for insert to authenticated with check (public.can_edit());
create policy "activity: editors delete" on public.investor_activity for delete to authenticated using (public.can_edit());

revoke all on public.members, public.fund_round, public.investors, public.investor_activity from anon;

-------------------------------------------------------------------------------
-- Realtime (postgres_changes respects the policies above)
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.investors, public.investor_activity, public.fund_round;
  end if;
end $$;
