# Venture: fundraising pipeline for founders

Venture is a small CRM for running a startup fundraise. It tracks every investor from the first email to the wire, shows how much of the round is committed, tells you who needs a follow-up today, and lets co-founders work on the same pipeline.

**Live app:** <https://avoronsky.github.io/venture/>. Sign in with Google. It runs on GitHub Pages, with Supabase for sign-in and the database. It's deployed automatically from `main`.

![Pipeline board for a seed round](docs/screenshots/pipeline-board.png)

*All screenshots use made-up sample data for a fictional company, Mars Rovers Inc.*

## What it does

### Organizations, rounds and pipelines

- An **organization** is the company you're raising for. Each organization has one or more **rounds** (pre-seed, seed, Series A, a bridge), and each round has its own investor **pipeline**.
- The sidebar lists active rounds first, then closed ones. **+** next to *Rounds* starts a new round. A new round can start with the investors from an earlier round.
- Every investor sits in one of these stages: Target, Contacted, First meeting, Diligence, Partner / IC, Term sheet, Committed, Closed, or Passed.

### Pipeline page

At the top of each round:

- **Raise meter.** It shows how much is committed against the round target, plus term sheets and the *weighted pipeline*. The weighted pipeline counts each investor's expected amount multiplied by the likelihood of its stage.
- **Stage counts.** How many investors are at each stage.
- **Follow-ups.** Next steps by due date, with overdue items first.

Below the meter, two views of the same investors:

- **Board.** Drag cards between stages. Each card shows priority (A, B or C), the check size, whether the fund's mandate allows the deal, the next step's due date, and how many comments it has.
- **Table.** Sortable columns, with the same search and filters as the board.

**Export** downloads the round as a CSV file, for board updates or backups.

![Table view](docs/screenshots/pipeline-table.png)

### Investor details and dated comments

Click an investor to open its panel. It has two tabs:

- **Comments:** a dated timeline of notes from calls, emails and meetings, with stage changes mixed in so you can see how the deal moved.
- **Details:** the investor's website, its contacts, check size, mandate, intro source, next step, and so on. An investor can have any number of contacts (up to 20), each with a name, role, email and LinkedIn page. The first one is the main contact shown on board cards. The website and every contact's email and LinkedIn also show as links at the top of the panel.

How comments behave:

- A comment is dated the day it happened. That can be an earlier day than when you write it, and the app then also shows when it was actually written.
- Each comment shows its author. Edited comments are marked as edited.
- Adding a comment updates the investor's "last touch" date.

![Investor panel with comments](docs/screenshots/investor-comments.png)

![Investor details: website and several contacts, each with role, email and LinkedIn](docs/screenshots/investor-details.png)

### Your private investor database

**Investor database** in the sidebar is your own list of investors that you keep across companies and rounds. Each entry has a name, type, website, minimum check, contacts (each with a name, role, email and LinkedIn page), and comments. **Only you can see it.** Teammates and organization owners can't.

- **Saved automatically.** Every investor you add to a pipeline, including those copied into a new round, is saved to your database if it isn't there yet. Investors are matched by name, ignoring upper and lower case. An investor that's already there isn't overwritten, but new contacts and a missing website are added to it. Adding contacts to a pipeline investor later also adds them to your entry for that investor. Contacts are matched by email, or by name when there's no email.
- **Reusable.** When you add an investor to a pipeline, start typing the name and pick a match from your database. The type, website, contacts and minimum check fill in for you.
- **Separate comments.** Database comments are your private long-term notes. Pipeline comments are shared with the team and belong to one round.
- Removing an investor from your database doesn't remove it from any pipeline.

![Investor database](docs/screenshots/investor-database.png)

![Picking an investor from the database when adding to a pipeline](docs/screenshots/add-from-database.png)

### Sharing with your team

People sign in with Google. A new user belongs to no organization and is asked to create one; they become its owner. To share, an owner adds a teammate's email address in **People & settings** and gives them a role. The organization appears for that person the next time they sign in with that Google account. No invitation email is sent, so send them the app link yourself.

Each organization has a **main currency** (default USD), set by an owner in **People & settings**. Every round in the organization shows targets, caps, check sizes and amounts in it. Changing it relabels figures; it doesn't convert them. Your personal investor database is shared across organizations, so its minimum checks are shown without a currency symbol.

