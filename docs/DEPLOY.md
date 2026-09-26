# Deploy runbook — Vercel + Neon + Cloudflare R2 (free tier)

Everything here is the human (account/secret/click) work. The code is already wired:
Postgres via `@prisma/adapter-pg`, R2 via the `r2` storage driver, migrations via
`prisma migrate deploy` in the Vercel build, and reminders via a GitHub Actions cron.

## 0. Generate secrets (local shell)

```bash
openssl rand -base64 32      # AUTH_SECRET
openssl rand -hex 32         # CRON_SECRET
npx web-push generate-vapid-keys   # VAPID public/private pair
```

## 1. Neon (Postgres) — free

1. Create a project at https://neon.tech.
2. Copy two connection strings from the dashboard:
   - **Pooled** (has `-pooler` in the host) → use as `DATABASE_URL`.
   - **Direct** (no `-pooler`) → use as `DIRECT_URL`.
   Both should include `?sslmode=require`.

## 2. Cloudflare R2 — free

1. Create a bucket at https://dash.cloudflare.com → R2.
2. Note your **Account ID** (R2 overview page).
3. Create an **R2 API token** (Object Read & Write) → gives an Access Key ID + Secret.
4. You will set: `STORAGE_DRIVER=r2`, `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET_NAME`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 3. Google OAuth — free

1. https://console.cloud.google.com → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`
   (you can add the real domain after the first Vercel deploy, then redeploy).
4. Copy the **Client ID** and **Client Secret**.

## 4. Vercel — free (Hobby)

1. Import the GitHub repo at https://vercel.com (framework auto-detects Next.js;
   `vercel.json` already sets the build command).
2. Add **Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** URL |
   | `DIRECT_URL` | Neon **direct** URL |
   | `AUTH_SECRET` | from step 0 |
   | `AUTH_GOOGLE_ID` | from step 3 |
   | `AUTH_GOOGLE_SECRET` | from step 3 |
   | `ALLOW_DEV_LOGIN` | `false` |
   | `ALLOWED_EMAILS` | comma-separated sign-in allowlist, e.g. `you@gmail.com,partner@gmail.com` (ADR 0057 — see §4c) |
   | `STORAGE_DRIVER` | `r2` |
   | `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
   | `R2_BUCKET_NAME` | from step 2 |
   | `R2_ACCESS_KEY_ID` | from step 2 |
   | `R2_SECRET_ACCESS_KEY` | from step 2 |
   | `VAPID_PUBLIC_KEY` | from step 0 |
   | `VAPID_PRIVATE_KEY` | from step 0 |
   | `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | same as `VAPID_PUBLIC_KEY` |
   | `CRON_SECRET` | from step 0 |
   | `NEXT_PUBLIC_APP_NAME` | e.g. `Trip Planner` |
   | `NEXT_PUBLIC_CARTO_API_KEY` | from https://carto.com/basemaps/apikey (optional — see below) |

   `NEXT_PUBLIC_CARTO_API_KEY` is optional: without it the map tiles still render, just
   watermarked ("API KEY REQUIRED"). **`NEXT_PUBLIC_*` values are inlined at build time**,
   so adding this to an *existing* deployment does nothing until you redeploy.

3. Deploy. The build runs `prisma migrate deploy` against `DIRECT_URL`, creating the
   schema on Neon, then `next build`.
4. Add your final Vercel domain to the Google OAuth redirect URI (step 3) if you didn't already, then redeploy.

## 4b. Deploying a migration that can break the running build (read before the next deploy)

The migration `prisma/migrations/20260812000000_cost_and_paid_amounts`
RENAMED columns and was applied to production on 2026-08-12 — the deploy
succeeded (`docs/open-follow-ups.md`, `OPS-01`). It is kept here as the
worked example this hazard shape is named after, not as a pending step.
`vercel.json` runs `prisma migrate deploy && next build`, so for the length
of that build the old column names had already gone while the previous
deployment was still serving traffic: **every cost read would have 500d for
the length of the build**, and indefinitely had the build failed. (An
additive migration that only adds nullable or defaulted columns has no such
window on *reads* — but see below: two additive shapes open the identical
window on *writes* instead, so "additive" does not mean "no window".)

