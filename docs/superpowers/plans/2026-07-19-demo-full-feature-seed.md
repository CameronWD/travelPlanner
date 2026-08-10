# Full-Feature Demo Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "AI TRIP - EU Christmas" demo seed with a 5-trip demo suite (plus a shared Globe) that exercises every non-derived model and all five Trip phases.

**Architecture:** All demo *data* is produced by **pure, framework-free builder functions** in `lib/demo/` (deterministic given a `today` string), unit-tested against the real domain engines (`detectFlags`, `computeProjectedEnd`, `computeTripPhase`). A thin **persister** in `prisma/demo/persist.ts` maps the framework-free graph to Prisma writes, resolving cross-references by stable string **keys**. `prisma/seed-demo.ts` orchestrates: `buildDemo(todayISO())` → wipe → persist globe → persist each trip.

**Tech Stack:** TypeScript (strict), Next.js, Prisma 7 (Postgres via driver adapter), Vitest (jsdom, Prisma mocked), Node built-ins (`zlib`, `crypto`) for cover-image generation.

## Global Constraints

- **No Prisma `enum`; no Prisma `Json`** — EXCEPT `Activity.changes` which IS `Json?` in the schema (pass a real JS value there). All other "enum-ish" columns are `String` validated by the Zod unions in `lib/enums.ts` / `lib/categories.ts` / `lib/chapter-colours.ts` / `lib/activity.ts`. JSON-ish columns other than `Activity.changes` are `String` of JSON (e.g. `PackingTemplate.itemsJson = JSON.stringify(...)`).
- **Money** = `Int` minor units. **Calendar dates** = `String` `"YYYY-MM-DD"`. **Instants** (`depAt`, `arrAt`, `fireAt`, `paidAt`, `fetchedAt`) = `DateTime`. **Lat/lng** = `Float?`.
- **Enum values must match the source vocabularies exactly:** transport modes `FLIGHT|TRAIN|BUS|CAR|FERRY|OTHER`; categories `SIGHTSEEING|FOOD|ACTIVITY|NIGHTLIFE|SHOPPING|OTHER`; vote levels `MUST|KEEN|MEH`; checklist kinds `PRETRIP|PACKING`; member/invite roles `owner|member`; note/attachment target types `TRIP|STOP|ITEM|TRANSPORT|ACCOMMODATION|JOURNAL|MARKER`; cost owner types `TRANSPORT|ACCOMMODATION|ITEM|OTHER`; chapter colours `sky|amber|emerald|violet|rose|teal|orange|indigo`; activity verbs `CREATED|UPDATED|DELETED|NOTED|PROMOTED`; activity entity types `STOP|ITEM|TRANSPORT|ACCOMMODATION|CHAPTER|COST|NOTE|FORK|ATTACHMENT`.
- **`countryCode`** is lowercase ISO-3166-1 alpha-2. **United Kingdom → `"gb"`** (not "uk"). Finland `fi`, Germany `de`, Ireland `ie`, France `fr`, Italy `it`, Switzerland `ch`, Japan `jp`, Peru `pe`, Morocco `ma`, Iceland `is`, Australia `au`.
- **Scheduled stops** carry an IANA `timezone`, `arriveDate`, `departDate`. **Rough stops** have `nights` and leave `timezone`/`arriveDate`/`departDate` **null** (they may still carry `lat`/`lng`/`countryCode`).
- Seed must be **idempotent** (delete-then-recreate by a fixed set of demo trip names + globe-by-owner-email).
- Path alias `@/` → repo root. Tests are colocated `*.test.ts`, run with `npm test` (vitest). Builder tests are **pure** — they never touch Prisma.
- Work stays on branch `feat/demo-full-feature-seed`. Do not touch `main`. Do not deploy.

---

## File Structure

```
lib/demo/
  types.ts          Framework-free graph types + engine adapters (toFlagStop, planFlagInput, toProjectionStop, ...)
  cover-image.ts    gradientPng(topHex, bottomHex, w?, h?): Buffer  — pure PNG encoder
  phase-dates.ts    phaseDates(today): PhaseDates  — date ranges per phase
  globe.ts          buildGlobe(): DemoGlobe
  eu-trip.ts        buildEuTrip(): DemoTrip        — enriched flagship (incl. 2 forks)
  alpine-trip.ts    buildAlpineTrip(): DemoTrip    — rough road-trip, overruns hard-end
  phase-trips.ts    buildSketchTrip/buildFinalPrepTrip/buildTravellingTrip/buildPastTrip(today)
  index.ts          buildDemo(today): DemoDataset  — composes all + validates cross-links
  *.test.ts         colocated unit tests
prisma/demo/
  persist.ts        wipeDemo(), persistGlobe(g), persistTrip(t) + storage/attachment/cover helpers
prisma/
  seed-demo.ts      (git mv from seed-ai-trip.ts) exports seedDemo(); orchestrates buildDemo → wipe → persist
  seed.ts           (modified) import { seedDemo } and call it instead of seedAiTrip
package.json        (modified) db:seed:demo -> tsx prisma/seed-demo.ts
```

**Data provenance:** The existing rich EU data currently lives as the `STOPS`, `OTHER_COSTS`, notes, checklists, packing-template, reminders, journal and attachments literals inside `prisma/seed-ai-trip.ts`. Task 5 **lifts** that data into `buildEuTrip()` (adapting to the `DemoTrip` shape) and layers the enrichments on top — it is not re-invented.

---

### Task 1: Demo graph types + engine adapters

**Files:**
- Create: `lib/demo/types.ts`
- Test: `lib/demo/types.test.ts`

**Interfaces:**
- Produces: all `Demo*` types (`DemoDataset`, `DemoGlobe`, `DemoMarker`, `DemoTrip`, `DemoFork`, `DemoPlan`, `DemoStop`, `DemoChapter`, `DemoTransport`, `DemoAccommodation`, `DemoItem`, `DemoCost`, `DemoVote`, `DemoNote`, `DemoChecklistItem`, `DemoReminder`, `DemoJournalEntry`, `DemoAttachment`, `DemoActivity`, `DemoInvite`), and adapters `toFlagStop`, `toFlagTransport`, `toFlagItem`, `toFlagAccommodation`, `toProjectionStop`, `planFlagInput(plan, opts)`.
- Consumes: `FlagStop`, `FlagTransport`, `FlagItem`, `FlagAccommodation`, `DetectFlagsInput` from `@/lib/flags`; `ProjectionStop` from `@/lib/firm-up`; `HomeBase` from `@/lib/home-base`.

