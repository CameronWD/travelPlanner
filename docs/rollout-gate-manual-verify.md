# Rollout gate — manual verification

Everything on `feat/rollout-gate` that the build sandbox **could not** verify,
because it has no Postgres and no browser. Each item says what is being
checked, why it matters, and the exact steps.

Work through §1 before letting anyone else near the deployment. **§1.5** (the
lockout check — an invited Traveller signing in *twice*) is the one that would
have gone wrong silently.

Run this **after the deploy**, against production — most of it is about the
migration having actually landed. `docs/DEPLOY.md` §4c is the pre-deploy half.

---

## How to run the steps

Steps come in three kinds, labelled on each one.

**`SQL`** — paste into Neon's SQL editor (Neon console → your project → SQL
Editor), which is the least error-prone way to run a read-only query against
production. If you would rather use `psql`, every query here also runs as:

```bash
psql "$DIRECT_URL" -c '<the query>'
```

**Most, not all, paste in unchanged.** The queries use double-quoted
identifiers, which are safe inside those outer single quotes — but at least
six of them also contain **single-quoted string literals** (`'<trip id>'`,
`LOWER('<address>')`, `= '<key>'`, and so on). A single quote inside a
single-quoted shell argument ends the argument; those queries will not paste
into the form above as written. Either use the Neon SQL editor for them, or
switch the *outer* quotes to double quotes and escape nothing else:

```bash
psql "$DIRECT_URL" -c "SELECT email FROM \"AllowedEmail\" WHERE email = 'you@example.com';"
```

This is the same class of hazard as the `npm run x -- --flag` separator that
§3.1 handles: the instruction looks like it works and quietly does something
else. `psql` is not installed in the build sandbox, so the **queries** below
are written against the schema in `prisma/schema.prisma` and
`prisma/migrations/`, and it is the `psql` *invocation* that is untested.

**`SHELL`** — run from the repository root. These were each checked to run as
written (argument parsing, module resolution, exit behaviour); only their
production side-effects are unverified.

`scripts/sweep-deleted-blobs.ts` **does** load `.env*` files, via
`import "./load-env"`, the same as `feedback-pull` and `feedback-resolve`
(final fix wave, C1 — it did not before, which is what made the `--execute`
bug below possible). Three consequences worth knowing before you type
anything, and the first one is the reason §3 opens with a warning:

- **`.env.production.local` wins over an inline variable, and over `env -u`.**
  `load-env` calls dotenv with `override: true` for that file
  (`scripts/load-env.ts:20-21`), so when the file exists it re-sets every
  variable it defines **after** your shell prefix has run and **before**
  `main()` reads any of them. `DATABASE_URL=… npm run sweep:blobs` therefore
  does not override `DATABASE_URL`; `env -u STORAGE_DRIVER npm run
  sweep:blobs` does not leave `STORAGE_DRIVER` unset; `STORAGE_DRIVER=r2 npm
  run sweep:blobs` does not select r2. **On the operator's machine there is no
  shell-level way to change what this script sees.** Change the file, or run
  the script somewhere that file is not.
- **The operator's `.env.production.local` sets `STORAGE_DRIVER="local"`** —
  alongside a production `DATABASE_URL`. So a sweep run on that machine is
  always "production database, local-disk storage driver" unless the file
  itself is changed. That combination is safe for a dry run and **catastrophic
  for `--execute`**: see the warning opening §3.
- **`STORAGE_DRIVER` now decides whether `--execute` runs at all** — see §3.1.
  Because dotenv makes the variable explicit on the operator's machine, the
  refusal never fires there; the refusal protects a machine *without* that
  file, and cannot be demonstrated on one that has it (§3.1a).

**`BROWSER`** — do it by hand in a real browser. There is no headless browser
in this repo's test setup, so nothing below marked `BROWSER` has any automated
cover at all.

---

## 1. The door (ADR 0057)

### 1.1 The migration applied, and `AllowedEmail` was backfilled

**Why:** if the backfill did not run, the gate starts enforcing against an
empty table and **nobody can sign in — including you** — unless
`ALLOWED_EMAILS` was set. This is the first thing to check after the deploy.

`SQL` — the migration is recorded as applied:

```sql
SELECT migration_name, finished_at, applied_steps_count, logs
FROM _prisma_migrations
WHERE migration_name IN (
  '20260922000000_rollout_gate',
  '20260921120000_user_whats_new_seen_at'
)
ORDER BY finished_at;
```

Expect **two** rows, both with a non-null `finished_at`, `applied_steps_count
= 1` and `logs` null. A row with `finished_at` null is a failed migration and
nothing below will make sense until it is resolved.

`SQL` — every existing account is on the allowlist, lowercased:

```sql
SELECT
  (SELECT count(*) FROM "User" WHERE "email" IS NOT NULL)            AS users,
  (SELECT count(*) FROM "AllowedEmail")                              AS allowed,
  (SELECT count(*) FROM "User" u
     WHERE u."email" IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM "AllowedEmail" a WHERE a."email" = LOWER(u."email")
       ))                                                            AS missing,
  (SELECT count(*) FROM "AllowedEmail" WHERE "email" <> LOWER("email")) AS not_lowercased;
```

Expect `missing = 0` and `not_lowercased = 0`. `allowed` may exceed `users`
only if you had already added addresses by hand; on a fresh deploy the two
should match.

`SQL` — the Journal key really did change (the §4b window closed cleanly):

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'JournalEntry'
ORDER BY indexname;
```

Expect `JournalEntry_tripId_date_authorId_key` **present** and
`JournalEntry_tripId_date_key` **absent**.

`SQL` — `gen_random_uuid()` was available on the live server (the migration's
backfill used it; this confirms the assumption the migration recorded rather
than verified):

```sql
SELECT current_setting('server_version') AS pg_version, gen_random_uuid() AS sample;
```

Expect a version of **13 or higher** (`db-backup.yml` records Neon as
PostgreSQL 18 as of 2026-09-16) and a UUID. Run this against the database the
*app* uses — confirm Vercel's `DIRECT_URL` points at the same Neon project
and branch as the connection string you are querying with.

### 1.2 `Invite.expiresAt` is sane, and nothing is already expired

**Why:** the migration backfills from **deploy date + 30 days**, never
`createdAt + 30`. If it had used `createdAt`, every pending Invite older than
30 days would be dead at the instant of deploy — and under ADR 0057 a dead
Invite is also a refused sign-in.

`SQL`:

```sql
SELECT
  count(*)                                                     AS pending,
  count(*) FILTER (WHERE "expiresAt" IS NULL)                  AS no_expiry,
  count(*) FILTER (WHERE "expiresAt" <= now())                 AS already_expired,
  min("expiresAt")                                             AS earliest,
  max("expiresAt")                                             AS latest