Procedure for a destructive migration like this one — kept as the template
for the *next* one, not as work still owed on this one:

1. **Rehearse on a copy.** Restore the latest Neon snapshot to a branch database
   (Neon → Branches → New branch from snapshot). Run
   `DATABASE_URL=<branch-url> npx prisma migrate deploy` against it. Record the
   row count the backfill touches:
   `SELECT count(*) FROM "Cost" WHERE "paidMinor" IS NOT NULL AND "paidAt" IS NULL;`
2. **Write the reverse migration first.** A rename reverses mechanically —
   keep the `ALTER TABLE ... RENAME COLUMN` inverse SQL in your pocket before
   deploying, so rollback is copy-paste, not composition under pressure.
3. **Deploy at a quiet moment** and watch the Vercel build to completion. The
   error window = migrate-finish → build-finish. If the build fails, either fix
   forward immediately or apply the reverse migration.
4. **Afterwards**, re-run the count from step 1 in prod and reconcile any
   legacy paid-without-date rows via the Budget page checklist (the app
   surfaces them — see `docs/things-to-fix.md` P2-8).

**How this played out for `cost_and_paid_amounts`:** step 1's rehearsal was
never run; what closed the migration instead was post-hoc verification
against the already-applied schema. Step 4's reconciliation is done — the
count came back **0 of 33** `Cost` rows (`docs/open-follow-ups.md`, `OPS-03`).

### The same window, on the write path

Everything above is about *reads* — a renamed column, so every cost read 500s
until the build lands. Two other SQL shapes open the identical window on
**writes**, and neither is a rename, so neither is caught by reading this
section's title:

1. **Adding a `NOT NULL` column with no default.** The moment the migration
   lands, the old build — still serving — writes `INSERT`s that omit the new
   column. Every one of them fails. Reads are fine throughout, so nothing in
   the read path warns you.
2. **Dropping a unique constraint an older client's `upsert` uses as its
   `ON CONFLICT` target.** Prisma compiles `upsert` against the constraint it
   knew at generate time. Drop or rename that constraint and the old build's
   upserts fail at the database, not in the app — again with reads untouched.

