-- Run this ONCE, only if you applied the first (single-organization) version of the schema
-- before 2026-10-18 and want to move to the multi-organization schema.
-- It DELETES the old pipeline tables and their data. Export a CSV from the app first if you have data.
-- Then run supabase/migrations/20261018000000_pipeline.sql.

drop table if exists public.investor_activity cascade;
drop table if exists public.investors cascade;
drop table if exists public.fund_round cascade;
drop table if exists public.members cascade;

drop function if exists public.member_role() cascade;
drop function if exists public.is_member() cascade;
drop function if exists public.can_edit() cascade;
drop function if exists public.log_investor_change() cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.stage_label(text) cascade;
