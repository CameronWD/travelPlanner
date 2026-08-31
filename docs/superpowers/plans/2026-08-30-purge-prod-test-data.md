# Purge Prod Test Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete 10 test/demo trips, the demo Globe and the two `@example.com` demo users from the production Neon database, keeping only the real trip and Xanthia's own trips — then remove the two `:prod` seed scripts so prod can never be re-seeded with fixture data.

**Architecture:** A single throwaway script at `.verify/purge-prod.ts` (the `.verify/` directory is gitignored — the script is deliberately NOT committed, for the same reason we are deleting the `:prod` seed scripts: prod-touching tooling should not live in the repo). It runs in three modes — `backup`, `dry-run`, `execute` — and every mode first runs `assertSafe()`, which re-reads the live database and aborts unless the world still looks exactly as this plan expects. The delete order is trips → globe → users, because several `Restrict` foreign keys point at the demo users from rows that only disappear once their parent trip/globe is gone.

**Tech Stack:** `tsx` (already a devDependency), Prisma 7 with `@prisma/adapter-pg` against Neon Postgres, `dotenv` to load `.env.production.local`. No new dependencies.

## Global Constraints

- **Never commit to `main`.** All work happens on the current branch `chore/purge-prod-test-data`.
- **Never deploy.** No `vercel` commands, no `prisma migrate deploy`, no pushing. Local runs only.
- **Task 3 is orchestrator-only.** It performs the irreversible delete and REQUIRES explicit user approval first. Do NOT dispatch a subagent for Task 3, and do NOT run `execute` mode without the user saying so in this session.
- `.verify/` is gitignored — nothing created there is ever `git add`ed. Do not add it to git, and do not remove its gitignore entry.
- No new npm dependencies.
- The script targets prod. Every mode must print the masked `DATABASE_URL` host before doing anything, so the operator can see which database is about to be touched.
- Prisma 7 requires the driver adapter — always reach the client via `await import("@/lib/db")` **after** `config({ path: ".env.production.local" })` has run, never a top-level static import. A static import reads `DATABASE_URL` too early and silently hits the wrong database.
- Run scripts from the repo root: `npx tsx .verify/purge-prod.ts <mode>`.
- The `pg` driver prints a multi-line SSL deprecation warning on every connect. Filter it when reading output:
  `npx tsx .verify/purge-prod.ts dry-run 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

## The agreed kill list (authoritative — copy these IDs verbatim)

**DELETE — 10 trips:**

| Trip ID | Name |
|---|---|
| `cmqpuo1fm0002leldb6yl2ubd` | `AI TRIP - EU Christmas` |
| `cmqyizxx5000004k0lbomdnvd` | `Test Trip` |
| `cmrohowzc000004juis7o17zj` | `Cam Test` |
| `cmrsn1bfp000liqaol3ymwjb4` | `EU Christmas 2026` |
| `cmrsn1gju0090iqao5fpmhq5o` | `Alpine Road Loop — Spring 2027` |
| `cmrsn1h5n009xiqaohm3sok26` | `Japan someday` |
| `cmrsn1he400aaiqaorb31qxzq` | `Blue Mountains by rail` |
| `cmrsn1huy00b0iqaowwy4ray2` | `Great Ocean Road, right now` |
| `cmrsn1i7s00bjiqaoae8yv45p` | `Spirit of Tassie` |
| `cms2itptu00015zqrcrj1qcg8` | `Christmas in Europe 2026` |

**KEEP — 4 trips:**

| Trip ID | Name |
|---|---|
| `cmqrm07a0000004ju0duip6vs` | `X Play` |
| `cmqyoavoo000004juekmwjp7t` | `FinLast` |
| `cmr2y6ifr000204l76hla95tb` | `Europe Trip` |
| `cmrhje0lw000004jrnw1i22ym` | `THE Trip` ← the real one; must survive |

**DELETE — 1 globe:** `cmrsn1b1z0002iqaomgn71fvv` (13 markers, demo users)
**KEEP — 1 globe:** `cmra1o6jx000004jyi4abgx23` (8 markers, Cam + Xanthia)

**DELETE — 2 users:** `you@example.com`, `partner@example.com`
**KEEP — 2 users:** `cammark.williams@gmail.com`, `xanni99.m@hotmail.com`

## Why the delete order matters

These relations have **no `onDelete`**, so Prisma defaults them to `Restrict`. Deleting a demo user fails while any of these still point at them:

- `Trip.createdBy` — demo users created the 6 demo trips (all on the kill list)
- `Globe.createdBy` — `you@example.com` created the demo globe (on the kill list)
- `Marker.createdBy` — all 13 demo-user markers live in the demo globe (cascade)
- `Fork.createdBy` — 2 forks, both inside `EU Christmas 2026` (cascade)
- `JournalEntry.author` — 11 entries across `AI TRIP`, `EU Christmas 2026`, `Spirit of Tassie` (cascade)

Every one is inside something deleted earlier in the sequence, so trips → globe → users completes cleanly. `assertSafe()` re-verifies this against the live DB rather than trusting the analysis.

---

### Task 1: `.verify/purge-prod.ts` — safety guard, backup and dry-run

**Files:**
- Create: `.verify/purge-prod.ts` (gitignored — never `git add` it)

**Interfaces:**
- Consumes: `db` from `@/lib/db` (dynamic import only); `getStorage` from `@/lib/storage`.
- Produces: a CLI with three modes — `backup`, `dry-run`, `execute`. Task 2 runs `backup`, Task 3 runs `execute`. `assertSafe()` runs first in all three.

- [ ] **Step 1: Write the script**

Create `.verify/purge-prod.ts` with exactly this content:

```ts
import { config } from "dotenv";
import { writeFileSync } from "node:fs";