- [ ] **Step 1: Write the failing test** — `lib/demo/types.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  toFlagStop,
  toProjectionStop,
  planFlagInput,
  type DemoStop,
  type DemoPlan,
} from "./types";

const scheduled: DemoStop = {
  key: "s1", name: "Paris", country: "France", countryCode: "fr",
  lat: 48.85, lng: 2.35, timezone: "Europe/Paris",
  arriveDate: "2026-12-29", departDate: "2027-01-03", sortOrder: 0,
};
const rough: DemoStop = { key: "s2", name: "Lucerne", countryCode: "ch", nights: 3, sortOrder: 1 };

describe("demo adapters", () => {
  it("maps a scheduled stop to a FlagStop", () => {
    expect(toFlagStop(scheduled)).toMatchObject({ id: "s1", arriveDate: "2026-12-29", timezone: "Europe/Paris" });
  });
  it("excludes rough stops from FlagStop (returns null)", () => {
    expect(toFlagStop(rough)).toBeNull();
  });
  it("maps any stop to a ProjectionStop (rough included)", () => {
    expect(toProjectionStop(rough)).toEqual({ id: "s2", arriveDate: null, departDate: null, nights: 3, pinned: false, sortOrder: 1 });
  });
  it("planFlagInput assembles a DetectFlagsInput with only scheduled stops", () => {
    const plan: DemoPlan = { stops: [scheduled, rough], chapters: [], transports: [], accommodations: [], items: [], costs: [] };
    const input = planFlagInput(plan, { tripStart: "2026-12-29", tripEnd: "2027-01-03" });
    expect(input.stops).toHaveLength(1);
    expect(input.stops[0].id).toBe("s1");
    expect(input.roughStopCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/types.test.ts` — Expected: FAIL ("Cannot find module './types'").

- [ ] **Step 3: Write the implementation** — `lib/demo/types.ts`

Define every `Demo*` type per the field lists below (all optional fields default to null/absent at persist time). Then the adapters.

```ts
import type { FlagStop, FlagTransport, FlagItem, FlagAccommodation, DetectFlagsInput } from "@/lib/flags";
import type { ProjectionStop } from "@/lib/firm-up";
import type { HomeBase } from "@/lib/home-base";

export type Key = string;                 // stable cross-ref key, e.g. "eu:stop:paris"
export type Who = "you" | "partner";

export interface DemoVote { user: Who; level: "MUST" | "KEEN" | "MEH"; }
export interface DemoInlineCost { estimatedMinor: number; actualMinor?: number | null; currency: string; paid?: boolean; category?: string | null; }
export interface DemoCost extends DemoInlineCost { ownerType: "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "OTHER"; ownerKey?: Key | null; label?: string | null; }

export interface DemoStop {
  key: Key; name: string; country?: string | null; countryCode?: string | null;
  lat?: number | null; lng?: number | null; timezone?: string | null;
  arriveDate?: string | null; departDate?: string | null; nights?: number | null;
  pinned?: boolean; chapterKey?: Key | null; chapterSortOrder?: number; notes?: string | null; sortOrder: number;
}
export interface DemoChapter { key: Key; name: string; colour: string; startDate?: string | null; endDate?: string | null; sortOrder: number; }
export interface DemoTransport {
  key: Key; mode: "FLIGHT" | "TRAIN" | "BUS" | "CAR" | "FERRY" | "OTHER";
  fromStopKey?: Key | null; toStopKey?: Key | null; depIsHome?: boolean; arrIsHome?: boolean;
  depPlace?: string | null; arrPlace?: string | null; depAt?: string | null; arrAt?: string | null;
  depLat?: number | null; depLng?: number | null; arrLat?: number | null; arrLng?: number | null;
  reference?: string | null; notes?: string | null; sortOrder: number; cost?: DemoInlineCost | null;
}
export interface DemoAccommodation { key: Key; stopKey: Key; name: string; address?: string | null; checkIn: string; checkOut: string; confirmation?: string | null; notes?: string | null; lat?: number | null; lng?: number | null; cost?: DemoInlineCost | null; }
export interface DemoItem {
  key: Key; title: string; category: string; stopKey?: Key | null; date?: string | null;
  startTime?: string | null; endTime?: string | null; lat?: number | null; lng?: number | null;
  address?: string | null; link?: string | null; booking?: string | null; notes?: string | null;
  sourceItemKey?: Key | null; sourceMarkerKey?: Key | null; votes?: DemoVote[]; cost?: DemoInlineCost | null; sortOrder?: number;
}
export interface DemoPlan { stops: DemoStop[]; chapters: DemoChapter[]; transports: DemoTransport[]; accommodations: DemoAccommodation[]; items: DemoItem[]; costs: DemoCost[]; }
export interface DemoFork extends DemoPlan { key: Key; name: string; sortOrder: number; createdBy: Who; }

export interface DemoNote { author: Who; targetType: "STOP" | "ITEM" | "ACCOMMODATION" | "TRANSPORT" | "TRIP"; targetKey: Key | "TRIP"; body: string; }
export interface DemoChecklistItem { kind: "PRETRIP" | "PACKING"; text: string; done: boolean; dueDate?: string | null; assignedTo?: Who | null; }
export interface DemoReminder { title: string; fireAt: string; targetType?: "ITEM" | "TRANSPORT" | null; targetKey?: Key | null; sent?: boolean; }
export interface DemoJournalEntry { date: string; author: Who; body: string; }
export interface DemoAttachment { targetType: "TRIP" | "TRANSPORT" | "ACCOMMODATION" | "ITEM" | "MARKER"; targetKey?: Key | "TRIP" | null; filename: string; mime: string; body: string; }
export interface DemoActivity { actor: Who; verb: "CREATED" | "UPDATED" | "DELETED" | "NOTED" | "PROMOTED"; entityType: string; entityKey?: Key | null; entityLabel: string; changes?: unknown; at?: string; daysAgo?: number; }
export interface DemoInvite { email: string; role: "owner" | "member"; }

export interface DemoTrip extends DemoPlan {
  key: Key; name: string; createdBy: Who; startDate: string | null; endDate: string | null;
  hardEndDate?: string | null; homeCurrency: string; home?: HomeBase | null; roundTrip?: boolean;
  coverGradient?: [string, string] | null; drivingWindingFactor?: number; drivingAvgSpeedKph?: number;
  exchangeRates?: { base: string; quote: string; rate: number; manual: boolean; fetchedAt: string }[];
  forks?: DemoFork[]; notes?: DemoNote[]; checklist?: DemoChecklistItem[]; reminders?: DemoReminder[];
  journal?: DemoJournalEntry[]; attachments?: DemoAttachment[]; activities?: DemoActivity[]; invites?: DemoInvite[];
  shareLink?: boolean; calendarFeed?: { includeTransport?: boolean; includeAccommodation?: boolean; includeActivities?: boolean } | null;
  packingTemplates?: { name: string; items: string[]; owner: Who }[]; unreadFor?: Who | null;
}
export interface DemoMarker { key: Key; title: string; category: string; note?: string | null; link?: string | null; timing?: string | null; lat?: number | null; lng?: number | null; city?: string | null; country?: string | null; countryCode?: string | null; createdBy: Who; attachments?: DemoAttachment[]; }
export interface DemoGlobe { createdBy: Who; members: { user: Who; role: "owner" | "member" }[]; markers: DemoMarker[]; invites?: DemoInvite[]; }
export interface DemoDataset { globe: DemoGlobe; trips: DemoTrip[]; }

// --- Adapters to the pure engines -----------------------------------------
export function toFlagStop(s: DemoStop): FlagStop | null {
  if (!s.arriveDate || !s.departDate || !s.timezone) return null; // rough stops are not flagged directly
  return { id: s.key, name: s.name, arriveDate: s.arriveDate, departDate: s.departDate, timezone: s.timezone, lat: s.lat ?? null, lng: s.lng ?? null, sortOrder: s.sortOrder };
}
export function toFlagTransport(t: DemoTransport): FlagTransport {
  return { id: t.key, fromStopId: t.fromStopKey ?? null, toStopId: t.toStopKey ?? null, depAt: t.depAt ?? null, arrAt: t.arrAt ?? null, mode: t.mode, depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false };
}
export function toFlagItem(i: DemoItem): FlagItem {
  return { id: i.key, stopId: i.stopKey ?? null, date: i.date ?? null, startTime: i.startTime ?? null, endTime: i.endTime ?? null, lat: i.lat ?? null, lng: i.lng ?? null };
}
export function toFlagAccommodation(a: DemoAccommodation): FlagAccommodation {
  return { id: a.key, stopId: a.stopKey, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name };
}
export function toProjectionStop(s: DemoStop): ProjectionStop {
  return { id: s.key, arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null, nights: s.nights ?? null, pinned: s.pinned ?? false, sortOrder: s.sortOrder };
}

export interface PlanFlagOpts {
  tripStart: string; tripEnd: string; hardEndDate?: string | null; projectedEnd?: string | null;
  home?: HomeBase | null; roundTrip?: boolean; drivingWindingFactor?: number; drivingAvgSpeedKph?: number;
}
export function planFlagInput(plan: DemoPlan, opts: PlanFlagOpts): DetectFlagsInput {
  const flagStops = plan.stops.map(toFlagStop).filter((s): s is FlagStop => s !== null);
  const roughStopCount = plan.stops.length - flagStops.length;
  const ordered = [...plan.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = ordered[0]; const last = ordered[ordered.length - 1];
  return {
    stops: flagStops,
    transports: plan.transports.map(toFlagTransport),
    accommodations: plan.accommodations.map(toFlagAccommodation),
    items: plan.items.map(toFlagItem),
    tripStart: opts.tripStart, tripEnd: opts.tripEnd,
    roughStopCount, projectedEnd: opts.projectedEnd ?? null, hardEndDate: opts.hardEndDate ?? null,
    drivingWindingFactor: opts.drivingWindingFactor, drivingAvgSpeedKph: opts.drivingAvgSpeedKph,
    home: opts.home ?? null, roundTrip: opts.roundTrip,
    homeFirstStop: first ? { id: first.key, name: first.name } : null,
    homeLastStop: last ? { id: last.key, name: last.name } : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/types.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/types.ts lib/demo/types.test.ts
git commit -m "feat(demo): framework-free demo graph types + engine adapters"
```

