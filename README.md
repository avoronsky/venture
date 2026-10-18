# Mars Rovers Raise Pipeline

Investor CRM for Mars Rovers' fundraise: a stage board, a sortable table, a raise gauge against the round target, a follow-up queue, per-investor activity logs, and CSV import/export.

- **Frontend:** static Vite app (vanilla JS), deployed to GitHub Pages.
- **Backend:** Supabase Postgres with row level security, email sign-in links, and realtime updates.

## Access model

Nobody sees anything unless their email is in the `members` table. Anyone can request a sign-in link, but row level security returns no data to an email that isn't on the list.

| Role   | Read | Change investors, activity, round | Manage members |
|--------|------|-----------------------------------|----------------|
| owner  | ✓    | ✓                                 | ✓              |
| editor | ✓    | ✓                                 |                |
| viewer | ✓    |                                   |                |

Owners manage the list from **Team** in the app header.

## Pipeline stages

Target → Contacted → First meeting → Diligence → Partner / IC → Term sheet → Committed → Closed, plus Passed.
The weighted pipeline multiplies each investor's expected amount by the stage weight (2%, 5%, 10%, 25%, 45%, 75%, 95%, 100%). Weights live in `STAGES` in `src/main.js`.

Stage moves and new investors are written to the activity log by a database trigger, so history is consistent no matter which client made the change.

## Set up Supabase (once)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema. Either paste `supabase/migrations/20261018000000_pipeline.sql` into **SQL Editor** and run it, or with the CLI:
   ```sh
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Add yourself as the owner (SQL Editor):
   ```sql
   insert into public.members (email, role) values ('you@example.com', 'owner');
   ```
4. **Authentication → URL Configuration:** set *Site URL* to the deployed app URL (for GitHub Pages: `https://avoronsky.github.io/venture/`) and add `http://localhost:5173/` to *Redirect URLs* for local development.
5. Optional hardening: **Authentication → Sign In / Providers → Email**, turn off *Allow new users to sign up* and invite teammates from **Authentication → Users → Invite user** (they still need a row in `members`). With signups on, strangers can create an empty account but still see nothing.
6. Set up custom SMTP (**Authentication → Emails → SMTP Settings**) before inviting the team. Supabase's built-in mailer is rate-limited and meant for testing.

## Run locally

```sh
cp .env.example .env   # fill in the project URL and publishable/anon key
npm install
npm run dev
```

## Deploy

**App (GitHub Pages).** In the repo: **Settings → Pages → Source: GitHub Actions**. Then **Settings → Secrets and variables → Actions → Variables** and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the publishable/anon key; it's public by design)

Every push to `main` rebuilds and deploys via `.github/workflows/deploy.yml`.

**Database migrations (optional automation).** `.github/workflows/migrate.yml` runs `supabase db push` when files in `supabase/migrations/` change. It stays idle until you add:

- variable `SUPABASE_PROJECT_ID` (the project ref)
- secret `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens)
- secret `SUPABASE_DB_PASSWORD`

Any static host works instead of Pages (Vercel, Netlify, Cloudflare Pages): build command `npm run build`, output `dist`, same two environment variables.

## CSV import

The importer matches headers case-insensitively: Fund/Name (required), Partner, Email, Type, Stage, Priority, Mandate, Check min, Check max, Amount, Intro via, Geo, Next step, Next date, Last contact, Notes. Free-text stages such as "passed", "IC" or "DD" map onto the right column.

## Project layout

```
index.html                 app shell, sign-in and no-access screens
src/main.js                UI, data access, realtime, CSV
src/supabase.js            client setup
src/csv.js                 CSV reader/writer
src/style.css              design tokens (light + dark) and components
supabase/migrations/       schema, triggers, RLS policies, realtime publication
.github/workflows/         Pages deploy and migration jobs
```