FROM "Invite"
WHERE "acceptedAt" IS NULL;
```

Expect `already_expired = 0`, `no_expiry = 0` (the backfill covers every
pending row), and `earliest`/`latest` both roughly **30 days from the deploy
moment** — *not* 30 days from when the Invites were created. Run the same
query against `"GlobeInvite"`.

`no_expiry > 0` is only acceptable for rows created by the **old** build
during the deploy window; a null `expiresAt` is deliberately treated as valid
(ADR 0017's amendment), so those rows are not broken, but their count should
be 0 or very small and should not grow afterwards.

### 1.3 A refused sign-in records an Access request and appears in `/admin`

**Why:** this is the whole refusal path — the callback returning false, the
redirect landing on the branded card rather than Auth.js's own error page,
and the request reaching the operator. Only the last of those has unit cover.

`BROWSER`:

1. In a private/incognito window (no TEEPEE session), open the deployed URL
   and sign in with a Google account that is **not** on the allowlist and has
   **no** pending Trip Invite.
2. **Expect:** you land back on `/signin?error=AccessDenied` — *not* on
   `/api/auth/error` — showing the card headed **"TEEPEE is invite-only."**
   Landing on an unbranded Auth.js error page means `pages.error` is not
   pointing at `/signin`.
3. **Expect:** no account was created. Confirm with
   `SELECT count(*) FROM "User" WHERE "email" = '<that address>';` → `0`.
4. As an `ADMIN_EMAILS` operator, open `/admin`. **Expect** the address in
   the Access requests list, with the Google display name and avatar.
5. Attempt the refused sign-in a second time. **Expect** the same row with
   `attempts` incremented rather than a duplicate row:
   `SELECT email, attempts, status, "resolvedAt" FROM "AccessRequest";`
6. If you have a Device registered for push (ADR 0048), **expect** one
   notification deep-linking to `/admin`. This is the only end-to-end check of
   the notification channel; `web-push` against a real endpoint cannot be
   exercised in the suite.

### 1.4 Approving lets that person in on the next attempt

**Why:** approval is the only writer to `AllowedEmail` other than the
migration and invite-admission, and it must lowercase explicitly rather than
trusting the upstream value.

`BROWSER` / `SQL`:

1. In `/admin`, press **Approve** on the request from §1.3.
2. **Expect:** the row leaves the Access requests list and the address appears
   in the **"Who can sign in"** card on the same page (that is the allowlist
   panel's title — `app/(app)/admin/page.tsx`).
3. `SELECT email, note FROM "AllowedEmail" WHERE email = LOWER('<address>');`
   → exactly one row, the email **lowercased** even if the Google profile was
   mixed case.
4. In the private window, sign in again with that account. **Expect** it
   succeeds and lands in the app.
5. **Revoke** the same address in `/admin`, then confirm the row is gone.
   **Do not expect the open session to end** — revocation is JWT-bounded
   (ADR 0057): it takes effect at the next sign-in, not immediately. Sign out
   in the private window, then try again — *that* attempt should be refused.
6. **Expect that refused attempt to put the request BACK in the Access
   requests list**, with a fresh admin notification headed "Access request
   reopened". This is deliberate, not a duplicate of §1.3: approving stamps
   `resolvedAt` (which is what `listAccessRequests` filters on), so without
   the reopen a revoked person would be invisible in `/admin` forever — the
   page has no reopen control and no add-an-address control
   (`lib/access-requests.ts`, final fix wave I2). A **dismissed** request is
   the one case that must *not* reopen.

### 1.5 THE LOCKOUT REGRESSION — an invited Traveller signs in TWICE

**Why:** this is the single most important check in this document. Admission
by a pending Invite used to be a **one-shot ticket**: the Invite is marked
accepted moments after the first sign-in, so the predicate that admitted them
goes false, and the *second* sign-in refuses someone who by then holds a
`User` row, a `TripMember` row and their own content. `admitByTripInvite`
fixes it by writing an `AllowedEmail` row at the moment of admission. The fix
is unit-tested against a mocked database; this is the only check that it works
against the real one.

`BROWSER` / `SQL`:

1. Confirm the target address is **not** already on the allowlist:
   `SELECT * FROM "AllowedEmail" WHERE email = LOWER('<address>');` → 0 rows.
   If it is there (e.g. from the backfill), use a different account.
2. As a Trip owner, invite that address on a Trip's Settings page.
3. In a private window, sign in as that person. **Expect** success, and the
   Trip visible.
4. `SELECT email, note FROM "AllowedEmail" WHERE email = LOWER('<address>');`
   → **one row**, with `note = 'admitted by Trip Invite'`. If this row is
   missing, stop — the lockout regression is live.
5. `SELECT "acceptedAt" FROM "Invite" WHERE email = LOWER('<address>');` →
   non-null. The ticket has now been spent; step 6 is the second sign-in it
   used to break.
6. **Sign out** in the private window and sign in again as the same person.
   **Expect** success. A "TEEPEE is invite-only." card here is the regression.
7. **Expect** one admin push/notification for the *first* admission only —
   not a second one after step 6.

### 1.6 Admission is transitive — confirm it is visible, not silent

**Why:** ADR 0057 accepts that anyone admitted can create a Trip and invite
others, on the condition that growth is visible. Worth seeing once so the
notification is recognised when it matters.

`BROWSER`: as the Traveller admitted in §1.5, create a Trip and invite a
fourth address. When that person signs in, **expect** an admin notification
and a new `AllowedEmail` row — from a chain no Admin approved.

### 1.7 `/privacy` and `/terms` render with no session

`BROWSER`: in a private window, open `/privacy` and `/terms` directly.
**Expect** both to render (they sit outside the auth-gated `(app)` group) and
both to be linked from `/signin`. Google's consent screen needs these URLs
(`docs/DEPLOY.md` §4c step 4) and a published app whose policy URL 302s to a
sign-in page is a rejected app.

---

## 2. The Journal (ADR 0058)

### 2.1 Two Travellers write the same day and BOTH entries survive

**Why:** the P0 (`ARCH-DAT-6`) this branch removes by construction. The suite
mocks the database, so no test has ever exercised the real unique key.

`BROWSER`, two accounts on the same Trip, two browsers (or one private):

1. Both open the **same** Trip day's Journal.
2. Traveller A types a distinctive sentence; click outside the box to trigger
   the autosave-on-blur.
3. Traveller B types a **different** distinctive sentence on the same day, and
   blurs.
4. Reload both. **Expect** both entries present, attributed to their authors —
   not one replacing the other.
5. `SQL`:
   ```sql
   SELECT "tripId", "date", "authorId", left("body", 40)
   FROM "JournalEntry"
   WHERE "tripId" = '<trip id>' AND "date" = '<YYYY-MM-DD>';
   ```
   **Expect two rows.** One row means the old unique key survived.
6. Have Traveller A blank their entry and blur. **Expect nothing to happen**:
   an empty body is a pure no-op by design — it neither deletes the entry nor
   writes an empty row (`server/actions/journal.ts`, ADR 0058 decision 4).
   Reload and **expect A's original text to still be there**. The confirm
   dialog belongs to **Remove entry**, which is the only way to delete one, so
   use that instead and check B's entry is untouched afterwards. (An earlier
   version of this step expected a confirm on blanking; there is none, and
   recording its absence as a regression — or "fixing" the deliberate no-op —
   is the failure this note exists to prevent.)

### 2.2 The §4b window closed

`BROWSER`: immediately after the deploy, save a Journal entry once. A failure
here (rather than during the build) would mean the new index did not land —
cross-check with the `pg_indexes` query in §1.1.

---

## 3. Attachments and blob retention (`ARCH-DAT-3`)

> ### ⚠ Never run `--execute` as part of this verification
>
> **Nothing in this section asks you to.** Every step here is a dry run or a
> read-only query, and that is the whole design — `--execute` destroys
> objects, and on the operator's machine it destroys them *wrongly*.
>
> `--execute` is safe to run only when `STORAGE_DRIVER` is genuinely resolved
> to the **production** driver (`r2`) for that process. On a machine holding
> `.env.production.local`, it is not and cannot be made so from the command
> line: that file sets `STORAGE_DRIVER="local"` and `load-env` applies it with
> `override: true`, so an inline `STORAGE_DRIVER=r2` prefix is silently
> discarded. The run then pairs a **production database** with a **local-disk
> storage driver** whose `delete()` is `fs.rm(..., { force: true })` — a
> silent no-op for a key that is not on this laptop. Result: every
> `DeletedBlob` row deleted, every R2 object left alive and permanently
> orphaned, and `destroyed N, failed 0` printed as if it had worked. That is
> the exact failure §3.1a records, and the `--execute` refusal does **not**
> catch it here, because the variable is set — just set to the wrong thing.
>
> **The printed `Storage driver:` line is the only reliable confirmation of
> what a run will act through.** Not the command line, not the environment you
> think you exported. If that line does not say `r2`, do not run `--execute`.
> A real sweep belongs on a host configured for R2 (or after editing
> `.env.production.local` itself and confirming the printed line), never as a
> verification step.

### 3.1 The dry run destroys nothing

**Why:** an earlier version of these steps shipped `npm run sweep:blobs
--execute`, which **npm swallows**: it is parsed as an npm config flag, never
reaches the script, and the run silently falls back to a dry run. The
safety-critical check therefore passed without testing anything. The `--`
separator is mandatory.

`SHELL`:

```bash
DATABASE_URL='<production pooled URL>' npm run sweep:blobs -- --days=1
```

(The inline `DATABASE_URL` is **ignored** when `.env.production.local` exists
— see "How to run the steps". It is written out for a machine without that
file, and so you can see which database the run is meant for.)

**Expect:** npm echoes `tsx scripts/sweep-deleted-blobs.ts --days=1` — if the
echoed line has no `--days=1` on it, the separator was lost and the run is
meaningless. **Expect** a `Storage driver: …` line first, then a candidate
count and a per-key listing, and **no deletions**: dry run is the default and
it constructs no storage client at all, so it cannot destroy anything even
with R2 credentials in the environment.

**Read that `Storage driver:` line.** It is printed on every run, dry or not,
so the dry run tells you what the real one would act through — and it is the
*only* trustworthy statement of that (see the warning opening §3). On a dry
run it carries a suffix, so the whole line reads:

```
Storage driver: local (dry run — nothing will be destroyed)
```

**`local` is what you will see on the operator's machine, and it is the stop
sign.** It means a real run would act through the local-disk driver while
reading the production database: it would delete nothing from R2 and report
that it had deleted everything (§3.1a). Blobs that live in R2 can only be
swept from an environment where this line says `r2`.

Two labels, and which one you get:

- `local` (or `r2`, `s3`) — plain, no parenthetical. `STORAGE_DRIVER` was set
  explicitly, which on this machine means `.env.production.local` set it.
  **This is the only label the operator will ever see.**
- `local (default — STORAGE_DRIVER is not set)` — the variable was genuinely
  absent (`lib/sweep-blobs-driver.ts:61`). This **cannot** appear on a machine
  with `.env.production.local`, because dotenv sets the variable before the
  script reads it. Do not wait to see this label; the plain `local` above
  carries exactly the same warning.

**A run that prints `Nothing to sweep.` and exits is also a pass.** On a
fresh deployment there is nothing older than a day, so the candidate query
returns empty and the script stops there. The rest of this section is about
distrusting a quiet run for the *wrong* reason (a swallowed flag); a
legitimately quiet run looks like this, and the `--days=0` step below is how
you tell the two apart. To see the listing path exercised, run it after §3.2
has put a real row in `DeletedBlob`.

Sanity-check that the argument is genuinely reaching the script:

```bash
DATABASE_URL='<production pooled URL>' npm run sweep:blobs -- --days=0
```

**Expect** it to fail with `Invalid --days value: "--days=0". Expected a
positive number.` If it instead runs a normal 35-day dry run, the `--` was
dropped and every other sweep command you type is a no-op in the same way.

**Do not run `--execute` as part of verification** — not in any form, not with
any prefix. See the warning opening §3.

### 3.1a `--execute` refuses to guess the storage driver — and why that is not a step

**Why:** the failure this closes was silent in both directions. With only
`DATABASE_URL` in the environment — exactly how the steps above are written —
`getStorage()` fell through to its `"local"` default, whose `delete` is
`fs.rm(path, { force: true })`: a no-op, not an error, for a key that is not
on the local disk. So `--execute` printed `[DESTROY]` for every key and
`destroyed N, failed 0`, **deleted every `DeletedBlob` row**, and left every
R2 object alive with nothing pointing at it and no record that it had ever
been scheduled — unfindable by any future sweep. The dry-run path builds no
driver, so no amount of dry-run checking could have surfaced it.

**There is no step to run here, and that is deliberate.** An earlier version
of this section told you to run
`env -u STORAGE_DRIVER npm run sweep:blobs -- --execute` and called it safe
"because it is the refusal". On the operator's machine it is not the refusal —
it is the bug. `load-env` re-sets `STORAGE_DRIVER` to `"local"` from
`.env.production.local` with `override: true`, **after** `env -u` has cleared
it and **before** `main()` reads it, so the variable is set, the guard is
satisfied, and the command becomes a real `--execute` against the production
database through the no-op local-disk driver. It is harmless only while
`DeletedBlob` happens to be empty; the day a row ages past 35 days it wipes
the retention ledger and deletes nothing. Do not resurrect that command, and
do not reach for `env -u`, `VAR=` or `export` to work around it — none of
them survive dotenv's `override: true`.

**What the guard actually does**, for the record: with `--execute` and
`STORAGE_DRIVER` genuinely unset, `resolveSweepDriver` returns a refusal
naming the variable, `main()` prints it and sets `process.exitCode = 1`
*before the candidate query runs*, and nothing is read or written.
`STORAGE_DRIVER=local` is **accepted** for `--execute` — setting it is a
choice, not a default. Only the unset case refuses, which is why the guard
does nothing for the operator: on that machine the variable is never unset.

**How it is verified instead.** `resolveSweepDriver` is a pure function,
extracted from the script precisely so this can be checked without a database
or a destructive run; `lib/sweep-blobs-driver.test.ts` covers the refusal, the
whitespace-only case, explicit `local`, explicit `r2`, and both dry-run
labels. That is the cover for the guard, and it is enough — the guard is a
backstop, not a feature, and the thing that actually protects a real sweep is
reading the `Storage driver:` line (§3.1).

The one thing worth confirming by hand, and it is free: a dry run in §3.1 that
prints a `Storage driver:` line **at all** is a build that has this fix.
That line and the refusal are emitted by the same `resolveSweepDriver` call
(`scripts/sweep-deleted-blobs.ts:96-102`), so a run that prints a candidate
count with no driver line above it is the *old* build, and `--execute` must
not be run against it under any configuration.

### 3.2 A deleted attachment's blob still exists

**Why:** the whole point of `ARCH-DAT-3`'s fix. A database restore from inside
the 30-day backup window must find the file the restored `Attachment` row
points at.

`BROWSER` / `SQL` / `SHELL`:

1. Upload an attachment to a Trip. Note its storage key:
   ```sql
   SELECT id, "storageKey", "filename" FROM "Attachment" ORDER BY "createdAt" DESC LIMIT 1;
   ```
2. Delete that attachment in the app.
3. `SQL` — the row is gone and a retention record exists:
   ```sql
   SELECT "storageKey", "deletedAt" FROM "DeletedBlob" WHERE "storageKey" = '<key>';
   ```
   **Expect one row**, `deletedAt` = now.
4. `SHELL` — the object itself is still in R2. From the repository root:
   ```bash
   cat > blob-check.ts <<'EOF'
   import { getStorage } from "./lib/storage";
   const key = process.argv[2];
   if (!key) { console.error("usage: npx tsx blob-check.ts <storageKey>"); process.exit(1); }
   getStorage()
     .read(key)
     .then((b) => console.log(b ? `PRESENT (${b.length} bytes)` : "MISSING"))
     .catch((e) => { console.error(e); process.exit(1); });
   EOF
   STORAGE_DRIVER=r2 \
   CLOUDFLARE_ACCOUNT_ID='<…>' R2_BUCKET_NAME='<…>' \
   R2_ACCESS_KEY_ID='<…>' R2_SECRET_ACCESS_KEY='<…>' \
     npx tsx blob-check.ts '<key>'
   rm blob-check.ts
   ```
   **The inline variables above genuinely take effect here** — unlike every
   `npm run sweep:blobs` invocation in §3.1. `blob-check.ts` does not import
   `scripts/load-env`, so nothing calls dotenv and nothing overrides your
   shell. Confirm it anyway: if `read` returns bytes for a key that only
   exists in R2, you were talking to R2. Do not add a `load-env` import to
   this throwaway script — it would silently pin it to `STORAGE_DRIVER="local"`
   and turn `PRESENT`/`MISSING` into a statement about this laptop's
   `.uploads/` directory.

   **Expect `PRESENT (<n> bytes)`.** `MISSING` means something still
   hard-deletes and the retention window is fiction. (Both output branches of
   this script were exercised in the sandbox against the local-disk driver;
   only the R2 credentials are untested.)
5. Same check for a Trip cover image (`Trip.coverImageKey`) — `deleteTrip` and
   the cover-replacement path were converted too.

### 3.3 The sweep never destroys a live blob

`SQL` — belt-and-braces before any future `--execute` run: no `DeletedBlob`
key is still referenced by live data.

```sql
SELECT d."storageKey"
FROM "DeletedBlob" d
WHERE EXISTS (SELECT 1 FROM "Attachment" a WHERE a."storageKey" = d."storageKey")
   OR EXISTS (SELECT 1 FROM "Trip" t WHERE t."coverImageKey" = d."storageKey");
