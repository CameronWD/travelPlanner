# Planning / Money / QoL Feature Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independent TEEPEE features on one branch — Duplicate trip, time-zone-aware display, map-first Wishlist + nearby-today, "Spend so far" + two new Flags, a command palette (⌘K), and a bounded a11y/perf hardening sweep.

**Architecture:** Each feature is a vertical slice that follows existing patterns: pure logic in `lib/*` (unit-tested), mutations as server actions in `server/actions/*` (guarded + validated + activity-logged), and React 19 client components under `components/trip/*`. No schema changes are required by any feature (all reuse existing models). Build order: **Planning (F1–F3) → Money (F4) → QoL (F5–F6)**.

**Tech Stack:** Next.js 16 (App Router, server components/actions), React 19, TypeScript 5, Prisma 7 → Postgres, Tailwind v4, Radix UI, lucide-react, Vitest + Testing Library, Leaflet (maps), `motion` (animation), Zod (validation).

## Global Constraints

- **Node** `>=20.19`. **No new runtime dependencies** unless a task explicitly says so — in particular **no** `cmdk`, **no** `leaflet.markercluster` (build on existing Radix/Leaflet).
- **No paid / metered / per-use services.** Free, keyless services only (existing storage, Leaflet+OSM+Nominatim, Open-Meteo, Frankfurter).
- **Schema portability:** no Prisma `enum`/`Json` for new fields (store enum-ish as `String`, JSON-ish as `String` of JSON). Money is `Int` minor units. Calendar dates are `String` `"YYYY-MM-DD"`. Instants are `DateTime`.
- **No schema migration is needed in this batch.** If any task thinks it needs one, stop and flag it.
- **Server-action convention:** `await requireTripAccess(tripId)` first; validate input with a Zod schema and return `{ success:false, errors }` on failure; mutate via `db`; `revalidatePath(...)` affected routes; record history best-effort via `recordActivity({...})` from `@/server/actions/activity`; return a `{ success:true, ... } | { success:false, ... }` union.
- **Test convention (Vitest):** mock `@/lib/db`, `@/lib/guards`, `next/cache`, and `@/server/actions/activity` using the `vi.hoisted(() => ({...}))` pattern (see Task 1.2). Pure `lib/*` modules get straight unit tests. `requireTripAccess` mock returns `{ user: { id: "user-1" }, membership: { role: "owner" } }`.
- **Migrations are authored but NOT run locally** (no live DB in dev sessions). The gates are `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npx vitest run <file>`. Prefer targeted `npx vitest run <file>` (full-suite runs sometimes hit a sandbox worker-pool timeout — not a real failure).
- **Terminology follows `CONTEXT.md` exactly** (Duplicate, Spend so far, Flag, Stop, Item, Wishlist, Traveller, Discreet mode…). Never coin new UI nouns; reuse the glossary's words ("Items", not "Ideas").
- **UX principle (saved user preference):** calm and uncluttered by default; heavier/contextual UI is opt-in (toggles) or collapsed and shown only when relevant; nothing nags.
- **Branch/merge discipline:** work only on `feat/trip-batch-planning-money-qol`; never commit to `main`; never merge/push/deploy without explicit human say-so.

---

## File Structure

**F1 Duplicate** — `lib/duplicate-trip.ts` (pure plan builder) + `.test.ts`; `server/actions/trips.ts` (+`duplicateTrip`) + test; `components/trip/duplicate-trip-dialog.tsx`; edits to `app/(app)/trips/[tripId]/settings/page.tsx`, `components/trip/trip-card.tsx`, `components/discreet/project-table.tsx`.

**F2 Time-zone display** — `lib/time-display.ts` (pure formatting helpers) + `.test.ts`; edits to the time-rendering surfaces (transport card, day view, calendar month grid, travelling Home, print).

**F3 Map Wishlist + nearby** — `lib/nearby.ts` (pure) + `.test.ts`; `components/trip/wishlist-map.tsx`; `components/trip/nearby-wishlist.tsx`; edits to `components/trip/wishlist-board.tsx`, the day view, travelling Home.

**F4 Spend so far + Flags** — `lib/spend-so-far.ts` (pure) + `.test.ts`; new flag rules in `lib/flags.ts` + tests; `components/trip/spend-so-far-card.tsx`; edits to budget page + Home phases.

**F5 Command palette** — `components/command-palette.tsx` + provider; `server/actions/search.ts`; edits to `app/(app)/layout.tsx` + header.

**F6 Hardening** — targeted edits to the audited surfaces (driven by the audit task's findings).

*(F2–F6 file lists are refined in their own sections below as the research lands.)*

---

# Feature 1 — Duplicate trip

**Outcome:** From an existing Trip, create a brand-new independent Trip that copies the reusable skeleton (Stops→rough, Chapters→rough, Wishlist/Items→unscheduled, Transport connections stripped of times/refs/cost, Checklist text, co-traveller memberships) and resets every date, dropping all bookings/money/history. Entry points: Settings action + trips-list card ⋯ menu (and the discreet project table). No schema change.

### Task 1.1: Pure duplicate-plan builder

**Files:**
- Create: `lib/duplicate-trip.ts`
- Test: `lib/duplicate-trip.test.ts`

**Interfaces:**
- Produces: `buildDuplicatePlan(source: DuplicateSource, newName: string): DuplicatePlan` and the exported input/output types below. Task 1.2 consumes these.

The builder is pure (no db, no IDs minted) — it transforms a source snapshot into create-data keyed by *source* ids, so the action can mint new ids and remap relationships.

- [ ] **Step 1: Write the failing test**

```ts
// lib/duplicate-trip.test.ts
import { describe, it, expect } from "vitest";
import { buildDuplicatePlan, type DuplicateSource } from "./duplicate-trip";

const SOURCE: DuplicateSource = {
  name: "Europe 2026",
  homeCurrency: "AUD",
  drivingWindingFactor: 1.4,
  drivingAvgSpeedKph: 90,
  chapters: [
    { id: "ch1", name: "Italy", colour: "rose", startDate: "2026-08-01", endDate: "2026-08-10", sortOrder: 0 },
  ],
  stops: [
    // scheduled stop — should become rough, nights derived from dates
    { id: "s1", name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
      arriveDate: "2026-08-01", departDate: "2026-08-04", nights: null, pinned: true,
      sortOrder: 0, chapterId: "ch1", chapterSortOrder: 0, notes: "near station" },
    // rough stop — keep its nights
    { id: "s2", name: "Florence", country: "Italy", lat: null, lng: null, timezone: null,
      arriveDate: null, departDate: null, nights: 2, pinned: false,
      sortOrder: 1, chapterId: "ch1", chapterSortOrder: 1, notes: null },
  ],
  items: [
    { stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-08-02",
      startTime: "09:00", endTime: "11:00", lat: 41.89, lng: 12.49, address: "Rome", link: "x", booking: "BK1", notes: "n" },
    { stopId: null, title: "Gelato somewhere", category: "FOOD", date: null,
      startTime: null, endTime: null, lat: null, lng: null, address: null, link: null, booking: null, notes: null },
  ],
  transports: [
    { fromStopId: "s1", toStopId: "s2", mode: "TRAIN", depPlace: "Roma Termini", arrPlace: "Firenze",
      depAt: new Date("2026-08-04T08:00:00Z"), arrAt: new Date("2026-08-04T09:30:00Z"),
      reference: "FR9521", notes: "platform 5", depLat: 41.9, depLng: 12.5, arrLat: 43.7, arrLng: 11.2 },
  ],
  checklistItems: [
    { kind: "PRETRIP", text: "Renew passport", dueDate: "2026-07-01" },
    { kind: "PACKING", text: "Chargers", dueDate: null },
  ],
};

describe("buildDuplicatePlan", () => {
  it("sets trip name + copies currency and driving settings, no dates", () => {
    const plan = buildDuplicatePlan(SOURCE, "Copy of Europe 2026");
    expect(plan.trip).toEqual({
      name: "Copy of Europe 2026",
      homeCurrency: "AUD",
      drivingWindingFactor: 1.4,
      drivingAvgSpeedKph: 90,
    });
  });

  it("carries chapters but resets their dates (rough)", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.chapters).toEqual([
      { sourceId: "ch1", data: { name: "Italy", colour: "rose", startDate: null, endDate: null, sortOrder: 0 } },
    ]);
  });

  it("makes every stop rough: clears dates, clears pin, derives nights for scheduled stops, keeps place facts", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    const rome = plan.stops.find((s) => s.sourceId === "s1")!;
    expect(rome.data).toEqual({
      name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
      arriveDate: null, departDate: null, nights: 3, pinned: false,
      sortOrder: 0, chapterSortOrder: 0, notes: "near station",
    });
    expect(rome.sourceChapterId).toBe("ch1");
    const flor = plan.stops.find((s) => s.sourceId === "s2")!;
    expect(flor.data.nights).toBe(2); // rough stop keeps its nights
  });

  it("turns all items into unscheduled wishlist items, clearing date/time/booking, keeping research", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    const col = plan.items[0];
    expect(col.sourceStopId).toBe("s1");
    expect(col.data).toEqual({
      title: "Colosseum", category: "SIGHTSEEING",
      date: null, startTime: null, endTime: null, booking: null,
      lat: 41.89, lng: 12.49, address: "Rome", link: "x", notes: "n",
      sortOrder: 0,
    });
  });

  it("keeps transport connections but strips times/reference/notes/cost-bearing fields", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.transports).toHaveLength(1);
    const t = plan.transports[0];
    expect(t.sourceFromStopId).toBe("s1");
    expect(t.sourceToStopId).toBe("s2");
    expect(t.data).toEqual({
      mode: "TRAIN", depPlace: "Roma Termini", arrPlace: "Firenze",
      depAt: null, arrAt: null, reference: null, notes: null,
      depLat: 41.9, depLng: 12.5, arrLat: 43.7, arrLng: 11.2, sortOrder: 0,
    });
  });

  it("copies checklist text, unticked, clearing due date and assignee", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.checklistItems).toEqual([
      { data: { kind: "PRETRIP", text: "Renew passport", done: false, dueDate: null, assignedToId: null, sortOrder: 0 } },
      { data: { kind: "PACKING", text: "Chargers", done: false, dueDate: null, assignedToId: null, sortOrder: 1 } },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/duplicate-trip.test.ts`
Expected: FAIL — `buildDuplicatePlan` is not defined / module missing.

- [ ] **Step 3: Write the implementation**

```ts
// lib/duplicate-trip.ts
/**
 * Pure builder for the Duplicate-trip feature. Transforms a source Trip
 * snapshot into create-data keyed by SOURCE ids, applying the copy/reset/drop
 * rules from ADR-0018. No db, no id minting, no network — the server action
 * mints ids and remaps relationships from the `sourceId` keys.
 *
 * Rules: keep the skeleton (stops as rough, chapters as rough, items as
 * unscheduled wishlist, transport connections stripped, checklist text);
 * reset every date; drop accommodations, costs, FX rates, and all history
 * (handled by simply not reading them into the source snapshot).
 */

export interface DuplicateSourceChapter {
  id: string;
  name: string;
  colour: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

export interface DuplicateSourceStop {
  id: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
  chapterId: string | null;
  chapterSortOrder: number;
  notes: string | null;
}

export interface DuplicateSourceItem {
  stopId: string | null;
  title: string;
  category: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  link: string | null;
  booking: string | null;
  notes: string | null;
}

export interface DuplicateSourceTransport {
  fromStopId: string | null;
  toStopId: string | null;
  mode: string;
  depPlace: string | null;
  arrPlace: string | null;
  depAt: Date | null;
  arrAt: Date | null;
  reference: string | null;
  notes: string | null;
  depLat: number | null;
  depLng: number | null;
  arrLat: number | null;
  arrLng: number | null;
}

export interface DuplicateSourceChecklistItem {
  kind: string;
  text: string;
  dueDate: string | null;
}

export interface DuplicateSource {
  name: string;
  homeCurrency: string;
  drivingWindingFactor: number;
  drivingAvgSpeedKph: number;
  chapters: DuplicateSourceChapter[];
  stops: DuplicateSourceStop[];
  items: DuplicateSourceItem[];
  transports: DuplicateSourceTransport[];
  checklistItems: DuplicateSourceChecklistItem[];
}

export interface DuplicatePlan {
  trip: { name: string; homeCurrency: string; drivingWindingFactor: number; drivingAvgSpeedKph: number };
  chapters: Array<{ sourceId: string; data: { name: string; colour: string; startDate: null; endDate: null; sortOrder: number } }>;
  stops: Array<{
    sourceId: string;
    sourceChapterId: string | null;
    data: {
      name: string; country: string | null; lat: number | null; lng: number | null; timezone: string | null;
      arriveDate: null; departDate: null; nights: number; pinned: false; sortOrder: number; chapterSortOrder: number; notes: string | null;
    };
  }>;
  items: Array<{
    sourceStopId: string | null;
    data: {
      title: string; category: string; date: null; startTime: null; endTime: null; booking: null;
      lat: number | null; lng: number | null; address: string | null; link: string | null; notes: string | null; sortOrder: number;
    };
  }>;
  transports: Array<{
    sourceFromStopId: string | null;
    sourceToStopId: string | null;
    data: {
      mode: string; depPlace: string | null; arrPlace: string | null; depAt: null; arrAt: null; reference: null; notes: null;
      depLat: number | null; depLng: number | null; arrLat: number | null; arrLng: number | null; sortOrder: number;
    };
  }>;
  checklistItems: Array<{ data: { kind: string; text: string; done: false; dueDate: null; assignedToId: null; sortOrder: number } }>;
}

/** Whole nights between two YYYY-MM-DD dates (UTC midnight diff). */
function nightsBetween(arrive: string, depart: string): number {
  const a = Date.parse(`${arrive}T00:00:00Z`);
  const d = Date.parse(`${depart}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(d)) return 1;
  return Math.max(1, Math.round((d - a) / 86_400_000));
}