/**
 * One-shot purge of test/demo data from the production Neon database.
 * Throwaway: lives in gitignored .verify/ and is deleted once the purge is done.
 *
 *   npx tsx .verify/purge-prod.ts dry-run   # print the kill list, write nothing
 *   npx tsx .verify/purge-prod.ts backup    # dump doomed rows to JSON on disk
 *   npx tsx .verify/purge-prod.ts execute   # irreversible; only on explicit go
 */

config({ path: ".env.production.local" });

const MODE = process.argv[2];
const VALID_MODES = ["backup", "dry-run", "execute"];

const DELETE_TRIPS: Record<string, string> = {
  cmqpuo1fm0002leldb6yl2ubd: "AI TRIP - EU Christmas",
  cmqyizxx5000004k0lbomdnvd: "Test Trip",
  cmrohowzc000004juis7o17zj: "Cam Test",
  cmrsn1bfp000liqaol3ymwjb4: "EU Christmas 2026",
  cmrsn1gju0090iqao5fpmhq5o: "Alpine Road Loop — Spring 2027",
  cmrsn1h5n009xiqaohm3sok26: "Japan someday",
  cmrsn1he400aaiqaorb31qxzq: "Blue Mountains by rail",
  cmrsn1huy00b0iqaowwy4ray2: "Great Ocean Road, right now",
  cmrsn1i7s00bjiqaoae8yv45p: "Spirit of Tassie",
  cms2itptu00015zqrcrj1qcg8: "Christmas in Europe 2026",
};

const KEEP_TRIPS: Record<string, string> = {
  cmqrm07a0000004ju0duip6vs: "X Play",
  cmqyoavoo000004juekmwjp7t: "FinLast",
  cmr2y6ifr000204l76hla95tb: "Europe Trip",
  cmrhje0lw000004jrnw1i22ym: "THE Trip",
};

const REAL_TRIP_ID = "cmrhje0lw000004jrnw1i22ym"; // THE Trip — must survive
const DELETE_GLOBE_ID = "cmrsn1b1z0002iqaomgn71fvv";
const KEEP_GLOBE_ID = "cmra1o6jx000004jyi4abgx23";
const DELETE_USER_EMAILS = ["you@example.com", "partner@example.com"];

