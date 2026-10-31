-- Several contacts per investor, each with a name, role, email and LinkedIn page.
--
-- Contacts are stored as a JSON list on the investor row (pipeline investors and the private
-- investor database), so they follow the investor's access rules, realtime updates and round
-- copies with nothing extra to secure. The existing single contact (partner / email / linkedin,
-- contact_name / contact_email / contact_linkedin) becomes the first contact, then those columns
-- are dropped.
-- Run after 20261031000000_websites_and_linkedin.sql. Safe to run again.

-------------------------------------------------------------------------------
-- What a valid contact list looks like
-------------------------------------------------------------------------------
-- [{"name": "...", "role": "...", "email": "...", "linkedin": "..."}, ...], at most 20 contacts.
-- Every key is optional text; a contact needs at least a name, email or LinkedIn page.
create or replace function public.valid_contacts(c jsonb)
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

-- One contact object from loose values, or null when all of them are blank. Malformed emails are dropped.
create or replace function public.make_contact(p_name text, p_email text, p_linkedin text)
returns jsonb language sql immutable set search_path = ''
as $$
  select case
    when trim(coalesce(p_name, '')) = '' and trim(coalesce(p_email, '')) = '' and trim(coalesce(p_linkedin, '')) = '' then null
    else jsonb_strip_nulls(jsonb_build_object(
      'name',     nullif(left(trim(coalesce(p_name, '')), 200), ''),
      'email',    case when trim(coalesce(p_email, '')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then trim(p_email) end,
      'linkedin', nullif(left(trim(coalesce(p_linkedin, '')), 500), '')))
  end
$$;

-- The same person is recognised by email, otherwise by name, otherwise by LinkedIn page.
create or replace function public.contact_key(c jsonb)
returns text language sql immutable set search_path = ''
as $$
  select coalesce(nullif(lower(trim(c ->> 'email')), ''),
                  'name:' || nullif(lower(trim(c ->> 'name')), ''),
                  'li:' || nullif(lower(trim(c ->> 'linkedin')), ''))
$$;

-- base plus the contacts in extra that aren't in it yet (same person = same contact_key), capped at 20.
create or replace function public.merge_contacts(base jsonb, extra jsonb)
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
-- New columns, filled from the single contact, then the old columns go
-------------------------------------------------------------------------------
alter table public.investors    add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table public.my_investors add column if not exists contacts jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'investors' and column_name = 'partner') then
    execute $q$
      update public.investors
         set contacts = jsonb_build_array(public.make_contact(partner, email, linkedin))
       where contacts = '[]'::jsonb and public.make_contact(partner, email, linkedin) is not null
    $q$;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'my_investors' and column_name = 'contact_name') then
    execute $q$
      update public.my_investors
         set contacts = jsonb_build_array(public.make_contact(contact_name, contact_email, contact_linkedin))
       where contacts = '[]'::jsonb and public.make_contact(contact_name, contact_email, contact_linkedin) is not null
    $q$;
  end if;
end $$;

alter table public.investors    drop constraint if exists investors_contacts_valid;
alter table public.investors    add constraint investors_contacts_valid check (public.valid_contacts(contacts));
alter table public.my_investors drop constraint if exists my_investors_contacts_valid;
alter table public.my_investors add constraint my_investors_contacts_valid check (public.valid_contacts(contacts));

alter table public.investors    drop column if exists partner, drop column if exists email, drop column if exists linkedin;
alter table public.my_investors drop column if exists contact_name, drop column if exists contact_email, drop column if exists contact_linkedin;

-------------------------------------------------------------------------------
-- Pipeline → your investor database, now with every contact
-------------------------------------------------------------------------------
-- Adding an investor to a pipeline saves it to the adding user's database (matched by name,
-- ignoring case). If it's already there, missing contacts and a missing website are added; nothing
-- you entered is overwritten. Editing a pipeline investor's contacts or website does the same for
-- the editor's own database entry, if they have one. Teammates' databases are never touched.
create or replace function public.save_pipeline_investor_to_database()
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

drop trigger if exists investors_save_to_database on public.investors;
create trigger investors_save_to_database after insert or update of contacts, website, name on public.investors
  for each row execute function public.save_pipeline_investor_to_database();

-------------------------------------------------------------------------------
-- A new round copied from another one keeps every contact
-------------------------------------------------------------------------------
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

revoke all on function public.create_round(uuid, text, uuid) from public, anon;
grant execute on function public.create_round(uuid, text, uuid) to authenticated;
