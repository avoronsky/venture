-- Main currency of an organization. Every round in it (targets, caps, check sizes, amounts)
-- is entered and shown in this currency. Values aren't converted when it changes.
alter table public.organizations
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$');

-- Owners already have update rights on organizations ("orgs: owners rename"),
-- so they can change the currency the same way they rename.
