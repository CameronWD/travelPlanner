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

## 4b. Deploying a column-RENAME migration (read before the next deploy)

The pending migration `prisma/migrations/20260812000000_cost_and_paid_amounts`
RENAMES columns. `vercel.json` runs `prisma migrate deploy && next build`, so the
old columns disappear while the previous deployment is still serving traffic:
**every cost read 500s for the length of the build**, and indefinitely if the
build fails. (Additive migrations have no such window — this section applies to
renames/drops only.)

Procedure for this (and any future destructive) migration:

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

### Before deploying `20260916000000_digest_and_alarms`

That migration drops `Reminder.fireAt`, `sent`, `targetType` and `targetId`, and
backfills the new `date` column from `fireAt` before dropping it. It no longer
empties the table, so a real Reminder survives the deploy — but the count is
still worth having, because it is the one number that says whether the world
matches what ADR 0047 was written against. **Immediately before deploying**, run
against production:

```sql
SELECT count(*) FROM "Reminder";
```

Expect `0`. **If it is non-zero, stop and find out why before deploying.**
Nothing in the deployed app has ever been able to write a `Reminder`: the add
form sat inside `RemindersCard`, which rendered only in the Travelling phase, and
no Trip has reached it (ADR 0047). So a non-zero count means something is running
that this migration was not designed around, and the `targetType = 'COST_DUE'`
delete may be throwing away rows a Traveller wrote.

## 5. GitHub Actions cron (reminder delivery)

In the GitHub repo settings:
- **Secrets and variables → Actions → Secrets:** add `CRON_SECRET` (same value as Vercel).
- **Variables:** add `APP_URL` = `https://<your-vercel-domain>` (no trailing slash).

The `Reminders cron` workflow then pings `/api/cron/reminders` at five fixed UTC hours —
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

Trigger it once manually (Actions tab → Reminders cron → Run workflow) to confirm it
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
`.github/workflows/reminders-cron.yml` — there is no fallback that covers them
automatically. That is the whole job, for whole-hour and half-hour zones alike; the window
logic in `lib/digest-schedule.ts` never needs to change.

A device on a zone this schedule misses is told so in the Trip's **Settings → Reminders**
panel, which judges the stored zone against these same hours via `servedSlotsForZone`.
There is still nothing in the cron logs — the run considers the device and simply matches
no window — so the panel is the only place it surfaces.

**Set all four VAPID variables in Vercel *before* the first deploy** —
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (step 4's table). `NEXT_PUBLIC_*` values are inlined into
the client bundle **at build time**, so adding `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the
dashboard after a deploy does nothing until you redeploy: the Enable button keeps
reporting that notifications need setup even though the server-side keys are present.

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