---

### Task 2: Cover-image generator (pure PNG encoder)

**Files:**
- Create: `lib/demo/cover-image.ts`
- Test: `lib/demo/cover-image.test.ts`

**Interfaces:**
- Produces: `gradientPng(topHex: string, bottomHex: string, width?: number, height?: number): Buffer` (default 640×400). Output is a valid PNG (8-bit RGB) with a vertical gradient.

- [ ] **Step 1: Write the failing test** — `lib/demo/cover-image.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { gradientPng } from "./cover-image";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("gradientPng", () => {
  it("returns a buffer that begins with the PNG magic number", () => {
    const png = gradientPng("#0ea5e9", "#6366f1", 8, 8);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
  it("encodes the requested dimensions in the IHDR chunk", () => {
    const png = gradientPng("#000000", "#ffffff", 12, 7);
    // IHDR width/height are big-endian uint32 at byte offsets 16 and 20.
    expect(png.readUInt32BE(16)).toBe(12);
    expect(png.readUInt32BE(20)).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/cover-image.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/demo/cover-image.ts`

```ts
import zlib from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Vertical gradient PNG (8-bit RGB). Pure; no external deps. */
export function gradientPng(topHex: string, bottomHex: string, width = 640, height = 400): Buffer {
  const [tr, tg, tb] = hexToRgb(topHex);
  const [br, bg, bb] = hexToRgb(bottomHex);
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const t = height === 1 ? 0 : y / (height - 1);
    const r = Math.round(tr + (br - tr) * t);
    const g = Math.round(tg + (bg - tg) * t);
    const b = Math.round(tb + (bb - tb) * t);
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type 2 = truecolour RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([magic, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/cover-image.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/cover-image.ts lib/demo/cover-image.test.ts
git commit -m "feat(demo): pure gradient PNG generator for trip covers"
```

---

### Task 3: Phase-date computation

**Files:**
- Create: `lib/demo/phase-dates.ts`
- Test: `lib/demo/phase-dates.test.ts`

**Interfaces:**
- Consumes: `addDays`, from `@/lib/dates`; `computeTripPhase` from `@/lib/trip-phase`.
- Produces: `interface PhaseDates { finalPrep: { start: string; end: string }; travelling: { start: string; end: string }; past: { start: string; end: string } }` and `phaseDates(today: string): PhaseDates`.

- [ ] **Step 1: Write the failing test** — `lib/demo/phase-dates.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { phaseDates } from "./phase-dates";
import { computeTripPhase } from "@/lib/trip-phase";

const today = "2026-07-19";

describe("phaseDates", () => {
  const d = phaseDates(today);
  it("final-prep range resolves to the final-prep phase", () => {
    expect(computeTripPhase({ startDate: d.finalPrep.start, endDate: d.finalPrep.end, today })).toBe("final-prep");
  });
  it("travelling range spans today", () => {
    expect(computeTripPhase({ startDate: d.travelling.start, endDate: d.travelling.end, today })).toBe("travelling");
  });
  it("past range is over", () => {
    expect(computeTripPhase({ startDate: d.past.start, endDate: d.past.end, today })).toBe("past");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/phase-dates.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/demo/phase-dates.ts`

Thresholds (from `lib/trip-phase.ts`): `final-prep` = within 14 days *before* start; `travelling` = start ≤ today ≤ end; `past` = today > end.

```ts
import { addDays } from "@/lib/dates";

export interface PhaseDates {
  finalPrep: { start: string; end: string };
  travelling: { start: string; end: string };
  past: { start: string; end: string };
}

export function phaseDates(today: string): PhaseDates {
  return {
    finalPrep: { start: addDays(today, 3), end: addDays(today, 5) },   // leaves in 3 days (< 14)
    travelling: { start: addDays(today, -2), end: addDays(today, 4) }, // day 3 of 7
    past: { start: addDays(today, -21), end: addDays(today, -7) },     // ended 7 days ago
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/phase-dates.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/phase-dates.ts lib/demo/phase-dates.test.ts
git commit -m "feat(demo): today-relative phase-date ranges"
```

---

### Task 4: Globe builder

**Files:**
- Create: `lib/demo/globe.ts`
- Test: `lib/demo/globe.test.ts`

**Interfaces:**
- Consumes: `CATEGORY_VALUES` from `@/lib/categories`; `DemoGlobe`, `DemoMarker` from `./types`.
- Produces: `buildGlobe(): DemoGlobe`, and `export const GLOBE_MARKER_KEYS` (a `Record<string, string>` of semantic name → marker key) so other builders reference markers by key without magic strings.