```

Expect **0 rows** normally. Rows here are not a bug — they are what a restore
produces, and the sweep is built to skip them *and* clear the stale record so
a later real deletion starts a fresh clock. But if any appear, do not run
`--execute` until you understand why.

---

## 4. The Calendar feed (`ARCH-TEN-7`, ADR 0052 amendment)

### 4.1 The feed carries no confirmation numbers, booking refs or notes

**Why:** the feed is a bearer-token URL with no identity. `Transport.reference`
was in the event **SUMMARY**, so it reached calendar previews and lock
screens.

`BROWSER` / `SHELL`:

1. On a Trip, set **distinctive sentinel values** you can grep for — they must
   be strings that appear nowhere else:
   - an Accommodation `confirmation` of `ZZCONFIRMZZ`
   - an Accommodation `notes` of `ZZACCNOTEZZ`
   - an Item `booking` of `ZZBOOKINGZZ` and `notes` of `ZZITEMNOTEZZ`
   - a Transport `reference` of `ZZREFZZ`
2. Create (or copy) the Trip's Calendar feed URL from Settings → Calendar
   feed. It looks like `https://<domain>/api/calendar/<token>`.
3. `SHELL`:
   ```bash
   curl -sS "https://<domain>/api/calendar/<token>" -o /tmp/teepee-feed.ics
   grep -c 'BEGIN:VEVENT' /tmp/teepee-feed.ics
   grep -nE 'ZZCONFIRMZZ|ZZACCNOTEZZ|ZZBOOKINGZZ|ZZITEMNOTEZZ|ZZREFZZ' /tmp/teepee-feed.ics \
     || echo 'PASS — no sentinel value appears in the feed'
   ```
   **Expect** a non-zero VEVENT count (so you know you actually fetched a
   populated feed and are not passing vacuously on an empty one) followed by
   `PASS — no sentinel value appears in the feed`. Any `grep` hit is a leak;
   a hit on a `SUMMARY:` line is the worst case.
