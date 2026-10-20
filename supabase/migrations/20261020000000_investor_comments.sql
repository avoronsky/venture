-- Dated comments on investors.
--
-- Comments are rows in investor_activity with kind = 'note'. This adds:
--   * who wrote each entry (author_email) and when a comment was last edited (edited_at)
--   * editing your own comments (text and date only)
--   * deleting comments: the author, or an owner of the organization
--   * stage changes and other system history can no longer be deleted by hand
--   * a new comment moves the investor's "last touch" date forward automatically
--
-- Safe to run on a database that already has 20261018000000_pipeline.sql applied.

alter table public.investor_activity
  add column if not exists author_email text default public.jwt_email(),
  add column if not exists edited_at timestamptz;

-- A comment's date is the day it happened (a call, a meeting), not when it was typed.
-- Keep it within a sane range; the app defaults it to today.
alter table public.investor_activity
  drop constraint if exists investor_activity_occurred_on_range,
  add constraint investor_activity_occurred_on_range
    check (occurred_on between date '2000-01-01' and date '2100-12-31');

alter table public.investor_activity
  drop constraint if exists investor_activity_body_length,
  add constraint investor_activity_body_length check (length(body) <= 10000);

create index if not exists investor_activity_org_kind_idx
  on public.investor_activity (org_id, kind, investor_id);

-------------------------------------------------------------------------------
-- Comments: author is always the signed-in user; only text and date can change
-------------------------------------------------------------------------------
create or replace function public.activity_guard()
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

drop trigger if exists investor_activity_guard on public.investor_activity;
create trigger investor_activity_guard
  before insert or update on public.investor_activity
  for each row execute function public.activity_guard();

-- A dated comment counts as contact with the investor.
create or replace function public.comment_touches_investor()
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

drop trigger if exists investor_activity_touch on public.investor_activity;
create trigger investor_activity_touch
  after insert or update of occurred_on on public.investor_activity
  for each row execute function public.comment_touches_investor();

-------------------------------------------------------------------------------
-- Access rules for comments
-------------------------------------------------------------------------------
drop policy if exists "activity: editors insert" on public.investor_activity;
drop policy if exists "activity: editors delete" on public.investor_activity;
drop policy if exists "comments: editors add" on public.investor_activity;
drop policy if exists "comments: authors edit" on public.investor_activity;
drop policy if exists "comments: authors or owners delete" on public.investor_activity;

-- Editors and owners can add comments. System rows are written by triggers, which bypass RLS.
create policy "comments: editors add" on public.investor_activity for insert to authenticated
  with check (public.can_edit_org(org_id) and kind = 'note');

-- You can edit your own comments while you can still edit the organization's pipeline.
create policy "comments: authors edit" on public.investor_activity for update to authenticated
  using (kind = 'note' and author_email = public.jwt_email() and public.can_edit_org(org_id))
  with check (kind = 'note' and author_email = public.jwt_email() and public.can_edit_org(org_id));

-- The author or an owner can delete a comment. Stage changes and other history stay.
create policy "comments: authors or owners delete" on public.investor_activity for delete to authenticated
  using (kind = 'note' and (
    (author_email = public.jwt_email() and public.can_edit_org(org_id))
    or public.is_org_owner(org_id)));

-- Realtime should report edits and deletes with the old row so clients can refresh.
alter table public.investor_activity replica identity full;

-------------------------------------------------------------------------------
-- Per-investor comment counts for the board and table
-- security_invoker: the view runs with the caller's rights, so RLS on
-- investor_activity still decides which rows are counted.
-------------------------------------------------------------------------------
create or replace view public.investor_comment_stats
with (security_invoker = true) as
select org_id,
       investor_id,
       count(*)::int      as comment_count,
       max(occurred_on)   as last_comment_on
from public.investor_activity
where kind = 'note'
group by org_id, investor_id;

revoke all on public.investor_comment_stats from anon;
grant select on public.investor_comment_stats to authenticated;