/** Every relation on `model Trip` — keep in sync with prisma/schema.prisma. */
const TRIP_INCLUDE = {
  members: true,
  invites: true,
  stops: true,
  transports: true,
  accommodations: true,
  items: true,
  costs: true,
  exchangeRates: true,
  notes: true,
  votes: true,
  checklistItems: true,
  attachments: true,
  reminders: true,
  shareLink: true,
  calendarFeed: true,
  journalEntries: true,
  chapters: true,
  activities: true,
  forks: true,
};

type Db = Awaited<ReturnType<typeof getDb>>;

async function getDb() {
  // Dynamic: lib/db reads DATABASE_URL at import time, so it must load AFTER config().
  const { db } = await import("@/lib/db");
  return db;
}

function maskedUrl(): string {
  return (process.env.DATABASE_URL ?? "")
    .replace(/:\/\/[^@]*@/, "://***@")
    .replace(/\?.*$/, "");
}

/**
 * Re-read the live database and refuse to proceed unless the world matches
 * this script's constants. Guards against DB drift between planning and running,
 * and against the Restrict foreign keys that point at the demo users.
 */
async function assertSafe(db: Db): Promise<{ doomedUserIds: string[]; survivingTripIds: string[] }> {
  const problems: string[] = [];

  const allTrips = await db.trip.findMany({ select: { id: true, name: true, createdById: true } });
  const doomedUsers = await db.user.findMany({
    where: { email: { in: DELETE_USER_EMAILS } },
    select: { id: true, email: true },
  });
  const doomedUserIds = doomedUsers.map((u) => u.id);
  const doomedTripIds = new Set(Object.keys(DELETE_TRIPS));

  for (const [id, name] of Object.entries(DELETE_TRIPS)) {
    const t = allTrips.find((x) => x.id === id);
    if (!t) problems.push(`doomed trip is already gone: "${name}" (${id})`);
    else if (t.name !== name) problems.push(`trip ${id} is named "${t.name}", expected "${name}"`);
  }

  for (const [id, name] of Object.entries(KEEP_TRIPS)) {
    const t = allTrips.find((x) => x.id === id);
    if (!t) problems.push(`trip we must KEEP is missing: "${name}" (${id})`);
    else if (t.name !== name) problems.push(`keeper ${id} is named "${t.name}", expected "${name}"`);
  }

  if (doomedTripIds.has(REAL_TRIP_ID)) problems.push("THE Trip is on the delete list — abort");

  const survivors = allTrips.filter((t) => !doomedTripIds.has(t.id));
  const unexpected = survivors.filter((t) => !(t.id in KEEP_TRIPS));
  if (unexpected.length > 0) {
    problems.push(
      `database has trips this plan never saw (drift) — refusing: ${unexpected
        .map((t) => `"${t.name}" (${t.id})`)
        .join(", ")}`,
    );
  }

  for (const u of doomedUsers) {
    if (!u.email.endsWith("@example.com")) problems.push(`refusing to delete real-looking user ${u.email}`);
  }
  if (doomedUsers.length !== DELETE_USER_EMAILS.length) {
    problems.push(`expected ${DELETE_USER_EMAILS.length} demo users, found ${doomedUsers.length}`);
  }

  const survivingTripIds = survivors.map((t) => t.id);

  // Restrict-relation checks: nothing that survives may point at a doomed user.
  const orphanTrips = survivors.filter((t) => doomedUserIds.includes(t.createdById));
  if (orphanTrips.length > 0) {
    problems.push(`surviving trips created by a doomed user: ${orphanTrips.map((t) => t.name).join(", ")}`);
  }

  const badForks = await db.fork.count({
    where: { createdById: { in: doomedUserIds }, tripId: { in: survivingTripIds } },
  });
  if (badForks > 0) problems.push(`${badForks} surviving fork(s) created by a doomed user`);

  const badJournals = await db.journalEntry.count({
    where: { authorId: { in: doomedUserIds }, tripId: { in: survivingTripIds } },
  });
  if (badJournals > 0) problems.push(`${badJournals} surviving journal entr(ies) authored by a doomed user`);

  const badGlobes = await db.globe.count({
    where: { createdById: { in: doomedUserIds }, id: { not: DELETE_GLOBE_ID } },
  });
  if (badGlobes > 0) problems.push(`${badGlobes} surviving globe(s) created by a doomed user`);

  const badMarkers = await db.marker.count({
    where: { createdById: { in: doomedUserIds }, globeId: { not: DELETE_GLOBE_ID } },
  });
  if (badMarkers > 0) problems.push(`${badMarkers} surviving marker(s) created by a doomed user`);

  const keepGlobe = await db.globe.findUnique({ where: { id: KEEP_GLOBE_ID }, select: { id: true } });
  if (!keepGlobe) problems.push(`the globe we must KEEP is missing (${KEEP_GLOBE_ID})`);

  if (problems.length > 0) {
    console.error("\n❌ SAFETY CHECK FAILED — nothing was written:\n");
    for (const p of problems) console.error(`   • ${p}`);
    console.error("");
    process.exit(1);
  }

  console.log("✅ safety check passed — live database matches the agreed plan\n");
  return { doomedUserIds, survivingTripIds };
}

