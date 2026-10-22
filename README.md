# Mars Rovers Raise Pipeline

Investor CRM for running a fundraise: a stage board, a sortable table, a raise gauge against the round target, a follow-up queue, dated comments on each investor, and CSV export. Each company raising is an **organization** with one or more **rounds**, each with its own pipeline; people sign in with Google, create organizations, and share access with teammates.

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
  hooks/useAuth.tsx           session, Google sign-in
  hooks/useOrganizations.ts   my organizations, create/rename/delete, members
  hooks/useOrg.tsx            current organization + my role in it
  hooks/useRounds.ts          rounds: list, create (optionally copying investors), settings, delete
  hooks/useCurrentRound.tsx   the round in the URL
  hooks/usePipeline.ts        org-scoped queries, mutations, realtime invalidation
  lib/pipeline.ts             stages, weights, money parsing, metrics (pure, unit-tested)
  lib/csv.ts, importExport.ts CSV export
  lib/supabase.ts, types.ts   client + row types
  pages/                      Auth, Home (onboarding), Organizations, Pipeline, OrgSettings, NotFound
supabase/migrations/          schema, triggers, RLS policies, realtime publication
supabase/scripts/             one-off maintenance SQL
.github/workflows/            CI + GitHub Pages deploy, optional migrations
```

Routes:

| Path | Page |
|------|------|
| `/auth` | Sign in with Google |
| `/` | Last-used organization; onboarding for a user with none |
| `/orgs` | All my organizations, create a new one |
| `/o/:orgId` | Opens the last-used round, or offers to create the first one |
| `/o/:orgId/r/:roundId` | Pipeline for one round |
| `/o/:orgId/r/:roundId/investors/:id` | Pipeline with an investor open (shareable link); `new` to add one |
| `/o/:orgId/settings` | Organization name, people with access, leave or delete |

## Organizations and access

- A new user belongs to **no** organization. The first screen asks them to create one; they become its owner.
- Anyone signed in can create more organizations (e.g. one per company they raise for).
- Access is per organization and by **email**. An owner adds an email with a role; when that person signs in with the Google account for that address, the organization appears for them. No invitation email is sent; share the app link yourself.
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

## Rounds

An organization can run several rounds (pre-seed, seed, Series A, a bridge). Each round has its own pipeline, target, terms, raise meter and follow-ups; the sidebar lists active rounds first and closed rounds below.

- **New round** (the + next to Rounds in the sidebar, editors and owners): give it a name and optionally a target. You can start it with the investors from another round. They're added at Target with contact details, type, priority, mandate and notes; stages, amounts, next steps and comments stay with the original round.
- **Round settings** (link under the round name): rename, change target, instrument, cap and close date, or mark the round closed.
- **Deleting a round** (owners only) deletes its investors and their comments. Other rounds aren't affected.
- The app opens the round you used last in each organization, or the newest active one.

## Comments

Each investor has a **Comments** tab: a dated timeline of notes from calls, emails and meetings.

- A comment's date is the day it happened. It defaults to today and can be set to an earlier day; a backdated comment shows when it was actually written.
- Comments record their author. Stage changes appear in the same timeline (they can be hidden) and show who made them.
- Editors and owners can comment. You can edit your own comments; edits are marked. The author or an owner can delete a comment. Stage history can't be deleted.
- Adding a comment moves the investor's "last touch" date forward when the comment is newer.
- Board cards and the table show how many comments an investor has and the date of the latest one.

All of this is enforced in the database (`supabase/migrations/20261020000000_investor_comments.sql`).

## Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. **Apply the schema.** Run each file in `supabase/migrations/` in name order: open it, copy **the contents of the file** (not its path), paste into **SQL Editor** and run.
   1. `20261018000000_pipeline.sql`: tables, access rules, realtime. Run once.
   2. `20261020000000_investor_comments.sql`: dated comments. Safe to run again.
   3. `20261022000000_rounds.sql`: multiple rounds per organization. Your current round settings become the first round and every existing investor (with comments) moves into it. Safe to run again.

   (CLI alternative: `supabase link --project-ref <ref>` then `supabase db push`, which applies whatever hasn't run yet.)
   - Already ran the earlier single-organization version? Run the contents of `supabase/scripts/drop_v1_single_tenant.sql` first. It deletes the old pipeline tables and their data.
3. **URL configuration** (Authentication → URL Configuration): set *Site URL* to the deployed app (GitHub Pages: `https://avoronsky.github.io/venture/`) and add `http://localhost:8087/` to *Redirect URLs*.
4. **Google sign-in.**
   1. Google Cloud Console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → type *Web application*.
   2. *Authorized JavaScript origins*: your app origin (e.g. `https://avoronsky.github.io`) and `http://localhost:8087`.
   3. *Authorized redirect URIs*: `https://<project-ref>.supabase.co/auth/v1/callback` (shown on the Supabase Google provider page).
   4. Configure the OAuth consent screen (app name, support email; scopes `email`, `profile`, `openid`).
   5. Supabase → Authentication → Sign In / Providers → **Google**: enable, paste the client ID and secret, save.
5. **Turn off email sign-in.** The app only offers Google. In Authentication → Sign In / Providers → Email, disable the Email provider so nobody can request sign-in links directly against the API.

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

## CSV export

**Export** on the pipeline page downloads every investor in the current organization as a CSV, for board updates or backups. There is no CSV import; add investors in the app.
