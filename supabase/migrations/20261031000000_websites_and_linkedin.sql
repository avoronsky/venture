-- Website for every pipeline investor, and a LinkedIn page for every contact person
-- (pipeline investors and the private investor database). Contacts already have an email.
-- Run after the earlier migrations. Safe to run again.

alter table public.investors
  add column if not exists website  text not null default '' check (length(website) <= 500),
  add column if not exists linkedin text not null default '' check (length(linkedin) <= 500);

alter table public.my_investors
  add column if not exists contact_linkedin text not null default '' check (length(contact_linkedin) <= 500);

-------------------------------------------------------------------------------
-- Adding to a pipeline saves website and LinkedIn to the adder's database too
-------------------------------------------------------------------------------
-- Same rules as before: matched by name (case-insensitive), only the adding user's database,
-- values that don't fit are left blank. An investor already in the database is not overwritten,
-- but a missing website or LinkedIn page is filled in from the pipeline.
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
    update public.my_investors m
       set website          = case when m.website = '' then left(trim(new.website), 500) else m.website end,
           contact_linkedin = case when m.contact_linkedin = '' then left(trim(new.linkedin), 500) else m.contact_linkedin end
     where m.owner_id = v_user and lower(trim(m.name)) = lower(trim(new.name))
       and ((m.website = '' and trim(new.website) <> '') or (m.contact_linkedin = '' and trim(new.linkedin) <> ''));
    return new;
  end if;
  insert into public.my_investors (owner_id, name, type, website, contact_name, contact_email, contact_linkedin, min_check)
  values (v_user,
          left(trim(new.name), 200),
          left(coalesce(nullif(new.type, ''), 'VC'), 60),
          left(trim(new.website), 500),
          left(new.partner, 200),
          case when new.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then new.email else '' end,
          left(trim(new.linkedin), 500),
          greatest(new.check_min, 0));
  return new;
end $$;

-------------------------------------------------------------------------------
-- A new round copied from another one keeps website and LinkedIn
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
    insert into public.investors (org_id, round_id, name, website, partner, email, linkedin, type, priority, mandate,
                                  check_min, check_max, can_lead, via, geo, notes, stage)
    select p_org, v_round, i.name, i.website, i.partner, i.email, i.linkedin, i.type, i.priority, i.mandate,
           i.check_min, i.check_max, i.can_lead, i.via, i.geo, i.notes, 'target'
    from public.investors i
    where i.round_id = p_copy_from
    order by i.created_at;
  end if;

  return v_round;
end $$;

revoke all on function public.create_round(uuid, text, uuid) from public, anon;
grant execute on function public.create_round(uuid, text, uuid) to authenticated;

-- Fill the new website column of pipeline investors from the adder's database, where known.
update public.investors i
   set website = m.website
  from public.my_investors m
 where i.website = '' and m.website <> ''
   and m.owner_id = i.created_by and lower(trim(m.name)) = lower(trim(i.name));