4. Confirm the feed is still **useful**. What `lib/ics.ts` actually emits —
   check for these, and do *not* expect anything else:
   - **Accommodation** → `SUMMARY:🛏 Stay: <name>` and, **only when the
     Accommodation has an `address`**, a `LOCATION:` carrying that address.
     The name is in the SUMMARY, never the LOCATION (`lib/ics.ts:253-262`).
   - **Item** → `SUMMARY:<title>`, plus `LOCATION:<address>` when the Item has
     an address, and `CATEGORIES:<category>` (`lib/ics.ts:174-197`). Only
     Items with a `date` are emitted.
   - **Transport** → `SUMMARY:✈ <departure> → <arrival>` and
     `CATEGORIES:Transport`, with **no `LOCATION:` line at all** — the event
     builder is passed `null` for location (`lib/ics.ts:221`). An absent
     LOCATION on a Transport event is correct, not a fault.
   - **Stops emit no VEVENT whatsoever.** They are fetched only to build the
     timezone map the other three loops resolve wall-clock times against
     (`lib/ics.ts:139`). A Stop name appearing nowhere in the file is the
     expected result — looking for one and not finding it is not a bug.

   Two things that will make a naive `grep` miss a value that *is* present:
   RFC-5545 escaping puts a backslash before every comma and semicolon (so an
   address renders as `12 High St\, Bath`), and lines longer than 75 octets
   are folded onto continuation lines beginning with a space. Grep for a
   distinctive word rather than a whole address.