| Role   | Can see the pipeline | Can change investors, comments and rounds | Can manage people, rename or delete the organization |
|--------|----------------------|-------------------------------------------|------------------------------------------------------|
| Owner  | ✓                    | ✓                                         | ✓                                                    |
| Editor | ✓                    | ✓                                         |                                                      |
| Viewer | ✓                    |                                           |                                                      |

The rules:

- Every organization always keeps at least one owner.
- Anyone can edit their own comments. The author or an owner can delete a comment.
- Only owners can delete a round or the organization.

All of these rules are enforced in the database with row level security, not only hidden in the interface. A user can never read or change another organization's data, or another user's investor database.

![People and settings](docs/screenshots/settings.png)

### Investor updates

**Investor updates** in the sidebar is for the regular email you send the people backing you. Write it here, send it from your own Gmail, and keep a record of every update and who got it.

- **Recipient lists.** **Recipient lists** holds named lists, such as *Current investors* or *Warm prospects*. Add people from your pipelines (by default, contacts at investors that committed or closed; any stage and round can be picked) or paste addresses. A pasted line can be `ann@fund.vc`, `Ann Lee <ann@fund.vc>`, or a spreadsheet row with name, firm and email.
- **Composer.** Write the update the way it looks, paste it from Google Docs or Word, or edit the HTML directly. A live preview shows the email as one chosen person on the list will get it, at desktop or phone width. New updates start from a template with the usual sections: TL;DR, key numbers, highlights, challenges, and how investors can help. Drafts save as you type.
- **Personal emails.** Each person gets their own email. Nobody sees the other recipients. `{{first_name}}`, `{{name}}`, `{{firm}}` and `{{email}}` are filled in for each person. Text after a `|` is used when a value is empty, for example `Hi {{first_name|there}},`. The composer warns about misspelled fields and fields that are empty for someone on the list.
- **Sent from your Gmail.** **Send me a test** sends the update to your own inbox first. **Send** asks Google for permission to send email as you; this is a popup, the first time in each session. The emails then go out through the Gmail API. They appear in your Gmail **Sent** folder, and replies come back to you.
- **History.** Every sent update keeps its subject and content, the list it went to, the address it was sent from, and who received it. You can open any recipient to see exactly what they got. If an email fails, or the tab closes partway through, **Retry** sends only to the people who haven't received it. **Start the next update from this one** copies the update into a new draft.
- **Who can do what.** Editors and owners manage lists, write and send updates. Viewers can read the lists and the history. Only owners can delete a sent update from the history. Once an update starts sending, the database doesn't let anyone change it.

The app never stores a Google token. Google gives the open tab a key that lasts about an hour and can only send email. It is kept in memory, and disconnecting revokes it.

### Works on a phone, and in dark mode

<p>
  <img src="docs/screenshots/phone.png" alt="Pipeline on a phone" width="300">
</p>

![Dark mode](docs/screenshots/pipeline-dark.png)

## Where it's deployed

| Piece | Where | How it gets updated |
|-------|-------|---------------------|
| Web app | GitHub Pages: <https://avoronsky.github.io/venture/> | Automatically on every push to `main` (`.github/workflows/deploy.yml`) |
| Sign-in and database | A Supabase project: Postgres, Google sign-in and realtime updates | The schema in `supabase/migrations/`, run by hand in the SQL Editor or by the optional workflow |
| Source | <https://github.com/avoronsky/venture> | |

The web app is a static site. All data lives in Supabase, and the browser talks to Supabase directly. The Supabase key in the app is the public *anon* key: access is controlled by the row level security rules in the schema, not by keeping that key secret.

## Deploy your own copy

You need a Supabase project, a Google Cloud OAuth client and somewhere to host static files. GitHub Pages is free and already set up in this repo.

### 1. Create the database

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste **the contents of** `supabase/migrations/20261031200000_schema.sql` (not its path) and run it. This one file creates everything: tables, access rules, triggers and realtime.

   If you have the Supabase CLI, you can instead run `supabase link --project-ref <ref>` and then `supabase db push`.

### 2. Set up Google sign-in

1. **Create the OAuth client.** In Google Cloud Console, go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose *Web application*.
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`. The Supabase Google provider page shows this exact URL.
   - **Authorized JavaScript origins:** optional. Add your app's origin, such as `https://avoronsky.github.io`, and `http://localhost:8087` if you like.
