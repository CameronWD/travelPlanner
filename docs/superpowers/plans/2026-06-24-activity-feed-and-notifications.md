# Activity Feed & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record create/update/delete of the six core trip entities (+ Note add/delete) as `Activity` events; show a per-trip chronological feed and a per-user unread notifications bell; mark unread per `TripMember` with a last-read marker; surface a header bell, an Activity page, and trips-list unread dots. In-app only. See `docs/adr/0012-activity-log-via-server-action-hooks.md`.

**Architecture:** A pure, tested `lib/activity.ts` (verbs/entity-types, `describeChanges` field-diffs, `entityLabel`, `headline`) + a best-effort `recordActivity()` server helper called by each mutating action + `markAllRead()` and read helpers. UI: a header bell (server count + client popover), an Activity page under More, a `TripCard` unread dot.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, Prisma 7 + Postgres, Vitest + jsdom + @testing-library/react.

**Conventions:** `lib/` PURE (no Prisma/React), co-located `*.test.ts`, `@/` = repo root. Prisma client = `db` (`@/lib/db`). Current user = `requireUser()` (`lib/guards.ts`, returns `{ id, name, ... }`). `requireTripAccess(tripId)` → `{ user, membership }`. Gates per task: `npx tsc --noEmit` (0), `npm run lint` (0/0), `npm test`. **No reachable DB here** → hand-author migrations, mock `db` in action tests; never run against a DB.

**Out of scope (v1, documented):** the specialized actions (`scheduleItem`/`unscheduleItem`/`rescheduleItem`, `setStopDates`, `firmUpSegment`, `moveStop`, `toggleStopPin`, `makeStopRough`, `assignStopToChapter`, `suggestChaptersFromCountries`); web push for activity; per-item read; live updates; global cross-trip count.

---

### Task 1: `Activity` model + `TripMember.lastReadActivityAt` + migration

**Files:** `prisma/schema.prisma`; new `prisma/migrations/20260624020000_activity_log/migration.sql`.

**Context:** No DB here — hand-author the migration (latest existing folder is `20260624010000_transport_coordinates`; use a strictly-later timestamp). `prisma generate`/`validate` work without a DB.

- [ ] **Step 1: Add to `prisma/schema.prisma`** — a new model and a column on `TripMember`, plus back-relations on `Trip` and `User`:

```prisma
model Activity {
  id          String   @id @default(cuid())
  tripId      String
  actorId     String
  verb        String // CREATED | UPDATED | DELETED | NOTED
  entityType  String // STOP | ITEM | TRANSPORT | ACCOMMODATION | CHAPTER | COST | NOTE
  entityId    String?
  entityLabel String // snapshot so deleted entities still render
  changes     Json? // [{ field, label, from, to }] for UPDATED; { excerpt } for NOTED
  createdAt   DateTime @default(now())

  trip  Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
  actor User @relation(fields: [actorId], references: [id], onDelete: Cascade)

  @@index([tripId, createdAt])
}
```
Add `lastReadActivityAt DateTime?` to `model TripMember`. Add `activities Activity[]` to `model Trip` and `activities Activity[]` to `model User` (back-relations).

- [ ] **Step 2: Hand-author** `prisma/migrations/20260624020000_activity_log/migration.sql` (match the style of an existing migration; Prisma `Json?` → `JSONB`, `DateTime` → `TIMESTAMP(3)`):

```sql
-- Activity event log
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Activity_tripId_createdAt_idx" ON "Activity"("tripId", "createdAt");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-member last-read marker
ALTER TABLE "TripMember" ADD COLUMN "lastReadActivityAt" TIMESTAMP(3);
```

- [ ] **Step 3:** `npx prisma generate && npx prisma validate && npx tsc --noEmit` — all clean. `npm test` still green.
- [ ] **Step 4: Commit** `git add prisma/schema.prisma prisma/migrations && git commit -m "feat(activity): Activity model + lastReadActivityAt + migration"`

---

### Task 2: `lib/activity.ts` — pure types, diffs, labels, headline

**Files:** Create `lib/activity.ts` + `lib/activity.test.ts`.

**Context:** All pure. Reuse existing formatters: `formatMoney` (`lib/money`), date helpers (`lib/dates`), `categoryLabel` (`lib/categories`), transport mode labels (`lib/enums` — check exact export). The diff compares a `before` and `after` plain object per entity.