export function buildDuplicatePlan(source: DuplicateSource, newName: string): DuplicatePlan {
  return {
    trip: {
      name: newName,
      homeCurrency: source.homeCurrency,
      drivingWindingFactor: source.drivingWindingFactor,
      drivingAvgSpeedKph: source.drivingAvgSpeedKph,
    },
    chapters: source.chapters.map((c) => ({
      sourceId: c.id,
      data: { name: c.name, colour: c.colour, startDate: null, endDate: null, sortOrder: c.sortOrder },
    })),
    stops: source.stops.map((s) => ({
      sourceId: s.id,
      sourceChapterId: s.chapterId,
      data: {
        name: s.name,
        country: s.country,
        lat: s.lat,
        lng: s.lng,
        timezone: s.timezone,
        arriveDate: null,
        departDate: null,
        nights: s.nights ?? (s.arriveDate && s.departDate ? nightsBetween(s.arriveDate, s.departDate) : 1),
        pinned: false,
        sortOrder: s.sortOrder,
        chapterSortOrder: s.chapterSortOrder,
        notes: s.notes,
      },
    })),
    items: source.items.map((it, idx) => ({
      sourceStopId: it.stopId,
      data: {
        title: it.title,
        category: it.category,
        date: null,
        startTime: null,
        endTime: null,
        booking: null,
        lat: it.lat,
        lng: it.lng,
        address: it.address,
        link: it.link,
        notes: it.notes,
        sortOrder: idx,
      },
    })),
    transports: source.transports.map((t, idx) => ({
      sourceFromStopId: t.fromStopId,
      sourceToStopId: t.toStopId,
      data: {
        mode: t.mode,
        depPlace: t.depPlace,
        arrPlace: t.arrPlace,
        depAt: null,
        arrAt: null,
        reference: null,
        notes: null,
        depLat: t.depLat,
        depLng: t.depLng,
        arrLat: t.arrLat,
        arrLng: t.arrLng,
        sortOrder: idx,
      },
    })),
    checklistItems: source.checklistItems.map((c, idx) => ({
      data: { kind: c.kind, text: c.text, done: false, dueDate: null, assignedToId: null, sortOrder: idx },
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/duplicate-trip.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/duplicate-trip.ts lib/duplicate-trip.test.ts
git commit -m "feat(duplicate): pure duplicate-plan builder (skeleton copy, dates reset)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: `duplicateTrip` server action

**Files:**
- Modify: `server/actions/trips.ts` (append `duplicateTrip`)
- Test: `server/actions/trips.test.ts` (append cases)

**Interfaces:**
- Consumes: `buildDuplicatePlan` (Task 1.1); `requireTripAccess` from `@/lib/guards`; `recordActivity` from `@/server/actions/activity`.
- Produces: `duplicateTrip(sourceTripId: string, newName: string): Promise<{ success: true; tripId: string } | { success: false; error: string }>`. Tasks 1.3/1.4 consume this.

The action loads the source trip with the relations the builder needs, runs `buildDuplicatePlan`, then in a `$transaction`: creates the new Trip, the owner membership (current user), copies co-traveller memberships, and creates chapters→stops (capturing source→new id maps) then items/transports (remapped) and checklist items.

- [ ] **Step 1: Write the failing test** (append to `server/actions/trips.test.ts`)

Add `tripFindUnique`, the child-model `create`/`findMany` mocks, and a `$transaction` mock whose `tx` exposes `trip`, `tripMember`, `chapter`, `stop`, `item`, `transport`, `checklistItem` create fns. Then:

```ts
describe("duplicateTrip", () => {
  it("creates a new trip + owner membership + copies co-travellers, and remaps children", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "user-1" }, membership: { role: "member" } });
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }, { userId: "user-2", role: "member" }],
      chapters: [{ id: "ch1", name: "Italy", colour: "rose", startDate: "2026-08-01", endDate: "2026-08-10", sortOrder: 0 }],
      stops: [{ id: "s1", name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
                arriveDate: "2026-08-01", departDate: "2026-08-04", nights: null, pinned: true,
                sortOrder: 0, chapterId: "ch1", chapterSortOrder: 0, notes: null }],
      items: [{ stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-08-02", startTime: "09:00",
                endTime: null, lat: null, lng: null, address: null, link: null, booking: "B", notes: null }],
      transports: [], checklistItems: [],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });
    chapterCreateMock.mockResolvedValue({ id: "new-ch1" });
    stopCreateMock.mockResolvedValue({ id: "new-s1" });
    itemCreateMock.mockResolvedValue({ id: "new-i1" });

    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new" });
    expect(tripCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Copy of Europe 2026", homeCurrency: "AUD", createdById: "user-1" }),
    }));
    // owner + one co-traveller membership
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-1", role: "owner" } });
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-2", role: "member" } });
    // stop created rough (dates null), item created unscheduled under the remapped stop
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", arriveDate: null, departDate: null, chapterId: "new-ch1" }) });
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", stopId: "new-s1", date: null, booking: null }) });
  });

  it("denies when the caller lacks access", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(duplicateTrip("src", "x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: FAIL — `duplicateTrip` not exported / mocks for new child models undefined.

- [ ] **Step 3: Implement `duplicateTrip`** (append to `server/actions/trips.ts`)

```ts
export type DuplicateTripResult =
  | { success: true; tripId: string }
  | { success: false; error: string };

export async function duplicateTrip(
  sourceTripId: string,
  newName: string,
): Promise<DuplicateTripResult> {
  const { user } = await requireTripAccess(sourceTripId);

  const source = await db.trip.findUnique({
    where: { id: sourceTripId },
    include: {
      members: { select: { userId: true, role: true } },
      chapters: true,
      stops: true,
      items: true,
      transports: true,
      checklistItems: true,
    },
  });
  if (!source) return { success: false, error: "Trip not found" };

  const name = newName.trim() || `Copy of ${source.name}`;
  const plan = buildDuplicatePlan(
    {
      name: source.name,
      homeCurrency: source.homeCurrency,
      drivingWindingFactor: source.drivingWindingFactor,
      drivingAvgSpeedKph: source.drivingAvgSpeedKph,
      chapters: source.chapters,
      stops: source.stops,
      items: source.items.map((i) => ({ ...i })),
      transports: source.transports,
      checklistItems: source.checklistItems,
    },
    name,
  );

  const newTrip = await db.$transaction(async (tx) => {
    const trip = await tx.trip.create({ data: { ...plan.trip, createdById: user.id } });

    // Owner = duplicator; copy every co-traveller membership too (ADR-0018).
    await tx.tripMember.create({ data: { tripId: trip.id, userId: user.id, role: "owner" } });
    for (const m of source.members) {
      if (m.userId === user.id) continue;
      await tx.tripMember.create({ data: { tripId: trip.id, userId: m.userId, role: m.role } });
    }

    const chapterIdMap = new Map<string, string>();
    for (const c of plan.chapters) {
      const created = await tx.chapter.create({ data: { tripId: trip.id, ...c.data } });
      chapterIdMap.set(c.sourceId, created.id);
    }

    const stopIdMap = new Map<string, string>();
    for (const s of plan.stops) {
      const created = await tx.stop.create({
        data: { tripId: trip.id, chapterId: s.sourceChapterId ? chapterIdMap.get(s.sourceChapterId) ?? null : null, ...s.data },
      });
      stopIdMap.set(s.sourceId, created.id);
    }

    for (const it of plan.items) {
      await tx.item.create({
        data: { tripId: trip.id, stopId: it.sourceStopId ? stopIdMap.get(it.sourceStopId) ?? null : null, ...it.data },
      });
    }

    for (const t of plan.transports) {
      await tx.transport.create({
        data: {
          tripId: trip.id,
          fromStopId: t.sourceFromStopId ? stopIdMap.get(t.sourceFromStopId) ?? null : null,
          toStopId: t.sourceToStopId ? stopIdMap.get(t.sourceToStopId) ?? null : null,
          ...t.data,
        },
      });
    }

    for (const c of plan.checklistItems) {
      await tx.checklistItem.create({ data: { tripId: trip.id, ...c.data } });
    }

    return trip;
  });

  await recordActivity({ tripId: newTrip.id, verb: "CREATED", entityType: "TRIP", entityId: newTrip.id, entityLabel: newTrip.name });
  revalidatePath("/trips");
  return { success: true, tripId: newTrip.id };
}
```

> If `ActivityEntityType` does not include `"TRIP"`, use the closest existing value or omit the `recordActivity` call (it is best-effort). Confirm against `lib/enums.ts` while implementing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/actions/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add server/actions/trips.ts server/actions/trips.test.ts
git commit -m "feat(duplicate): duplicateTrip server action — transactional copy + member copy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Duplicate dialog + Settings entry point

**Files:**
- Create: `components/trip/duplicate-trip-dialog.tsx`
- Modify: `app/(app)/trips/[tripId]/settings/page.tsx`

**Interfaces:**
- Consumes: `duplicateTrip` (Task 1.2). Mirror the existing confirm-modal pattern in `components/trip/settings/danger-zone.tsx` (Radix dialog + a client mutation + `useRouter`).

- [ ] **Step 1: Build the dialog component**

Create a `"use client"` `DuplicateTripDialog({ tripId, tripName }: { tripId: string; tripName: string })` that:
- renders a trigger button "Duplicate trip" (lucide `Copy` icon),
- opens a dialog (reuse `@/components/ui/dialog`) with a single text `Input` (default value `Copy of ${tripName}`), and the helper line *"Your co-travellers will be added to the duplicate too."*,
- on confirm: `setPending(true)`, `const res = await duplicateTrip(tripId, name)`, on `res.success` `router.push(\`/trips/${res.tripId}\`)`, else `toast({ title: "Couldn't duplicate", variant: "destructive" })`.

Mirror imports/structure of `danger-zone.tsx` exactly (same dialog primitive, `useRouter` from `next/navigation`, `Button`, `toast`).

- [ ] **Step 2: Add a "Duplicate" section to the Settings page**

In `app/(app)/trips/[tripId]/settings/page.tsx`, add a card section (matching the existing section styling) **above the Danger Zone**, rendering `<DuplicateTripDialog tripId={tripId} tripName={trip.name} />` with a one-line description: *"Start a new trip from this one's structure — dates reset, bookings and costs left behind."*

- [ ] **Step 3: Verify it renders + typechecks**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0. (Manual runtime check happens at branch review; no live DB here.)

- [ ] **Step 4: Commit**

```bash
git add components/trip/duplicate-trip-dialog.tsx "app/(app)/trips/[tripId]/settings/page.tsx"
git commit -m "feat(duplicate): Settings entry point + confirm dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 1.4: Trips-list card ⋯ menu + discreet row action

**Files:**
- Modify: `components/trip/trip-card.tsx`
- Modify: `components/discreet/project-table.tsx`

**Interfaces:**
- Consumes: `duplicateTrip` (Task 1.2); `DuplicateTripDialog` (Task 1.3) — or a lighter inline trigger. Uses Radix `@radix-ui/react-dropdown-menu` (already a dependency).

- [ ] **Step 1: Add a ⋯ menu overlay to `TripCard`**

The card is a full `<Link>`. Add an absolutely-positioned `DropdownMenu` trigger (top-right, lucide `MoreVertical`, `aria-label="Trip actions"`) **outside** the `<Link>`'s navigation by wrapping the card in a `relative` container and rendering the menu as a sibling overlay with `onClick`/`onPointerDown` `stopPropagation` so opening the menu doesn't navigate. Menu item **"Duplicate"** opens the `DuplicateTripDialog` (controlled `open` state).

- [ ] **Step 2: Add the same action to the discreet `ProjectTable`**

In `components/discreet/project-table.tsx`, add a trailing row action (a `DropdownMenu` with a single neutral **"Duplicate"** item — no "trip" wording, matching the disguise) that triggers the same duplicate flow for that row's id.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

```bash
git add components/trip/trip-card.tsx components/discreet/project-table.tsx
git commit -m "feat(duplicate): trips-list card menu + discreet row action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# Feature 2 — Time-zone-aware display

**Outcome:** Times are never ambiguous about their zone. Local time stays primary; a short zone abbreviation labels the day/stop header once, and inline labels appear where there's no header (transport cards, next-departure). Cross-zone transport shows both ends' zones + a "+N day" marker. Unknown zones are labelled `UTC`, never silently faked. ICS feed is verified unchanged (it already emits correct UTC instants). No schema change.

**Reuse:** `lib/dates.ts` already exports `tzAbbrev(timezone, onDateISO): string | null` and `daysBetween(a, b)`; `lib/tz.ts` exports `instantToZonedTime` and `instantToZonedDateISO`.

### Task 2.1: Pure time-display helper

**Files:**
- Create: `lib/time-display.ts`
- Test: `lib/time-display.test.ts`

**Interfaces:**
- Produces: `zoneLabel(timezone, onDateISO): string`, `shortDate(dateISO): string`, `transportTimeDisplay(input): TransportTimeDisplay`. Consumed by Tasks 2.2–2.4.

- [ ] **Step 1: Write the failing test**

```ts
// lib/time-display.test.ts
import { describe, it, expect } from "vitest";
import { zoneLabel, shortDate, transportTimeDisplay } from "./time-display";

describe("zoneLabel", () => {
  it("falls back to UTC when the zone is missing/invalid", () => {
    expect(zoneLabel(null, "2026-08-05")).toBe("UTC");
    expect(zoneLabel(undefined, "2026-08-05")).toBe("UTC");
    expect(zoneLabel("Not/AZone", "2026-08-05")).toBe("UTC");
  });
  it("returns a non-empty abbreviation for a real zone", () => {
    const label = zoneLabel("Australia/Sydney", "2026-01-01");
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("UTC");
  });
});

describe("shortDate", () => {
  it("formats an ISO date as day + short month", () => {
    expect(shortDate("2026-08-05")).toBe("5 Aug");
  });
});

describe("transportTimeDisplay", () => {
  it("labels both ends in their own zone and flags a +1 day arrival", () => {
    const td = transportTimeDisplay({
      depAt: new Date("2026-08-05T18:00:00Z"), // 20:00 in Europe/Rome (CEST)
      arrAt: new Date("2026-08-06T07:30:00Z"), // 16:30 next day in Asia/Tokyo (JST)
      fromTimezone: "Europe/Rome",
      toTimezone: "Asia/Tokyo",
    });
    expect(td.dep).toMatchObject({ time: "20:00", dateISO: "2026-08-05" });
    expect(td.arr).toMatchObject({ time: "16:30", dateISO: "2026-08-06" });
    expect(td.dayDelta).toBe(1);
    expect(td.dep!.zone.length).toBeGreaterThan(0);
    expect(td.arr!.zone.length).toBeGreaterThan(0);
  });
  it("uses UTC labels when a zone is unknown and returns null ends for missing instants", () => {
    const td = transportTimeDisplay({ depAt: new Date("2026-08-05T18:00:00Z"), arrAt: null, fromTimezone: null, toTimezone: null });
    expect(td.dep).toMatchObject({ zone: "UTC" });
    expect(td.arr).toBeNull();
    expect(td.dayDelta).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/time-display.test.ts`
Expected: FAIL — module/functions missing.

- [ ] **Step 3: Write the implementation**

```ts
// lib/time-display.ts
/**
 * Pure display helpers for timezone-aware time rendering (Feature: tz display).
 * Local time stays primary; these add a legible zone label and cross-zone
 * "+N day" math. No React, no network.
 */
import { instantToZonedTime, instantToZonedDateISO } from "@/lib/tz";
import { tzAbbrev, daysBetween } from "@/lib/dates";

/** Short zone label for an instant's local date, e.g. "CEST"; "UTC" when unknown. */
export function zoneLabel(timezone: string | null | undefined, onDateISO: string): string {
  return tzAbbrev(timezone ?? null, onDateISO) ?? "UTC";
}

/** Compact "5 Aug" from a YYYY-MM-DD calendar date (zone-free). */
export function shortDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateISO}T00:00:00Z`));
}

export interface ZonedEndpoint { time: string; zone: string; dateISO: string }
export interface TransportTimeDisplay {
  dep: ZonedEndpoint | null;
  arr: ZonedEndpoint | null;
  /** arr calendar date minus dep calendar date, each in its own zone; 0 same day, can be negative. */
  dayDelta: number;
}

export function transportTimeDisplay(input: {
  depAt: Date | null | undefined;
  arrAt: Date | null | undefined;
  fromTimezone: string | null | undefined;
  toTimezone: string | null | undefined;
}): TransportTimeDisplay {
  const { depAt, arrAt, fromTimezone, toTimezone } = input;
  const depTz = fromTimezone ?? "UTC";
  const arrTz = toTimezone ?? fromTimezone ?? "UTC";

  let dep: ZonedEndpoint | null = null;
  if (depAt) {
    const dateISO = instantToZonedDateISO(depAt, depTz);
    dep = { time: instantToZonedTime(depAt, depTz), zone: zoneLabel(fromTimezone, dateISO), dateISO };
  }
  let arr: ZonedEndpoint | null = null;
  if (arrAt) {
    const dateISO = instantToZonedDateISO(arrAt, arrTz);
    arr = { time: instantToZonedTime(arrAt, arrTz), zone: zoneLabel(toTimezone ?? fromTimezone, dateISO), dateISO };
  }
  const dayDelta = dep && arr ? daysBetween(dep.dateISO, arr.dateISO) : 0;
  return { dep, arr, dayDelta };
}

/** Render the "+1 day" / "−1 day" suffix for a cross-zone arrival; "" when same day. */
export function dayDeltaSuffix(dayDelta: number): string {
  if (dayDelta === 0) return "";
  const sign = dayDelta > 0 ? "+" : "−";
  const n = Math.abs(dayDelta);
  return ` (${sign}${n} day${n === 1 ? "" : "s"})`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/time-display.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/time-display.ts lib/time-display.test.ts
git commit -m "feat(tz): pure time-display helpers (zone label, cross-zone day delta)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Transport card — labelled times + cross-zone marker

**Files:**
- Modify: `components/trip/transport-card.tsx`
- Test: `components/trip/transport-card.test.tsx` (add cases)

**Interfaces:**
- Consumes: `transportTimeDisplay`, `shortDate`, `dayDeltaSuffix` (Task 2.1). The component already receives `t.fromStopTimezone` / `t.toStopTimezone`.

- [ ] **Step 1: Write the failing test** (append to `transport-card.test.tsx`)

```ts
it("labels dep/arr with their zone and a +1 day marker for overnight cross-zone flights", () => {
  render(
    <TransportCard
      transport={{
        id: "t1", mode: "FLIGHT", sortOrder: 0,
        depAt: new Date("2026-08-05T18:00:00Z"), arrAt: new Date("2026-08-06T07:30:00Z"),
        fromStopTimezone: "Europe/Rome", toStopTimezone: "Asia/Tokyo",
      }}
    />,
  );
  expect(screen.getByText(/20:00/)).toBeInTheDocument();
  expect(screen.getByText(/16:30/)).toBeInTheDocument();
  expect(screen.getByText(/\+1 day/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/transport-card.test.tsx`
Expected: FAIL — "+1 day" text not rendered (current code shows no zone/delta).

- [ ] **Step 3: Replace the time rendering**

In `transport-card.tsx`, delete the local `formatInstant` helper and replace the dep/arr computation + the "Times row" rendering with:

```tsx
import { transportTimeDisplay, shortDate, dayDeltaSuffix } from "@/lib/time-display";
// ...
const td = transportTimeDisplay({
  depAt: t.depAt, arrAt: t.arrAt, fromTimezone: t.fromStopTimezone, toTimezone: t.toStopTimezone,
});
```

```tsx
{td.dep && (
  <span>
    <span className="font-medium text-foreground/70">dep</span>{" "}
    {shortDate(td.dep.dateISO)} {td.dep.time}{" "}
    <abbr title={t.fromStopTimezone ?? "Time zone unknown"} className="no-underline text-foreground/60">{td.dep.zone}</abbr>
  </span>
)}
{td.arr && (
  <span>
    <span className="font-medium text-foreground/70">arr</span>{" "}
    {td.arr.time}{" "}
    <abbr title={t.toStopTimezone ?? "Time zone unknown"} className="no-underline text-foreground/60">{td.arr.zone}</abbr>
    {dayDeltaSuffix(td.dayDelta)}
  </span>
)}
```

Keep the existing duration + driveEstimate rendering unchanged (duration is computed from the instants and stays correct).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/trip/transport-card.test.tsx`
Expected: PASS (existing drive-estimate cases still green).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/trip/transport-card.tsx components/trip/transport-card.test.tsx
git commit -m "feat(tz): transport card shows zone labels + cross-zone day marker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: Zone label on day headers (day view + print)

**Files:**
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx`
- Modify: `app/(app)/trips/[tripId]/print/page.tsx`

**Interfaces:**
- Consumes: `zoneLabel` (Task 2.1). The day page already has `stopTimezone` + `effectiveDate`; the print page has `day.stop.timezone` + `day.dateISO`.

- [ ] **Step 1: Add the label to the day-view header**

In the day header block (after `formatLongDate(effectiveDate)` + stop name), when `dayPlan.stop?.timezone` is set, append a muted zone chip:

```tsx
{dayPlan.stop?.timezone && (
  <span className="text-xs text-muted-foreground">
    {dayPlan.stop.name}{dayPlan.stop.country ? `, ${dayPlan.stop.country}` : ""} · {zoneLabel(dayPlan.stop.timezone, effectiveDate)}
  </span>
)}
```

(Replace the existing stop-name `<p>` so the zone sits alongside the place. Items below stay bare — they inherit this header.)

- [ ] **Step 2: Add the same to the print day header**

In `print/page.tsx`, in the day-section header (next to `formatLongDate(day.dateISO)` + `day.stop.name`), append `· {zoneLabel(day.stop.timezone, day.dateISO)}` when the stop has a timezone.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

```bash
git add "app/(app)/trips/[tripId]/day/[date]/page.tsx" "app/(app)/trips/[tripId]/print/page.tsx"
git commit -m "feat(tz): label the time zone once on day + print headers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2.4: Zone label on the travelling Home's next-departure

**Files:**
- Modify: `components/trip/transport-countdown.tsx`
- Modify: `components/trip/home/phase-travelling.tsx` (where the countdown/next-departure is rendered)

**Interfaces:**
- Consumes: `zoneLabel` (Task 2.1). The countdown currently receives a precomputed `depTimeLabel` (HH:MM). Add an optional `depZone?: string` prop and render it after the time.

- [ ] **Step 1: Thread a zone label into the countdown**

Add `depZone?: string | null` to `TransportCountdownProps`; where it renders `at {depTimeLabel}`, render `at {depTimeLabel}{depZone ? ` ${depZone}` : ""}`. In `phase-travelling.tsx`, compute the zone for the next departure with `zoneLabel(fromStop?.timezone, effectiveDate)` and pass it as `depZone`.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

```bash
git add components/trip/transport-countdown.tsx components/trip/home/phase-travelling.tsx
git commit -m "feat(tz): next-departure countdown shows the departure zone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **ICS note (no task):** Per spec, the ICS feed is intentionally left unchanged — it already emits correct UTC instants (`DTSTART:…Z`), which external calendars render in the viewer's own zone. Do **not** add TZID/VTIMEZONE here.

---

# Feature 3 — Map-first Wishlist + nearby-today

**Outcome:** Wishlist gains a calm List ⇄ Map toggle (List is default). Map view plots located items as category-coloured pins with a stop filter and click-to-Schedule; unlocated items show as one collapsed count line. Separately, "Nearby from your Wishlist" surfaces located unscheduled items within ~1.5 km of a day's plan — collapsed, only when there are any — on the Day view and travelling Home, each with an "Add to today" action. No schema change.

**Reuse:** `lib/geo.haversineKm`; Leaflet via the `route-map-loader` dynamic-import (`ssr:false`) pattern; `CATEGORIES` colours from `lib/categories.ts`; `ScheduleItemDialog`; `scheduleItem` action.

### Task 3.1: Pure nearby calculator

**Files:**
- Create: `lib/nearby.ts`
- Test: `lib/nearby.test.ts`

**Interfaces:**
- Produces: `NEARBY_RADIUS_KM`, `nearbyWishlistItems(input): NearbyResult[]`. Consumed by Task 3.4.

- [ ] **Step 1: Write the failing test**

```ts
// lib/nearby.test.ts
import { describe, it, expect } from "vitest";
import { nearbyWishlistItems, NEARBY_RADIUS_KM } from "./nearby";

const anchors = [{ lat: 41.9028, lng: 12.4964 }]; // Rome centre

describe("nearbyWishlistItems", () => {
  it("returns items within the radius, nearest first, with distance", () => {
    const res = nearbyWishlistItems({
      anchors,
      candidates: [
        { id: "near", title: "Close", category: "FOOD", lat: 41.9035, lng: 12.4970 },   // ~100m
        { id: "far", title: "Far", category: "FOOD", lat: 48.8566, lng: 2.3522 },        // Paris — far
        { id: "mid", title: "Mid", category: "FOOD", lat: 41.9100, lng: 12.5050 },       // ~1.1km
      ],
    });
    expect(res.map((r) => r.id)).toEqual(["near", "mid"]);
    expect(res[0].distanceKm).toBeLessThan(res[1].distanceKm);
    expect(res[0]).toMatchObject({ title: "Close", category: "FOOD" });
  });

  it("returns [] when there are no anchors", () => {
    expect(nearbyWishlistItems({ anchors: [], candidates: [{ id: "x", title: "x", category: "FOOD", lat: 41.9, lng: 12.5 }] })).toEqual([]);
  });

  it("respects a custom radius", () => {
    const res = nearbyWishlistItems({ anchors, candidates: [{ id: "mid", title: "Mid", category: "FOOD", lat: 41.9100, lng: 12.5050 }], radiusKm: 0.5 });
    expect(res).toEqual([]);
    expect(NEARBY_RADIUS_KM).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/nearby.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// lib/nearby.ts
import { haversineKm, type LatLng } from "@/lib/geo";

export const NEARBY_RADIUS_KM = 1.5;

export interface NearbyCandidate { id: string; title: string; category: string; lat: number; lng: number }
export interface NearbyResult { id: string; title: string; category: string; distanceKm: number }

/** Located wishlist candidates within `radiusKm` of ANY anchor point, nearest first. */
export function nearbyWishlistItems(input: {
  anchors: LatLng[];
  candidates: NearbyCandidate[];
  radiusKm?: number;
}): NearbyResult[] {
  const radius = input.radiusKm ?? NEARBY_RADIUS_KM;
  if (input.anchors.length === 0) return [];
  const out: NearbyResult[] = [];
  for (const c of input.candidates) {
    let best = Infinity;
    for (const a of input.anchors) {
      const d = haversineKm(a, { lat: c.lat, lng: c.lng });
      if (d < best) best = d;
    }
    if (best <= radius) out.push({ id: c.id, title: c.title, category: c.category, distanceKm: best });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/nearby.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/nearby.ts lib/nearby.test.ts
git commit -m "feat(wishlist): pure nearby-wishlist calculator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Wishlist map component (Leaflet)

**Files:**
- Create: `components/trip/wishlist-map.tsx`
- Create: `components/trip/wishlist-map-loader.tsx`

**Interfaces:**
- Produces: `WishlistMapLoader({ items, onSelect })` where `items: WishlistMapItem[]` (`{ id, title, category, lat, lng }`) and `onSelect(itemId: string): void`. Consumed by Task 3.3.

- [ ] **Step 1: Build the loader (mirror `route-map-loader.tsx`)**

```tsx
// components/trip/wishlist-map-loader.tsx
"use client";
import dynamic from "next/dynamic";
import type { WishlistMapProps } from "./wishlist-map";
const Inner = dynamic(() => import("./wishlist-map").then((m) => m.WishlistMap), { ssr: false });
export function WishlistMapLoader(props: WishlistMapProps) {
  return <Inner {...props} />;
}
```

- [ ] **Step 2: Build the map (mirror `day-map.tsx` init + `divIcon` markers)**

Create `wishlist-map.tsx` ("use client") that:
- imports leaflet dynamically (`let L = ...; import("leaflet").then(...)`), adds the same OSM tile layer + attribution as `day-map.tsx`,
- renders a `divIcon` per item coloured by category — map category → hex with this constant (from `lib/categories.ts` colour names):

```ts
const CATEGORY_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9", // sky
  FOOD: "#f59e0b",        // amber
  ACTIVITY: "#10b981",    // emerald
  NIGHTLIFE: "#8b5cf6",   // violet
  SHOPPING: "#f43f5e",    // rose
  OTHER: "#78716c",       // stone
};
const pinHex = (category: string) => CATEGORY_HEX[category] ?? CATEGORY_HEX.OTHER;
```

- fits bounds to the items, and on marker click calls `props.onSelect(item.id)` (a popup with the title + a "Schedule" button is also acceptable; the click→onSelect path is the contract the test relies on),
- exports `export interface WishlistMapProps { items: WishlistMapItem[]; onSelect: (id: string) => void }` and `export interface WishlistMapItem { id: string; title: string; category: string; lat: number; lng: number }`.

- [ ] **Step 3: Verify it typechecks/builds**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0 (the build confirms the dynamic import + leaflet types resolve; no jsdom test for the Leaflet inner, matching how `day-map.tsx` is left untested while `day-map-panel` is tested).

- [ ] **Step 4: Commit**

```bash
git add components/trip/wishlist-map.tsx components/trip/wishlist-map-loader.tsx
git commit -m "feat(wishlist): Leaflet wishlist map with category-coloured pins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: List ⇄ Map toggle on the Wishlist board

**Files:**
- Modify: `components/trip/wishlist-board.tsx`
- Test: `components/trip/wishlist-board.test.tsx` (add cases)

**Interfaces:**
- Consumes: `WishlistMapLoader` (Task 3.2). Mock it in tests the way `day-map-panel.test.tsx` mocks `./day-map`.

- [ ] **Step 1: Write the failing test** (append to `wishlist-board.test.tsx`)

```tsx
vi.mock("./wishlist-map-loader", () => ({ WishlistMapLoader: () => <div data-testid="wishlist-map" /> }));

it("defaults to List and reveals the map only when Map is chosen", async () => {
  const user = userEvent.setup();
  render(<WishlistBoard tripId="t1" stops={[]} items={[
    { id: "i1", title: "Colosseum", category: "SIGHTSEEING", lat: 41.89, lng: 12.49 },
    { id: "i2", title: "No location", category: "FOOD" },
  ]} />);
  expect(screen.queryByTestId("wishlist-map")).not.toBeInTheDocument();      // List by default
  await user.click(screen.getByRole("tab", { name: /map/i }));               // or button
  expect(screen.getByTestId("wishlist-map")).toBeInTheDocument();
  expect(screen.getByText(/1 not on the map/i)).toBeInTheDocument();         // unlocated count line
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/wishlist-board.test.tsx`
Expected: FAIL — no Map toggle.

- [ ] **Step 3: Add the toggle + map view**

In `WishlistBoard`:
- add `const [view, setView] = React.useState<"list" | "map">("list")` and a small toggle in the header (use `@radix-ui/react-toggle-group` — already a dep — with two items "List"/"Map", `aria-label="Wishlist view"`),
- when `view === "map"`: render `<WishlistMapLoader items={locatedItems} onSelect={setSchedulingItem-by-id} />` where `locatedItems = items.filter((i) => i.lat != null && i.lng != null)` mapped to `{ id, title, category, lat, lng }`; render the existing stop-filter as a chip row above the map (default "All"); below the map render one line `{unlocated} not on the map — add a location` when `unlocated > 0` (count of `items.length - locatedItems.length`),
- `onSelect(id)` → `setSchedulingItem(items.find((i) => i.id === id) ?? null)` so the existing `ScheduleItemDialog` opens,
- when `view === "list"`: the current grouped list (unchanged).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/trip/wishlist-board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx
git commit -m "feat(wishlist): List/Map toggle, map view defaults off (calm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3.4: Nearby-today section + wiring

**Files:**
- Create: `components/trip/nearby-wishlist.tsx`
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx`
- Modify: `components/trip/home/phase-travelling.tsx`

**Interfaces:**
- Consumes: `nearbyWishlistItems` (Task 3.1), `scheduleItem` (existing). `NearbyWishlist({ tripId, date, items }: { tripId: string; date: string; items: NearbyResult[] })`.

- [ ] **Step 1: Build the collapsed client component** + test

`NearbyWishlist` ("use client"): renders **nothing when `items.length === 0`**; otherwise a collapsible section (default collapsed, `aria-expanded`) titled `Nearby from your Wishlist ({items.length})`. Each row: title, `≈{Math.round(distanceKm * 1000)} m` (or `{distanceKm.toFixed(1)} km` when ≥1), an **"Add to today"** button calling `scheduleItem(id, { date })` then a toast, and the row links to the wishlist. Footer: a "See full wishlist" link to `/trips/${tripId}/wishlist`.

Add `components/trip/nearby-wishlist.test.tsx` mirroring `day-map-panel.test.tsx`: renders null for `[]`; renders the collapsed toggle + count for a non-empty list; expands on click.

- [ ] **Step 2: Compute + render on the Day view**

In the day page, after the existing parallel load, add a query for located unscheduled wishlist items:
```ts
db.item.findMany({ where: { tripId, date: null, lat: { not: null }, lng: { not: null } }, select: { id: true, title: true, category: true, lat: true, lng: true } })
```
Build anchors from the day's located scheduled items + tonight's accommodation coords, then:
```ts
const nearby = nearbyWishlistItems({ anchors, candidates: wishlistLocated.map((i) => ({ id: i.id, title: i.title, category: i.category, lat: i.lat!, lng: i.lng! })) });
```
Render `<NearbyWishlist tripId={tripId} date={effectiveDate} items={nearby} />` just below the `DayMapPanel`.

- [ ] **Step 3: Same on the travelling Home**

In `phase-travelling.tsx`, reuse the same query + computation for `effectiveDate` and render `<NearbyWishlist>` below the "Today's plan" section.

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run components/trip/nearby-wishlist.test.tsx && npx tsc --noEmit && npm run lint`
Expected: PASS + exit 0.

```bash
git add components/trip/nearby-wishlist.tsx components/trip/nearby-wishlist.test.tsx "app/(app)/trips/[tripId]/day/[date]/page.tsx" components/trip/home/phase-travelling.tsx
git commit -m "feat(wishlist): quiet 'Nearby from your Wishlist' on day view + travelling home

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

# Feature 4 — "Spend so far" + two new Flags

**Outcome:** A read-only "Spend so far" card (estimate-accuracy on *paid* costs) on the Budget page + travelling/past Home; plus two new actionable Flags — **missing connection** between consecutive scheduled Stops and **accommodation coverage gap** (a night uncovered at a Stop that has *some* accommodation). Over-estimate spending is shown in the card only — never a Flag. No schema change.

**Reuse:** `convertCostToHome` (exported from `lib/budget.ts`); `daysBetween`, `addDays`, `nightsBetween` (`lib/dates.ts`); the `detectFlags` array + threshold-constant pattern in `lib/flags.ts`.

### Task 4.1: Pure "Spend so far" calculator

**Files:**
- Create: `lib/spend-so-far.ts`
- Test: `lib/spend-so-far.test.ts`

**Interfaces:**
- Produces: `buildSpendSoFar(input): SpendSoFar` + the `SpendCost`/`SpendSoFar` types. Consumed by Tasks 4.2/4.3.

- [ ] **Step 1: Write the failing test**

```ts
// lib/spend-so-far.test.ts
import { describe, it, expect } from "vitest";
import { buildSpendSoFar, type SpendCost } from "./spend-so-far";

const cost = (o: Partial<SpendCost>): SpendCost => ({
  id: "c", estimatedMinor: 0, actualMinor: null, currency: "AUD", rateToHome: null,
  ownerType: "OTHER", ownerId: null, label: null, category: null, paidAt: null, ...o,
});

describe("buildSpendSoFar", () => {
  it("totals estimates, paid actuals, variance on paid items, and remaining", () => {
    const res = buildSpendSoFar({
      homeCurrency: "AUD",
      costs: [
        cost({ id: "a", estimatedMinor: 10000, actualMinor: 11000, paidAt: new Date("2026-08-02") }), // paid, $10 over by $10
        cost({ id: "b", estimatedMinor: 5000, actualMinor: 4000, paidAt: new Date("2026-08-03") }),   // paid, under by $10
        cost({ id: "c", estimatedMinor: 8000, actualMinor: null, paidAt: null }),                      // not paid
      ],
      tripStart: "2026-08-01", tripEnd: "2026-08-11", today: "2026-08-06",
    });
    expect(res.estimatedTotalMinor).toBe(23000);
    expect(res.paidSoFarMinor).toBe(15000);      // 11000 + 4000
    expect(res.paidEstimateMinor).toBe(15000);   // 10000 + 5000
    expect(res.varianceMinor).toBe(0);           // 15000 - 15000
    expect(res.estimatedRemainingMinor).toBe(8000); // 23000 - 15000
    expect(res.tripElapsedPct).toBe(50);         // day 5 of 10
  });

  it("excludes missing-rate foreign costs and handles no dates", () => {
    const res = buildSpendSoFar({
      homeCurrency: "AUD",
      costs: [cost({ estimatedMinor: 9999, currency: "JPY", rateToHome: null, paidAt: new Date() })],
      tripStart: null, tripEnd: null, today: "2026-08-06",
    });
    expect(res.estimatedTotalMinor).toBe(0);
    expect(res.paidSoFarMinor).toBe(0);
    expect(res.tripElapsedPct).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/spend-so-far.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// lib/spend-so-far.ts
import { convertCostToHome, type BudgetCost } from "@/lib/budget";
import { daysBetween } from "@/lib/dates";

export interface SpendCost extends BudgetCost {
  /** When the cost was paid; null = not yet paid (excluded from "paid so far"). */
  paidAt: Date | string | null;
}

export interface SpendSoFar {
  estimatedTotalMinor: number;
  paidSoFarMinor: number;
  paidEstimateMinor: number;
  /** paidSoFar − paidEstimate; > 0 = over your estimates on what you've paid. */
  varianceMinor: number;
  estimatedRemainingMinor: number;
  /** 0–100, or null when the trip has no/invalid dates. */
  tripElapsedPct: number | null;
}

export function buildSpendSoFar(input: {
  costs: SpendCost[];
  homeCurrency: string;
  tripStart?: string | null;
  tripEnd?: string | null;
  today: string;
}): SpendSoFar {
  let estimatedTotal = 0, paidSoFar = 0, paidEstimate = 0;
  for (const c of input.costs) {
    const { estimatedHome, actualHome } = convertCostToHome(c, input.homeCurrency);
    if (estimatedHome === null) continue; // missing rate — excluded everywhere
    estimatedTotal += estimatedHome;
    if (c.paidAt != null) {
      paidSoFar += actualHome ?? 0;
      paidEstimate += estimatedHome;
    }
  }

  let tripElapsedPct: number | null = null;
  if (input.tripStart && input.tripEnd) {
    const total = daysBetween(input.tripStart, input.tripEnd);
    if (total > 0) {
      const elapsed = Math.min(Math.max(daysBetween(input.tripStart, input.today), 0), total);
      tripElapsedPct = Math.round((elapsed / total) * 100);
    } else {
      tripElapsedPct = input.today >= input.tripStart ? 100 : 0;
    }
  }

  return {
    estimatedTotalMinor: estimatedTotal,
    paidSoFarMinor: paidSoFar,
    paidEstimateMinor: paidEstimate,
    varianceMinor: paidSoFar - paidEstimate,
    estimatedRemainingMinor: estimatedTotal - paidEstimate,
    tripElapsedPct,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/spend-so-far.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/spend-so-far.ts lib/spend-so-far.test.ts
git commit -m "feat(budget): pure 'Spend so far' calculator (estimate-accuracy on paid)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: "Spend so far" card on the Budget page

**Files:**
- Create: `components/trip/spend-so-far-card.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx`

**Interfaces:**
- Consumes: `buildSpendSoFar` (Task 4.1); `formatMoney` from `lib/money`. `SpendSoFarCard({ spend, homeCurrency, compact? }: { spend: SpendSoFar; homeCurrency: string; compact?: boolean })`.

- [ ] **Step 1: Build the card**

`SpendSoFarCard` renders a read-only card titled **"Spend so far"** with: Estimated total, **Paid so far** (with a variance chip — `{formatMoney(Math.abs(variance))} over/under` using the existing `TrendingUp`/`TrendingDown` green/rose treatment from the budget hero), Est. remaining, and a muted footer line `≈{tripElapsedPct}% of the trip elapsed` when `tripElapsedPct != null`. Render nothing when `estimatedTotalMinor === 0 && paidSoFarMinor === 0`. A `compact` variant renders just the one line `Paid {paid} of {est} est.{ variance ? ` · {abs} over/under` : "" }` for the Home phases.

- [ ] **Step 2: Slot it into the Budget page**

In `budget/page.tsx`: build `SpendCost[]` from the already-loaded `allCosts` (they include `paidAt` via `COST_SELECT`), compute `const spend = buildSpendSoFar({ costs, homeCurrency, tripStart: trip.startDate, tripEnd: trip.endDate, today: todayISO() })`, and render `<SpendSoFarCard spend={spend} homeCurrency={homeCurrency} />` **directly below the Grand-total hero Card**.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

```bash
git add components/trip/spend-so-far-card.tsx "app/(app)/trips/[tripId]/budget/page.tsx"
git commit -m "feat(budget): Spend so far card on the Budget page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: Spend-so-far line on travelling + past Home

**Files:**
- Modify: `components/trip/home/phase-travelling.tsx`
- Modify: `components/trip/home/phase-past.tsx`

**Interfaces:**
- Consumes: `buildSpendSoFar` (4.1), `SpendSoFarCard` compact variant (4.2).

- [ ] **Step 1: Travelling Home**

Load the trip's costs (`db.cost.findMany({ where: { tripId }, select: { ...estimatedMinor, actualMinor, currency, rateToHome, paidAt, ownerType, ownerId, label, category } })`) plus `homeCurrency`, compute `buildSpendSoFar`, and render `<SpendSoFarCard compact spend={spend} homeCurrency={homeCurrency} />` as a small glance line after the "Where you are" section.

- [ ] **Step 2: Past Home**

`phase-past.tsx` already loads budget totals; load costs the same way, compute `buildSpendSoFar` (today = trip end so `tripElapsedPct` reads 100), and render the **full** `<SpendSoFarCard>` below the "That's a wrap" summary as the spend retro.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

```bash
git add components/trip/home/phase-travelling.tsx components/trip/home/phase-past.tsx
git commit -m "feat(budget): Spend so far on travelling + past Home

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.4: Flag — missing connection between consecutive stops

**Files:**
- Modify: `lib/flags.ts` (add `flagMissingConnections`; call it in `detectFlags`)
- Test: `lib/flags.test.ts` (add cases)

**Interfaces:**
- Produces: `flagMissingConnections(stops: FlagStop[], transports: FlagTransport[]): Flag[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { flagMissingConnections } from "./flags";

describe("flagMissingConnections", () => {
  it("flags consecutive scheduled stops with no transport between them", () => {
    const flags = flagMissingConnections([LONDON, PARIS], []); // LONDON sortOrder 0, PARIS 1
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ severity: "info", targetType: "TRANSPORT" });
    expect(flags[0].message).toMatch(/London.*Paris|Paris.*London/);
  });
  it("does not flag when a transport links them (either direction)", () => {
    const t = makeTransport({ id: "t1", fromStopId: "london", toStopId: "paris" });
    expect(flagMissingConnections([LONDON, PARIS], [t])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/flags.test.ts -t "flagMissingConnections"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement + wire**

```ts
export function flagMissingConnections(stops: FlagStop[], transports: FlagTransport[]): Flag[] {
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const linked = new Set<string>();
  for (const t of transports) {
    if (t.fromStopId && t.toStopId) linked.add(`${t.fromStopId}|${t.toStopId}`);
  }
  const flags: Flag[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (linked.has(`${a.id}|${b.id}`) || linked.has(`${b.id}|${a.id}`)) continue;
    flags.push({
      id: `missing-connection-${a.id}-${b.id}`,
      severity: "info",
      message: `No transport booked between ${a.name} and ${b.name}.`,
      targetType: "TRANSPORT",
    });
  }
  return flags;
}
```

Add `...flagMissingConnections(stops, transports),` to the `detectFlags` return array.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS (existing flag tests unaffected — `detectFlags` count assertions, if any, updated to include the new flag).

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/flags.ts lib/flags.test.ts
git commit -m "feat(flags): missing-connection flag between consecutive stops

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 4.5: Flag — accommodation coverage gap

**Files:**
- Modify: `lib/flags.ts` (add `flagAccommodationCoverageGaps`; call it in `detectFlags`)
- Test: `lib/flags.test.ts` (add cases)

**Interfaces:**
- Produces: `flagAccommodationCoverageGaps(stops: FlagStop[], accommodations: FlagAccommodation[]): Flag[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { flagAccommodationCoverageGaps } from "./flags";

describe("flagAccommodationCoverageGaps", () => {
  const stop = { ...LONDON, arriveDate: "2026-07-01", departDate: "2026-07-05" }; // 4 nights: 1,2,3,4
  it("flags nights not covered when the stop HAS some accommodation", () => {
    const accom = makeAccom({ id: "h1", stopId: "london", checkIn: "2026-07-01", checkOut: "2026-07-04" }); // covers nights 1-3
    const flags = flagAccommodationCoverageGaps([stop], [accom]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ severity: "warning", targetType: "STOP", targetId: "london" });
    expect(flags[0].message).toMatch(/1 night/);
  });
  it("does not flag full coverage", () => {
    const accom = makeAccom({ id: "h1", stopId: "london", checkIn: "2026-07-01", checkOut: "2026-07-05" });
    expect(flagAccommodationCoverageGaps([stop], [accom])).toHaveLength(0);
  });
  it("ignores stops with zero accommodation (handled by flagStopsWithoutAccommodation)", () => {
    expect(flagAccommodationCoverageGaps([stop], [])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/flags.test.ts -t "flagAccommodationCoverageGaps"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement + wire**

```ts
export function flagAccommodationCoverageGaps(stops: FlagStop[], accommodations: FlagAccommodation[]): Flag[] {
  const byStop = new Map<string, FlagAccommodation[]>();
  for (const a of accommodations) {
    const arr = byStop.get(a.stopId) ?? [];
    arr.push(a);
    byStop.set(a.stopId, arr);
  }
  const flags: Flag[] = [];
  for (const stop of stops) {
    const nights = nightsBetween(stop.arriveDate, stop.departDate);
    if (nights < 1) continue;
    const accoms = byStop.get(stop.id) ?? [];
    if (accoms.length === 0) continue; // zero-accommodation handled elsewhere
    let uncovered = 0;
    for (let d = 0; d < nights; d++) {
      const night = addDays(stop.arriveDate, d);
      const covered = accoms.some((a) => a.checkIn <= night && night < a.checkOut);
      if (!covered) uncovered++;
    }
    if (uncovered > 0) {
      flags.push({
        id: `accom-gap-${stop.id}`,
        severity: "warning",
        message: `${stop.name} has ${uncovered} night${uncovered === 1 ? "" : "s"} without accommodation booked.`,
        targetType: "STOP",
        targetId: stop.id,
      });
    }
  }
  return flags;
}
```

Ensure `addDays` is imported from `@/lib/dates` at the top of `flags.ts` (add to the existing import if not present). Add `...flagAccommodationCoverageGaps(stops, accommodations),` to `detectFlags`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add lib/flags.ts lib/flags.test.ts
git commit -m "feat(flags): accommodation coverage-gap flag (uncovered nights)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# Feature 5 — Command palette (⌘K)

**Outcome:** A ⌘K/Ctrl+K palette (plus a header search affordance) with three groups — **Go to** (trip pages + switch trip), **Find** (server-backed search of this trip's Stops/Items/Transport/Accommodation), **Do** (New trip, Add item, Add stop, Toggle theme, Toggle Discreet). Built on the existing Radix Dialog (no `cmdk`). Disabled entirely in Discreet mode. "Find" degrades to "search needs a connection" when offline. No schema change.

**Reuse:** `components/ui/dialog.tsx` (Radix); `useTheme().toggleTheme` (`components/ui/theme-provider`); `getDiscreetState()` (`lib/discreet-server`); `requireUser`/`requireTripAccess` (`lib/guards`).

### Task 5.1: Search server actions

**Files:**
- Create: `server/actions/search.ts`
- Test: `server/actions/search.test.ts`

**Interfaces:**
- Produces: `searchTrip(tripId: string, query: string): Promise<SearchHit[]>` and `listMyTrips(): Promise<Array<{ id: string; name: string }>>`. `SearchHit = { type: "stop"|"item"|"transport"|"accommodation"; id: string; label: string; sublabel?: string; href: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/actions/search.test.ts — mock @/lib/db + @/lib/guards per the hoisted pattern.
describe("searchTrip", () => {
  it("returns labelled, href'd hits across entity types for a non-empty query", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: { role: "owner" } });
    stopFindManyMock.mockResolvedValue([{ id: "s1", name: "Rome" }]);
    itemFindManyMock.mockResolvedValue([{ id: "i1", title: "Colosseum", date: "2026-08-02", stopId: "s1" }]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    const hits = await searchTrip("t1", "co");
    expect(hits).toContainEqual({ type: "stop", id: "s1", label: "Rome", href: "/trips/t1/plan" });
    expect(hits).toContainEqual(expect.objectContaining({ type: "item", id: "i1", label: "Colosseum", href: "/trips/t1/day/2026-08-02" }));
  });
  it("returns [] for a blank query without hitting the db", async () => {
    expect(await searchTrip("t1", "  ")).toEqual([]);
    expect(stopFindManyMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/search.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// server/actions/search.ts
"use server";
import { db } from "@/lib/db";
import { requireTripAccess, requireUser } from "@/lib/guards";

export interface SearchHit {
  type: "stop" | "item" | "transport" | "accommodation";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

const TAKE = 5;

export async function searchTrip(tripId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  await requireTripAccess(tripId);
  const base = `/trips/${tripId}`;
  const ci = { contains: q, mode: "insensitive" as const };

  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({ where: { tripId, name: ci }, take: TAKE, select: { id: true, name: true } }),
    db.item.findMany({ where: { tripId, title: ci }, take: TAKE, select: { id: true, title: true, date: true, stopId: true } }),
    db.transport.findMany({ where: { tripId, OR: [{ depPlace: ci }, { arrPlace: ci }, { reference: ci }] }, take: TAKE, select: { id: true, depPlace: true, arrPlace: true } }),
    db.accommodation.findMany({ where: { tripId, name: ci }, take: TAKE, select: { id: true, name: true } }),
  ]);

  return [
    ...stops.map((s): SearchHit => ({ type: "stop", id: s.id, label: s.name, href: `${base}/plan` })),
    ...items.map((i): SearchHit => ({ type: "item", id: i.id, label: i.title, href: i.date ? `${base}/day/${i.date}` : `${base}/wishlist` })),
    ...transports.map((t): SearchHit => ({ type: "transport", id: t.id, label: [t.depPlace, t.arrPlace].filter(Boolean).join(" → ") || "Transport", href: `${base}/plan` })),
    ...accommodations.map((a): SearchHit => ({ type: "accommodation", id: a.id, label: a.name, href: `${base}/plan` })),
  ];
}

export async function listMyTrips(): Promise<Array<{ id: string; name: string }>> {
  const user = await requireUser();
  const memberships = await db.tripMember.findMany({
    where: { userId: user.id },
    select: { trip: { select: { id: true, name: true } } },
    orderBy: { trip: { createdAt: "desc" } },
  });
  return memberships.map((m) => m.trip);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/actions/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add server/actions/search.ts server/actions/search.test.ts
git commit -m "feat(palette): trip search + my-trips server actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5.2: Command-palette component

**Files:**
- Create: `components/command-palette.tsx`
- Test: `components/command-palette.test.tsx`

**Interfaces:**
- Consumes: `searchTrip`, `listMyTrips` (5.1); `Dialog`/`DialogContent` (`@/components/ui/dialog`); `useTheme` (`@/components/ui/theme-provider`); `useRouter`, `usePathname` (`next/navigation`).
- Produces: `CommandPalette({ open, onOpenChange, tripId }: { open: boolean; onOpenChange: (o: boolean) => void; tripId: string | null })`.

- [ ] **Step 1: Build the component**

A `"use client"` component that renders a `Dialog` (`hideClose`) containing a text `Input` (autofocus) and three grouped, filtered button lists. Behaviour:
- **Go to** (only when `tripId`): static array of `{ label, href }` for the trip's pages (`Home /trips/:id`, `Plan`, `Calendar`, `Today`, `Wishlist`, `Budget`, `Summary`, `Checklists`, `Files`, `Journal`, `Activity`, `Settings`), filtered by the typed query (case-insensitive `includes`). Activating one → `router.push(href)` then `onOpenChange(false)`.
- **Switch trip:** load `listMyTrips()` once on open; show matches under "Go to".
- **Do:** `New trip` → `/trips/new`; `Add item`/`Add stop` → navigate to `…/wishlist`/`…/plan` (where the add affordance lives); `Toggle theme` → `toggleTheme()`; `Toggle Discreet` → flip the `teepee-discreet` cookie + `router.refresh()`. Filter by query.
- **Find:** when `tripId` and `query.trim()` non-empty and `navigator.onLine`, debounce ~150 ms then `const hits = await searchTrip(tripId, query)` into state; render hits with an icon per `hit.type`, activating → `router.push(hit.href)`. When `!navigator.onLine`, render a muted row "Search needs a connection." Guard against out-of-order responses (ignore stale query results).
- Arrow Up/Down move focus across the rendered command buttons; Enter activates the focused one; Escape closes (Radix handles it).

- [ ] **Step 2: Write the test**

`components/command-palette.test.tsx` (mock `@/server/actions/search`, `next/navigation`'s `useRouter`/`usePathname`, and wrap in `ThemeProvider`):
- renders "Go to" entries when `open` + `tripId` set; typing "bud" filters to Budget.
- a static "Toggle theme" command is present and clicking it calls the mocked `toggleTheme` (assert via spying on the theme context or that the dialog closes).
- typing a query calls `searchTrip` (mocked) and renders the returned hit's label.

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run components/command-palette.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit && npm run lint
git add components/command-palette.tsx components/command-palette.test.tsx
git commit -m "feat(palette): command palette (Go to / Find / Do) on Radix Dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5.3: Mount + ⌘K listener + header affordance + Discreet disable

**Files:**
- Create: `components/command-palette-mount.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `CommandPalette` (5.2). `CommandPaletteMount({ disabled }: { disabled: boolean })` — derives `tripId` from `usePathname()`; owns `open` state.

- [ ] **Step 1: Build the mount**

`"use client"` `CommandPaletteMount`: returns `null` when `disabled`. Otherwise:
- derive `tripId` from the path (`/trips/<id>/…`),
- on mount add a `window` keydown listener: `if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }`,
- also listen for a custom event `window.addEventListener("teepee:open-palette", () => setOpen(true))`,
- render `<CommandPalette open={open} onOpenChange={setOpen} tripId={tripId} />`.

- [ ] **Step 2: Header search affordance**

In `app/(app)/layout.tsx` header controls (the `flex items-center gap-1` cluster, left of `ThemeToggle`), add a ghost icon `Button` (`Search` icon, `aria-label="Search (⌘K)"`) — a `"use client"` tiny button that dispatches `window.dispatchEvent(new Event("teepee:open-palette"))`. (Create `components/command-palette-trigger.tsx` for this client button.)

- [ ] **Step 3: Mount with Discreet gating**

In `app/(app)/layout.tsx` (server component), `const { discreet } = await getDiscreetState();` and render `<CommandPaletteMount disabled={discreet} />` near the existing global components, and conditionally render the header trigger only when `!discreet`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0 (build confirms client/server boundary is correct).

```bash
git add components/command-palette-mount.tsx components/command-palette-trigger.tsx "app/(app)/layout.tsx"
git commit -m "feat(palette): mount with ⌘K + header trigger, disabled in Discreet mode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# Feature 6 — Hardening sweep (a11y + perf)

**Outcome:** Fix the **concrete issues the audit found** on the named surfaces — 3 missing page `<h1>`s, an attachment-button a11y defect, a notes-label mismatch, reduced-motion gating, and a Day-page over-fetch. Confirmed-compliant areas (dialog focus, dnd keyboard sensor, focus-visible rings, Leaflet/motion code-splitting, page query batching) need **no change**. Out-of-scope/bigger findings are **logged**, not chased. No schema change.

### Task 6.1: Accessibility fixes

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx`, `app/(app)/trips/[tripId]/summary/page.tsx`, `app/(app)/trips/[tripId]/wishlist/page.tsx`
- Modify: `components/trip/attachment-list.tsx`, `components/trip/note-thread.tsx`

- [ ] **Step 1: Add page-level headings**

Add a visually-appropriate `<h1>` at the top of the Budget ("Budget"), Summary ("Trip summary"), and Wishlist ("Wishlist") page returns. For Wishlist, the `WishlistBoard` already renders an `<h2>"Wishlist"` — promote the page to carry the `<h1>` (e.g. a visually-hidden `<h1 className="sr-only">Wishlist</h1>` on the page wrapper to avoid a duplicate visible title), matching how other pages title themselves.

- [ ] **Step 2: Fix the attachment view button**

In `attachment-list.tsx`, remove the nested `sr-only` span + `asChild={false}` anti-pattern: make the link itself the labelled control (`aria-label={`View ${att.filename}`}`) wrapping a single icon, so the accessibility tree has one labelled actionable element, not a labelled link around a separately-labelled button.

- [ ] **Step 3: Fix the notes trigger label**

In `note-thread.tsx`, align `title` and `aria-label` on the popover trigger: `aria-label={notes.length === 0 ? "Notes" : \`Notes (${notes.length})\`}` and matching `title`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run components/trip/note-thread.test.tsx components/trip/attachment-list.test.tsx`
Expected: exit 0 / PASS (update those tests' label assertions if they pin the old strings).

```bash
git add "app/(app)/trips/[tripId]/budget/page.tsx" "app/(app)/trips/[tripId]/summary/page.tsx" "app/(app)/trips/[tripId]/wishlist/page.tsx" components/trip/attachment-list.tsx components/trip/note-thread.tsx
git commit -m "fix(a11y): page headings + attachment button + notes label

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6.2: Gate animations on reduced-motion

**Files:**
- Modify: `components/trip/calendar-views.tsx`, `components/trip/checklist.tsx`, `components/trip/vote-control.tsx`

**Interfaces:**
- Uses `useReducedMotion` from `motion/react` (already installed).

- [ ] **Step 1: Gate each component's motion**

In each file, call `const reduce = useReducedMotion();` and when `reduce` is true, disable the animation (e.g. pass `initial={false}` and/or zero-duration `transition={{ duration: 0 }}`, or render the static element). This honours `prefers-reduced-motion` at the JS level for these `motion/react` usages (the CSS `@media (prefers-reduced-motion)` block already covers the keyframe-based animations elsewhere).

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0.

```bash
git add components/trip/calendar-views.tsx components/trip/checklist.tsx components/trip/vote-control.tsx
git commit -m "fix(a11y): honour prefers-reduced-motion in motion/react components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6.3: Day-page accommodation query — filter at the database

**Files:**
- Modify: `app/(app)/trips/[tripId]/day/[date]/page.tsx`

- [ ] **Step 1: Push the date filter into Prisma**

Change the accommodations query from `where: { tripId }` (fetch-all-then-filter) to fetch only those covering the day:

```ts
db.accommodation.findMany({
  where: { tripId, checkIn: { lte: effectiveDate }, checkOut: { gt: effectiveDate } },
  orderBy: { checkIn: "asc" },
  select: { /* unchanged */ },
}),
```

(`effectiveDate` is already computed before this load — move the load below it if needed.) Confirm the day map + "tonight's stay" still receive the covering accommodation. **Leave the transport query unchanged** — its per-day placement is zone-computed in `buildItinerary` and needs the full list; filtering it at the DB would risk dropping zone-edge legs (recorded as a deliberate non-change).

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: exit 0.

```bash
git add "app/(app)/trips/[tripId]/day/[date]/page.tsx"
git commit -m "perf(day): fetch only the accommodation covering the day

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6.4: Log the deferred follow-up

**Files:**
- Modify: `docs/superpowers/plans/2026-06-30-planning-money-qol-batch.md` (the "Logged follow-ups" section below)

- [ ] **Step 1: Record, don't chase**

The audit flagged that `itinerary-manager.tsx`'s optimistic drag state has no explicit rollback when a `reorder*` mutation fails (a low-severity UX edge, not a perf bug, and a meaningful refactor). Per the sweep's boundary, it is **logged** under "Logged follow-ups" below, not implemented in this batch. Confirm the entry is present; no code change.

```bash
git add docs/superpowers/plans/2026-06-30-planning-money-qol-batch.md
git commit -m "docs(hardening): log itinerary-manager optimistic-rollback follow-up

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Logged follow-ups (out of this batch's scope)

- **Optimistic drag rollback (`itinerary-manager.tsx`):** failed `reorderStops`/`reorderChecklistItem` mutations don't explicitly roll back local optimistic state; a new drag before the error surfaces can desync until the next server render. A `useTransition` + rollback refactor; deferred (low severity, not a perf issue).
- **Cross-zone tz inference for stop-less transport (F2):** transport to/from home with no linked Stop falls back to a `UTC` label. Real coordinate→timezone inference is out of scope (we only have country→tz).
- **Offline edit feedback (ADR-0016):** the per-action "can't edit offline" toast remains deferred (dropped from this batch by request).

---

## Self-Review

**Spec coverage** (every spec item maps to a task):
- F1 Duplicate: builder (1.1), action incl. member-copy + transport-stripped + costs-dropped (1.2), Settings entry + dialog (1.3), card menu + discreet row (1.4). ✓
- F2 tz display: helper (2.1), transport card + cross-zone marker (2.2), day/print headers (2.3), travelling next-departure (2.4); ICS explicitly untouched. ✓
- F3 map + nearby: nearby calc (3.1), Leaflet map (3.2), List/Map toggle + stop filter + unlocated line (3.3), quiet nearby section + wiring + "see full wishlist" (3.4). ✓
- F4 Spend so far + flags: calculator (4.1), budget card (4.2), home lines (4.3), missing-connection flag (4.4), coverage-gap flag (4.5); overspend card-only (no flag). ✓
- F5 palette: search actions (5.1), component with Go-to/Find/Do (5.2), ⌘K mount + header trigger + Discreet-disable + offline degrade (5.3). ✓
- F6 hardening: a11y fixes (6.1), reduced-motion (6.2), day-page perf (6.3), logged follow-ups (6.4). ✓

**Placeholder scan:** pure-logic/action/flag tasks carry complete code + tests; UI tasks name exact files, props, and the key code, and reference the existing component to mirror. No "TBD"/"handle edge cases".

**Type consistency:** `buildDuplicatePlan`→`duplicateTrip`; `transportTimeDisplay`/`zoneLabel`/`shortDate`/`dayDeltaSuffix` shared across 2.x; `nearbyWishlistItems`→`NearbyWishlist`; `buildSpendSoFar`/`SpendCost`→`SpendSoFarCard`; `searchTrip`/`SearchHit`→`CommandPalette`→`CommandPaletteMount`. Names align across tasks.

**Constraints honoured:** no schema migration; no new deps (Radix/Leaflet/motion reused); calm-by-default (List default, nearby collapsed/only-when-present, palette opt-in); free services only; terminology per glossary.

---

## Execution Handoff

Per the project's `CLAUDE.md`, this plan is executed with **superpowers:subagent-driven-development** — one fresh subagent per task, each followed by a spec-compliance review then a code-quality review, then a final whole-branch review — run end-to-end on `feat/trip-batch-planning-money-qol` without per-task check-ins. No merge/deploy without explicit human say-so.