- [ ] **Step 1: Write the failing test** — `lib/demo/globe.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildGlobe, GLOBE_MARKER_KEYS } from "./globe";
import { CATEGORY_VALUES } from "@/lib/categories";

describe("buildGlobe", () => {
  const g = buildGlobe();
  it("has both travellers as members, one owner", () => {
    expect(g.members).toHaveLength(2);
    expect(g.members.filter((m) => m.role === "owner")).toHaveLength(1);
  });
  it("has at least 12 markers, all with valid categories and lowercase country codes", () => {
    expect(g.markers.length).toBeGreaterThanOrEqual(12);
    for (const m of g.markers) {
      expect(CATEGORY_VALUES).toContain(m.category);
      if (m.countryCode) expect(m.countryCode).toBe(m.countryCode.toLowerCase());
    }
  });
  it("covers every trip region so both trips get overlap suggestions", () => {
    const codes = new Set(g.markers.map((m) => m.countryCode));
    for (const c of ["fi", "de", "gb", "ie", "fr", "it", "ch", "jp"]) expect(codes.has(c)).toBe(true);
  });
  it("has >=2 markers carrying attachments and >=1 with both timing and link", () => {
    expect(g.markers.filter((m) => (m.attachments?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(2);
    expect(g.markers.some((m) => m.timing && m.link)).toBe(true);
  });
  it("has exactly one pending globe invite", () => {
    expect(g.invites ?? []).toHaveLength(1);
  });
  it("exports the marker keys the EU wishlist links to", () => {
    const keys = new Set(g.markers.map((m) => m.key));
    expect(keys.has(GLOBE_MARKER_KEYS.versailles)).toBe(true);
    expect(keys.has(GLOBE_MARKER_KEYS.kemi)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/globe.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/demo/globe.ts`

Build ≥12 markers. Required key names in `GLOBE_MARKER_KEYS`: `versailles` (fr), `kemi` (fi). Full marker set (each with `createdBy`, real `lat`/`lng`, `city`, `country`, lowercase `countryCode`, and a `category` from CATEGORY_VALUES):

| key | title | cat | country/code | extras |
|---|---|---|---|---|
| `versailles` | Palace of Versailles | SIGHTSEEING | France/fr | note |
| `kemi` | SnowHotel, Kemi | ACTIVITY | Finland/fi | note |
| `zugspitze` | Zugspitze summit | ACTIVITY | Germany/de | — |
| `cinque` | Cinque Terre | SIGHTSEEING | Italy/it | link |
| `hogmanay` | Edinburgh Hogmanay | NIGHTLIFE | United Kingdom/gb | timing "31 Dec" |
| `interlaken` | Interlaken paragliding | ACTIVITY | Switzerland/ch | timing "summer" |
| `fushimi` | Fushimi Inari shrine | SIGHTSEEING | Japan/jp | — |
| `tokyoTower` | Tokyo Tower | SIGHTSEEING | Japan/jp | link |
| `machu` | Machu Picchu | SIGHTSEEING | Peru/pe | note |
| `sahara` | Sahara overnight camp | ACTIVITY | Morocco/ma | **attachment** `sahara-itinerary.txt` |
| `oktoberfest` | Oktoberfest | FOOD | Germany/de | **timing** "late Sept" + **link** |
| `iceland` | Ring Road, Iceland | ACTIVITY | Iceland/is | **attachment** `iceland-route.txt` |

`createdBy` mix of "you"/"partner". Attachments use `mime: "text/plain"` and a short `body`. Members: `you` owner, `partner` member. `invites`: one `{ email: "friend@example.com", role: "member" }`.

```ts
import type { DemoGlobe } from "./types";
export const GLOBE_MARKER_KEYS = {
  versailles: "globe:versailles", kemi: "globe:kemi", zugspitze: "globe:zugspitze",
  cinque: "globe:cinque", hogmanay: "globe:hogmanay", interlaken: "globe:interlaken",
  fushimi: "globe:fushimi", tokyoTower: "globe:tokyo-tower", machu: "globe:machu",
  sahara: "globe:sahara", oktoberfest: "globe:oktoberfest", iceland: "globe:iceland",
} as const;
export function buildGlobe(): DemoGlobe { /* return { createdBy, members, markers: [...12], invites: [...1] } per the table */ }
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/globe.test.ts` — Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/globe.ts lib/demo/globe.test.ts
git commit -m "feat(demo): shared Globe builder with 12 markers + pending invite"
```

---

### Task 5: EU flagship trip builder

**Files:**
- Create: `lib/demo/eu-trip.ts`
- Test: `lib/demo/eu-trip.test.ts`
- Reference (data source): current `prisma/seed-ai-trip.ts` literals (`STOPS`, `OTHER_COSTS`, notes, checklists, packing template, reminders, journal, attachments).

**Interfaces:**
- Consumes: `DemoTrip`, `planFlagInput`, `toProjectionStop` from `./types`; `detectFlags` from `@/lib/flags`; `computeProjectedEnd` from `@/lib/firm-up`; `hasOutboundLeg`, `hasReturnLeg` from `@/lib/home-base`; `GLOBE_MARKER_KEYS` from `./globe`.
- Produces: `buildEuTrip(): DemoTrip`.

**Construction recipe** (lift + enrich):
1. **Lift** the 6 European stops (drop "Brisbane / Gold Coast") from the existing `STOPS` array into `DemoStop`s (rename `arriveDate/departDate/timezone/lat/lng/country/notes`; assign `sortOrder`; add `countryCode`: Rovaniemi `fi`, Munich `de`, London `gb`, Dublin `ie`, Paris `fr`, Rome `it`). Lift each stop's `transportIn`, `accommodation`, and `items` similarly. Give every entity a stable `key` (e.g. `eu:stop:rovaniemi`, `eu:tr:muc-lhr`, `eu:acc:bloomsbury`, `eu:item:<slug>`).
2. **Home base:** set `home = { name: "Brisbane", lat: -27.4698, lng: 153.0251, countryCode: "au" }`, `roundTrip: true`. Outbound flight (was BNE→RVN): `fromStopKey: null, depIsHome: true, toStopKey: "eu:stop:rovaniemi"`. Homeward flight (Rome→BNE): `fromStopKey: "eu:stop:rome", arrIsHome: true, toStopKey: null`. The old "Pack, weigh bags…" Brisbane item becomes a **PRETRIP checklist** item instead.
3. **Chapters** (dated): `Lapland` sky (Rovaniemi), `Bavaria` amber (Munich), `British Isles` emerald (London+Dublin), `France & Italy` violet (Paris+Rome). Set each chapter `startDate`/`endDate` to span its stops' arrive/depart.
4. **hardEndDate:** `"2027-01-16"` (trip ends 2027-01-09 → clear).
5. **Pinned:** `pinned: true` on Rovaniemi and Paris.
6. **Wishlist reclassification:** the 8 voted ideas become trip-wide items (`stopKey: null`, `date: null`), votes preserved. Wire `sourceMarkerKey`: "Day trip to the Palace of Versailles" → `GLOBE_MARKER_KEYS.versailles`; "Overnight at the SnowHotel, Kemi" → `GLOBE_MARKER_KEYS.kemi`.
7. **Things to do** (stop-attached, undated): add `eu:item:englischer-garten` (Munich), `eu:item:camden-market` (London), `eu:item:aventine-keyhole` (Rome) with `stopKey` set, `date: null`.
8. **Placed copy:** add a scheduled London item `eu:item:ritz-tea-scheduled` (date 2026-12-18, category FOOD) with `sourceItemKey` = the trip-wide "Afternoon tea at The Ritz" idea key. The idea stays in the wishlist.
9. **Exchange rates:** keep EUR (fetched) + GBP (manual); add CHF (manual) for the fork.
10. **Forks** (`forks: [italyFirst, plusSwitzerland]`):
    - `eu:fork:italy-first` "Italy first" — reordered clean variant (Rome before Paris), re-flowed dates within the same Dec6–Jan9 window; fits hardEndDate. Own stops/transports/accommodations/items/costs with `key`s prefixed `eu:fork:if:`.
    - `eu:fork:plus-ch` "+ Switzerland" — inserts a rough Zermatt stop (`nights: 3`, `countryCode: ch`, no dates) after Paris; pins Rome; a CHF cost; the added nights push the **projected end past 2027-01-16**.
11. **Activities** (`activities`, absolute `at` dates Jun–Jul 2026, mix of you/partner): ≥12 rows — `CREATED` STOP×several, `CREATED` TRANSPORT, `UPDATED` COST (`changes: [{field:"actualMinor",label:"Actual",from:"",to:"$2,264.00"}]`), `UPDATED` ITEM time, 5× `NOTED` (`changes:{excerpt:"…"}`) mirroring the notes, and one `CREATED` FORK (`entityType:"FORK"`, label "Italy first"). The **two newest** activities must be authored by **partner**; set `unreadFor: "you"`.
12. Keep the existing **notes, pre-trip + packing checklists, packing template, reminders, journal, attachments, shareLink**. Set `calendarFeed: { includeActivities: false }`. Set `coverGradient: ["#0ea5e9", "#1e3a8a"]`.

- [ ] **Step 1: Write the failing test** — `lib/demo/eu-trip.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildEuTrip } from "./eu-trip";
import { buildGlobe } from "./globe";
import { planFlagInput, toProjectionStop } from "./types";
import { detectFlags } from "@/lib/flags";
import { computeProjectedEnd } from "@/lib/firm-up";
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";