async function summarise(db: Db): Promise<void> {
  const trips = await db.trip.findMany({
    where: { id: { in: Object.keys(DELETE_TRIPS) } },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          stops: true,
          costs: true,
          notes: true,
          attachments: true,
          journalEntries: true,
          forks: true,
          chapters: true,
          checklistItems: true,
        },
      },
    },
  });

  console.log(`── WOULD DELETE ${trips.length} TRIPS ──`);
  for (const t of trips) {
    const c = t._count;
    console.log(
      `  ✗ ${t.name}\n      stops=${c.stops} costs=${c.costs} notes=${c.notes} attach=${c.attachments} ` +
        `journal=${c.journalEntries} forks=${c.forks} chapters=${c.chapters} checklist=${c.checklistItems}`,
    );
  }

  const globe = await db.globe.findUnique({
    where: { id: DELETE_GLOBE_ID },
    select: { id: true, _count: { select: { markers: true, members: true, attachments: true } } },
  });
  console.log(`\n── WOULD DELETE 1 GLOBE ──`);
  if (globe) {
    console.log(
      `  ✗ ${globe.id}  markers=${globe._count.markers} members=${globe._count.members} attach=${globe._count.attachments}`,
    );
  }

  const users = await db.user.findMany({
    where: { email: { in: DELETE_USER_EMAILS } },
    select: { email: true, name: true },
  });
  console.log(`\n── WOULD DELETE ${users.length} USERS ──`);
  for (const u of users) console.log(`  ✗ ${u.email} (${u.name ?? "—"})`);

  const keptTrips = await db.trip.findMany({
    where: { id: { in: Object.keys(KEEP_TRIPS) } },
    select: { name: true, _count: { select: { stops: true, costs: true } } },
  });
  console.log(`\n── WOULD KEEP ${keptTrips.length} TRIPS ──`);
  for (const t of keptTrips) console.log(`  ✓ ${t.name}  stops=${t._count.stops} costs=${t._count.costs}`);

  const keptGlobe = await db.globe.findUnique({
    where: { id: KEEP_GLOBE_ID },
    select: { id: true, _count: { select: { markers: true } } },
  });
  if (keptGlobe) console.log(`  ✓ globe ${keptGlobe.id}  markers=${keptGlobe._count.markers}`);

  const keptUsers = await db.user.findMany({
    where: { email: { notIn: DELETE_USER_EMAILS } },
    select: { email: true },
  });
  for (const u of keptUsers) console.log(`  ✓ ${u.email}`);
}