5. `BROWSER`: subscribe to the URL in a real calendar client once. ICS
   escaping and line folding are unit-tested, but no test has ever handed the
   output to a calendar application.

---

## 5. Errors (ADR 0059)

### 5.1 A client error reaches `/admin`

`BROWSER`:

1. Trigger a client-side error boundary (the simplest reliable way is to POST
   a synthetic report from the browser console on the deployed origin).
   **Edit the date to today's, then paste the snippet whole** — step 5 pastes
   it again completely unchanged, and the two only dedup together if the
   `message` is byte-identical both times:
   ```js
   fetch('/api/client-error', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ message: 'manual verify probe 2026-09-23', route: '/signin' }),
   }).then(r => console.log(r.status));
   ```
   **Expect `204`.** The date is there to keep this run's probe distinct from
   an earlier verification's, so it is a **fixed literal you type once** —
   never `Date.now()`, which would mint a different message (and so a
   different dedup signature, and so a second row) on every call.
2. Do it **while signed out**, from `/signin`. The endpoint is deliberately
   open (ADR 0059) because a boundary can fire before there is a session.
3. Open `/admin` as an Admin. **Expect** the report in the Errors section with
   `source: client`.
4. **Expect NO push notification for it.** Client-sourced reports record but
   never push — that is decision 5 in ADR 0059, and a notification here would
   mean an unauthenticated caller can put text on your lock screen.