- [ ] **Step 1: Write failing tests** in `lib/activity.test.ts` covering: `describeChanges("STOP", before, after)` returns one `{field,label,from,to}` per changed field and `[]` when nothing changed; date fields format human-readably; unchanged fields are omitted; `entityLabel("STOP", {name:"Rome"})` → "Rome"; `headline({verb:"CREATED",entityType:"STOP",entityLabel:"Rome"})` → a string containing "Rome". Add a money case for COST (estimatedMinor change formats via formatMoney) and an enum case for TRANSPORT mode.

- [ ] **Step 2: Implement** `lib/activity.ts`:

```ts
export const ACTIVITY_VERBS = ["CREATED", "UPDATED", "DELETED", "NOTED"] as const;
export type ActivityVerb = (typeof ACTIVITY_VERBS)[number];

export const ACTIVITY_ENTITY_TYPES = [
  "STOP", "ITEM", "TRANSPORT", "ACCOMMODATION", "CHAPTER", "COST", "NOTE",
] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export interface ActivityChange { field: string; label: string; from: string; to: string; }

// A field spec maps a key to a human label + a formatter (value -> display string).
interface FieldSpec { key: string; label: string; format?: (v: unknown) => string; }

// Per-entity diffable fields. Implementer fills all entities using existing
// formatters (dates, money, categoryLabel, transport-mode labels).
const FIELD_SPECS: Record<ActivityEntityType, FieldSpec[]> = {
  STOP: [
    { key: "name", label: "name" },
    { key: "country", label: "country" },
    { key: "arriveDate", label: "arrive date" },
    { key: "departDate", label: "depart date" },
    { key: "nights", label: "nights" },
  ],
  // ITEM, TRANSPORT, ACCOMMODATION, CHAPTER, COST: fill analogously.
  // NOTE has no field diffs (NOTED carries an excerpt instead).
  ITEM: [/* title, category(→categoryLabel), date, startTime, endTime, address */],
  TRANSPORT: [/* mode(→label), depPlace, arrPlace, depAt, arrAt, reference */],
  ACCOMMODATION: [/* name, address, checkIn, checkOut, confirmation */],
  CHAPTER: [/* name, colour, startDate, endDate */],
  COST: [/* estimatedMinor(→formatMoney w/ currency), actualMinor, currency, category */],
  NOTE: [],
};

const fmt = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v));

export function describeChanges(
  entityType: ActivityEntityType,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ActivityChange[] {
  const out: ActivityChange[] = [];
  for (const spec of FIELD_SPECS[entityType]) {
    const b = before[spec.key];
    const a = after[spec.key];
    if (b === a) continue;
    if (b == null && a == null) continue;
    const f = spec.format ?? fmt;
    out.push({ field: spec.key, label: spec.label, from: f(b), to: f(a) });
  }
  return out;
}

export function entityLabel(entityType: ActivityEntityType, row: Record<string, unknown>): string {
  switch (entityType) {
    case "STOP": case "ACCOMMODATION": case "CHAPTER": return String(row.name ?? "");
    case "ITEM": return String(row.title ?? "");
    case "TRANSPORT": return String(row.reference ?? row.depPlace ?? "transport");
    case "COST": return String(row.label ?? "cost");
    case "NOTE": return "note";
  }
}

const ENTITY_NOUN: Record<ActivityEntityType, string> = {
  STOP: "stop", ITEM: "item", TRANSPORT: "transport", ACCOMMODATION: "accommodation",
  CHAPTER: "chapter", COST: "cost", NOTE: "note",
};
const VERB_WORD: Record<ActivityVerb, string> = {
  CREATED: "added", UPDATED: "updated", DELETED: "removed", NOTED: "left a note on",
};

export function headline(a: { verb: ActivityVerb; entityType: ActivityEntityType; entityLabel: string }): string {
  return `${VERB_WORD[a.verb]} the ${a.entityLabel} ${ENTITY_NOUN[a.entityType]}`.trim();
}
```
The implementer must fill the remaining `FIELD_SPECS` with appropriate `format` fns (dates via `lib/dates`, money via `formatMoney(value, currency)` — note COST needs the row's currency, so format money in the action when building changes, OR pass currency through; simplest: COST formats estimated/actual against `after.currency`). Keep it pure and tested.

- [ ] **Step 3:** tests green; `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `git add lib/activity.ts lib/activity.test.ts && git commit -m "feat(activity): pure diff/label/headline helpers"`

---

### Task 3: `recordActivity` + `markAllRead` + read helpers

**Files:** Create `server/actions/activity.ts` + `server/actions/activity.test.ts`.

**Context:** `recordActivity` resolves the actor via `requireUser()` and is **best-effort** (swallow errors so it never breaks the caller's mutation). Read helpers compute unread relative to the caller's `TripMember.lastReadActivityAt`.

- [ ] **Step 1: Write failing tests** (mock `@/lib/db` and `@/lib/guards`): `recordActivity` calls `db.activity.create` with the resolved `actorId` + passed fields; if `db.activity.create` throws, `recordActivity` resolves without throwing (best-effort). `markAllRead` updates the caller's `TripMember.lastReadActivityAt`. Follow the mocking style in an existing `server/actions/*.test.ts`.

- [ ] **Step 2: Implement** `server/actions/activity.ts`:

```ts
"use server";
import { db } from "@/lib/db";
import { requireUser, requireTripAccess } from "@/lib/guards";
import type { ActivityVerb, ActivityEntityType, ActivityChange } from "@/lib/activity";

export async function recordActivity(input: {
  tripId: string;
  verb: ActivityVerb;
  entityType: ActivityEntityType;
  entityId?: string | null;
  entityLabel: string;
  changes?: ActivityChange[] | { excerpt: string } | null;
}): Promise<void> {
  try {
    const user = await requireUser();
    // Skip UPDATED events whose diff came back empty (no real change).
    if (input.verb === "UPDATED" && Array.isArray(input.changes) && input.changes.length === 0) return;
    await db.activity.create({
      data: {
        tripId: input.tripId,
        actorId: user.id,
        verb: input.verb,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel,
        changes: input.changes ?? undefined,
      },
    });
  } catch {
    // best-effort: never break the caller's mutation
  }
}

export async function markAllRead(tripId: string): Promise<void> {
  const user = await requireUser();
  await db.tripMember.updateMany({
    where: { tripId, userId: user.id },
    data: { lastReadActivityAt: new Date() },
  });
}

export async function getRecentActivity(tripId: string, limit = 10) {
  await requireTripAccess(tripId);
  return db.activity.findMany({
    where: { tripId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, name: true, image: true } } },
  });
}

export async function getUnreadActivityCount(tripId: string): Promise<number> {
  const { user, membership } = await requireTripAccess(tripId);
  const since = (membership as { lastReadActivityAt?: Date | null }).lastReadActivityAt ?? null;
  return db.activity.count({
    where: { tripId, actorId: { not: user.id }, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}
```
NOTE: `requireTripAccess` currently selects membership as `{ userId, role }` (see `lib/guards.ts`). **Add `lastReadActivityAt` to that membership `select`** so `getUnreadActivityCount` can read it (and so the trips-list/bell can use it). Make that small edit in `lib/guards.ts`.

- [ ] **Step 3:** tests green; `npx tsc --noEmit && npm run lint`.
- [ ] **Step 4: Commit** `git add server/actions/activity.ts server/actions/activity.test.ts lib/guards.ts && git commit -m "feat(activity): recordActivity, markAllRead, read helpers"`

---

### Task 4: Hooks — Stops (template for the rest)

**Files:** `server/actions/stops.ts` (+ existing test).

**Context:** This task establishes the hook pattern. Apply `recordActivity` to `createStop` / `updateStop` / `deleteStop` ONLY (leave the specialized stop actions per scope). Import `recordActivity` from `@/server/actions/activity` and `describeChanges` / `entityLabel` from `@/lib/activity`.

- [ ] **Step 1 — create:** capture the created row and record after the write, before/after `revalidatePath`:
```ts
const created = await db.stop.create({ data: {...} });
await recordActivity({ tripId, verb: "CREATED", entityType: "STOP", entityId: created.id, entityLabel: entityLabel("STOP", created) });
```
- [ ] **Step 2 — update:** load the FULL before-row (the access guard only gives `{id,tripId}` for some entities; for stops `requireStopAccess` gives 6 fields but not all — load the full row explicitly), update, then diff before-row vs the validated input:
```ts
const before = await db.stop.findUnique({ where: { id: stopId } });
const updated = await db.stop.update({ where: { id: stopId }, data: {...} });
await recordActivity({ tripId: stop.tripId, verb: "UPDATED", entityType: "STOP", entityId: stopId,
  entityLabel: entityLabel("STOP", updated),
  changes: describeChanges("STOP", before ?? {}, updated) });
```
(`recordActivity` no-ops on an empty diff.)
- [ ] **Step 3 — delete:** the label must be captured BEFORE deletion. Load `name` first (or reuse a loaded row), delete, then record:
```ts
const doomed = await db.stop.findUnique({ where: { id: stopId }, select: { name: true } });
await db.stop.delete({ where: { id: stopId } });
await recordActivity({ tripId: stop.tripId, verb: "DELETED", entityType: "STOP", entityId: stopId, entityLabel: doomed?.name ?? "" });
```
- [ ] **Step 4:** Extend `stops.test.ts` (it already mocks `db`): assert `createStop`/`updateStop`/`deleteStop` cause `db.activity.create` (or that `recordActivity` is invoked — mock `@/server/actions/activity`'s `recordActivity` and assert call args). Prefer mocking `recordActivity` to keep the assertion focused.
- [ ] **Step 5:** `npx tsc --noEmit && npm run lint && npm test` green.
- [ ] **Step 6: Commit** `git add server/actions/stops.ts server/actions/stops.test.ts && git commit -m "feat(activity): record stop create/update/delete"`

---

### Task 5: Hooks — Items + Transport

**Files:** `server/actions/items.ts`, `server/actions/transport.ts` (+ tests).

Apply the Task 4 pattern to `createItem`/`updateItem`/`deleteItem` (entityType `ITEM`, label = title) and `createTransport`/`updateTransport`/`deleteTransport` (entityType `TRANSPORT`). Load full before-rows for the updates (the guards only return `{id,tripId}`). Leave the item scheduling specials per scope. Extend both test files (mock `recordActivity`, assert calls). Commit each: `feat(activity): record item create/update/delete` and `feat(activity): record transport create/update/delete`.

---

### Task 6: Hooks — Accommodation + Chapters + Costs

**Files:** `server/actions/accommodation.ts`, `server/actions/chapters.ts`, `server/actions/costs.ts` (+ tests).

Apply the pattern to the plain create/update/delete in each (entityTypes `ACCOMMODATION`/`CHAPTER`/`COST`). For COST, `entityLabel` falls back to "cost"; money diffs format estimated/actual against the row's `currency`. Leave `suggestChaptersFromCountries` per scope. Extend the three test files. Commit per file with `feat(activity): record <entity> create/update/delete`.

---

### Task 7: Hooks — Notes

**Files:** `server/actions/notes.ts` (+ test).

`addNote` → `recordActivity({ verb: "NOTED", entityType: "NOTE", entityId: note.id, entityLabel: <target label or "note">, changes: { excerpt: body.slice(0,80) } })`. `deleteNote` → a `DELETED`/`NOTE` event (or skip delete — record add only; implementer's call, but be consistent: record `addNote` for sure). `addNote` already destructures `{ user }`, but `recordActivity` resolves the actor itself, so no change needed there. Extend the test. Commit `feat(activity): record notes`.

---

### Task 8: Header notification bell

**Files:** Create `components/trip/notification-bell.tsx` (+ focused test); modify `app/(app)/trips/[tripId]/layout.tsx`.

**Context:** The layout (server) fetches the unread count + recent activity and renders the bell next to the member avatars (around lines 77–100 of the layout). The bell is a client popover.

- [ ] **Step 1:** In `layout.tsx`, after the trip fetch, call `getUnreadActivityCount(tripId)` and `getRecentActivity(tripId, 10)`; render `<NotificationBell tripId={tripId} unreadCount={count} recent={recent} />` inside the header row (left of / beside the avatars).
- [ ] **Step 2:** `NotificationBell` (client): a bell icon (lucide `Bell`) with an unread badge when `unreadCount > 0`; opens a popover/dropdown (reuse `components/ui/dropdown-menu` or a popover) listing `recent` items via a small inline renderer (actor name + `headline(...)` + relative time from `lib/relative-time`); a "Mark all read" button that calls the `markAllRead` server action inside a `useTransition` then `router.refresh()`; a "See all" link to `/trips/${tripId}/activity`. `aria-label="Notifications"`; badge has an accessible label (e.g. `${count} unread`).
- [ ] **Step 3 (focused test):** `notification-bell.test.tsx` — mock `@/server/actions/activity` (`markAllRead`). Assert: badge shows the count and is hidden when 0; opening reveals the recent items; clicking "Mark all read" calls `markAllRead(tripId)`. (RTL + user-event, per `vote-control.test.tsx`.)
- [ ] **Step 4:** gates green.
- [ ] **Step 5: Commit** `git add components/trip/notification-bell.tsx components/trip/notification-bell.test.tsx "app/(app)/trips/[tripId]/layout.tsx" && git commit -m "feat(activity): header notification bell"`

---

### Task 9: Activity page + More-menu entry

**Files:** Create `app/(app)/trips/[tripId]/activity/page.tsx`, `components/trip/activity-feed.tsx`, `components/trip/mark-read-on-view.tsx`; modify `components/trip/trip-nav.tsx` (`moreNav`).

- [ ] **Step 1:** Add `{ label: "Activity", href: \`${base}/activity\` }` to `moreNav(tripId)` in `trip-nav.tsx`.
- [ ] **Step 2:** `activity/page.tsx` (server): guard via `requireTripAccess`; fetch activities (e.g. latest 100, desc, include actor); render `<ActivityFeed activities={...} />`; render `<MarkReadOnView tripId={tripId} />` (a tiny client component that calls the `markAllRead` server action in a mount `useEffect` then `router.refresh()`), so opening the feed clears unread.
- [ ] **Step 3:** `ActivityFeed` (presentational): group by day or a simple list; each row shows actor (name/avatar), `headline(activity)`, and for `UPDATED` the `changes` as "label: from → to" lines, plus relative time. Escape nothing dangerous (these are plain text in React, safe by default). Use `cn()`/existing card styling.
- [ ] **Step 4 (test):** a focused test for `ActivityFeed` rendering a CREATED and an UPDATED activity (asserts headline text + a "from → to" change line). `mark-read-on-view` can be left untested or shallow-tested with the action mocked.
- [ ] **Step 5:** gates green.
- [ ] **Step 6: Commit** `git add "app/(app)/trips/[tripId]/activity" components/trip/activity-feed.tsx components/trip/mark-read-on-view.tsx components/trip/trip-nav.tsx && git commit -m "feat(activity): activity feed page + More entry"`

---

### Task 10: Trips-list unread dots

**Files:** `app/(app)/trips/page.tsx`, `components/trip/trip-card.tsx` (+ trip-card test).

- [ ] **Step 1:** In the trips list page (server), for the current user compute per-trip unread counts: for each trip, count `Activity` where `tripId = trip.id AND actorId != userId AND (createdAt > thatMembership.lastReadActivityAt OR marker null)`. Simplest correct approach: fetch the user's memberships (`{ tripId, lastReadActivityAt }`) and run a count per trip (a handful of trips), or a single `groupBy` on Activity by tripId with the per-trip filter. Pass `unreadCount` into each `TripCard`.
- [ ] **Step 2:** Add optional `unreadCount?: number` prop to `TripCard`; when `> 0`, render a small dot/badge on the card (e.g. top-right of the gradient cover, mirroring the phase chip placement) with an accessible label (`${n} new`).
- [ ] **Step 3 (test):** extend `trip-card.test.tsx` — `unreadCount={3}` shows the badge; absent/0 shows nothing.
- [ ] **Step 4:** gates green.
- [ ] **Step 5: Commit** `git add "app/(app)/trips/page.tsx" components/trip/trip-card.tsx components/trip/trip-card.test.tsx && git commit -m "feat(activity): unread dots on the trips list"`

---

## Self-review notes

- **Spec coverage:** Task 1 (model/migration) · 2 (pure diffs/labels) · 3 (record/read/markRead + guard select) · 4–7 (hooks: stops, items+transport, accom+chapters+costs, notes) · 8 (bell) · 9 (feed page + nav) · 10 (trips-list dots). ADR 0012 + "Activity" glossary done.
- **Read model:** unread = other-actor activities after `TripMember.lastReadActivityAt`; `markAllRead` updates it; `requireTripAccess` membership select must include `lastReadActivityAt` (Task 3).
- **Best-effort recording:** `recordActivity` swallows errors and no-ops empty UPDATE diffs — never breaks a mutation.
- **Type consistency:** `ActivityVerb` / `ActivityEntityType` / `ActivityChange` from `@/lib/activity` used by `recordActivity`, the feed, and the bell. `describeChanges`/`entityLabel`/`headline` names stable.
- **Env caveat:** hand-author the migration; mock `db` in all action tests; never hit a DB.