2. **Set up the consent screen.** Configure the OAuth consent screen with an app name and support email, and the scopes `email`, `profile` and `openid`.
3. **Turn on Google in Supabase.** In **Supabase → Authentication → Sign In / Providers → Google**, turn it on, then paste the client ID and secret.
4. **Turn off email sign-in.** In the same section, turn off the **Email** provider. The app only offers Google, and this stops anyone from requesting sign-in links directly against the API.
5. **Set the URLs.** In **Supabase → Authentication → URL Configuration**:
   - Set **Site URL** to the deployed app, for example `https://avoronsky.github.io/venture/`.
   - Add `http://localhost:8087/` to **Redirect URLs** for local development.

Any Google account can sign in, but a new user sees nothing until they create an organization or someone adds their email to one.

### 3. Set up Gmail sending (for investor updates)

Skip this if you won't use investor updates. Everything else works without it.

1. **Enable the Gmail API.** In the same Google Cloud project, go to **APIs & Services → Library**, find **Gmail API** and enable it.
2. **Add the scope.** On the OAuth consent screen, under **Data access**, add `https://www.googleapis.com/auth/gmail.send`.
   - **Google Workspace:** set the app's audience to **Internal**. Everyone in your Workspace can then send, with no Google review and no "unverified app" warning.
   - **A personal Gmail account:** leave the app in **Testing** and add each sender as a test user. Google shows an "unverified app" warning that they can click through.