describe("buildEuTrip", () => {
  const t = buildEuTrip();
  const realPlan = { stops: t.stops, chapters: t.chapters, transports: t.transports, accommodations: t.accommodations, items: t.items, costs: t.costs };

  it("has a home base with outbound and return legs", () => {
    expect(t.home?.name).toBe("Brisbane");
    expect(hasOutboundLeg(t.transports, t.home ?? null)).toBe(true);
    expect(hasReturnLeg(t.transports, t.home ?? null, t.roundTrip ?? true)).toBe(true);
  });
  it("has 6 scheduled stops, all with a lowercase country code", () => {
    expect(t.stops).toHaveLength(6);
    for (const s of t.stops) { expect(s.arriveDate).toBeTruthy(); expect(s.countryCode).toBe(s.countryCode?.toLowerCase()); }
  });
  it("chapters cover all stops with valid colours", () => {
    const chaptered = new Set(t.stops.map((s) => {
      const arr = s.arriveDate!;
      return t.chapters.some((c) => c.startDate! <= arr && arr <= c.endDate!);
    }));
    expect(chaptered.has(false)).toBe(false);
  });
  it("real plan is CLEAN — zero warning-severity flags", () => {
    const flags = detectFlags(planFlagInput(realPlan, { tripStart: t.startDate!, tripEnd: t.endDate!, hardEndDate: t.hardEndDate, home: t.home, roundTrip: t.roundTrip }));
    expect(flags.filter((f) => f.severity === "warning")).toEqual([]);
  });
  it("has >=2 pinned stops", () => {
    expect(t.stops.filter((s) => s.pinned).length).toBeGreaterThanOrEqual(2);
  });
  it("wishlist ideas are trip-wide (no stop, no date) and carry votes", () => {
    const wishlist = t.items.filter((i) => !i.stopKey && !i.date);
    expect(wishlist.length).toBeGreaterThanOrEqual(6);
    expect(wishlist.some((i) => (i.votes?.length ?? 0) > 0)).toBe(true);
  });
  it("has a thing-to-do (stop-attached, undated) and a placed copy (sourceItemKey)", () => {
    expect(t.items.some((i) => i.stopKey && !i.date)).toBe(true);
    expect(t.items.some((i) => i.sourceItemKey)).toBe(true);
  });
  it("links >=2 wishlist ideas to real Globe markers", () => {
    const markerKeys = new Set(buildGlobe().markers.map((m) => m.key));
    const linked = t.items.filter((i) => i.sourceMarkerKey);
    expect(linked.length).toBeGreaterThanOrEqual(2);
    for (const i of linked) expect(markerKeys.has(i.sourceMarkerKey!)).toBe(true);
  });
  it("has two forks; the '+ Switzerland' fork overruns the hard-end date", () => {
    expect(t.forks).toHaveLength(2);
    const ch = t.forks!.find((f) => f.name.includes("Switzerland"))!;
    const projected = computeProjectedEnd(ch.stops.map(toProjectionStop), t.startDate);
    expect(projected! > t.hardEndDate!).toBe(true);
    const flags = detectFlags(planFlagInput(ch, { tripStart: t.startDate!, tripEnd: t.endDate!, hardEndDate: t.hardEndDate, projectedEnd: projected }));
    expect(flags.some((f) => f.severity === "warning")).toBe(true);
  });
  it("records a FORK activity and leaves the two newest activities unread for 'you'", () => {
    expect(t.activities!.some((a) => a.entityType === "FORK")).toBe(true);
    const sorted = [...t.activities!].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    const newestTwo = sorted.slice(-2);
    expect(newestTwo.every((a) => a.actor === "partner")).toBe(true);
    expect(t.unreadFor).toBe("you");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/eu-trip.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/demo/eu-trip.ts` per the construction recipe above.

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/eu-trip.test.ts` — Expected: PASS (10 tests). If the "clean" test surfaces an unexpected *warning*, fix the **data** (e.g. an accommodation coverage gap, an item overlap) so the flagship is genuinely clean — do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/eu-trip.ts lib/demo/eu-trip.test.ts
git commit -m "feat(demo): enriched EU flagship builder (home base, chapters, forks, globe links)"
```

---

### Task 6: Alpine rough road-trip builder

**Files:**
- Create: `lib/demo/alpine-trip.ts`
- Test: `lib/demo/alpine-trip.test.ts`

**Interfaces:**
- Consumes: `DemoTrip`, `toProjectionStop`, `planFlagInput` from `./types`; `computeProjectedEnd` from `@/lib/firm-up`; `detectFlags` from `@/lib/flags`.
- Produces: `buildAlpineTrip(): DemoTrip`.

**Construction recipe:** `startDate: "2027-05-01"`, `endDate: null`, `hardEndDate: "2027-05-14"`, `homeCurrency: "EUR"`, `home: { name: "Munich", lat: 48.1351, lng: 11.582, countryCode: "de" }`, `roundTrip: true`, `coverGradient: ["#10b981","#065f46"]`. Six **rough** stops (no dates/timezone; with lat/lng + countryCode), interleaving DE/FR: Munich `de` (n3) → Strasbourg `fr` (n2) → Freiburg `de` (n2) → Colmar `fr` (n2) → Lucerne `ch` (n4) → Lake Como `it` (n3) = 16 nights → projected end ≈ 2027-05-17 (> 05-14). CAR transports between consecutive stops (`mode: "CAR"`, with `depLat/depLng/arrLat/arrLng`; leave `depAt`/`arrAt` null — rough). One **rough chapter** `Alsace` (colour `orange`, no dates) holding Strasbourg+Freiburg+Colmar via `chapterKey` + `chapterSortOrder`; leave Lucerne+Como **Ungrouped**. A handful of things-to-do items (stop-attached, undated) and 2 trip-wide wishlist ideas. Estimated-only costs (no `paid`). No accommodation (drives Next-steps + rough-stop flags). One transport uses `mode: "OTHER"` (e.g. a cable-car hop `eu`… `alp:tr:pilatus`) so the OTHER mode is covered.

- [ ] **Step 1: Write the failing test** — `lib/demo/alpine-trip.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildAlpineTrip } from "./alpine-trip";
import { toProjectionStop, planFlagInput } from "./types";
import { computeProjectedEnd } from "@/lib/firm-up";
import { detectFlags } from "@/lib/flags";

describe("buildAlpineTrip", () => {
  const t = buildAlpineTrip();
  it("is anchored but every stop is rough (nights, no dates)", () => {
    expect(t.startDate).toBe("2027-05-01");
    for (const s of t.stops) { expect(s.arriveDate).toBeFalsy(); expect(s.nights).toBeGreaterThan(0); expect(s.countryCode).toBeTruthy(); }
  });
  it("interleaves countries (a country is revisited) — a Combined chapter case", () => {
    const codes = t.stops.sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.countryCode);
    const revisits = codes.some((c, i) => i >= 2 && codes.slice(0, i).includes(c) && codes[i - 1] !== c);
    expect(revisits).toBe(true);
  });
  it("projects past the hard-end date and raises a hard-end warning", () => {
    const projected = computeProjectedEnd(t.stops.map(toProjectionStop), t.startDate);
    expect(projected! > t.hardEndDate!).toBe(true);
    const flags = detectFlags(planFlagInput(t, { tripStart: t.startDate!, tripEnd: projected!, hardEndDate: t.hardEndDate, projectedEnd: projected }));
    expect(flags.some((f) => f.severity === "warning")).toBe(true);
  });
  it("uses CAR and OTHER transport modes", () => {
    const modes = new Set(t.transports.map((x) => x.mode));
    expect(modes.has("CAR")).toBe(true);
    expect(modes.has("OTHER")).toBe(true);
  });
  it("has a rough chapter and an ungrouped tail", () => {
    expect(t.chapters.some((c) => !c.startDate)).toBe(true);
    expect(t.stops.some((s) => !s.chapterKey)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/alpine-trip.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Write the implementation** — `lib/demo/alpine-trip.ts` per recipe.
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/alpine-trip.test.ts` — Expected: PASS (5 tests).
- [ ] **Step 5: Commit**

```bash
git add lib/demo/alpine-trip.ts lib/demo/alpine-trip.test.ts
git commit -m "feat(demo): Alpine rough road-trip builder (overrun + combined chapter)"
```

---

### Task 7: Phase-demo trip builders

**Files:**
- Create: `lib/demo/phase-trips.ts`
- Test: `lib/demo/phase-trips.test.ts`

**Interfaces:**
- Consumes: `phaseDates` from `./phase-dates`; `DemoTrip`, `planFlagInput` from `./types`; `detectFlags` from `@/lib/flags`; `computeTripPhase` from `@/lib/trip-phase`.
- Produces: `buildSketchTrip(): DemoTrip`, `buildFinalPrepTrip(today: string): DemoTrip`, `buildTravellingTrip(today: string): DemoTrip`, `buildPastTrip(today: string): DemoTrip`.

**Construction recipes:**
- **Sketch** ("Japan someday"): `startDate: null` (Sketching). ~4 rough stops (Tokyo/Kyoto/Osaka/Hakone, `countryCode: jp`, nights only). A couple trip-wide wishlist ideas. `homeCurrency: "AUD"`. No bookings.
- **Final prep** ("Blue Mountains by rail", `today`+3…+5): fully scheduled, 1–2 stops, `mode: "TRAIN"` legs (covers TRAIN), 1 accommodation, a mostly-ticked PRETRIP checklist, a packing list, a reminder firing in ~2 days (`sent: false`). `coverGradient` set.
- **Travelling** ("Great Ocean Road, right now", `today`−2…+4): 2–3 scheduled stops along the coast with **located items on `today`** (lat/lng + start/end times), tonight's accommodation, and a **CAR** leg on `today` between two distant coast towns (≥ ~350 km straight-line) so `flagLongDrivingDays` raises a **warning**. Include one `mode: "BUS"` leg (airport transfer) to cover BUS.
- **Past** ("Spirit of Tassie", `today`−21…−7): fully scheduled; a `mode: "FERRY"` leg (Melbourne→Devonport) + CAR legs; several **paid** costs (`paid: true`, `actualMinor` set) to feed Spend-so-far; 2–3 journal entries; a shareLink. `coverGradient` set.

- [ ] **Step 1: Write the failing test** — `lib/demo/phase-trips.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildSketchTrip, buildFinalPrepTrip, buildTravellingTrip, buildPastTrip } from "./phase-trips";
import { phaseDates } from "./phase-dates";
import { planFlagInput } from "./types";
import { detectFlags } from "@/lib/flags";
import { computeTripPhase } from "@/lib/trip-phase";

const today = "2026-07-19";
const d = phaseDates(today);

describe("phase trips", () => {
  it("sketch trip is date-less (sketching phase) with rough stops", () => {
    const t = buildSketchTrip();
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("sketching");
    expect(t.stops.every((s) => !s.arriveDate)).toBe(true);
  });
  it("final-prep trip resolves to final-prep and has a pretrip checklist + soon reminder", () => {
    const t = buildFinalPrepTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("final-prep");
    expect((t.checklist ?? []).some((c) => c.kind === "PRETRIP")).toBe(true);
    expect((t.reminders ?? []).length).toBeGreaterThanOrEqual(1);
  });
  it("travelling trip spans today with a located item today and a long-driving-day warning", () => {
    const t = buildTravellingTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("travelling");
    expect(t.items.some((i) => i.date === today && i.lat != null && i.lng != null)).toBe(true);
    const flags = detectFlags(planFlagInput(t, { tripStart: t.startDate!, tripEnd: t.endDate! }));
    expect(flags.some((f) => f.severity === "warning" && /driv/i.test(f.message))).toBe(true);
  });
  it("past trip is over and has paid costs + journal for spend-so-far", () => {
    const t = buildPastTrip(today);
    expect(computeTripPhase({ startDate: t.startDate, endDate: t.endDate, today })).toBe("past");
    const allCosts = [...t.costs, ...t.transports.flatMap((x) => x.cost ? [x.cost] : []), ...t.accommodations.flatMap((a) => a.cost ? [a.cost] : [])];
    expect(allCosts.some((c) => c.paid)).toBe(true);
    expect((t.journal ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("across the four phase trips, transport modes include TRAIN, CAR, FERRY, BUS", () => {
    const modes = new Set([buildFinalPrepTrip(today), buildTravellingTrip(today), buildPastTrip(today)].flatMap((t) => t.transports.map((x) => x.mode)));
    for (const m of ["TRAIN", "CAR", "FERRY", "BUS"]) expect(modes.has(m)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/phase-trips.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Write the implementation** — `lib/demo/phase-trips.ts` per recipes. Tune the Travelling CAR-leg endpoints until `flagLongDrivingDays` fires (needs `mode:"CAR"`, both stops with coords, `depAt` on `today`, and estimated drive > `LONG_DRIVE_DAY_THRESHOLD_MIN` = 300 min).
- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/phase-trips.test.ts` — Expected: PASS (5 tests).
- [ ] **Step 5: Commit**

```bash
git add lib/demo/phase-trips.ts lib/demo/phase-trips.test.ts
git commit -m "feat(demo): four today-relative phase-demo trips"
```

---

### Task 8: buildDemo orchestrator + cross-link validation

**Files:**
- Create: `lib/demo/index.ts`
- Test: `lib/demo/index.test.ts`

**Interfaces:**
- Consumes: all builders + `DemoDataset` from `./types`.
- Produces: `buildDemo(today: string): DemoDataset`, `export const DEMO_TRIP_NAMES: string[]` (used by the persister's wipe).

- [ ] **Step 1: Write the failing test** — `lib/demo/index.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildDemo, DEMO_TRIP_NAMES } from "./index";

const today = "2026-07-19";

describe("buildDemo", () => {
  const data = buildDemo(today);
  it("produces five trips and a globe", () => {
    expect(data.trips).toHaveLength(5);
    expect(data.globe.markers.length).toBeGreaterThanOrEqual(12);
  });
  it("every sourceMarkerKey used by a trip resolves to a real globe marker", () => {
    const markerKeys = new Set(data.globe.markers.map((m) => m.key));
    const used = data.trips.flatMap((t) => [...t.items, ...(t.forks ?? []).flatMap((f) => f.items)]).map((i) => i.sourceMarkerKey).filter(Boolean) as string[];
    expect(used.length).toBeGreaterThanOrEqual(2);
    for (const k of used) expect(markerKeys.has(k)).toBe(true);
  });
  it("trip names are unique and exported for the wipe", () => {
    const names = data.trips.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(DEMO_TRIP_NAMES).toContain(n);
  });
  it("the suite covers all six transport modes", () => {
    const modes = new Set(data.trips.flatMap((t) => [...t.transports, ...(t.forks ?? []).flatMap((f) => f.transports)].map((x) => x.mode)));
    for (const m of ["FLIGHT", "TRAIN", "BUS", "CAR", "FERRY", "OTHER"]) expect(modes.has(m)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- lib/demo/index.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** — `lib/demo/index.ts`

```ts
import { buildGlobe } from "./globe";
import { buildEuTrip } from "./eu-trip";
import { buildAlpineTrip } from "./alpine-trip";
import { buildSketchTrip, buildFinalPrepTrip, buildTravellingTrip, buildPastTrip } from "./phase-trips";
import type { DemoDataset } from "./types";

export function buildDemo(today: string): DemoDataset {
  return {
    globe: buildGlobe(),
    trips: [buildEuTrip(), buildAlpineTrip(), buildSketchTrip(), buildFinalPrepTrip(today), buildTravellingTrip(today), buildPastTrip(today)],
  };
}
export const DEMO_TRIP_NAMES = buildDemo("2000-01-01").trips.map((t) => t.name);
```

(Note: `DEMO_TRIP_NAMES` is date-independent — trip names are constant regardless of `today` — so any placeholder date is fine.) Confirm the FLIGHT/OTHER modes are present from EU (FLIGHT) and Alpine (OTHER); if the mode test fails, ensure the EU outbound is FLIGHT and Alpine has the OTHER-mode leg.

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- lib/demo/index.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/demo/index.ts lib/demo/index.test.ts
git commit -m "feat(demo): buildDemo orchestrator with cross-link validation"
```

---

### Task 9: Persister — wipe, globe, storage/attachment helpers

**Files:**
- Create: `prisma/demo/persist.ts`
- (No unit test — this is Prisma/IO. Verified by the seed run in Task 11.)

**Interfaces:**
- Consumes: `db` from `@/lib/db`; `getStorage`, `generateKey` from `@/lib/storage`; `gradientPng` from `@/lib/demo/cover-image`; `DEMO_TRIP_NAMES` from `@/lib/demo/index`; `DemoGlobe`, `DemoAttachment`, `Who` from `@/lib/demo/types`.
- Produces: `USER_EMAILS: Record<Who, string>`, `ensureUsers()`, `wipeDemo()`, `persistGlobe(globe: DemoGlobe): Promise<Map<string,string>>` (returns marker-key → marker-id map), and helper `saveAttachment(scope, targetType, targetId, att)`.

- [ ] **Step 1: Implement** — `prisma/demo/persist.ts`

Key points:
- `USER_EMAILS = { you: "you@example.com", partner: "partner@example.com" }`; `ensureUsers()` upserts both (names "You"/"Partner"), returns `{ you: User, partner: User }`.
- `wipeDemo()`: for every trip whose `name` ∈ `DEMO_TRIP_NAMES`, delete its attachment blobs from storage (as the current seed does) then `db.trip.delete` (cascades). Then delete the demo users' Globe: find `GlobeMember` for the two user ids, delete their globes' attachment blobs, then `db.globe.delete` (cascades markers/members/invites).
- `persistGlobe`: create the `Globe` (createdById = you), `GlobeMember` rows (respect the unique `userId` — delete any pre-existing membership for these users first, handled by wipe), `Marker` rows (map `createdBy`→id, hardcode lat/lng/city/country/countryCode), `GlobeInvite` (token `crypto.randomUUID()`, `acceptedAt: null`), and Marker attachments via `saveAttachment({ globe: globeId }, "MARKER", markerId, att)`. Return the marker-key→id map.
- `saveAttachment(scope, targetType, targetId, att)`: create `Attachment` row (`tripId` or `globeId` per scope, `url: ""`), then `generateKey(scope, id, att.filename)`, `storage.save(key, Buffer.from(att.body), att.mime)`, then update the row `{ storageKey: key, url: "/api/attachments/" + id }`. Mirrors the existing seed's attachment logic.

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit` — Expected: no errors in `prisma/demo/persist.ts`.

- [ ] **Step 3: Commit**

```bash
git add prisma/demo/persist.ts
git commit -m "feat(demo): persister — wipe, globe, marker attachments, storage helpers"
```

---

### Task 10: Persister — persistTrip (generic)

**Files:**
- Modify: `prisma/demo/persist.ts` (add `persistTrip`)

**Interfaces:**
- Consumes: everything from Task 9 + `DemoTrip`, `DemoPlan`, `DemoCost` from `@/lib/demo/types`; the enum/vocab modules only for reference.
- Produces: `persistTrip(trip: DemoTrip, users, markerIds: Map<string,string>): Promise<void>`.

- [ ] **Step 1: Implement `persistTrip`** — key-resolution approach:

- Maintain a `Map<Key,string>` `id` for this trip's created rows (stops, chapters, transports, accommodations, items, forks). Also merge in `markerIds` for `sourceMarkerKey` resolution.
- Create `Trip` (name, startDate, endDate, hardEndDate, homeCurrency, home* fields from `trip.home`, `roundTrip`, `drivingWindingFactor`/`drivingAvgSpeedKph` if set, `createdById`, members: you owner + partner member). If `coverGradient`, generate a PNG, `generateKey({trip:id}, randomUUID(), "cover.png")`, `storage.save(...)`, update `coverImageKey`.
- `exchangeRates` → `db.exchangeRate.create` each.
- **A reusable `persistPlan(plan, { forkId }): Promise<void>`** creates: chapters → stops (resolve `chapterKey`, set `chapterSortOrder`, `pinned`, `forkId`) → transports (resolve `fromStopKey`/`toStopKey`, `depIsHome`/`arrIsHome`, `forkId`) → accommodations (resolve `stopKey`, `forkId`) → items (resolve `stopKey`, `sourceItemKey`, `sourceMarkerKey`, `forkId`) → costs. Costs: inline costs on a transport/accommodation/item become `Cost` rows with `ownerType`/`ownerId` = the created id and `rateToHome` from the trip's rates (null if same currency); `paid` sets `paidAt = new Date()` minus a few days; plan-level `costs[]` (OTHER + any explicit) resolve `ownerKey`→id or null. Votes on items → `Vote` rows (resolve user). Call `persistPlan(trip, {})` for the real plan.
- Trip-scoped extras: notes (resolve `targetKey`, `targetType`; `TRIP`→ targetId = trip id), checklist items, packing templates, reminders (resolve `targetKey`), journal entries, attachments (`saveAttachment({trip:id}, ...)`; `TRIP` target → targetId null like current seed), shareLink, calendarFeed (with include* flags).
- Forks: for each `DemoFork`, create `Fork` row, then `persistPlan(fork, { forkId })`.
- Activities: create `Activity` rows — `createdAt = at ? new Date(at) : new Date(Date.now() - daysAgo*86400000)`; `changes` passed as the raw JS value (Prisma `Json`). Resolve `entityKey`→`entityId` when present (else null). After creating, if `trip.unreadFor`, set that member's `TripMember.lastReadActivityAt` to the `createdAt` of the 3rd-newest activity (so the newest two are unread).

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/demo/persist.ts
git commit -m "feat(demo): persistTrip — generic plan/fork persister with key resolution"
```

---

### Task 11: Orchestrator, rename, and integration verification

**Files:**
- Rename: `prisma/seed-ai-trip.ts` → `prisma/seed-demo.ts` (`git mv`), replace body.
- Modify: `prisma/seed.ts` (import), `package.json` (script).

**Interfaces:**
- Produces: `export async function seedDemo(): Promise<void>`; retains a standalone `isMain` run guard.

- [ ] **Step 1: Rename and rewrite** — `git mv prisma/seed-ai-trip.ts prisma/seed-demo.ts`, then replace its contents:

```ts
import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { todayISO } from "../lib/dates";
import { buildDemo } from "../lib/demo";
import { ensureUsers, wipeDemo, persistGlobe, persistTrip } from "./demo/persist";

export async function seedDemo(): Promise<void> {
  const data = buildDemo(todayISO());
  const users = await ensureUsers();
  await wipeDemo();
  const markerIds = await persistGlobe(data.globe);
  for (const trip of data.trips) await persistTrip(trip, users, markerIds);
  console.log(`\n✅ Seeded ${data.trips.length} demo trips + a shared Globe (${data.globe.markers.length} markers).`);
  console.log(`   Sign in as ${"you@example.com"} and open the trips.\n`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedDemo().then(() => db.$disconnect()).catch(async (err) => { console.error(err); await db.$disconnect(); process.exit(1); });
}
```

- [ ] **Step 2: Update `prisma/seed.ts`** — change `import { seedAiTrip } from "./seed-ai-trip";` → `import { seedDemo } from "./seed-demo";` and the call `await seedAiTrip();` → `await seedDemo();`.

- [ ] **Step 3: Update `package.json`** — `"db:seed:demo": "tsx prisma/seed-demo.ts"`.

- [ ] **Step 4: Type-check + full unit suite** — Run: `npx tsc --noEmit && npm test` — Expected: tsc clean; all `lib/demo/*.test.ts` pass. (Existing tests must remain green; if any referenced `seed-ai-trip`, update it.)

- [ ] **Step 5: Integration seed run** — Bring up the dev Postgres and run the seed:

```bash
docker compose up -d db && npx prisma db push && npm run db:seed:demo
```

Expected: exits 0; prints the seeded summary. **If the database cannot be started in this environment**, instead run a DB-free dry run to prove the dataset builds and count its contents:

```bash
npx tsx -e "import('./lib/demo/index.ts').then(({buildDemo})=>{const d=buildDemo(new Date().toISOString().slice(0,10));console.log('trips',d.trips.length,'markers',d.globe.markers.length,'forks',d.trips.flatMap(t=>t.forks??[]).length);})"
```

Report which path was taken (real seed vs. dry run) in the completion notes.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-demo.ts prisma/seed.ts package.json
git commit -m "feat(demo): orchestrate 5-trip demo suite; rename seed-ai-trip -> seed-demo"
```

---

## Self-Review

**1. Spec coverage** — every previously-dark feature maps to a task:
Home base → T5; Chapters (dated) → T5; Combined/rough chapter + between-legs + Ungrouped → T6 (+T5 seams); Rough stops + Firm-up/projected-end → T6; Pinned → T5/T6; Hard end date (green) → T5; (overrun) → T5 fork + T6; Make-it-fit (fork + real plan) → T5 + T6; Forks + Compare → T5; Globe/Markers/attachments/timing/GlobeInvite → T4/T9; sourceMarkerKey → T4/T5/T8; sourceItemKey (placed copy) → T5; Activity + unread → T5/T10; Invite → T5/T10; transport modes (all six) → T5–T7/T8; long-driving-day flag → T7; Flags (clean vs provoked) → T5/T6/T7; cover images → T2/T10; true Wishlist vs things-to-do → T5; five Phases + Today view + Past wrap-up + Spend-so-far → T3/T7. Discreet mode + real push are documented non-goals (a dummy PushSubscription is out of scope unless requested).

**2. Placeholder scan** — bulk EU data is "lifted from the named existing literals," not invented; every enrichment is an explicit delta. Tricky code (types, adapters, PNG encoder, phase dates, orchestrator) is given in full. Builder bodies for T4–T7 are specified as tables/recipes with exact field values plus failing tests that pin the invariants; this is the intended granularity for data construction.

**3. Type consistency** — keys are `Key = string` throughout; `planFlagInput`/`toProjectionStop`/`toFlagStop` names match across tasks; `buildDemo`/`DEMO_TRIP_NAMES`/`GLOBE_MARKER_KEYS`/`seedDemo`/`persistTrip`/`persistGlobe`/`ensureUsers`/`wipeDemo`/`gradientPng`/`phaseDates` are used consistently by the tasks that consume them.
