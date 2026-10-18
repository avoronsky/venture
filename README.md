# Mars Rovers Raise Pipeline

Investor CRM for Mars Rovers' fundraise: a stage board, a sortable table, a raise gauge against the round target, a follow-up queue, per-investor activity logs, team access control, and CSV import/export.

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
  components/                 AppHeader, ProtectedRoute, AuthShell
  hooks/useAuth.tsx           session + member role
  hooks/usePipeline.ts        queries, mutations, realtime invalidation
  lib/pipeline.ts             stages, weights, money parsing, metrics (pure, unit-tested)
  lib/csv.ts, importExport.ts CSV import/export
  lib/supabase.ts, types.ts   client + row types
  pages/                      Auth, Pipeline, Team, NotFound
supabase/migrations/          schema, triggers, RLS policies, realtime publication
.github/workflows/            CI + GitHub Pages deploy, optional migrations
```

Routes: `/` pipeline, `/investors/:id` pipeline with that investor open (shareable link), `/investors/new`, `/team` (owners only), `/auth`.

## Access model

Nobody sees anything unless their email is in the `members` table. Anyone can request a sign-in link, but row level security returns no data to an email that isn't on the list.

| Role   | Read | Change investors, activity, round | Manage members |
|--------|------|-----------------------------------|----------------|
| owner  | ✓    | ✓                                 | ✓              |
| editor | ✓    | ✓                                 |                |
| viewer | ✓    |                                   |                |

Owners manage the list on the **Team access** page (account menu, top right).

## Pipeline stages

Target → Contacted → First meeting → Diligence → Partner / IC → Term sheet → Committed → Closed, plus Passed.
The weighted pipeline multiplies each investor's expected amount by the stage weight (2%, 5%, 10%, 25%, 45%, 75%, 95%, 100%). Weights live in `STAGES` in `src/lib/pipeline.ts`.

Stage moves and new investors are written to the activity log by a database trigger, so history is consistent no matter which client made the change.

## Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema: open `supabase/migrations/20261018000000_pipeline.sql`, copy **the contents of the file**, paste them into **SQL Editor** and run. (Or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.) Run it once.
3. Add yourself as the owner (SQL Editor, separate query):
   ```sql
   insert into public.members (email, role) values ('you@example.com', 'owner');
   ```
4. **Authentication → URL Configuration:** set *Site URL* to the deployed app URL (GitHub Pages: `https://avoronsky.github.io/venture/`) and add `http://localhost:8087/` to *Redirect URLs* for local development.
5. Set up custom SMTP (**Authentication → Emails → SMTP Settings**) before inviting the team. Supabase's built-in mailer is rate-limited and meant for testing.
6. Optional hardening: turn off *Allow new users to sign up* (**Authentication → Sign In / Providers → Email**) and invite teammates from **Authentication → Users → Invite user**. They still need a row in `members`. With signups on, strangers can create an empty account but see nothing.

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