3. **Allow the app's origin.** In the OAuth client, add the app's origin under **Authorized JavaScript origins**, for example `https://avoronsky.github.io`. Add `http://localhost:8087` too for local development. Use the origin only, without a path.
4. **Give the app the client ID.** Set `VITE_GOOGLE_CLIENT_ID` to the client ID (`….apps.googleusercontent.com`): as a GitHub Actions variable for Pages (next step), or in `.env` locally. The client ID is public; the client secret stays in Supabase only.
5. **Run the migration.** Run `supabase/migrations/20261126100000_investor_updates.sql` once, as described in [Changing the database later](#changing-the-database-later).

Gmail allows about 2,000 recipients a day from a Workspace account and 500 from a personal one.

### 4. Publish the app on GitHub Pages

1. **Turn on Pages.** In the GitHub repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. **Add the variables.** Under **Settings → Secrets and variables → Actions → Variables**, add these. They're *variables*, not secrets; both values are public.
   - `VITE_SUPABASE_URL`: from Supabase **Settings → API**.
   - `VITE_SUPABASE_ANON_KEY`: the publishable (anon) key from the same page.
   - `VITE_GOOGLE_CLIENT_ID`: optional. It turns on Gmail sending for investor updates (step 3).
   - `VITE_BASE_PATH`: only if the app is served from a path other than `/venture/`. For example, use `/` for a custom domain or a repo named `<user>.github.io`.
3. **Deploy.** Push to `main`, or run **Actions → Build & Deploy → Run workflow**. The app appears at `https://<user>.github.io/<repo>/`.

The workflow runs type checking, lint, tests and the build on every pull request, and deploys on every push to `main`. Changes to Markdown files, `docs/` or `supabase/` alone don't trigger a deploy. The build writes `404.html` as a copy of `index.html` so links straight to a page, such as `/venture/investors/<id>`, work on Pages.

### Other hosts

Any static host works: Vercel, Netlify, Cloudflare Pages or Firebase Hosting.

- **Build command:** `npm run build`
- **Output folder:** `dist`
- **Environment variables:** the same as above
- **Rewrite rule:** send every path to `index.html`

Add the new URL to Supabase's Site URL and Redirect URLs.

### Changing the database later

Don't edit the schema file once a project has run it. Add a new file to `supabase/migrations/` whose name starts with a later timestamp, for example `20261115000000_add_tags.sql`, containing only the change. Then run it in the SQL Editor, or let the workflow below apply it.

### Run migrations automatically (optional)

`.github/workflows/migrate.yml` runs `supabase db push` whenever files in `supabase/migrations/` change on `main`. It applies only the files the project hasn't run yet. It does nothing until you add:

- the variable `SUPABASE_PROJECT_ID`: the project ref
- the secret `SUPABASE_ACCESS_TOKEN`: create one at supabase.com/dashboard/account/tokens
- the secret `SUPABASE_DB_PASSWORD`

If your database was set up by hand in the SQL Editor, first tell the CLI that the schema is already in place, or the first push will try to create everything again and fail:

```sh
supabase link --project-ref <ref>
supabase migration repair --status applied 20261031200000
```

## Run it locally

```sh
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:8087
```

The local app uses the same Supabase project as the deployed one unless you point it at another.

Run the same checks CI runs:

```sh
npm run typecheck
npm run lint
npm test               # Node's built-in test runner over src/lib/*.test.ts
npm run build
```

## How it's built

- **React 19 + TypeScript**, built with **Vite** using `@vitejs/plugin-react-swc`.
- **Tailwind CSS v4.** The theme tokens for light and dark live in `src/index.css`.
- **shadcn/ui** on Radix, with `lucide-react` icons and `sonner` toasts.
- **TanStack Query** for server data. Stage moves update the screen right away and roll back if the save fails.
- **react-hook-form + zod** for forms, **react-router-dom** for routing, and `next-themes` for light and dark mode.
- **Supabase:**
  - Postgres with row level security.
  - Triggers keep the activity log and the investor database up to date.
  - Functions create organizations and rounds.
  - Realtime updates refresh every teammate's screen when someone changes the pipeline.

```
src/
  App.tsx                        providers and routes
  index.css                      Tailwind v4 theme (light and dark)
  components/AppShell.tsx        sidebar: organization switcher, rounds, investor database
  components/pipeline/           Board, InvestorTable, InvestorSheet, RaiseMeter, FollowUps,
                                 RoundSheet, NewRoundForm, DatabaseNameInput (picker from your database)
  components/database/           MyInvestorSheet
  components/comments/           CommentTimeline, shared by pipelines and the database
  components/contacts/           ContactsEditor and InvestorLinks, shared by pipelines and the database
  components/updates/            Composer, SentUpdate, EmailFrame (preview and visual editor), PipelinePicker
  components/ui/                 shadcn/ui primitives
  hooks/                         useAuth, useOrganizations, useOrg, useRounds, useCurrentRound,
                                 usePipeline (queries, mutations, realtime), useMyInvestors,
                                 useUpdates (lists, updates, sending), useGmail, useSendRunner
  lib/                           pure helpers with unit tests: stages and money, comments, contacts, rounds, websites, CSV,
                                 email placeholders, pasted recipients, MIME messages; gmail.ts talks to Google
  pages/                         Auth, Home, Organizations, Pipeline, InvestorDatabase, OrgSettings,
                                 Updates, UpdatePage, RecipientLists
supabase/migrations/             the database schema (tables, triggers, access rules, realtime), then any later changes
docs/screenshots/                images used in this README
.github/workflows/               CI, GitHub Pages deploy, optional migrations
```

| Page address | Shows |
|--------------|-------|
| `/auth` | Sign in with Google |
| `/` | Your last-used organization, or setup for a new user |
| `/orgs` | Your organizations, and a form to create a new one |
| `/o/:orgId` | The last-used round of that organization |
| `/o/:orgId/r/:roundId` | The pipeline for one round |
| `/o/:orgId/r/:roundId/investors/:id` | The pipeline with an investor open. This is a link you can share. `new` opens the add form |
| `/o/:orgId/updates` | Investor updates: drafts and everything sent |
| `/o/:orgId/updates/:id` | A draft in the composer, or a sent update with who received it |
| `/o/:orgId/lists`, `/o/:orgId/lists/:id` | Recipient lists for investor updates. `new` opens the create form |
| `/o/:orgId/settings` | Organization name, main currency (used by every round), people with access, leave or delete |
| `/investors`, `/investors/:id` | Your private investor database |

The stage weights for the weighted pipeline are in `STAGES` in `src/lib/pipeline.ts`:

| Target | Contacted | First meeting | Diligence | Partner / IC | Term sheet | Committed | Closed |
|--------|-----------|---------------|-----------|--------------|------------|-----------|--------|
| 2%     | 5%        | 10%           | 25%       | 45%          | 75%        | 95%       | 100%   |

Stage changes and newly added investors are written to the activity log by database triggers, so the history stays consistent no matter which client made the change.
