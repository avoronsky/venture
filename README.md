# Mars Rovers Raise Pipeline

Investor CRM for running a fundraise: a stage board, a sortable table, a raise gauge against the round target, a follow-up queue, per-investor activity logs, and CSV import/export. Each company raising is an **organization**; people sign in with Google or an email link, create organizations, and share access with teammates.

## Stack

Same conventions as the Hasper frontend:

- **React 19 + TypeScript**, built with **Vite** (`@vitejs/plugin-react-swc`)
- **Tailwind CSS v4** (CSS-first config in `src/index.css`, `@tailwindcss/postcss`)
- **shadcn/ui** components on Radix (`src/components/ui`), `lucide-react` icons, `sonner` toasts
- **TanStack Query** for server state, **react-hook-form + zod** for forms, **react-router-dom** for routing, `next-themes` for light/dark
- **Supabase**: Postgres with row level security, email sign-in links, realtime updates

## Project layout

```
src/
  App.tsx                     providers + routes
  index.css                   Tailwind v4 theme tokens (light + dark)
  components/ui/              shadcn/ui primitives
  components/pipeline/        Board, InvestorTable, InvestorSheet, RoundSheet, RaiseGauge, NextActions
  components/                 AppHeader (org switcher), ProtectedRoute, OrgRoute, AuthShell
  hooks/useAuth.tsx           session, Google + email-link sign-in
  hooks/useOrganizations.ts   my organizations, create/rename/delete, members
  hooks/useOrg.tsx            current organization + my role in it
  hooks/usePipeline.ts        org-scoped queries, mutations, realtime invalidation
  lib/pipeline.ts             stages, weights, money parsing, metrics (pure, unit-tested)
  lib/csv.ts, importExport.ts CSV import/export
  lib/supabase.ts, types.ts   client + row types
  pages/                      Auth, Home (onboarding), Organizations, Pipeline, OrgSettings, NotFound
supabase/migrations/          schema, triggers, RLS policies, realtime publication
supabase/scripts/             one-off maintenance SQL
.github/workflows/            CI + GitHub Pages deploy, optional migrations
```

Routes:

| Path | Page |
|------|------|
| `/auth` | Sign in (Google or email link) |
| `/` | Last-used organization; onboarding for a user with none |
| `/orgs` | All my organizations, create a new one |
| `/o/:orgId` | Pipeline |
| `/o/:orgId/investors/:id` | Pipeline with an investor open (shareable link); `new` to add one |
| `/o/:orgId/settings` | Organization name, people with access, leave or delete |

## Organizations and access

- A new user belongs to **no** organization. The first screen asks them to create one; they become its owner.
- Anyone signed in can create more organizations (e.g. one per company they raise for).
- Access is per organization and by **email**. An owner adds an email with a role; when that person signs in with Google or an email link using that address, the organization appears for them. No invitation email is sent; share the app link yourself.
- Every organization keeps at least one owner (enforced in the database). Members can leave; owners can delete the organization, which deletes its pipeline.

| Role   | Read | Change investors, activity, round | Manage access, rename, delete org |
|--------|------|-----------------------------------|-----------------------------------|
| owner  | ✓    | ✓                                 | ✓                                 |
| editor | ✓    | ✓                                 |                                   |
| viewer | ✓    |                                   |                                   |

All of this is enforced with row level security, not just in the UI. Every pipeline row carries an `org_id`; investors can't be moved between organizations and activity always inherits its investor's organization.

## Pipeline stages

Target → Contacted → First meeting → Diligence → Partner / IC → Term sheet → Committed → Closed, plus Passed.
The weighted pipeline multiplies each investor's expected amount by the stage weight (2%, 5%, 10%, 25%, 45%, 75%, 95%, 100%). Weights live in `STAGES` in `src/lib/pipeline.ts`.

Stage moves and new investors are written to the activity log by a database trigger, so history is consistent no matter which client made the change.

## Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. **Apply the schema.** Open `supabase/migrations/20261018000000_pipeline.sql`, copy **the contents of the file** (not its path), paste into **SQL Editor** and run. Run it once. (CLI alternative: `supabase link --project-ref <ref>` then `supabase db push`.)
   - Already ran the earlier single-organization version? Run the contents of `supabase/scripts/drop_v1_single_tenant.sql` first. It deletes the old pipeline tables and their data.
3. **URL configuration** (Authentication → URL Configuration): set *Site URL* to the deployed app (GitHub Pages: `https://avoronsky.github.io/venture/`) and add `http://localhost:8087/` to *Redirect URLs*.
4. **Google sign-in.**
   1. Google Cloud Console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → type *Web application*.
   2. *Authorized JavaScript origins*: your app origin (e.g. `https://avoronsky.github.io`) and `http://localhost:8087`.
   3. *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback` (shown on the Supabase Google provider page).
   4. Configure the OAuth consent screen (app name, support email; scopes `email`, `profile`, `openid`).
   5. Supabase → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret, save.
5. **Email links.** Set up custom SMTP (Authentication → Emails → SMTP Settings) before inviting people. Supabase's built-in mailer is rate-limited and meant for testing.

There is no manual first-owner step: the first person to sign in creates their organization from the app.

## Run locally

```sh
cp .env.example .env   # fill in the project URL and publishable/anon key
npm install
npm run dev            # http://localhost:8087
```

Checks (the same ones CI runs):

```sh
npm run typecheck
npm run lint
npm test               # Node's built-in test runner over src/lib/*.test.ts
npm run build
```

## Deploy

**App (GitHub Pages).** In the repo: **Settings → Pages → Source: GitHub Actions**. Then **Settings → Secrets and variables → Actions → Variables** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the publishable/anon key; it's public by design)
- `VITE_BASE_PATH` only if you serve from somewhere other than `/venture/` (e.g. `/` on a custom domain)

`.github/workflows/deploy.yml` runs type check, lint, tests and build on every PR, and deploys on every push to `main`. The build writes `404.html` as a copy of `index.html` so deep links like `/investors/<id>` work on Pages.

Any static host works instead (Vercel, Netlify, Cloudflare Pages, Firebase Hosting): build command `npm run build`, output `dist`, same environment variables, and a rewrite of all paths to `index.html`.

**Database migrations (optional automation).** `.github/workflows/migrate.yml` runs `supabase db push` when files in `supabase/migrations/` change. It stays idle until you add:

- variable `SUPABASE_PROJECT_ID` (the project ref)
- secret `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens)
- secret `SUPABASE_DB_PASSWORD`

## CSV import

The importer matches headers case-insensitively: Fund/Name (required), Partner, Email, Type, Stage, Priority, Mandate, Check min, Check max, Amount, Can lead, Intro via, Geo, Next step, Next date, Last contact, Notes. Free-text stages such as "passed", "IC" or "DD" map onto the right column.
