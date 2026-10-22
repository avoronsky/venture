-- A private investor database for every user.
--
-- Separate from organizations and rounds: each signed-in user keeps their own list of investors
-- (name, type, website, contact person and email, minimum check) with dated comments.
-- Nobody else can see or change it, including teammates and organization owners.
-- Run after the earlier migrations. Safe to run again.

create table if not exists public.my_investors (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 200),
  type           text not null default 'VC' check (length(type) <= 60),
  website        text not null default '' check (length(website) <= 500),
  contact_name   text not null default '' check (length(contact_name) <= 200),
  contact_email  text not null default '' check (contact_email = '' or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  min_check      numeric(14, 2) not null default 0 check (min_check >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists my_investors_owner_idx on public.my_investors (owner_id, name);

create table if not exists public.my_investor_comments (
  id           bigint generated always as identity primary key,
  investor_id  uuid not null references public.my_investors (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body         text not null check (length(trim(body)) > 0 and length(body) <= 10000),
  occurred_on  date not null default current_date check (occurred_on between date '2000-01-01' and date '2100-12-31'),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);
create index if not exists my_investor_comments_investor_idx on public.my_investor_comments (investor_id, occurred_on desc, created_at desc);

-------------------------------------------------------------------------------
-- Ownership is always the signed-in user, whatever the client sends
-------------------------------------------------------------------------------
create or replace function public.my_investors_guard()
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

drop trigger if exists my_investors_guard on public.my_investors;
create trigger my_investors_guard before insert or update on public.my_investors
  for each row execute function public.my_investors_guard();

create or replace function public.my_investor_comments_guard()
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

drop trigger if exists my_investor_comments_guard on public.my_investor_comments;
create trigger my_investor_comments_guard before insert or update on public.my_investor_comments
  for each row execute function public.my_investor_comments_guard();

-------------------------------------------------------------------------------
-- Access: only the owner, for everything
-------------------------------------------------------------------------------
alter table public.my_investors enable row level security;
alter table public.my_investor_comments enable row level security;
revoke all on public.my_investors, public.my_investor_comments from anon;

drop policy if exists "my investors: owner only" on public.my_investors;
create policy "my investors: owner only" on public.my_investors for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "my investor comments: owner only" on public.my_investor_comments;
create policy "my investor comments: owner only" on public.my_investor_comments for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.my_investors i where i.id = investor_id and i.owner_id = auth.uid()));

-------------------------------------------------------------------------------
-- Comment count and latest comment date per investor (runs with the caller's rights)
-------------------------------------------------------------------------------
create or replace view public.my_investor_comment_stats
with (security_invoker = true) as
select investor_id,
       count(*)::int    as comment_count,
       max(occurred_on) as last_comment_on
from public.my_investor_comments
group by investor_id;

revoke all on public.my_investor_comment_stats from anon;
grant select on public.my_investor_comment_stats to authenticated;

-------------------------------------------------------------------------------
-- Adding an investor to a pipeline also saves it to the adding user's database
-------------------------------------------------------------------------------
-- Matched by name (case-insensitive) so the same fund isn't saved twice. Only the person who
-- added the investor gets the entry; teammates' databases are untouched. Values that don't fit
-- the database's rules (e.g. a malformed email) are left blank rather than blocking the pipeline.
create or replace function public.save_pipeline_investor_to_database()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or length(trim(new.name)) = 0 then
    return new;
  end if;
  if exists (select 1 from public.my_investors m
             where m.owner_id = v_user and lower(trim(m.name)) = lower(trim(new.name))) then
    return new;
  end if;
  insert into public.my_investors (owner_id, name, type, contact_name, contact_email, min_check)
  values (v_user,
          left(trim(new.name), 200),
          left(coalesce(nullif(new.type, ''), 'VC'), 60),
          left(new.partner, 200),
          case when new.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then new.email else '' end,
          greatest(new.check_min, 0));
  return new;
end $$;

drop trigger if exists investors_save_to_database on public.investors;
create trigger investors_save_to_database after insert on public.investors
  for each row execute function public.save_pipeline_investor_to_database();

-- One-time backfill: investors people already added to pipelines go into their databases.
insert into public.my_investors (owner_id, name, type, contact_name, contact_email, min_check, created_at)
select distinct on (i.created_by, lower(trim(i.name)))
       i.created_by,
       left(trim(i.name), 200),
       left(coalesce(nullif(i.type, ''), 'VC'), 60),
       left(i.partner, 200),
       case when i.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then i.email else '' end,
       greatest(i.check_min, 0),
       i.created_at
from public.investors i
join auth.users u on u.id = i.created_by
where length(trim(i.name)) > 0
  and not exists (select 1 from public.my_investors m
                  where m.owner_id = i.created_by and lower(trim(m.name)) = lower(trim(i.name)))
order by i.created_by, lower(trim(i.name)), i.updated_at desc;