5. Paste the **exact same snippet** from step 1 a second time — same date,
   same every character. (If you navigated away in steps 2–4, paste it again
   from this document rather than retyping it.) **Expect** the existing row's
   `count` to increment to 2 rather than a second row appearing. The dedup
   signature is `name + message + first stack frame`, hashed
   (`lib/error-sink.ts`); `name` is always "Error" here and the route clears
   the stack when the caller sends none, so `message` is the only thing that
   distinguishes the two. Change one character of it and you get a second row
   with `count = 1`, which looks exactly like the failure this step is
   checking for.
6. `SQL`:
   ```sql
   SELECT signature, source, "count", "firstSeen", "lastSeen", left(message, 60)
   FROM "ErrorReport" ORDER BY "lastSeen" DESC LIMIT 10;
   ```
   **Expect one row** for the probe message, with `count = 2`, `source =
   client`, and `firstSeen` < `lastSeen`.

### 5.2 A server error pushes once

`BROWSER`: the first time a genuine server-side failure is caught in
production, **expect** exactly one notification and one row whose `count`
climbs thereafter. There is no safe way to provoke this deliberately; note it
as something to watch for rather than a step to perform.

---

## 6. Membership, ownership and Globe (`ARCH-DAT-1`, `-4`, `ARCH-TEN-4`, `ARCH-ADR-1`, `-3`)