async function backup(db: Db): Promise<string> {
  const trips = await db.trip.findMany({
    where: { id: { in: Object.keys(DELETE_TRIPS) } },
    include: TRIP_INCLUDE,
  });
  const globe = await db.globe.findUnique({
    where: { id: DELETE_GLOBE_ID },
    include: { members: true, markers: true, invites: true, attachments: true },
  });
  const users = await db.user.findMany({ where: { email: { in: DELETE_USER_EMAILS } } });

  // Stamped by the caller, not Date.now() inside a workflow — plain script, fine here.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `.verify/purge-backup-${stamp}.json`;
  writeFileSync(path, JSON.stringify({ takenAt: stamp, trips, globe, users }, null, 2), "utf8");

  const rows =
    trips.reduce(
      (n, t) =>
        n +
        1 +
        Object.keys(TRIP_INCLUDE).reduce((m, k) => {
          const v = (t as unknown as Record<string, unknown>)[k];
          return m + (Array.isArray(v) ? v.length : v ? 1 : 0);
        }, 0),
      0,
    ) +
    (globe ? 1 + globe.members.length + globe.markers.length + globe.invites.length + globe.attachments.length : 0) +
    users.length;

  console.log(`\n💾 backup written: ${path}`);
  console.log(`   ${trips.length} trips, globe ${globe ? "included" : "MISSING"}, ${users.length} users — ~${rows} rows\n`);
  return path;
}

