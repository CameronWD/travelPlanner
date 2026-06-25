# Activity-Feed Completion & Targeted Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the activity events ADR-0012 deferred (item scheduling, stop dating/firming/pinning/reordering, chapter assignment & bulk-create) so the feed reflects every meaningful change; fix the stuck-unread `mark-read` bug; and add focused tests + small clarity cleanups to the riskiest untested code.

**Architecture:** Two threads. **Thread 1 (Tasks 1–10)** extends the existing `recordActivity` hook pattern (ADR-0012) onto the deferred mutating actions. Actions that map to field-level changes record `UPDATED` events via the existing `describeChanges`; three structureless/batch actions (reorder, ungrouped firm-up, bulk chapter-create) carry a new `{ summary: string }` change payload that the feed renders as `"{actor} {summary}"`. No schema/migration (the `changes` column is already JSON; no new verbs or entity types). **Thread 2 (Tasks 11–15)** adds focused RTL tests to four large untested client components and two clarity cleanups. Tests-only — no component splits.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript 5, Prisma 7 / Postgres, Vitest + jsdom + @testing-library/react + user-event, Tailwind v4.

**Branch:** `feat/activity-completion-and-hardening` (already created off `main`). Do NOT touch `main`, push, or deploy.

**Conventions every task must follow:**
- The unit suite mocks `@/lib/db`, `@/lib/guards`, `next/cache`, `@/lib/geocode`, and `@/server/actions/activity` (`recordActivity` as a `vi.fn()` spy). There is NO live database. Use the `vi.hoisted(...)` mock block at the top of `server/actions/stops.test.ts` as the canonical template.
- Activity recording is **best-effort and after the write** — append the `recordActivity` call after the successful mutation, mirroring `createStop`/`updateStop`/`updateItem` (already in the codebase).
- After every task: `npx tsc --noEmit && npm run lint && npm test` must all pass. Do not regress.
- Match house style: `select`-narrowed Prisma queries, `cn()`, lucide icons with `aria-hidden`, `revalidatePath`.
- Commit at the end of each task with the message given.

**Thread ordering:** Do Thread 1 (Tasks 1–10) before Thread 2 (Tasks 11–15). The Thread-2 component tests `vi.mock` the server actions, so they're insulated from Thread-1 internals, but keeping the order makes each diff coherent.

---

## Thread 1 — Close the activity-feed gaps

### Task 1: Update ADR-0012 to record the expanded scope & payload

**Files:**
- Modify: `docs/adr/0012-activity-log-via-server-action-hooks.md`

**Context:** ADR-0012 §6 currently says the specialized actions are "**not** recorded in v1 — a documented follow-up". We are now recording them, and adding a `summary` change payload. Update the ADR so it reflects what's built (it is the single source of truth a future reader will consult).

- [ ] **Step 1: Rewrite Decision §6**

Replace the paragraph that begins "**Scope is the plain create/update/delete…**" with:

```markdown
6. **Scope covers the plain create/update/delete of the six entities + Note
   add/delete, plus the specialized mutations** (item scheduling —
   `scheduleItem`/`unscheduleItem`/`rescheduleItem`; stop dating —
   `setStopDates`/`makeStopRough`; `toggleStopPin`; `assignStopToChapter`;
   `firmUpSegment`; `moveStop`; `suggestChaptersFromCountries`). Each records
   one event per user action — never one-per-affected-row. `setStopDates`
   records only the stop the user edited, not the stops its ripple moved.
```

- [ ] **Step 2: Add a change-payload bullet to the Decision list**

After Decision §3 (the `describeChanges` bullet), insert:

```markdown
3b. **The `changes` payload is a tagged union:** `ActivityChange[]` (field
   diffs, the common case), `{ excerpt }` (Notes), or `{ summary }` — a single
   human-readable predicate for structureless or batch actions (reorder,
   ungrouped firm-up, bulk chapter-create) that have no meaningful per-field
   diff. The feed renders a `summary` row as "{actor} {summary}", bypassing the
   generic headline. No new verbs or entity types are introduced.
```

- [ ] **Step 3: Replace the "Deferred specialized actions" consequence**

Replace the final bullet ("**Deferred specialized actions** mean some real changes…") with:

```markdown
- **Specialized actions are now recorded** (see Decision §6). The structureless
  ones use the `{ summary }` payload; the rest reuse field diffs. `firmUpSegment`
  on a chapter records a single CHAPTER update (its start/end dates); an
  ungrouped firm-up records one STOP `{ summary }`. This supersedes the original
  v1 deferral.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0012-activity-log-via-server-action-hooks.md
git commit -m "docs(adr): 0012 records specialized actions + summary change payload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `lib/activity.ts` — `pinned` field spec + `ActivitySummary` type

**Files:**
- Modify: `lib/activity.ts`
- Test: `lib/activity.test.ts`

**Context:** `toggleStopPin` will diff the `pinned` boolean, so STOP needs a `pinned` field spec with a boolean-aware formatter (the default formatter would render "false → true"). The `summary` payload also needs a shared type. `describeChanges` itself is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `lib/activity.test.ts`:

```ts
import { describeChanges, type ActivitySummary } from "./activity";