All of these are pinned by logic-level tests against a mocked database. What
is unverified is the rendering and the real-guard behaviour end to end.

`BROWSER`, each a single pass:

1. **Remove and leave.** On a Trip's Settings, remove a co-Traveller; confirm
   they lose access but their Journal entries, Notes and Costs remain. As a
   non-owner, use **Leave**. **Expect** the owner cannot remove themselves or
   leave. **Expect** their `AllowedEmail` row to survive — Trip removal is not
   sign-in revocation (ADR 0057); use `/admin` → Revoke for that.
2. **Owner-only destruction.** As a non-owner member, attempt to delete a Stop
   and to promote a Fork. **Expect** a refusal *toast carrying the server's own
   message*, and **expect the Stop to still be rendered** — no optimistic
   removal.
3. **Deletion preview.** Delete a Stop that holds an Accommodation with a
   confirmation number, an attachment, a note and an unpaid Cost. **Expect**
   an itemised list of what will be lost, and **expect the confirmation number
   itself never to appear** (only that there is one). Do the same via **Make
   it fit → Drop**, which renders the same itemisation from the same source.
4. **Globe.** As a non-owner Globe member, attempt to invite someone.
   **Expect** the refusal "Only the Globe owner can invite people." As the
   owner, invite someone who **already has their own Globe**. **Expect** the
   dead-end message rather than a false "Invited".
5. **Duplicate.** Duplicate a Trip that has a co-Traveller. **Expect** the
   dialog to say they will be *invited*, and afterwards:
   ```sql
   SELECT "tripId", email, "expiresAt" FROM "Invite" WHERE "tripId" = '<new trip id>';
   SELECT "userId", role FROM "TripMember" WHERE "tripId" = '<new trip id>';
   ```
   **Expect** one `TripMember` (the duplicator, owner) and one pending
   `Invite` per co-Traveller, each with an `expiresAt` ~30 days out.

---

## 7. Known-unverifiable, recorded so nobody re-chases them

- **Real push delivery.** `web-push` against a live FCM/Apple endpoint cannot
  be exercised by the suite. §1.3 step 6 is the only end-to-end check.
- **Calendar client rendering.** §4.1 step 5.
- **R2 presigned GETs against a real bucket.** Already packaged as
  `npx tsx scripts/verify-r2-presign.ts` (needs the four R2 env vars); it
  creates and removes its own throwaway object. It sets `STORAGE_DRIVER="r2"`
  on itself and does **not** import `scripts/load-env`, so inline variables on
  its command line are honoured — the §3 hazard does not apply to it.
- **Google Cloud Console state.** Whether the OAuth app is published, and what
  the consent screen requires, is not observable from this repository.
- **`_prisma_migrations` drift.** If Vercel's `DIRECT_URL` and the connection
  string you verify with point at different Neon branches, every query in §1
  can pass while production is untouched. Check the host strings match.
