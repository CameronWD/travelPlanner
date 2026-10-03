# Restore runbook — recovering a Trip from backup

A procedure for Cam. This is a **last resort**: since ADR 0067, a deleted Trip
sits in **Recently deleted** for 30 days and the owner can **Restore** it from
the Trips page in one click. Use this runbook only when the Trip has already
been purged (past the 30-day window) or was lost some other way (e.g. rows
corrupted or removed outside the app).

## Prerequisites

- `pg_restore` and `psql` installed locally — match the `postgresql-client`
  version the db-backup workflow installs (see the version note in
  `db-backup.yml`).
- A Neon connection string for a **scratch branch** — never production.
- The GitHub CLI (`gh`), authenticated against this repository.

## 1. Fetch the backup artifact

Backups run daily via `.github/workflows/db-backup.yml`: a `pg_dump
--format=custom` (compressed custom format) uploaded as a GitHub Actions
artifact named `neon-backup-<UTC timestamp>` (e.g.
`neon-backup-20261003T232600Z`), retained for 30 days.

```bash
gh run list --workflow db-backup.yml --limit 5
gh run download <run-id> -n neon-backup-<timestamp>
```

This downloads the `.dump` file (custom-format `pg_dump` archive) into the
current directory.

## 2. Restore into a Neon branch — never production

1. In the Neon console, create a new **branch** from the current state of the
   project (Neon → your project → Branches → Create branch). This gives you
   an isolated copy with its own connection string — call it `$SCRATCH_URL`.
2. Restore the dump into that branch, not production:

   ```bash
   pg_restore --clean --no-owner -d "$SCRATCH_URL" neon-backup-<timestamp>.dump
   ```

**Never point `pg_restore` at the production `DATABASE_URL` or `DIRECT_URL`.**
`--clean` drops existing objects before recreating them — safe on a disposable
scratch branch, destructive anywhere else.

## 3. Find the Trip

On the scratch branch:

```sql
SELECT id, name, "deletedAt" FROM "Trip" WHERE name ILIKE '%…%';
```

Note the Trip's `id` — every table below is scoped by `tripId`.

**Prefer Restore in the app first.** If the Trip still exists in production
with `deletedAt` set (i.e. it's still inside its 30-day Recently-deleted
window), use **Restore** from the Trips page instead of any of this — it's
one click and needs no backup at all. This runbook is only for a Trip that
has already been purged, or lost another way.

## 4. Copy one Trip's rows across

Copy tables **parents before children**, using the Trip's `id` to scope each
query. On the scratch branch, export each table to CSV; on production,
import it. Table order (from `prisma/schema.prisma`, every model with a
`tripId` relation):

1. `Trip`
2. `Fork`
3. `TripMember`
4. `Invite`
5. `Chapter`
6. `Stop`
7. `DayTitle` — keyed to its owning `Stop`, not to the Trip (no `tripId`
   column), so it does not show up by filtering on `tripId` and needs its own
   `stopId`-scoped copy — see below. Any table keyed to a Trip *child* rather
   than to the Trip itself must be copied the same way; `DayTitle` is the only
   one in this schema.
8. `Transport`
9. `Accommodation`
10. `Item`
11. `Cost`
12. `ExchangeRate`
13. `Note`
14. `Vote`
15. `ChecklistItem`
16. `Attachment`
17. `Reminder`
18. `ShareLink`
19. `CalendarFeed`
20. `JournalEntry`
21. `Activity`
22. `DigestPreference`
23. `DigestDispatch`
24. `TripSlug` — **last**, and may conflict: `TripSlug.slug` is globally
    unique, so if the slug has since been reused by another Trip, this
    import fails on that row. Skip the conflicting row rather than force it
    — the Trip keeps its id-based routes working without its old slug.

For each table, on the **scratch branch**:

```sql
\copy (SELECT * FROM "Stop" WHERE "tripId" = '…') TO 'stop.csv' CSV HEADER
```

Then on **production**:

```sql
\copy "Stop" FROM 'stop.csv' CSV HEADER
```

Repeat for every table in the order above, substituting the table name and
(for `Trip` itself) its own `id` as the filter — **except** `DayTitle`, which
has no `tripId` and must be scoped through its Stops instead:

```sql
\copy (SELECT * FROM "DayTitle" WHERE "stopId" IN (SELECT id FROM "Stop" WHERE "tripId" = '…')) TO 'daytitle.csv' CSV HEADER
```

```sql
\copy "DayTitle" FROM 'daytitle.csv' CSV HEADER
```

Any table keyed to a Trip *child* (a `stopId`, `itemId`, etc.) rather than to
the Trip itself needs this same child-scoped `WHERE … IN (SELECT id FROM …)`
form instead of a plain `"tripId" = '…'` filter. `DayTitle` is the only one
in this schema today — checked by grepping every model for a foreign key
without also carrying its own `tripId`.

## 5. Blobs

`Attachment` rows and a Trip's cover photo point at R2 object keys, not at
data stored in Postgres — restoring the rows does not restore the files. If
the 35-day blob sweep (`scripts/sweep-deleted-blobs.ts` / `DeletedBlob`) has
run since the files were deleted, **the files themselves are gone** — say so
plainly to whoever is waiting on this restore. Restoring the database rows
alone will show broken images and dead download links for any blob the sweep
already claimed.

## 6. Verify and clean up

1. Open the Trip in the app on production and check it looks right: Stops,
   Costs, Checklist items, Attachments that still have a live blob.
2. Delete the Neon **scratch branch** once you're done with it — it's no
   longer needed and costs nothing to keep, but there's no reason to.