describe("STOP pinned diff", () => {
  it("renders pinned booleans as Pinned / Not pinned", () => {
    const changes = describeChanges("STOP", { pinned: false }, { pinned: true });
    expect(changes).toEqual([
      { field: "pinned", label: "Pinned", from: "Not pinned", to: "Pinned" },
    ]);
  });

  it("emits no change when pinned is unchanged", () => {
    expect(describeChanges("STOP", { pinned: true }, { pinned: true })).toEqual([]);
  });
});

describe("ActivitySummary", () => {
  it("is a { summary } shape", () => {
    const s: ActivitySummary = { summary: "firmed up 4 stops" };
    expect(s.summary).toBe("firmed up 4 stops");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/activity.test.ts -t pinned`
Expected: FAIL — no `pinned` spec, so the change array is empty / `ActivitySummary` not exported.

- [ ] **Step 3: Add the `pinned` formatter + spec + type**

In `lib/activity.ts`, add a formatter near the other format fns (after `transportModeFormat`):

```ts
function pinnedFormat(value: unknown): string {
  return value ? "Pinned" : "Not pinned";
}
```

Add `pinned` to the STOP entry of `FIELD_SPECS` (after the `nights` spec):

```ts
    { key: "pinned", label: "Pinned", format: (v) => pinnedFormat(v) },
```

> Note: `isEmpty(false)` is `false` (false is a real value, not empty), so a `false → true` flip is diffed correctly. A spec only emits when the field is actually present and changed, so existing STOP updates that don't touch `pinned` are unaffected.

Add the exported type near `ActivityChange`:

```ts
/** A single human-readable predicate, rendered as "{actor} {summary}". */
export interface ActivitySummary {
  summary: string;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run lib/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/activity.ts lib/activity.test.ts
git commit -m "feat(activity): pinned field spec + ActivitySummary type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Widen `recordActivity` to accept a `summary` payload

**Files:**
- Modify: `server/actions/activity.ts`

**Context:** `recordActivity`'s `changes` param is currently `ActivityChange[] | { excerpt: string } | null`. Add the `summary` arm. The `db.activity.create` call already casts `changes` to `any`, so no body change is needed — only the type.

- [ ] **Step 1: Edit the import and the param type**

In `server/actions/activity.ts`, extend the type import:

```ts
import type { ActivityVerb, ActivityEntityType, ActivityChange, ActivitySummary } from "@/lib/activity";
```

Change the `changes` field of the `recordActivity` input from:

```ts
  changes?: ActivityChange[] | { excerpt: string } | null;
```
to:
```ts
  changes?: ActivityChange[] | { excerpt: string } | ActivitySummary | null;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/actions/activity.ts
git commit -m "feat(activity): recordActivity accepts a summary change payload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Render `summary` rows in the activity feed

**Files:**
- Modify: `components/trip/activity-feed.tsx`
- Test: `components/trip/activity-feed.test.tsx`

**Context:** `ActivityFeed` renders `headline(...)` plus a field-diff list or a note excerpt. A `{ summary }` payload should render as the main line `"{actor} {summary}"` instead of the generic headline (which would read "updated the … stop" — misleading for batch/reorder rows).

- [ ] **Step 1: Write the failing test**

Add to `components/trip/activity-feed.test.tsx` (follow the file's existing `render`/`screen` setup and `ActivityRow` factory):

```ts
it("renders a summary payload as '{actor} {summary}', not the generic headline", () => {
  render(
    <ActivityFeed
      activities={[
        {
          id: "a1",
          verb: "UPDATED",
          entityType: "STOP",
          entityLabel: "Rome",
          changes: { summary: "firmed up 4 stops · 3 Jul 2026 – 18 Jul 2026" },
          createdAt: new Date("2026-06-25T10:00:00Z"),
          actor: { id: "u1", name: "Cam", image: null },
        },
      ]}
    />,
  );
  expect(screen.getByText(/firmed up 4 stops/)).toBeInTheDocument();
  expect(screen.queryByText(/updated the/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run components/trip/activity-feed.test.tsx -t summary`
Expected: FAIL — the headline "updated the Rome stop" renders; no summary line.

- [ ] **Step 3: Extract the summary and render it**

In `components/trip/activity-feed.tsx`, after the `noteExcerpt` block, add:

```tsx
        // Extract a one-line summary payload (reorder / batch actions)
        const summary =
          typeof activity.changes === "object" &&
          activity.changes !== null &&
          !Array.isArray(activity.changes) &&
          "summary" in (activity.changes as object)
            ? (activity.changes as { summary: string }).summary
            : null;
```

Change the main headline paragraph from:

```tsx
              <p className="text-sm text-foreground">
                <span className="font-medium">{actorName}</span>{" "}
                {headlineText}
              </p>
```
to:
```tsx
              <p className="text-sm text-foreground">
                <span className="font-medium">{actorName}</span>{" "}
                {summary ?? headlineText}
              </p>
```

> A summary row never also carries field diffs or an excerpt (the action sets exactly one payload), so the existing `changes`/`noteExcerpt` blocks stay as-is — they render nothing for a summary row.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run components/trip/activity-feed.test.tsx`
Expected: PASS (existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add components/trip/activity-feed.tsx components/trip/activity-feed.test.tsx
git commit -m "feat(activity): render summary change payloads in the feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Record item scheduling (`scheduleItem` / `unscheduleItem` / `rescheduleItem`)

**Files:**
- Modify: `server/actions/items.ts` (`scheduleItem` ~280, `unscheduleItem` ~309, `rescheduleItem` ~339)
- Test: `server/actions/items.test.ts`

**Context:** All three change an item's `date`/`startTime`/`endTime`, which `describeChanges("ITEM", …)` already diffs. Mirror `updateItem` (lines 205–212): load a before-row, capture the updated row, record an `UPDATED` ITEM event.

- [ ] **Step 1: Write the failing tests**

Add to `server/actions/items.test.ts` (follow the file's existing mock block; `recordActivity` is already mocked as a spy). For each action, set the item-`findUnique` mock to return the access shape then the before-row, and the item-`update` mock to return the updated row, then assert:

```ts
it("scheduleItem records an ITEM update with the date change", async () => {
  // requireItemAccess findUnique → { id, tripId }; before-row findUnique → { date: null, ... }
  // item.update → { id, title: "Louvre", date: "2026-07-03", startTime: null, endTime: null }
  await scheduleItem("item-1", { date: "2026-07-03" });
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "UPDATED",
      entityType: "ITEM",
      entityId: "item-1",
      changes: expect.arrayContaining([
        expect.objectContaining({ field: "date", to: expect.stringContaining("Jul") }),
      ]),
    }),
  );
});

it("rescheduleItem records the new date", async () => {
  // before-row { date: "2026-07-03" }; update → { date: "2026-07-04", title: "Louvre" }
  await rescheduleItem("item-1", "2026-07-04");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({ verb: "UPDATED", entityType: "ITEM", entityId: "item-1" }),
  );
});

it("unscheduleItem records date cleared", async () => {
  // before-row { date: "2026-07-03" }; update → { date: null, title: "Louvre" }
  await unscheduleItem("item-1");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({ verb: "UPDATED", entityType: "ITEM", entityId: "item-1" }),
  );
});
```

> Match the existing `items.test.ts` mock-sequencing style (`mockResolvedValueOnce(...)` for the access guard then the before-row). Read the top of `items.test.ts` for the exact mock names.

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run server/actions/items.test.ts -t records`
Expected: FAIL — `recordActivity` not called by these actions yet.

- [ ] **Step 3: Add recording to `scheduleItem`**

In `scheduleItem`, load a before-row and capture the update result. Replace the `await db.item.update({...})` block (lines ~293–300) with:

```ts
  const before = await db.item.findUnique({ where: { id: itemId } });

  const updated = await db.item.update({
    where: { id: itemId },
    data: {
      date,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
    },
  });

  await recordActivity({
    tripId: item.tripId,
    verb: "UPDATED",
    entityType: "ITEM",
    entityId: itemId,
    entityLabel: entityLabel("ITEM", updated as unknown as Record<string, unknown>),
    changes: describeChanges("ITEM", (before ?? {}) as Record<string, unknown>, updated as unknown as Record<string, unknown>),
  });
```

- [ ] **Step 4: Add recording to `unscheduleItem`**

Apply the same before-row/`updated`/`recordActivity` treatment to the `db.item.update` in `unscheduleItem` (data stays `{ date: null, startTime: null, endTime: null }`).

- [ ] **Step 5: Add recording to `rescheduleItem`**

In `rescheduleItem`, add `const before = await db.item.findUnique({ where: { id: itemId } });` immediately before the final `db.item.update` (line ~382), capture `const updated = await db.item.update({...})`, then append the same `recordActivity` block (entityType `"ITEM"`, `describeChanges("ITEM", before, updated)`).

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run server/actions/items.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/actions/items.ts server/actions/items.test.ts
git commit -m "feat(activity): record item scheduling, rescheduling and unscheduling

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Record stop dating (`setStopDates` edited-stop-only + `makeStopRough`)

**Files:**
- Modify: `server/actions/stops.ts` (`setStopDates` ~311, `makeStopRough` ~489)
- Test: `server/actions/stops.test.ts`

**Context:** Both produce STOP field diffs. `setStopDates` ripples following stops — **record only the stop the user edited**, never the rippled ones (consistent with not recording the auto-grown trip end date).

- [ ] **Step 1: Write the failing tests**

Add to `server/actions/stops.test.ts`:

```ts
it("setStopDates records ONE update for the edited stop only", async () => {
  // requireStopAccess findUnique → { id:"s1", tripId:"trip-1", sortOrder:0, arriveDate:null, departDate:null, nights:2, pinned:false }
  // before-row findUnique → { name:"Rome", country:"Italy", arriveDate:null, departDate:null, nights:2 }
  // stop.findMany (following) → []   (no ripple)
  // trip.findUnique → { endDate: null }
  await setStopDates("s1", { arriveDate: "2026-07-03", departDate: "2026-07-06" });
  expect(recordActivity).toHaveBeenCalledTimes(1);
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "UPDATED",
      entityType: "STOP",
      entityId: "s1",
      changes: expect.arrayContaining([
        expect.objectContaining({ field: "arriveDate" }),
        expect.objectContaining({ field: "departDate" }),
      ]),
    }),
  );
});

it("makeStopRough records dates cleared", async () => {
  // requireStopAccess → { id:"s1", tripId:"trip-1", sortOrder:0, arriveDate:"2026-07-03", departDate:"2026-07-06", nights:null, pinned:false }
  // before-row → { name:"Rome", arriveDate:"2026-07-03", departDate:"2026-07-06", pinned:false, nights:null }
  await makeStopRough("s1");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "UPDATED",
      entityType: "STOP",
      entityId: "s1",
      changes: expect.arrayContaining([expect.objectContaining({ field: "arriveDate" })]),
    }),
  );
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run server/actions/stops.test.ts -t "edited stop only"`
Expected: FAIL.

- [ ] **Step 3: Record the edited stop in `setStopDates`**

In `setStopDates`, load a before-row before the edited-stop update (after the depart<arrive guard, before line ~320) and record after it:

```ts
  const before = await db.stop.findUnique({
    where: { id: stopId },
    select: { name: true, country: true, arriveDate: true, departDate: true, nights: true },
  });

  await db.stop.update({ where: { id: stopId }, data: { arriveDate: dates.arriveDate, departDate: dates.departDate } });

  await recordActivity({
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", (before ?? {}) as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      { ...(before ?? {}), arriveDate: dates.arriveDate, departDate: dates.departDate } as Record<string, unknown>,
    ),
  });
```

Leave the ripple loop below untouched — it records nothing.

- [ ] **Step 4: Record `makeStopRough`**

In `makeStopRough`, after computing `nights` and before the `db.stop.update`, load the before-row; after the update, record:

```ts
  const before = await db.stop.findUnique({
    where: { id: stopId },
    select: { name: true, arriveDate: true, departDate: true, pinned: true, nights: true },
  });

  await db.stop.update({
    where: { id: stopId },
    data: { arriveDate: null, departDate: null, timezone: null, pinned: false, nights },
  });

  await recordActivity({
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: entityLabel("STOP", (before ?? {}) as Record<string, unknown>),
    changes: describeChanges(
      "STOP",
      (before ?? {}) as Record<string, unknown>,
      { ...(before ?? {}), arriveDate: null, departDate: null, pinned: false, nights } as Record<string, unknown>,
    ),
  });
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run server/actions/stops.test.ts`
Expected: PASS. Confirm `setStopDates` asserts `toHaveBeenCalledTimes(1)`.

- [ ] **Step 6: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(activity): record stop dating (edited stop only) and make-rough

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Record `toggleStopPin` + `assignStopToChapter`

**Files:**
- Modify: `server/actions/stops.ts` (`toggleStopPin` ~476, `assignStopToChapter` ~506)
- Test: `server/actions/stops.test.ts`

**Context:** `toggleStopPin` diffs the `pinned` boolean (Task 2's spec). `assignStopToChapter` changes which chapter a stop belongs to — `chapterId` isn't a diffable field, so resolve the old/new chapter **names** and pass a hand-built `ActivityChange`. Skip recording when the chapter didn't actually change.

- [ ] **Step 1: Write the failing tests**

```ts
it("toggleStopPin records a Pinned change", async () => {
  // requireStopAccess → { id:"s1", tripId:"trip-1", sortOrder:0, arriveDate:"2026-07-03", departDate:"2026-07-06", nights:null, pinned:false }
  // name findUnique → { name:"Rome" }
  await toggleStopPin("s1");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "UPDATED",
      entityType: "STOP",
      changes: [{ field: "pinned", label: "Pinned", from: "Not pinned", to: "Pinned" }],
    }),
  );
});

it("assignStopToChapter records a Chapter change with resolved names", async () => {
  // requireStopAccess → { id:"s1", tripId:"trip-1", ... }
  // before findUnique → { name:"Rome", chapterId: null }
  // chapter findUnique (new) → { name:"Italy" }
  await assignStopToChapter("s1", "chap-it");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "UPDATED",
      entityType: "STOP",
      entityId: "s1",
      changes: [{ field: "chapter", label: "Chapter", from: "", to: "Italy" }],
    }),
  );
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run server/actions/stops.test.ts -t "Pinned change"`
Expected: FAIL.

- [ ] **Step 3: Record `toggleStopPin`**

After the `db.stop.update({ ... data: { pinned: !stop.pinned } })`, add:

```ts
  const named = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
  await recordActivity({
    tripId: stop.tripId,
    verb: "UPDATED",
    entityType: "STOP",
    entityId: stopId,
    entityLabel: named?.name ?? "",
    changes: describeChanges("STOP", { pinned: stop.pinned }, { pinned: !stop.pinned }),
  });
```

- [ ] **Step 4: Record `assignStopToChapter`**

Replace the body so it loads names and records only on a real change. After `const stop = await requireStopAccess(stopId);`:

```ts
  const before = await db.stop.findUnique({ where: { id: stopId }, select: { name: true, chapterId: true } });
```

Keep the existing `chapterSortOrder` computation and the `db.stop.update`. After the update, before `revalidatePath`, add:

```ts
  if ((before?.chapterId ?? null) !== (chapterId ?? null)) {
    const [fromCh, toCh] = await Promise.all([
      before?.chapterId ? db.chapter.findUnique({ where: { id: before.chapterId }, select: { name: true } }) : Promise.resolve(null),
      chapterId ? db.chapter.findUnique({ where: { id: chapterId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    await recordActivity({
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: stopId,
      entityLabel: before?.name ?? "",
      changes: [{ field: "chapter", label: "Chapter", from: fromCh?.name ?? "", to: toCh?.name ?? "" }],
    });
  }
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run server/actions/stops.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(activity): record stop pin toggle and chapter assignment

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Record `moveStop` (reorder summary) + `firmUpSegment`

**Files:**
- Modify: `server/actions/stops.ts` (`moveStop` ~265, `firmUpSegment` ~383)
- Test: `server/actions/stops.test.ts`

**Context:** `moveStop` has no diffable field → `{ summary }`, recorded only when a swap actually happened. `firmUpSegment` records **one** event: a CHAPTER update (its start/end dates) when chaptered, or one STOP `{ summary }` when ungrouped. Never one-per-stop.

- [ ] **Step 1: Write the failing tests**

```ts
it("moveStop records a reorder summary only when a swap happens", async () => {
  // requireStopAccess → { id:"s1", tripId:"trip-1", sortOrder:0, ... }
  // $queryRaw siblings → [{ id:"s1", sortOrder:0 }, { id:"s2", sortOrder:1 }]
  // name findUnique → { name:"Rome" }
  await moveStop("s1", "down");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "STOP",
      entityId: "s1",
      changes: { summary: expect.stringContaining("Moved Rome") },
    }),
  );
});

it("moveStop records nothing on a no-op (no neighbour)", async () => {
  // siblings → [{ id:"s1", sortOrder:0 }] only
  await moveStop("s1", "up");
  expect(recordActivity).not.toHaveBeenCalled();
});

it("firmUpSegment on a chapter records ONE chapter update", async () => {
  // trip.findUnique → { startDate:"2026-07-01", endDate:null }
  // stop.findMany → two rough stops in chap-it (arriveDate null)
  // chapter before findUnique → { name:"Italy", startDate:null, endDate:null }
  await firmUpSegment({ tripId: "trip-1", chapterId: "chap-it" });
  expect(recordActivity).toHaveBeenCalledTimes(1);
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({ verb: "UPDATED", entityType: "CHAPTER" }),
  );
});

it("ungrouped firmUpSegment records one stop summary", async () => {
  // chapterId omitted → ungrouped; two rough ungrouped stops
  await firmUpSegment({ tripId: "trip-1" });
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "STOP",
      changes: { summary: expect.stringContaining("Firmed up") },
    }),
  );
});
```

> Read the existing `firmUpSegment` tests in `stops.test.ts` for the exact `findMany`/`flowDates` mock shapes and extend them.

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run server/actions/stops.test.ts -t "reorder summary"`
Expected: FAIL.

- [ ] **Step 3: Record `moveStop` (only on a real swap)**

Have the transaction report whether it swapped. Change the two no-op `return;` lines inside the `$transaction` callback to `return false;`, the successful path to end with `return true;`, and capture the result:

```ts
  const moved = await db.$transaction(async (tx) => {
    // ... existing body ...
    if (idx === -1) return false;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return false;
    // ... the two tx.stop.update calls ...
    return true;
  });

  if (moved) {
    const named = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
    await recordActivity({
      tripId: stop.tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: stopId,
      entityLabel: named?.name ?? "",
      changes: { summary: `Moved ${named?.name ?? "a stop"} ${direction === "up" ? "earlier" : "later"} in the route` },
    });
  }
```

- [ ] **Step 4: Record `firmUpSegment`**

Import `formatLongDate` (add it to the existing `@/lib/dates` import alongside `nightsBetween`).

For the **chaptered** branch, replace the existing `if (chapterId) { ... db.chapter.update ... }` block (~458–462) with a version that loads the before-row and records:

```ts
  if (chapterId) {
    const start = results[0].arriveDate;
    const end = results[results.length - 1].departDate;
    const beforeCh = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { name: true, startDate: true, endDate: true },
    });
    await db.chapter.update({ where: { id: chapterId }, data: { startDate: start, endDate: end } });
    await recordActivity({
      tripId,
      verb: "UPDATED",
      entityType: "CHAPTER",
      entityId: chapterId,
      entityLabel: beforeCh?.name ?? "",
      changes: describeChanges(
        "CHAPTER",
        (beforeCh ?? {}) as Record<string, unknown>,
        { ...(beforeCh ?? {}), startDate: start, endDate: end } as Record<string, unknown>,
      ),
    });
  } else {
    const firstArrive = results[0].arriveDate;
    const lastDepart = results[results.length - 1].departDate;
    const n = results.length;
    await recordActivity({
      tripId,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: segment[0].id,
      entityLabel: segment[0].name ?? "",
      changes: { summary: `Firmed up ${n} ${n === 1 ? "stop" : "stops"} · ${formatLongDate(firstArrive)} – ${formatLongDate(lastDepart)}` },
    });
  }
```

> The early `if (segment.length === 0) return ...` guard already short-circuits before any recording, so a no-op firm-up records nothing.

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run server/actions/stops.test.ts`
Expected: PASS, including the `toHaveBeenCalledTimes(1)` on the chaptered firm-up.

- [ ] **Step 6: Commit**

```bash
git add server/actions/stops.ts server/actions/stops.test.ts
git commit -m "feat(activity): record stop reorder and firm-up (one event per action)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Record `suggestChaptersFromCountries` (bulk summary)

**Files:**
- Modify: `server/actions/chapters.ts` (`suggestChaptersFromCountries` ~139)
- Test: `server/actions/chapters.test.ts`

**Context:** This bulk-creates N chapters in one `createMany`. Record one CHAPTER `{ summary }` when at least one chapter was created.

- [ ] **Step 1: Write the failing test**

Add to `server/actions/chapters.test.ts` (mirror its existing mock block):

```ts
it("records one summary when chapters are created", async () => {
  // stop.findMany / chapter.findMany mocked so suggestChapterRuns yields 2 non-overlapping runs
  await suggestChaptersFromCountries("trip-1");
  expect(recordActivity).toHaveBeenCalledWith(
    expect.objectContaining({
      verb: "CREATED",
      entityType: "CHAPTER",
      changes: { summary: expect.stringContaining("Created") },
    }),
  );
});

it("records nothing when no chapters are created", async () => {
  // findMany mocked so every run overlaps existing → data stays empty
  await suggestChaptersFromCountries("trip-1");
  expect(recordActivity).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run server/actions/chapters.test.ts -t "summary when chapters"`
Expected: FAIL.

- [ ] **Step 3: Record after the bulk create**

Replace the tail of `suggestChaptersFromCountries`:

```ts
  if (data.length > 0) {
    await db.chapter.createMany({ data });
    await recordActivity({
      tripId,
      verb: "CREATED",
      entityType: "CHAPTER",
      entityId: null,
      entityLabel: "",
      changes: { summary: `Created ${data.length} ${data.length === 1 ? "chapter" : "chapters"} from countries` },
    });
  }
  revalidateChapterPaths(tripId);
  return { success: true };
```

(Add `recordActivity` to the imports if not already present — it is, per line 10.)

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run server/actions/chapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/actions/chapters.ts server/actions/chapters.test.ts
git commit -m "feat(activity): record bulk chapter suggestion as one summary

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Fix the stuck-unread `mark-read` bug

**Files:**
- Modify: `components/trip/mark-read-on-view.tsx`
- Test: `components/trip/mark-read-on-view.test.tsx` (create)

**Context:** `markAllRead(tripId).then(() => router.refresh())` has no `.catch()`. `markAllRead` is **not** best-effort (it can throw from `requireUser`/`updateMany`); on rejection `router.refresh()` never fires, and because `called.current` is already `true`, it never retries — unread dots stay stale for the session. Reset the guard on failure so a later render can retry, and swallow the rejection.

- [ ] **Step 1: Write the failing test**

Create `components/trip/mark-read-on-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/server/actions/activity", () => ({ markAllRead: vi.fn() }));
import { markAllRead } from "@/server/actions/activity";
import { MarkReadOnView } from "./mark-read-on-view";

beforeEach(() => vi.clearAllMocks());

it("refreshes after a successful mark-read", async () => {
  (markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  render(<MarkReadOnView tripId="trip-1" />);
  await waitFor(() => expect(refreshMock).toHaveBeenCalled());
});

it("does not throw and does not refresh when mark-read fails", async () => {
  (markAllRead as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
  render(<MarkReadOnView tripId="trip-1" />);
  await waitFor(() => expect(markAllRead).toHaveBeenCalled());
  expect(refreshMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm the failing case**

Run: `npx vitest run components/trip/mark-read-on-view.test.tsx`
Expected: the "does not throw" test FAILS (unhandled rejection) and/or an unhandled promise warning surfaces.

- [ ] **Step 3: Add the `.catch`**

Replace the `useEffect` body's call:

```tsx
    markAllRead(tripId)
      .then(() => {
        router.refresh();
      })
      .catch(() => {
        // Mark-read failed (network/auth). Allow a later render to retry
        // instead of leaving the unread dots stuck for the session.
        called.current = false;
      });
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run components/trip/mark-read-on-view.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add components/trip/mark-read-on-view.tsx components/trip/mark-read-on-view.test.tsx
git commit -m "fix(activity): handle mark-read failure so unread dots don't stick

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Thread 2 — Harden the riskiest code

> **Test convention for Tasks 11–14:** follow `components/trip/vote-control.test.tsx` and `components/trip/cost-editor.test.tsx` — `vi.mock` the relevant `@/server/actions/*` module (each action a `vi.fn().mockResolvedValue(...)`), `render` from `@testing-library/react`, drive with `@testing-library/user-event`, `beforeEach(() => vi.clearAllMocks())`. **Read the component first** for exact labels/roles/props; the cases below define WHAT to assert. Focused / high-risk only — NOT blanket coverage.

### Task 11: Focused tests for `itinerary-manager.tsx`

**Files:**
- Test (create): `components/trip/itinerary-manager.test.tsx`

**Mock targets:** `@/server/actions/stops` (`deleteStop`, `moveStop`, `setStopDates`, `firmUpSegment`, plus whatever else the component imports — read lines ~25–35), `@/server/actions/transport` (`deleteTransport`), `@/server/actions/accommodation` (`deleteAccommodation`).

- [ ] **Step 1: Read the component** (`components/trip/itinerary-manager.tsx`) to capture the exact prop shape (`tripId`, stops/transports/accommodations, chapters, costs) and the labels/roles of: the delete-stop control + its confirmation, the firm-up / date-adjustment trigger, and the reorder (up/down) controls.

- [ ] **Step 2: Write focused tests** for the highest-risk flows:
  1. **Delete confirmation gating:** clicking delete on a stop does NOT call `deleteStop` until the confirmation is accepted; accepting calls `deleteStop` with that stop's id.
  2. **Reorder wiring:** the down/up control calls `moveStop(stopId, "down" | "up")`.
  3. **Firm-up / date-adjust:** invoking the firm-up control calls `firmUpSegment` (or `setStopDates`) with the expected args, and a returned `conflicts` array surfaces to the user (assert the conflict UI renders).
  4. **Optimistic pending state:** while a mocked action is unresolved (return a pending promise), the triggering control is disabled / shows pending; resolve it and assert the pending state clears.

Run: `npx vitest run components/trip/itinerary-manager.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/trip/itinerary-manager.test.tsx
git commit -m "test(trip): focused coverage for itinerary-manager delete/reorder/firm-up

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Focused tests for `other-cost-editor.tsx`

**Files:**
- Test (create): `components/trip/other-cost-editor.test.tsx`

**Mock target:** `@/server/actions/costs` (`createCost`, `updateCost`, `deleteCost`).

- [ ] **Step 1: Read the component** for the add-form fields (label, amount, currency, category), the prop shape (`tripId`, `costs`, `homeCurrency`), and submit/delete controls.

- [ ] **Step 2: Write focused tests** — the cost math is the point:
  1. Adding an "Other" cost with estimated "12.50" in a 2-minor-digit currency calls `createCost` with `estimatedMinor: 1250` and `actualMinor: undefined`/null (actual left blank).
  2. Filling both estimated and actual parses both to minor units in the `createCost` payload.
  3. Editing an existing cost prefills the form from `cost.estimatedMinor` (e.g. `1250` → shows "12.50").
  4. Deleting calls `deleteCost` with the cost id (after any confirmation).

Run: `npx vitest run components/trip/other-cost-editor.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/trip/other-cost-editor.test.tsx
git commit -m "test(trip): focused coverage for other-cost-editor money parsing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Focused tests for `item-form-dialog.tsx`

**Files:**
- Test (create): `components/trip/item-form-dialog.test.tsx`

**Mock target:** `@/server/actions/items` (`createItem`, `updateItem`).

- [ ] **Step 1: Read the component** for the open/trigger mechanism, the required fields (title, category), optional date/time, and how it surfaces validation/`FormErrors`.

- [ ] **Step 2: Write focused tests:**
  1. Submitting with the required title empty does NOT call `createItem`/`updateItem` and surfaces the client-side validation message.
  2. Submitting valid input calls the action with the expected payload (title, category, and date/time when provided).
  3. (If the dialog renders server-returned field errors) a returned error is displayed.

Run: `npx vitest run components/trip/item-form-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/trip/item-form-dialog.test.tsx
git commit -m "test(trip): focused coverage for item-form-dialog validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Focused tests for `transport-form-dialog.tsx`

**Files:**
- Test (create): `components/trip/transport-form-dialog.test.tsx`

**Mock target:** `@/server/actions/transport` (`createTransport`, `updateTransport`).

- [ ] **Step 1: Read the component** for the open mechanism, mode selector, required fields (dep/arr place, times), and validation/`FormErrors` rendering. Note the `any`-cast `eslint-disable` on the form data at ~line 238.

- [ ] **Step 2: Write focused tests:**
  1. Submitting with a required field empty does NOT call the action and surfaces the validation message.
  2. Submitting valid input calls `createTransport` (or `updateTransport` in edit mode) with the expected payload (mode, dep/arr place, times).
  3. (If it renders server-returned field errors) a returned error is displayed.

Run: `npx vitest run components/trip/transport-form-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full verify + commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add components/trip/transport-form-dialog.test.tsx
git commit -m "test(trip): focused coverage for transport-form-dialog validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Clarity cleanups (`checklists` narrowing + `route-map` deps doc)

**Files:**
- Modify: `lib/checklists.ts` (~48)
- Modify: `components/trip/route-map.tsx` (~222)
- Test: `lib/checklists.test.ts` (verify existing tests still pass; add one only if `sortByDueDate` lacks a mixed-date case)

**Context:** `lib/checklists.ts:48` uses `a.dueDate!.localeCompare(b.dueDate!)` inside a block guarded by the separate `aHasDate`/`bHasDate` booleans — safe, but TS can't narrow through them, so the `!` obscures the guard. Replace with local narrowed bindings (behaviour identical). The `route-map.tsx` `react-hooks/exhaustive-deps` disable is correct but undocumented.

- [ ] **Step 1: Narrow `sortByDueDate` without `!`**

In `lib/checklists.ts`, capture the values once and narrow on them:

```ts
  return [...items].sort((a, b) => {
    const ad = a.dueDate != null && a.dueDate !== "" ? a.dueDate : null;
    const bd = b.dueDate != null && b.dueDate !== "" ? b.dueDate : null;

    if (ad !== null && bd !== null) {
      // Both have dates: compare lexicographically (YYYY-MM-DD is sortable)
      const dateCmp = ad.localeCompare(bd);
      if (dateCmp !== 0) return dateCmp;
    } else if (ad !== null && bd === null) {
      return -1;
```

Continue the existing branch logic using `ad`/`bd` in place of `aHasDate`/`bHasDate` and drop both `!`. Keep every comparison result identical.

- [ ] **Step 2: Document the route-map deps disable**

In `components/trip/route-map.tsx`, change the bare disable comment (~line 222) to explain the stable-deps string:

```ts
  // The effect re-runs only when the set of plotted coords/colours actually
  // changes; we depend on a derived signature string rather than the `stops`
  // array identity, which exhaustive-deps can't verify — hence the disable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Verify (behaviour unchanged) + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run lib/checklists.test.ts`
Expected: PASS — `sortByDueDate` ordering unchanged; no `!` remains at the old site.

```bash
git add lib/checklists.ts components/trip/route-map.tsx lib/checklists.test.ts
git commit -m "refactor: narrow dueDate sort without non-null assertions; document route-map deps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Activity for the deferred actions → Tasks 5 (item scheduling), 6 (`setStopDates` edited-stop-only + `makeStopRough`), 7 (`toggleStopPin` + `assignStopToChapter`), 8 (`moveStop` + `firmUpSegment`), 9 (`suggestChaptersFromCountries`). All on the existing `recordActivity` pattern.
- Decision B (`summary` payload) → Task 2 (type), 3 (action accepts it), 4 (feed renders it), used by Tasks 8 (reorder, ungrouped firm-up) & 9 (bulk).
- Edited-stop-only ripple → Task 6 Step 3 + the `toHaveBeenCalledTimes(1)` assertion.
- ADR update → Task 1.
- mark-read bug → Task 10.
- Hardening tests → Tasks 11–14 (the four untested client components, focused).
- Cleanups → Task 15 (`dueDate` narrowing, route-map deps doc).
- Out of scope (confirmed): calendar-feed filtering (already shipped), the `itinerary-manager` split, push delivery, `CONTEXT.md` edits (domain unchanged).

**Placeholder scan:** Server-action edits show full before/after code. Component-test tasks (11–14) follow the repo's established "define cases + read component for exact selectors" convention (as the prior tidy-up plan did) with concrete action-payload assertions and exact `vi.mock` targets — not placeholders.

**Type/name consistency:** `ActivitySummary = { summary: string }` defined in Task 2, accepted by `recordActivity` in Task 3, produced by Tasks 8/9, rendered in Task 4. The `pinned` spec (Task 2) is consumed by Task 7. `describeChanges` / `entityLabel` / `recordActivity` signatures match their existing definitions. Summary payload shape is `{ summary }` everywhere (never `{ text }`/`{ message }`).

**No schema/migration:** `changes` is already a JSON column; `pinned` already exists on `Stop`; no new verbs or entity types — confirmed nothing under `prisma/` changes.