**Worked example — `20260920120000_share_links_per_audience`.** It was both at
once: `label` landed `NOT NULL` with its default dropped (the migration's
other new columns, the three `include*` toggles, keep `DEFAULT true` and
don't trigger hazard #1), and `DROP INDEX "ShareLink_tripId_key"` removed the
unique index the old build's `upsert` used as its `ON CONFLICT` target. For
the length of that build, the previous deployment could still read share
links but could not create or update one. The window passed and nothing is
known to have broken, which is exactly why it is worth writing down — the
failure was invisible from the read path the rest of this section describes.

**So: before deploying, check your migration SQL against the write path too.**
Ask what the *currently deployed* build's `INSERT`s and `upsert`s look like
against the *new* schema, not just its `SELECT`s. If either would fail, the
migration needs two deploys — additive first (nullable column, or add the new
constraint alongside the old), then the tightening one after the build that
writes to it is live.

### `20260916000000_digest_and_alarms` (applied — kept as the template for this check)

That migration dropped `Reminder.fireAt`, `sent`, `targetType` and `targetId`,
backfilling the new `date` column from `fireAt` before dropping it. It no
longer emptied the table, so a real Reminder would have survived the deploy —
which is why the pre-deploy count mattered: it was the one number that said
whether the world matched what ADR 0047 was written against.

The migration is applied in production — every migration in
`prisma/migrations/` is (`docs/open-follow-ups.md`'s migration-state audit).
**The gate below is a one-time check that has been overtaken; it is not a
pending step for this migration.** It is kept as the template for the next
migration that needs the same kind of check run immediately before it:

```sql
SELECT count(*) FROM "Reminder";
```

Expect `0` **before running a migration like this one**. If it is non-zero,
stop and find out why before deploying. Nothing in the deployed app has ever
been able to write a `Reminder`: the add form sat inside `RemindersCard`,
which rendered only in the Travelling phase, and no Trip has reached it (ADR
0047). So a non-zero count means something is running that the migration
was not designed around, and the `targetType = 'COST_DUE'` delete may have
thrown away rows a Traveller wrote. (For `digest_and_alarms` itself, this
specific check's outcome was not recorded before the gate was overtaken; if
it matters retrospectively it needs a fresh production read, not a re-run of
the gate — `docs/open-follow-ups.md`, `RM-01`.)

## 4c. Pre-deploy checklist — the rollout gate (`feat/rollout-gate`)

The branch that closes the architecture sitrep's shortlist. It ships the
sign-in gate (ADR 0057), per-Traveller Journal entries (ADR 0058) and the
error sink (ADR 0059), plus one migration,
`20260922000000_rollout_gate`. Work through this in order.

1. **Set `ALLOWED_EMAILS` in Vercel (Production) before the deploy.**
   Comma-separated, case-insensitive; your own address and any co-Traveller's.
   This is **belt-and-braces, not load-bearing**: the migration backfills the
   `AllowedEmail` table from every existing `User`, so everyone who already
   holds an account is admitted at the moment the gate starts being enforced
   even if this variable is empty. Set it anyway — it is the break-glass path
   back in if the table is ever wiped or restored empty, and it is not a
   `NEXT_PUBLIC_*` value so it takes effect without a rebuild.

2. **Deploy at a quiet moment, and do not write a Journal entry while the
   build runs.** The migration changes `JournalEntry`'s unique key from
   `(tripId, date)` to `(tripId, date, authorId)`, which means dropping the
   index the *currently deployed* build's `upsert` uses as its
   `ON CONFLICT (tripId, date)` target — the second write-path shape §4b
   describes. For the length of the build, the old build can still read
   Journal entries but cannot save one. §4b prescribes two deploys for this
   shape; **one is being taken deliberately** (ADR 0058), because this ships
   before TEEPEE opens to more Travellers, so the only people who can be
   mid-save are you and one co-Traveller. Watch the build to completion. An
   empty Journal table would *not* have made this safe — the failure is a
   missing `ON CONFLICT` target, not a row collision.

   **If the migration aborts, every later deploy dies until you clear it.**
   The database itself rolls back cleanly (each migration runs in one
   transaction), but Prisma leaves a `_prisma_migrations` row with
   `finished_at` NULL, and `prisma migrate deploy` then refuses to do anything
   at all with **P3009 — migrate found failed migrations**. Every subsequent
   build fails with the same error, including builds of code that has nothing
   to do with the migration, which reads as "the deploy pipeline is broken"
   rather than "one migration needs acknowledging". Clear it against
   `DIRECT_URL` (not the pooled URL), then redeploy:

   ```bash
   DATABASE_URL="$DIRECT_URL" npx prisma migrate resolve --rolled-back 20260922000000_rollout_gate
   ```

   Only use `--rolled-back`. `--applied` tells Prisma the migration succeeded
   and it will never be run again — on a migration that actually failed, that
   permanently desynchronises the schema from the ledger.

3. **The pending `whatsNewSeenAt` migration ships alongside this one.**
   `20260921120000_user_whats_new_seen_at` has not been deployed yet either.
   It is additive and nullable, so it opens no §4b window of its own; it just
   needs to be known about rather than discovered in the build log.

4. **After the deploy: publish the Google OAuth app.** This is Cloud Console
   work, not code. ADR 0057 moves admission into TEEPEE's own allowlist, so
   the Console's test-user list stops being a second, invisible door — but
   the 100-test-user ceiling only disappears once the app is published. The
   consent screen wants an app name, a support email, a developer contact, an
   authorised domain, and privacy-policy and terms URLs; `/privacy` and
   `/terms` now exist for exactly this and are linked from `/signin`. TEEPEE
   requests only the non-sensitive `openid email profile` scopes, so
   publishing needs no paid security assessment. **Verify Google's current
   requirements at the time you do it** — this reflects the policy as
   understood on 2026-09-22.

5. **Consider enabling R2 bucket versioning — recommended, not required.**
   What actually protects a deleted attachment is the app-level retention
   this branch added: `scheduleBlobDeletion` records the key in `DeletedBlob`
   instead of destroying the object, and `npm run sweep:blobs` destroys it
   only once no live database backup can still reference it (35 days).
   Bucket versioning is a second, independent net under that; it is not the
   thing the restore story depends on.

6. **Verify against the live database and a real browser.** Everything this
   branch could not check without Postgres or a browser is listed, with exact
   steps, in `docs/rollout-gate-manual-verify.md`. The lockout check (an
   invited Traveller signing in **twice**, across the Invite-acceptance
   boundary) is the one to do first.

## 4d. Feedback note site — deploy order (`feat/feedback-site-tag`)

`prisma/migrations/20260926000000_feedback_note_site` adds the nullable
`FeedbackNote.site` column that this branch's code selects and writes.
**Deploy production — the migration included — before this code reaches any
preview or beta**, including a preview Vercel creates just from pushing this
branch. New code against the old (unmigrated) schema is the direction §4b's
worked examples don't cover: `VIEW_SELECT` includes `site`, so every
`listFeedbackNotes` and `createFeedbackNote` call 500s (Prisma P2022, column
does not exist) until the production migration has run. It's non-destructive
— a failed send stays in the offline queue and the flush retries it once the
column exists — but it will look broken on that preview until then. Once
`main` has deployed with the migration applied, merging `main` into `beta` is
safe (the column already exists in the shared database).

`site` also depends on `VERCEL_GIT_COMMIT_REF` being exposed to the running
function, not just `VERCEL_ENV`. Vercel always exposes `VERCEL_ENV` at
runtime, but the Git system variables (`VERCEL_GIT_COMMIT_REF` among them)
only reach the runtime when the project's "Automatically expose System
Environment Variables" setting is on (the default for new projects). If it's
off, every beta note records as `preview` instead of `beta` — still not
`main`, so it fails safe, but it lands in the wrong inbox section with the
wrong chip. **The check:** after beta is deployed, write one Feedback note
from beta and confirm both the panel chip and the pulled inbox show it as
**Beta**. If either shows "Preview" instead, turn the setting on and redeploy.

## 5. GitHub Actions cron (reminder delivery)

In the GitHub repo settings:
- **Secrets and variables → Actions → Secrets:** add `CRON_SECRET` (same value as Vercel).
- **Variables:** add `APP_URL` = `https://<your-vercel-domain>` (no trailing slash).

> **Note:** Land the cron route rename away from 06/09/10/19/20 UTC: GitHub reads the
> workflow from `main` at schedule time, Vercel needs a minute or two to deploy, and a run
> inside that gap 404s and costs one Digest.

The `Digest cron` workflow then pings `/api/cron/digest` at five fixed UTC hours —
**06:00, 09:00, 10:00, 19:00 and 20:00** (`0 6,9,10,19,20 * * *`). The schedule is
deliberately not "every N minutes": each run asks the route to dispatch only to subscribers
whose *local* hour is inside the morning (06–08) or evening (20–22) window, so the five
hours exist to land inside those windows for the zones we serve. Where each run actually
lands (✔ = the run that delivers):

| UTC | Europe/Vienna (CET) | Australia/Brisbane (AEST, UTC+10) | Australia/Sydney (AEDT, UTC+11) |
|---|---|---|---|
| 06:00 | 07:00 **MORNING ✔** | 16:00 — | 17:00 — |
| 09:00 | 10:00 — | 19:00 — | 20:00 **EVENING ✔** |
| 10:00 | 11:00 — | 20:00 **EVENING ✔** | 21:00 EVENING (absorbed) |
| 19:00 | 20:00 **EVENING ✔** | 05:00 — | 06:00 **MORNING ✔** (next day) |
| 20:00 | 21:00 EVENING (absorbed) | 06:00 **MORNING ✔** (next day) | 07:00 MORNING (absorbed) |

An "absorbed" run sends nothing: the dispatch ledger is keyed (user, trip, local date,
slot), so the second run inside a window is a no-op. That redundancy is deliberate cover
for a GitHub run delayed past its hour. Note the consequence for Sydney under AEDT — the
morning Digest arrives at **06:00 local, not 07:00**, because the 19:00Z run gets there
first and claims the slot.

Trigger it once manually (Actions tab → Digest cron → Run workflow) to confirm it
returns 200. `lib/digest-schedule.test.ts` holds this schedule against the route's windows,
so removing an hour fails the suite rather than silently cutting a zone off.

**Limitation — the schedule is not universal.** Because the UTC hours are fixed and the
filter is a whole local hour, only zones whose offset lines one of those hours up with the
06–08 or 20–22 local window are served. Two cases to know about:

- **Whole-hour zones we do not cover yet.** UTC+10 is the near miss and the reason the
  10:00Z run exists: `Australia/Brisbane` never observes daylight saving, and
  `Australia/Sydney` is UTC+10 (AEST) for roughly seven months of the year. Without
  10:00Z, both get a morning Digest and **never the 8pm one** — the part of the feature
  people actually notice. Any other whole-hour offset needs the same check before a
  traveller relies on it.
- **Half-hour zones cost one more hour — not a code change.** `Asia/Kolkata` (UTC+5:30)
  and `Asia/Kathmandu` (UTC+5:45) land in no window on the five hours above, so today they
  get no Digest at all. But the filter reads the subscriber's local **hour**, and a half
  hour of offset does not move it out of one: a run at **15:00Z** is 20:30 in Kolkata and
  20:45 in Kathmandu — hour 20 either way, already inside the evening window. So a
  half-hour zone is served exactly like any other, by adding its hour.
  `lib/digest-schedule.test.ts` asserts both halves of that.

Supporting a new zone means adding the matching UTC hour(s) to the `cron:` list in
`.github/workflows/digest-cron.yml` — there is no fallback that covers them
automatically. That is the whole job, for whole-hour and half-hour zones alike; the window
logic in `lib/digest-schedule.ts` never needs to change.

A device on a zone this schedule misses is told so in the Trip's **Settings → Digest**
panel, which judges the stored zone against these same hours via `servedSlotsForZone`.
There is still nothing in the cron logs — the run considers the device and simply matches
no window — so the panel is the only place it surfaces.

**Set all four VAPID variables in Vercel *before* the first deploy** —
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (step 4's table). `NEXT_PUBLIC_*` values are inlined into
the client bundle **at build time**, so adding `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the
dashboard after a deploy does nothing until you redeploy: the Enable button keeps
reporting that notifications need setup even though the server-side keys are present.

**The `CronHeartbeat` table must exist before this route runs.** The
`20260920000000_cron_heartbeat` migration adds it — a single row, stamped with
`lastRunAt` on every authorized cron hit whether or not a Digest was actually
sent, so the Account page can tell a genuinely quiet week apart from a
dispatcher that has stopped running at all (a `DigestDispatch` row only exists
when something was sent, so it cannot answer that question). Apply this
migration in the same deploy as the rest of the schema; there is nothing
route-specific to configure beyond that. Until the first authorized cron hit
lands against the deployed table — including on a brand-new deployment where
no row has ever been written — the Account page reads it as "never run",
which is correct and expected, not a bug to chase.

## 5b. Database backups — who can download the dump

`.github/workflows/db-backup.yml` runs a daily `pg_dump` of the production
Neon database and uploads it as a **GitHub Actions artifact** with 30-day
retention. Recorded here because the access model is not obvious from the
workflow file: **who can download an Actions artifact is exactly who can read
the repository.** There is no separate artifact permission.

The repository was **public until 2026-09-23** and is now **private**.

What a dump contains, so the exposure is stated rather than inferred:

- **Bearer tokens** — `ShareLink.token`, `CalendarFeed.token`, `Invite.token`,
  `GlobeInvite.token`, `Account.access_token` / `refresh_token` / `id_token`,
  and `PushSubscription.p256dh` / `auth`. The two token columns this list
  deliberately omits are `Session.sessionToken` and `VerificationToken.token`:
  both tables exist in the schema for the Auth.js adapter but are **empty in
  practice**, because sessions are JWTs (`strategy: "jwt"`) and there is no
  email/magic-link provider. They were considered, not overlooked.
- **All Traveller content** — every Trip, Stop, Accommodation, Cost, Note,
  Journal entry, Attachment row, Feedback note (including the user agent it
  records), Access request and error report.
- **CI secrets are NOT in it.** `AUTH_SECRET` is a Vercel environment
  variable and never reaches the database, so **session forgery from the dump
  alone is not possible**, and there is nothing to rotate on that account.

Two operational consequences of the repository being private:

- Going private does not un-publish artifacts that were downloadable while it
  was public. Existing `neon-backup-*` artifacts are their own item.
- A private repository on the **Free plan** drops to **2,000 Actions minutes**
  and **500 MB of artifact storage**. Thirty retained dumps could approach the
  storage cap; R2 is already configured and is the obvious alternative
  destination if it does.

### Outstanding operator actions

Recorded here because this is the only place they survive. Going private
closed the door; it did not undo what was already reachable through it.

1. **Delete the existing `neon-backup-*` artifacts.** GitHub → Actions → *DB
   backup* → each run → delete the artifact. Going private does not
   un-publish what was already downloadable while the repository was public.
2. **Rotate the bearer tokens that were in those dumps.** These are
   capability URLs — whoever holds one needs no account:
   - `ShareLink.token` — revoke and re-create each Share link from the Trip's
     Settings; the holders of the old URLs will need the new ones.
   - `CalendarFeed.token` — same, from Settings → Calendar feed; anyone
     subscribed re-subscribes to the new URL.
   - `Invite.token` — currently unused by any flow (ADR 0017 notes it is
     reserved for a future accept-by-link), so nothing depends on it, but it
     is in the dump.
   - `GlobeInvite.token` — same shape.
3. **Force a Google re-auth** so the stored `Account.access_token`,
   `refresh_token` and `id_token` are retired. TEEPEE never refreshes Google
   tokens (`strategy: "jwt"`, no token refresh path), so these grant nothing
   *in* TEEPEE — the exposure is against Google, not against this app.
4. **Consider moving the dump target off Actions artifacts entirely.** R2 is
   already configured and already holds attachments. This removes the whole
   class rather than leaving it depending on a repository setting that is
   invisible from the code — nobody reading this repository can tell whether
   it is public.

## 6. First sign-in

1. Open the deployed URL, sign in with Google.
2. Create your trip, then invite your partner by email on the trip's Settings page.
3. Your partner signs in with that Google email and is auto-added.

### One-off: sweep orphaned costs (after the ADR 0039 deploy)

Deletes before ADR 0039 orphaned Cost rows (owner gone, money still in the
budget). Run ONCE against prod after deploying the reliability round:

    npx tsx scripts/sweep-orphaned-costs.ts            # dry run — review output
    npx tsx scripts/sweep-orphaned-costs.ts --execute  # apply

Never-paid orphans are deleted; ever-paid orphans become "Other costs"
labelled "<label> (deleted)". Requires DATABASE_URL pointing at prod.

## Enabling AI later (optional, paid)

Add `ANTHROPIC_API_KEY` (and optionally `AI_MODEL=claude-haiku-4-5` for lower cost) in
Vercel env and redeploy. No code change.