async function execute(db: Db): Promise<void> {
  // Best-effort blob cleanup first — prod runs STORAGE_DRIVER="local" on Vercel,
  // so these blobs are almost certainly already gone. Never abort the purge for them.
  try {
    const { getStorage } = await import("@/lib/storage");
    const storage = getStorage();
    const atts = await db.attachment.findMany({
      where: {
        storageKey: { not: null },
        OR: [{ tripId: { in: Object.keys(DELETE_TRIPS) } }, { globeId: DELETE_GLOBE_ID }],
      },
      select: { storageKey: true },
    });
    let ok = 0;
    for (const a of atts) {
      if (!a.storageKey) continue;
      try {
        await storage.delete(a.storageKey);
        ok += 1;
      } catch {
        /* blob already gone — expected on ephemeral local storage */
      }
    }
    console.log(`🧹 blobs: ${ok}/${atts.length} deleted (misses are expected on ephemeral storage)`);
  } catch (err) {
    console.log(`🧹 blob cleanup skipped: ${(err as Error).message}`);
  }

  await db.$transaction(
    async (tx) => {
      const t = await tx.trip.deleteMany({ where: { id: { in: Object.keys(DELETE_TRIPS) } } });
      console.log(`   trips deleted:  ${t.count}`);

      const g = await tx.globe.deleteMany({ where: { id: DELETE_GLOBE_ID } });
      console.log(`   globes deleted: ${g.count}`);

      const u = await tx.user.deleteMany({ where: { email: { in: DELETE_USER_EMAILS } } });
      console.log(`   users deleted:  ${u.count}`);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

async function main(): Promise<void> {
  if (!MODE || !VALID_MODES.includes(MODE)) {
    console.error(`usage: npx tsx .verify/purge-prod.ts <${VALID_MODES.join("|")}>`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("No DATABASE_URL after loading .env.production.local. Aborting.");
    process.exit(1);
  }

  console.log(`\nmode: ${MODE}`);
  console.log(`db:   ${maskedUrl()}\n`);

  const db = await getDb();
  try {
    await assertSafe(db);

    if (MODE === "dry-run") {
      await summarise(db);
      console.log("\n(dry run — nothing was written)\n");
      return;
    }

    if (MODE === "backup") {
      await backup(db);
      return;
    }

    console.log("🔥 EXECUTING — this is irreversible\n");
    await execute(db);
    console.log("\n✅ purge complete\n");
    await summarise(db).catch(() => undefined);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Prove the safety guard actually fires (negative test)**

Before trusting `assertSafe`, verify it blocks a bad run. Temporarily add a fake entry to `DELETE_TRIPS` — insert this line at the top of the object:

```ts
  cmFAKE0000000000000000000: "Trip That Does Not Exist",
```

Run: `npx tsx .verify/purge-prod.ts dry-run 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

Expected: exits non-zero, prints `❌ SAFETY CHECK FAILED` and the line `doomed trip is already gone: "Trip That Does Not Exist" (cmFAKE0000000000000000000)`. **No `── WOULD DELETE` section is printed.**

Then run a second negative check — remove the fake line, and instead temporarily delete the `cmqrm07a0000004ju0duip6vs: "X Play",` line from `KEEP_TRIPS`. Run the same command.

Expected: exits non-zero with `database has trips this plan never saw (drift) — refusing: "X Play" (cmqrm07a0000004ju0duip6vs)`.

**Restore both edits before continuing** — `DELETE_TRIPS` must have exactly 10 entries and `KEEP_TRIPS` exactly 4.

- [ ] **Step 3: Run the real dry-run**

Run: `npx tsx .verify/purge-prod.ts dry-run 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

Expected: `✅ safety check passed`, then `── WOULD DELETE 10 TRIPS ──` listing exactly the 10 names from the kill-list table above, `── WOULD DELETE 1 GLOBE ──` with `markers=13`, `── WOULD DELETE 2 USERS ──` (`you@example.com`, `partner@example.com`), and `── WOULD KEEP 4 TRIPS ──` listing `X Play`, `FinLast`, `Europe Trip`, `THE Trip` plus globe `cmra1o6jx000004jyi4abgx23  markers=8` and the two real user emails. Ends with `(dry run — nothing was written)`.

If any count or name differs from this plan, STOP and report — do not proceed to Task 2.

- [ ] **Step 4: Confirm nothing was written**

Run: `npx tsx .verify/list-prod-trips.ts 2>&1 | grep -c "^• "`

Expected: `14` — the trip count is unchanged.

- [ ] **Step 5: No commit**

`.verify/` is gitignored, so there is nothing to commit for this task. Run `git status --short` and confirm the output is empty. Do **not** `git add -f` anything.

---

### Task 2: Take the JSON backup

**Files:**
- Create: `.verify/purge-backup-<timestamp>.json` (gitignored)

**Interfaces:**
- Consumes: `.verify/purge-prod.ts` from Task 1.
- Produces: a backup file on disk. Task 3 must not run until this exists.

- [ ] **Step 1: Run the backup**

Run: `npx tsx .verify/purge-prod.ts backup 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

Expected: `✅ safety check passed`, then `💾 backup written: .verify/purge-backup-<stamp>.json` and a line reading `10 trips, globe included, 2 users — ~N rows` where N is comfortably over 300.

- [ ] **Step 2: Verify the file on disk**

Run:

```bash
ls -la .verify/purge-backup-*.json
node -e '
const f = require("fs").readdirSync(".verify").filter(n => n.startsWith("purge-backup-")).sort().pop();
const d = JSON.parse(require("fs").readFileSync(".verify/" + f, "utf8"));
console.log("file:", f);
console.log("trips:", d.trips.length);
console.log("names:", d.trips.map(t => t.name).join(" | "));
console.log("globe markers:", d.globe ? d.globe.markers.length : "MISSING");
console.log("users:", d.users.map(u => u.email).join(", "));
console.log("THE Trip present (must be false):", d.trips.some(t => t.name === "THE Trip"));
const eu = d.trips.find(t => t.name === "EU Christmas 2026");
console.log("EU Christmas 2026 stops/costs/forks:", eu.stops.length, eu.costs.length, eu.forks.length);
'
```

Expected:
- `trips: 10`, and `names:` lists exactly the 10 kill-list names
- `globe markers: 13`
- `users: you@example.com, partner@example.com`
- `THE Trip present (must be false): false`
- `EU Christmas 2026 stops/costs/forks: 20 93 2`

If `THE Trip` appears in the backup, the kill list is wrong — STOP and report.

- [ ] **Step 3: Confirm the database is still untouched**

Run: `npx tsx .verify/list-prod-trips.ts 2>&1 | grep -c "^• "`

Expected: `14`.

- [ ] **Step 4: No commit** — the backup is gitignored. `git status --short` must be empty.

---

### Task 3: Execute the purge — ORCHESTRATOR ONLY, REQUIRES USER APPROVAL

> **STOP.** Do not dispatch a subagent for this task. Do not run `execute` mode until the user has seen the Task 1 dry-run output and Task 2 backup summary in this session and has explicitly approved the delete. If you are a subagent reading this, skip this task and report back that it is blocked pending approval.

**Files:** none — this task only runs the script from Task 1.

**Interfaces:**
- Consumes: `.verify/purge-prod.ts` (Task 1), the backup from Task 2.
- Produces: a prod database with 4 trips, 1 globe, 2 users.

- [ ] **Step 1: Show the user the dry-run output and the backup summary, and ask for explicit approval to delete.**

- [ ] **Step 2: Run the purge** (only after approval)

Run: `npx tsx .verify/purge-prod.ts execute 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

Expected: `✅ safety check passed`, a `🧹 blobs:` line (misses are fine), then:

```
   trips deleted:  10
   globes deleted: 1
   users deleted:  2

✅ purge complete
```

- [ ] **Step 3: Verify the resulting state**

Run: `npx tsx .verify/list-prod-trips.ts 2>&1 | grep -v "SECURITY WARNING\|sslmode\|libpq\|trace-warnings\|postgresql.org\|injected env\|^- If you\|^To prepare"`

Expected:
- `=== trips (4) ===` — `X Play`, `FinLast`, `Europe Trip`, `THE Trip` and nothing else
- `=== users (2) ===` — `xanni99.m@hotmail.com`, `cammark.williams@gmail.com`
- `=== globes (1) ===` — `cmra1o6jx000004jyi4abgx23` with `markers=8`

- [ ] **Step 4: Verify THE Trip survived intact**

Run: `npx tsx .verify/peek-trips.ts 2>&1 | sed -n '/### THE Trip/,/^$/p'`

Expected: 11 stops (Denpasar → Rome) and the costs line still showing the paid amounts. If THE Trip is missing or emptied, restore from the Task 2 backup immediately and report.

- [ ] **Step 5: No commit** — nothing in git changed.

---

### Task 4: Tidy up the throwaway scripts

> Runs BEFORE the seed-script task on purpose. `tsconfig.json` has `include: ["**/*.ts"]` with only `node_modules` excluded, so `npm run build` type-checks everything under `.verify/` too. Clearing the throwaways first means Task 5's build gate reports on the real change and cannot fail on a scratch script.

**Files:**
- Delete: `.verify/purge-prod.ts`, `.verify/list-prod-trips.ts`, `.verify/peek-trips.ts`, `.verify/check-restricts.ts`
- Keep: `.verify/purge-backup-*.json`

**Interfaces:** none.

- [ ] **Step 1: Confirm the purge is done before deleting the tooling**

Run: `ls -la .verify/purge-backup-*.json`

Expected: at least one backup file exists. If not, STOP — do not delete the scripts, the backup is the only rollback path.

- [ ] **Step 2: Confirm the purge actually landed**

Run: `npx tsx .verify/list-prod-trips.ts 2>&1 | grep -c "^• "`

Expected: `4`. If it still prints `14`, Task 3 has not run — STOP and report rather than deleting the tooling.

- [ ] **Step 3: Delete the four prod-touching scripts, keep the backup**

```bash
rm -f .verify/purge-prod.ts .verify/list-prod-trips.ts .verify/peek-trips.ts .verify/check-restricts.ts
ls .verify/ | grep -E "purge|prod|restrict"
```

Expected: only the `purge-backup-<stamp>.json` file matches.

- [ ] **Step 4: Confirm no `.verify` TypeScript remains to trip the build**

Run: `ls .verify/*.ts 2>/dev/null | wc -l`

Expected: `0`.

- [ ] **Step 5: No commit** — everything in `.verify/` is gitignored. `git status --short` should show only the untracked/committed state of `docs/`, never a `.verify/` path.

---

### Task 5: Delete the `:prod` seed scripts

**Files:**
- Delete: `prisma/seed-demo-prod.ts`
- Delete: `prisma/seed-real-prod.ts`
- Modify: `package.json` (remove 2 script entries)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `db:seed`, `db:seed:demo` and `db:seed:real` remain and are unaffected.

- [ ] **Step 1: Confirm nothing imports them**

Run:

```bash
grep -rn "seed-demo-prod\|seed-real-prod\|seed:demo:prod\|seed:real:prod" \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" --include="*.mjs" . \
  | grep -v node_modules
```

Expected: only `package.json` lines 18 and 20, and the two files' own docblock comments. (A historical mention in `docs/superpowers/plans/2026-07-26-real-trip-christmas-europe-2026.md` may also appear — leave that file alone, it is a record of past work.)

- [ ] **Step 2: Delete the files**

```bash
git rm prisma/seed-demo-prod.ts prisma/seed-real-prod.ts
```

- [ ] **Step 3: Remove the two package.json scripts**

In `package.json`, delete these two lines from `"scripts"`:

```json
    "db:seed:demo:prod": "tsx prisma/seed-demo-prod.ts",
    "db:seed:real:prod": "tsx prisma/seed-real-prod.ts",
```

Leave `"db:seed"`, `"db:seed:demo"` and `"db:seed:real"` exactly as they are. Verify the file is still valid JSON:

```bash
node -e 'const p=require("./package.json"); console.log(Object.keys(p.scripts).join("\n"))'
```

Expected: the list contains `db:seed`, `db:seed:demo`, `db:seed:real` and does NOT contain either `:prod` entry.

- [ ] **Step 4: Confirm no dangling references remain**

Run the Step 1 grep again. Expected: no hits in `package.json`, no hits in `prisma/`. Only the historical plan doc may match.

- [ ] **Step 5: Full verification sweep**

```bash
npm test
npm run lint
npm run build
```

Expected: all three green. These scripts were never imported by app code or tests, so nothing should break. If `npm run build` fails for a reason unrelated to this change, report the failure rather than working around it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(seeds): remove the :prod seed scripts

The demo suite and the seeded "Christmas in Europe 2026" trip have been
purged from prod, which is now real data only: THE Trip plus Xanthia's
own trips. These two wrappers existed to populate an empty prod with
fixture data; that job is done and they can now only do harm — a stray
`npm run db:seed:demo:prod` would refill the live database with six demo
trips and re-create the you@/partner@example.com users.

Local seeding is untouched: db:seed, db:seed:demo and db:seed:real all
still work against docker Postgres.

No ADR: re-adding a seed script is trivial, so this fails the
hard-to-reverse bar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Confirm the repo is clean**

```bash
git status --short
git log --oneline -3
```

Expected: `git status --short` is empty, and the top commit is `chore(seeds): remove the :prod seed scripts`.

---

## Out of scope (explicitly)

- Merging `chore/purge-prod-test-data` into `main`, pushing, or deploying — stop at a green branch; the user decides integration.
- Xanthia's own trips (`X Play`, `FinLast`, `Europe Trip`) and Cam's membership of them — untouched by decision.
- Fixing THE Trip's data (stale `sortOrder` putting Como before Milan, Rome still rough, the "Nothern Ireland" typo) — flagged to the user, deliberately not in this plan.
- Any change to `CONTEXT.md` — this cleanup introduces no new domain language.
- Adding a confirmation prompt to the local seed scripts — the `:prod` wrappers are being deleted outright instead.
