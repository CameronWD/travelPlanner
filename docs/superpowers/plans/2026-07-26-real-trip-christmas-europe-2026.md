# "Christmas in Europe 2026" Real-Trip Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Cameron & Xanthia's real "Christmas in Europe 2026" trip as a pure, unit-tested data builder plus an idempotent seed script that persists it into the local Postgres under Cameron's real account.

**Architecture:** Mirror the repo's proven demo pipeline — a **pure builder** (`lib/real-trip/christmas-europe-2026.ts`) that returns the trip as a `DemoTrip` descriptor (reusing the battle-tested `lib/demo/types.ts` types), and a **focused persist layer** (`prisma/real/persist.ts`) + **entrypoint** (`prisma/seed-real.ts`) that writes it under a single owner member. The persist is a deliberate subset of `prisma/demo/persist.ts` (no forks, no globe, no partner, single member) — we do **not** refactor the shared demo persist, to avoid regressing the demo suite.

**Tech Stack:** TypeScript 5, Prisma 7 (Postgres, driver adapter), Vitest, `tsx` seed runner. Pure builder has zero runtime deps.

## Global Constraints

- Store money as `Int` minor units; calendar dates as `"YYYY-MM-DD"` strings; transport `depAt`/`arrAt` as UTC ISO instants (`...Z`). (schema.prisma header)
- No Prisma `enum`/`Json` — enum-ish values are plain strings validated against `lib/enums.ts` / `lib/categories.ts` / `lib/chapter-colours.ts`. (schema.prisma header)
- `countryCode` is lowercase ISO 3166-1 alpha-2. (schema.prisma:217)
- Import within `lib/` and `prisma/` using the `@/` path alias (e.g. `@/lib/demo/types`), matching existing files.
- Reuse existing helpers verbatim — `getStorage`, `generateKey` from `@/lib/storage`; `gradientPng` from `@/lib/demo/cover-image`; types from `@/lib/demo/types`. Do not reimplement them.
- **Local only. Nothing is pushed or deployed.** Work stays on branch `feat/real-trip-christmas-europe-2026`.
- **This environment has no Postgres/Docker.** Builder is verified by Vitest (no DB). Persist + seed are verified by `npx tsc --noEmit` + `npx eslint` — the repo's established pattern for DB-integration code (see `prisma/demo/persist.ts` header: *"Verified by tsc --noEmit and eslint; exercised by the full seed"*). The live `npm run db:seed:real` run is a documented manual step for the user's real dev environment.

### Canonical trip data (single source of truth for all tasks)

**Trip:** name `Christmas in Europe 2026`; `2026-12-04` → `2027-01-08`; home currency `AUD`; home base `Gold Coast` (lat `-28.0167`, lng `153.4`, cc `au`); `roundTrip: true`; cover gradient `["#0c2461", "#b71540"]`.

**FX (base→AUD):** EUR `1.65`, GBP `1.95`, IDR `0.0001` (all `manual: false`, `fetchedAt: "2026-07-26T00:00:00Z"`).

**Stops (sortOrder, arrive→depart, tz, lat/lng, chapter):**

| # | Stop | Country (cc) | Arrive | Depart | TZ | lat, lng | Chapter |
|---|---|---|---|---|---|---|---|
| 0 | Bali (Denpasar) | Indonesia (id) | 2026-12-04 | 2026-12-05 | Asia/Makassar | -8.6705, 115.2126 | Bali stopover |
| 1 | Munich | Germany (de) | 2026-12-06 | 2026-12-10 | Europe/Berlin | 48.1351, 11.582 | Central Europe |
| 2 | Strasbourg | France (fr) | 2026-12-10 | 2026-12-13 | Europe/Paris | 48.5734, 7.7521 | Central Europe |
| 3 | Frankfurt | Germany (de) | 2026-12-13 | 2026-12-15 | Europe/Berlin | 50.1109, 8.6821 | Central Europe |
| 4 | Paris | France (fr) | 2026-12-15 | 2026-12-19 | Europe/Paris | 48.8566, 2.3522 | Central Europe |
| 5 | London | United Kingdom (gb) | 2026-12-19 | 2026-12-22 | Europe/London | 51.5074, -0.1278 | UK & Ireland |
| 6 | Belfast | United Kingdom (gb) | 2026-12-22 | 2026-12-29 | Europe/London | 54.5973, -5.9301 | UK & Ireland |
| 7 | Dublin | Ireland (ie) | 2026-12-29 | 2026-12-30 | Europe/Dublin | 53.3498, -6.2603 | UK & Ireland |
| 8 | Milan | Italy (it) | 2026-12-30 | 2027-01-02 | Europe/Rome | 45.4642, 9.19 | Italy |
| 9 | Rome | Italy (it) | 2027-01-02 | 2027-01-07 | Europe/Rome | 41.9028, 12.4964 | Italy |

**Chapters (colour, start→end, sortOrder):** Bali stopover `amber` 2026-12-04→2026-12-05 (0); Central Europe `sky` 2026-12-06→2026-12-19 (1); UK & Ireland `violet` 2026-12-19→2026-12-30 (2); Italy `rose` 2026-12-30→2027-01-07 (3).

**Transports (11; UTC instants; ✅ booked cost / 🅿️ placeholder):**

| sortOrder | mode | from→to | depAt / arrAt (UTC) | reference | cost |
|---|---|---|---|---|---|
| 0 | FLIGHT | home→Bali (`depIsHome`) | 2026-12-04T07:50Z / 2026-12-04T14:00Z | — | — |
| 1 | FLIGHT | Bali→Munich | 2026-12-05T11:00Z / 2026-12-06T05:00Z | TG440 · DHZU24 | — |
| 2 | TRAIN | Munich→Strasbourg | 2026-12-10T05:51Z / 2026-12-10T09:30Z | TGV | ✅ 23521 AUD |
| 3 | TRAIN | Strasbourg→Frankfurt | 2026-12-13T10:00Z / 2026-12-13T12:00Z | — | 🅿️ |
| 4 | TRAIN | Frankfurt→Paris | 2026-12-15T10:00Z / 2026-12-15T14:00Z | — | 🅿️ |
| 5 | TRAIN | Paris→London | 2026-12-19T07:02Z / 2026-12-19T09:18Z | Eurostar Plus | ✅ 41438 AUD |
| 6 | FLIGHT | London→Belfast | 2026-12-22T09:15Z / 2026-12-22T10:40Z | BA1394 · XHARUZ | — |
| 7 | TRAIN | Belfast→Dublin | 2026-12-29T11:00Z / 2026-12-29T13:15Z | — | 🅿️ |
| 8 | FLIGHT | Dublin→Milan | 2026-12-30T08:15Z / 2026-12-30T10:45Z | FR7799 · H4WP7Q | — |
| 9 | TRAIN | Milan→Rome | 2027-01-02T09:00Z / 2027-01-02T12:00Z | — | 🅿️ |
| 10 | FLIGHT | Rome→home (`arrIsHome`) | 2027-01-07T14:15Z / 2027-01-08T09:30Z | Qatar · via Doha · 8QPEWK | ✅ 186752 EUR |

All 3 costs are `{ estimatedMinor === actualMinor, paid: true }`. Leg 10 has `toStopKey: null` + `arrIsHome: true` (arrives Brisbane; ~1h drive home noted).

**Items (1):** `Day trip to Neuschwanstein Castle`, SIGHTSEEING, stop = Munich, `date: null`, lat `47.5576` lng `10.7498`, link `https://www.neuschwanstein.de`, one `MUST` vote by `you`.

**Accommodation:** none. **Standalone costs:** none. **Forks / globe / journal / notes / reminders / activities:** none.

**Pre-trip checklist (20, all `kind: "PRETRIP"`, `done: false`):** Book accommodation ×10 (Bali, Munich, Strasbourg, Frankfurt, Paris, London, Belfast [over Christmas], Dublin, Milan [NYE], Rome); Confirm Gold Coast→Denpasar flight (Virgin); Book Strasbourg→Frankfurt train; Book Frankfurt→Paris train; Decide & book Belfast→Dublin transfer; Book Milan→Rome high-speed train; Book Neuschwanstein timed-entry tickets; Travel insurance; Passport/visas; Confirm TG440 baggage; Download Ryanair app.

---

### Task 1: Pure trip builder + unit tests

**Files:**
- Create: `lib/real-trip/christmas-europe-2026.ts`
- Test: `lib/real-trip/christmas-europe-2026.test.ts`

**Interfaces:**
- Consumes: `DemoTrip`, `DemoStop`, `DemoChapter`, `DemoTransport`, `DemoItem`, `DemoChecklistItem` from `@/lib/demo/types`; `hasOutboundLeg`, `hasReturnLeg` from `@/lib/home-base`; `CHAPTER_COLOUR_VALUES` from `@/lib/chapter-colours`; `TRANSPORT_MODES` from `@/lib/enums`.
- Produces: `export function buildChristmasEurope2026(): DemoTrip` — consumed by `prisma/seed-real.ts` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `lib/real-trip/christmas-europe-2026.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026 } from "./christmas-europe-2026";
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
import { CHAPTER_COLOUR_VALUES } from "@/lib/chapter-colours";
import { TRANSPORT_MODES } from "@/lib/enums";

describe("buildChristmasEurope2026", () => {
  const t = buildChristmasEurope2026();

  it("has the right envelope", () => {
    expect(t.name).toBe("Christmas in Europe 2026");
    expect(t.startDate).toBe("2026-12-04");
    expect(t.endDate).toBe("2027-01-08");
    expect(t.homeCurrency).toBe("AUD");
    expect(t.roundTrip).toBe(true);
    expect(t.home?.name).toBe("Gold Coast");
    expect(t.home?.countryCode).toBe("au");
  });

  it("has 10 dated stops in order, lowercase country codes, unique sortOrder", () => {
    expect(t.stops).toHaveLength(10);
    expect(new Set(t.stops.map((s) => s.sortOrder)).size).toBe(10);
    for (const s of t.stops) {
      expect(s.arriveDate).toBeTruthy();
      expect(s.departDate).toBeTruthy();
      expect(s.timezone).toBeTruthy();
      expect(typeof s.lat).toBe("number");
      expect(typeof s.lng).toBe("number");
      expect(s.countryCode).toBe(s.countryCode?.toLowerCase());
    }
  });

  it("stops never overlap or run backwards", () => {
    const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(ordered[i + 1].arriveDate! >= ordered[i].departDate!).toBe(true);
    }
  });

  it("has 4 chapters with valid colours, each covering its stops", () => {
    expect(t.chapters).toHaveLength(4);
    const valid = new Set<string>(CHAPTER_COLOUR_VALUES);
    for (const c of t.chapters) expect(valid.has(c.colour)).toBe(true);
    for (const s of t.stops) {
      const covered = t.chapters.some(
        (c) => c.startDate! <= s.arriveDate! && s.arriveDate! <= c.endDate!,
      );
      expect(covered).toBe(true);
    }
  });

  it("has 11 transports connecting real stops with valid modes", () => {
    expect(t.transports).toHaveLength(11);
    const stopKeys = new Set(t.stops.map((s) => s.key));
    for (const tr of t.transports) {
      expect(TRANSPORT_MODES).toContain(tr.mode);
      if (tr.fromStopKey) expect(stopKeys.has(tr.fromStopKey)).toBe(true);
      if (tr.toStopKey) expect(stopKeys.has(tr.toStopKey)).toBe(true);
    }
  });

  it("is a closed round trip (outbound from home, return to home)", () => {
    const legs = t.transports.map((x) => ({
      depIsHome: x.depIsHome,
      arrIsHome: x.arrIsHome,
      toStopId: x.toStopKey ?? null,
      fromStopId: x.fromStopKey ?? null,
    }));
    const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(hasOutboundLeg(legs, ordered[0].key)).toBe(true);
    expect(hasReturnLeg(legs, ordered[ordered.length - 1].key)).toBe(true);
  });

  it("records the 3 booked costs as actual + paid", () => {
    const withCost = t.transports.filter((tr) => tr.cost);
    expect(withCost).toHaveLength(3);
    for (const tr of withCost) {
      expect(tr.cost!.paid).toBe(true);
      expect(tr.cost!.actualMinor).toBe(tr.cost!.estimatedMinor);
    }
    expect(withCost.map((tr) => tr.cost!.estimatedMinor).sort((a, b) => a - b)).toEqual([
      23521, 41438, 186752,
    ]);
    expect(withCost.filter((tr) => tr.cost!.currency === "AUD")).toHaveLength(2);
    expect(withCost.filter((tr) => tr.cost!.currency === "EUR")).toHaveLength(1);
  });

  it("seeds EUR, GBP and IDR exchange rates quoted to AUD", () => {
    expect(new Set((t.exchangeRates ?? []).map((r) => r.base))).toEqual(
      new Set(["EUR", "GBP", "IDR"]),
    );
    for (const r of t.exchangeRates ?? []) expect(r.quote).toBe("AUD");
  });

  it("has the Neuschwanstein day trip on Munich, undated, marked must-do", () => {
    const n = t.items.find((i) => i.title.includes("Neuschwanstein"));
    expect(n).toBeTruthy();
    expect(n!.stopKey).toBe("xmas26:stop:munich");
    expect(n!.date).toBeNull();
    expect(n!.category).toBe("SIGHTSEEING");
    expect(n!.votes?.some((v) => v.level === "MUST")).toBe(true);
  });

  it("has no accommodation booked yet", () => {
    expect(t.accommodations).toHaveLength(0);
  });

  it("has a pre-trip checklist of outstanding tasks", () => {
    const cl = t.checklist ?? [];
    expect(cl.length).toBeGreaterThanOrEqual(15);
    for (const c of cl) {
      expect(c.kind).toBe("PRETRIP");
      expect(c.done).toBe(false);
    }
    expect(cl.filter((c) => /Book accommodation/i.test(c.text))).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: FAIL — cannot resolve `./christmas-europe-2026` (module not created yet).

- [ ] **Step 3: Write the builder**

Create `lib/real-trip/christmas-europe-2026.ts`:

```ts
/**
 * "Christmas in Europe 2026" — Cameron & Xanthia's real trip.
 *
 * Pure builder returning the trip as a DemoTrip descriptor (reusing the
 * well-tested demo data types) for persistence by prisma/seed-real.ts.
 *
 * Round-trip from the Gold Coast (AUD): a Bali overnight, then Munich →
 * Strasbourg → Frankfurt → Paris → London → Belfast → Dublin → Milan → Rome,
 * home via Doha. Booked legs carry real references + actual/paid costs;
 * unbooked internal legs are placeholders. No accommodation booked yet — the
 * pre-trip checklist captures everything still to arrange.
 *
 * Pure module — no Prisma, no React, no network.
 */

import type {
  DemoTrip,
  DemoStop,
  DemoChapter,
  DemoTransport,
  DemoItem,
  DemoChecklistItem,
} from "@/lib/demo/types";

// --- keys ------------------------------------------------------------------

const SK = {
  bali: "xmas26:stop:bali",
  munich: "xmas26:stop:munich",
  strasbourg: "xmas26:stop:strasbourg",
  frankfurt: "xmas26:stop:frankfurt",
  paris: "xmas26:stop:paris",
  london: "xmas26:stop:london",
  belfast: "xmas26:stop:belfast",
  dublin: "xmas26:stop:dublin",
  milan: "xmas26:stop:milan",
  rome: "xmas26:stop:rome",
} as const;

const CK = {
  bali: "xmas26:chapter:bali",
  central: "xmas26:chapter:central-europe",
  ukIreland: "xmas26:chapter:uk-ireland",
  italy: "xmas26:chapter:italy",
} as const;

// --- stops -----------------------------------------------------------------

const STOPS: DemoStop[] = [
  { key: SK.bali, name: "Bali (Denpasar)", country: "Indonesia", countryCode: "id", lat: -8.6705, lng: 115.2126, timezone: "Asia/Makassar", arriveDate: "2026-12-04", departDate: "2026-12-05", chapterKey: CK.bali, sortOrder: 0, notes: "Overnight stopover before the Munich flight." },
  { key: SK.munich, name: "Munich", country: "Germany", countryCode: "de", lat: 48.1351, lng: 11.582, timezone: "Europe/Berlin", arriveDate: "2026-12-06", departDate: "2026-12-10", chapterKey: CK.central, sortOrder: 1 },
  { key: SK.strasbourg, name: "Strasbourg", country: "France", countryCode: "fr", lat: 48.5734, lng: 7.7521, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-13", chapterKey: CK.central, sortOrder: 2 },
  { key: SK.frankfurt, name: "Frankfurt", country: "Germany", countryCode: "de", lat: 50.1109, lng: 8.6821, timezone: "Europe/Berlin", arriveDate: "2026-12-13", departDate: "2026-12-15", chapterKey: CK.central, sortOrder: 3 },
  { key: SK.paris, name: "Paris", country: "France", countryCode: "fr", lat: 48.8566, lng: 2.3522, timezone: "Europe/Paris", arriveDate: "2026-12-15", departDate: "2026-12-19", chapterKey: CK.central, sortOrder: 4 },
  { key: SK.london, name: "London", country: "United Kingdom", countryCode: "gb", lat: 51.5074, lng: -0.1278, timezone: "Europe/London", arriveDate: "2026-12-19", departDate: "2026-12-22", chapterKey: CK.ukIreland, sortOrder: 5 },
  { key: SK.belfast, name: "Belfast", country: "United Kingdom", countryCode: "gb", lat: 54.5973, lng: -5.9301, timezone: "Europe/London", arriveDate: "2026-12-22", departDate: "2026-12-29", chapterKey: CK.ukIreland, sortOrder: 6, notes: "Christmas in Belfast." },
  { key: SK.dublin, name: "Dublin", country: "Ireland", countryCode: "ie", lat: 53.3498, lng: -6.2603, timezone: "Europe/Dublin", arriveDate: "2026-12-29", departDate: "2026-12-30", chapterKey: CK.ukIreland, sortOrder: 7 },
  { key: SK.milan, name: "Milan", country: "Italy", countryCode: "it", lat: 45.4642, lng: 9.19, timezone: "Europe/Rome", arriveDate: "2026-12-30", departDate: "2027-01-02", chapterKey: CK.italy, sortOrder: 8, notes: "New Year's Eve in Milan." },
  { key: SK.rome, name: "Rome", country: "Italy", countryCode: "it", lat: 41.9028, lng: 12.4964, timezone: "Europe/Rome", arriveDate: "2027-01-02", departDate: "2027-01-07", chapterKey: CK.italy, sortOrder: 9 },
];

// --- chapters --------------------------------------------------------------

const CHAPTERS: DemoChapter[] = [
  { key: CK.bali, name: "Bali stopover", colour: "amber", startDate: "2026-12-04", endDate: "2026-12-05", sortOrder: 0 },
  { key: CK.central, name: "Central Europe", colour: "sky", startDate: "2026-12-06", endDate: "2026-12-19", sortOrder: 1 },
  { key: CK.ukIreland, name: "UK & Ireland", colour: "violet", startDate: "2026-12-19", endDate: "2026-12-30", sortOrder: 2 },
  { key: CK.italy, name: "Italy", colour: "rose", startDate: "2026-12-30", endDate: "2027-01-07", sortOrder: 3 },
];

// --- transports (11) -------------------------------------------------------

const TRANSPORTS: DemoTransport[] = [
  { key: "xmas26:tr:ool-dps", mode: "FLIGHT", fromStopKey: null, toStopKey: SK.bali, depIsHome: true, depPlace: "Gold Coast (OOL)", depAt: "2026-12-04T07:50:00Z", arrPlace: "Denpasar (DPS)", arrAt: "2026-12-04T14:00:00Z", notes: "Virgin Australia — flight number & booking reference TBC. Times approximate.", sortOrder: 0 },
  { key: "xmas26:tr:dps-muc", mode: "FLIGHT", fromStopKey: SK.bali, toStopKey: SK.munich, depPlace: "Denpasar (DPS)", depAt: "2026-12-05T11:00:00Z", arrPlace: "Munich (MUC)", arrAt: "2026-12-06T05:00:00Z", reference: "TG440 · DHZU24", notes: "Thai Airways, Economy. Booking ref DHZU24. Checked-baggage allowance/cost TBC. Arrival time approximate (overnight).", sortOrder: 1 },
  { key: "xmas26:tr:muc-xwg", mode: "TRAIN", fromStopKey: SK.munich, toStopKey: SK.strasbourg, depPlace: "Munich Hbf", depAt: "2026-12-10T05:51:00Z", arrPlace: "Strasbourg", arrAt: "2026-12-10T09:30:00Z", reference: "TGV", notes: "1st class · You + Xanthia.", sortOrder: 2, cost: { estimatedMinor: 23521, actualMinor: 23521, currency: "AUD", paid: true } },
  { key: "xmas26:tr:xwg-fra", mode: "TRAIN", fromStopKey: SK.strasbourg, toStopKey: SK.frankfurt, depPlace: "Strasbourg", depAt: "2026-12-13T10:00:00Z", arrPlace: "Frankfurt (Hbf)", arrAt: "2026-12-13T12:00:00Z", notes: "Not booked yet — placeholder time.", sortOrder: 3 },
  { key: "xmas26:tr:fra-par", mode: "TRAIN", fromStopKey: SK.frankfurt, toStopKey: SK.paris, depPlace: "Frankfurt (Hbf)", depAt: "2026-12-15T10:00:00Z", arrPlace: "Paris (Gare de l'Est)", arrAt: "2026-12-15T14:00:00Z", notes: "Not booked yet — placeholder time.", sortOrder: 4 },
  { key: "xmas26:tr:par-lon", mode: "TRAIN", fromStopKey: SK.paris, toStopKey: SK.london, depPlace: "Paris Gare du Nord", depAt: "2026-12-19T07:02:00Z", arrPlace: "London St Pancras", arrAt: "2026-12-19T09:18:00Z", reference: "Eurostar Plus", notes: "Coach 15, seats 53 & 54. Arrive 120 min early; gates close 30 min before departure. You + Xanthia.", sortOrder: 5, cost: { estimatedMinor: 41438, actualMinor: 41438, currency: "AUD", paid: true } },
  { key: "xmas26:tr:lon-bfs", mode: "FLIGHT", fromStopKey: SK.london, toStopKey: SK.belfast, depPlace: "London Heathrow (LHR)", depAt: "2026-12-22T09:15:00Z", arrPlace: "Belfast City (BHD)", arrAt: "2026-12-22T10:40:00Z", reference: "BA1394 · XHARUZ", notes: "British Airways, Economy. Booking ref XHARUZ.", sortOrder: 6 },
  { key: "xmas26:tr:bfs-dub", mode: "TRAIN", fromStopKey: SK.belfast, toStopKey: SK.dublin, depPlace: "Belfast (Lanyon Place)", depAt: "2026-12-29T11:00:00Z", arrPlace: "Dublin (Connolly)", arrAt: "2026-12-29T13:15:00Z", notes: "Not booked yet — bus/train/drive TBD; placeholder time (Enterprise ~2h15).", sortOrder: 7 },
  { key: "xmas26:tr:dub-mxp", mode: "FLIGHT", fromStopKey: SK.dublin, toStopKey: SK.milan, depPlace: "Dublin (DUB)", depAt: "2026-12-30T08:15:00Z", arrPlace: "Milan Malpensa (MXP)", arrAt: "2026-12-30T10:45:00Z", reference: "FR7799 · H4WP7Q", notes: "Ryanair. Booking ref H4WP7Q. Digital boarding pass via the Ryanair app only — no printed passes.", sortOrder: 8 },
  { key: "xmas26:tr:mil-rom", mode: "TRAIN", fromStopKey: SK.milan, toStopKey: SK.rome, depPlace: "Milano Centrale", depAt: "2027-01-02T09:00:00Z", arrPlace: "Roma Termini", arrAt: "2027-01-02T12:00:00Z", notes: "Not booked yet — high-speed (Frecciarossa ~3h); placeholder time.", sortOrder: 9 },
  { key: "xmas26:tr:rom-bne", mode: "FLIGHT", fromStopKey: SK.rome, toStopKey: null, arrIsHome: true, depPlace: "Rome (FCO)", depAt: "2027-01-07T14:15:00Z", arrPlace: "Brisbane (BNE)", arrAt: "2027-01-08T09:30:00Z", reference: "Qatar · via Doha · 8QPEWK", notes: "Rome → Doha → Brisbane. PNR 8QPEWK. Lands Brisbane — ~1h drive home to the Gold Coast. Times approximate.", sortOrder: 10, cost: { estimatedMinor: 186752, actualMinor: 186752, currency: "EUR", paid: true } },
];

// --- items (1) -------------------------------------------------------------

const ITEMS: DemoItem[] = [
  {
    key: "xmas26:item:neuschwanstein",
    title: "Day trip to Neuschwanstein Castle",
    category: "SIGHTSEEING",
    stopKey: SK.munich,
    date: null,
    lat: 47.5576,
    lng: 10.7498,
    link: "https://www.neuschwanstein.de",
    notes: "The fairytale castle near Füssen — ~2h each way from Munich. Book timed-entry tickets well in advance; winter slots sell out.",
    votes: [{ user: "you", level: "MUST" }],
    sortOrder: 0,
  },
];

// --- pre-trip checklist (20) -----------------------------------------------

const CHECKLIST: DemoChecklistItem[] = [
  { kind: "PRETRIP", text: "Book accommodation — Bali (1 night)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Munich (4 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Strasbourg (3 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Frankfurt (2 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Paris (4 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — London (3 nights)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Belfast (7 nights) — over Christmas, book early", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Dublin (1 night)", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Milan (3 nights) — NYE, book early", done: false },
  { kind: "PRETRIP", text: "Book accommodation — Rome (5 nights)", done: false },
  { kind: "PRETRIP", text: "Confirm Gold Coast → Denpasar flight (Virgin) — save flight number + booking ref", done: false },
  { kind: "PRETRIP", text: "Book Strasbourg → Frankfurt train", done: false },
  { kind: "PRETRIP", text: "Book Frankfurt → Paris train", done: false },
  { kind: "PRETRIP", text: "Decide & book Belfast → Dublin transfer (Dec 29)", done: false },
  { kind: "PRETRIP", text: "Book Milan → Rome high-speed train", done: false },
  { kind: "PRETRIP", text: "Book Neuschwanstein Castle timed-entry tickets (in advance)", done: false },
  { kind: "PRETRIP", text: "Travel insurance", done: false },
  { kind: "PRETRIP", text: "Passport valid 6+ months; visas (Indonesia VoA, UK, Schengen)", done: false },
  { kind: "PRETRIP", text: "Confirm TG440 checked-baggage allowance/cost", done: false },
  { kind: "PRETRIP", text: "Download Ryanair app for digital boarding pass (Dublin → Milan)", done: false },
];

// --- builder ---------------------------------------------------------------

export function buildChristmasEurope2026(): DemoTrip {
  return {
    key: "xmas26:trip",
    name: "Christmas in Europe 2026",
    createdBy: "you",
    startDate: "2026-12-04",
    endDate: "2027-01-08",
    homeCurrency: "AUD",
    home: { name: "Gold Coast", lat: -28.0167, lng: 153.4, countryCode: "au" },
    roundTrip: true,
    coverGradient: ["#0c2461", "#b71540"],
    exchangeRates: [
      { base: "EUR", quote: "AUD", rate: 1.65, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
      { base: "GBP", quote: "AUD", rate: 1.95, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
      { base: "IDR", quote: "AUD", rate: 0.0001, manual: false, fetchedAt: "2026-07-26T00:00:00Z" },
    ],
    stops: STOPS,
    chapters: CHAPTERS,
    transports: TRANSPORTS,
    accommodations: [],
    items: ITEMS,
    costs: [],
    checklist: CHECKLIST,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: PASS — all assertions green (12 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint lib/real-trip`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/real-trip/christmas-europe-2026.ts lib/real-trip/christmas-europe-2026.test.ts
git commit -m "feat(real-trip): add Christmas in Europe 2026 pure builder + tests"
```

---

### Task 2: Real-trip persist layer

**Files:**
- Create: `prisma/real/persist.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`; `getStorage`, `generateKey` from `@/lib/storage`; `gradientPng` from `@/lib/demo/cover-image`; `DemoTrip`, `Who` from `@/lib/demo/types`; `User` from `@prisma/client`.
- Produces:
  - `export const REAL_TRIP_NAME: string`
  - `export const REAL_USER: { email: string; name: string }`
  - `export async function ensureRealUser(): Promise<User>`
  - `export async function wipeRealTrip(): Promise<void>`
  - `export async function persistRealTrip(trip: DemoTrip, user: User): Promise<void>`

  These are consumed by `prisma/seed-real.ts` (Task 3).

**Note:** No unit test — DB-integration code follows the repo's established pattern (see `prisma/demo/persist.ts` header): verified by `tsc --noEmit` + `eslint`, exercised by the seed run (Task 3 / manual). Do not invent a Prisma mock.

- [ ] **Step 1: Write the persist module**

Create `prisma/real/persist.ts`:

```ts
/**
 * Persister for the real "Christmas in Europe 2026" trip.
 *
 * A focused subset of prisma/demo/persist.ts: one trip, one owner member, no
 * forks / globe / partner. Reuses the demo storage + cover helpers and the
 * DemoTrip data types. Idempotent: wipeRealTrip() deletes any prior trip with
 * the same name (and its attachment blobs) before re-persisting.
 *
 * Verified by `tsc --noEmit` and `eslint`; exercised by prisma/seed-real.ts.
 */

import { db } from "@/lib/db";
import { getStorage, generateKey } from "@/lib/storage";
import { gradientPng } from "@/lib/demo/cover-image";
import type { DemoTrip, Who } from "@/lib/demo/types";
import type { User } from "@prisma/client";

export const REAL_TRIP_NAME = "Christmas in Europe 2026";
export const REAL_USER = { email: "cameron.williams@hismileteeth.com", name: "Cam" };

/** Upsert the real trip owner by email. */
export async function ensureRealUser(): Promise<User> {
  return db.user.upsert({
    where: { email: REAL_USER.email },
    update: { name: REAL_USER.name },
    create: { email: REAL_USER.email, name: REAL_USER.name },
  });
}

/**
 * Idempotent teardown: delete every trip named REAL_TRIP_NAME (deleting its
 * attachment blobs first so no orphaned storage objects remain). Safe on a
 * fresh DB — the lookup returns [] so nothing is deleted.
 */
export async function wipeRealTrip(): Promise<void> {
  const storage = getStorage();
  const trips = await db.trip.findMany({ where: { name: REAL_TRIP_NAME }, select: { id: true } });
  for (const t of trips) {
    const atts = await db.attachment.findMany({
      where: { tripId: t.id, storageKey: { not: null } },
      select: { storageKey: true },
    });
    for (const a of atts) if (a.storageKey) await storage.delete(a.storageKey);
    await db.trip.delete({ where: { id: t.id } });
  }
}

/**
 * Persist a DemoTrip under a single owner member. Handles the full DemoPlan
 * shape (chapters, stops, transports+costs, accommodations+costs, items+votes+
 * costs, standalone costs) plus exchange rates, cover gradient and the pre-trip
 * checklist. No forks. `Who` always resolves to the single real user.
 */
export async function persistRealTrip(trip: DemoTrip, user: User): Promise<void> {
  const storage = getStorage();
  const who = (_w: Who): string => user.id; // single-user trip: you === partner === owner
  const id = new Map<string, string>();

  // --- Trip + owner member ---
  const dbTrip = await db.trip.create({
    data: {
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      hardEndDate: trip.hardEndDate ?? null,
      homeCurrency: trip.homeCurrency,
      homeName: trip.home?.name ?? null,
      homeLat: trip.home?.lat ?? null,
      homeLng: trip.home?.lng ?? null,
      homeCountryCode: trip.home?.countryCode ?? null,
      roundTrip: trip.roundTrip ?? true,
      createdById: user.id,
      members: { create: [{ userId: user.id, role: "owner" }] },
    },
  });
  const tripId = dbTrip.id;
  id.set(trip.key, tripId);

  // --- Cover gradient ---
  if (trip.coverGradient) {
    const [top, bottom] = trip.coverGradient;
    const png = gradientPng(top, bottom);
    const coverKey = generateKey({ trip: tripId }, crypto.randomUUID(), "cover.png");
    await storage.save(coverKey, png, "image/png");
    await db.trip.update({ where: { id: tripId }, data: { coverImageKey: coverKey } });
  }

  // --- Exchange rates + rate lookup ---
  const rateMap = new Map<string, number>();
  for (const er of trip.exchangeRates ?? []) {
    await db.exchangeRate.create({
      data: { tripId, base: er.base, quote: er.quote, rate: er.rate, manual: er.manual, fetchedAt: new Date(er.fetchedAt) },
    });
    rateMap.set(er.base, er.rate);
  }
  const rateToHome = (currency: string): number | null =>
    currency === trip.homeCurrency ? null : (rateMap.get(currency) ?? null);
  const paidAt = (paid: boolean | undefined): Date | null => (paid ? new Date() : null);

  // --- Chapters ---
  for (const ch of trip.chapters) {
    const dbCh = await db.chapter.create({
      data: { tripId, name: ch.name, colour: ch.colour, startDate: ch.startDate ?? null, endDate: ch.endDate ?? null, sortOrder: ch.sortOrder },
    });
    id.set(ch.key, dbCh.id);
  }

  // --- Stops ---
  for (const s of trip.stops) {
    const chapterId = s.chapterKey ? (id.get(s.chapterKey) ?? null) : null;
    const dbStop = await db.stop.create({
      data: {
        tripId, name: s.name, country: s.country ?? null, countryCode: s.countryCode ?? null,
        lat: s.lat ?? null, lng: s.lng ?? null, timezone: s.timezone ?? null,
        arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null, nights: s.nights ?? null,
        sortOrder: s.sortOrder, pinned: s.pinned ?? false, chapterId,
        chapterSortOrder: s.chapterSortOrder ?? 0, notes: s.notes ?? null,
      },
    });
    id.set(s.key, dbStop.id);
  }

  // --- Transports (+ costs) ---
  for (const t of trip.transports) {
    const dbT = await db.transport.create({
      data: {
        tripId,
        fromStopId: t.fromStopKey ? (id.get(t.fromStopKey) ?? null) : null,
        toStopId: t.toStopKey ? (id.get(t.toStopKey) ?? null) : null,
        depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false,
        mode: t.mode, depPlace: t.depPlace ?? null, depAt: t.depAt ? new Date(t.depAt) : null,
        arrPlace: t.arrPlace ?? null, arrAt: t.arrAt ? new Date(t.arrAt) : null,
        depLat: t.depLat ?? null, depLng: t.depLng ?? null, arrLat: t.arrLat ?? null, arrLng: t.arrLng ?? null,
        reference: t.reference ?? null, notes: t.notes ?? null, sortOrder: t.sortOrder,
      },
    });
    id.set(t.key, dbT.id);
    if (t.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "TRANSPORT", ownerId: dbT.id,
          estimatedMinor: t.cost.estimatedMinor, actualMinor: t.cost.actualMinor ?? null,
          currency: t.cost.currency, rateToHome: rateToHome(t.cost.currency),
          paidAt: paidAt(t.cost.paid), category: t.cost.category ?? null,
        },
      });
    }
  }

  // --- Accommodations (+ costs) ---
  for (const a of trip.accommodations) {
    const stopId = id.get(a.stopKey);
    if (!stopId) continue;
    const dbA = await db.accommodation.create({
      data: {
        tripId, stopId, name: a.name, address: a.address ?? null,
        checkIn: a.checkIn, checkOut: a.checkOut, confirmation: a.confirmation ?? null,
        notes: a.notes ?? null, lat: a.lat ?? null, lng: a.lng ?? null,
      },
    });
    id.set(a.key, dbA.id);
    if (a.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "ACCOMMODATION", ownerId: dbA.id,
          estimatedMinor: a.cost.estimatedMinor, actualMinor: a.cost.actualMinor ?? null,
          currency: a.cost.currency, rateToHome: rateToHome(a.cost.currency),
          paidAt: paidAt(a.cost.paid), category: a.cost.category ?? null,
        },
      });
    }
  }

  // --- Items (+ costs + votes) ---
  for (const it of trip.items) {
    const stopId = it.stopKey ? (id.get(it.stopKey) ?? null) : null;
    const dbItem = await db.item.create({
      data: {
        tripId, stopId, title: it.title, category: it.category, date: it.date ?? null,
        startTime: it.startTime ?? null, endTime: it.endTime ?? null,
        lat: it.lat ?? null, lng: it.lng ?? null, address: it.address ?? null,
        link: it.link ?? null, booking: it.booking ?? null, notes: it.notes ?? null,
        sortOrder: it.sortOrder ?? 0,
      },
    });
    id.set(it.key, dbItem.id);
    if (it.cost) {
      await db.cost.create({
        data: {
          tripId, ownerType: "ITEM", ownerId: dbItem.id,
          estimatedMinor: it.cost.estimatedMinor, actualMinor: it.cost.actualMinor ?? null,
          currency: it.cost.currency, rateToHome: rateToHome(it.cost.currency),
          paidAt: paidAt(it.cost.paid), category: it.cost.category ?? null,
        },
      });
    }
    for (const v of it.votes ?? []) {
      await db.vote.create({ data: { tripId, itemId: dbItem.id, userId: who(v.user), level: v.level } });
    }
  }

  // --- Standalone (OTHER) costs ---
  for (const c of trip.costs) {
    const ownerId = c.ownerType === "OTHER" ? null : c.ownerKey ? (id.get(c.ownerKey) ?? null) : null;
    await db.cost.create({
      data: {
        tripId, ownerType: c.ownerType, ownerId,
        estimatedMinor: c.estimatedMinor, actualMinor: c.actualMinor ?? null,
        currency: c.currency, rateToHome: rateToHome(c.currency),
        paidAt: paidAt(c.paid), label: c.label ?? null, category: c.category ?? null,
      },
    });
  }

  // --- Pre-trip checklist ---
  let clSort = 0;
  for (const c of trip.checklist ?? []) {
    await db.checklistItem.create({
      data: {
        tripId, kind: c.kind, text: c.text, done: c.done,
        dueDate: c.dueDate ?? null, assignedToId: c.assignedTo ? who(c.assignedTo) : null,
        sortOrder: clSort++,
      },
    });
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint prisma/real`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/real/persist.ts
git commit -m "feat(real-trip): add single-owner persist layer for the real trip"
```

---

### Task 3: Seed entrypoint + npm script

**Files:**
- Create: `prisma/seed-real.ts`
- Modify: `package.json` (add `db:seed:real` script)

**Interfaces:**
- Consumes: `db` from `../lib/db`; `buildChristmasEurope2026` from `../lib/real-trip/christmas-europe-2026` (Task 1); `ensureRealUser`, `wipeRealTrip`, `persistRealTrip` from `./real/persist` (Task 2).
- Produces: `export async function seedReal(): Promise<void>`; the `npm run db:seed:real` command.

- [ ] **Step 1: Write the seed entrypoint**

Create `prisma/seed-real.ts` (mirrors `prisma/seed-demo.ts`'s main-guard pattern):

```ts
import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { buildChristmasEurope2026 } from "../lib/real-trip/christmas-europe-2026";
import { ensureRealUser, wipeRealTrip, persistRealTrip } from "./real/persist";

/**
 * Seeds Cameron & Xanthia's real "Christmas in Europe 2026" trip into the local
 * Postgres under Cameron's account. Idempotent: wipeRealTrip() clears any prior
 * trip of the same name before recreating.
 *
 *   Run with:  npm run db:seed:real   (needs a running Postgres)
 */
export async function seedReal(): Promise<void> {
  const trip = buildChristmasEurope2026();
  const user = await ensureRealUser();
  await wipeRealTrip();
  await persistRealTrip(trip, user);
  console.log(
    `\n✅ Seeded "${trip.name}" — ${trip.stops.length} stops, ${trip.transports.length} transports, ${trip.checklist?.length ?? 0} checklist items — for ${user.email}.\n`,
  );
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedReal()
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` immediately after the `"db:seed:demo:prod"` line:

```json
    "db:seed:real": "tsx prisma/seed-real.ts",
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint prisma`
Expected: no errors.

- [ ] **Step 4: Confirm the full builder test suite still passes**

Run: `npx vitest run lib/real-trip`
Expected: PASS.

- [ ] **Step 5: Attempt the seed (documents the DB requirement)**

Run: `npm run db:seed:real`
Expected in THIS environment: fails at connection (`ECONNREFUSED 127.0.0.1:5432`) because no Postgres is running — this is expected and confirms the wiring reaches the DB layer. In the user's real dev environment (with `docker compose up -d` + migrations applied), it prints the `✅ Seeded "Christmas in Europe 2026" …` line. **Do not treat the connection error here as a task failure** — the deliverable is the compiling, lint-clean, test-covered seed; the live run is the user's manual step.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed-real.ts package.json
git commit -m "feat(real-trip): add db:seed:real entrypoint + npm script"
```

---

## How to run it for real (user's environment)

```bash
docker compose up -d                 # start local Postgres 16
npx prisma migrate deploy            # ensure schema is applied
npm run db:seed:real                 # seed the trip under your account
npm run dev                          # open the app, sign in as cameron.williams@hismileteeth.com
```

Re-running `npm run db:seed:real` is safe — it wipes and rebuilds the trip by name.

## Self-Review

**Spec coverage:** mechanism (builder+seed, local, your account) → Tasks 1–3; travellers (you owner, partner later) → single owner member in persist (Task 2); route/dates/10 stops → STOPS (Task 1); 4 chapters → CHAPTERS (Task 1); 11 transports incl. booked refs + placeholders + home legs → TRANSPORTS (Task 1); accommodation none → `accommodations: []`; Neuschwanstein activity → ITEMS (Task 1); budget actuals-only + FX → 3 transport costs + exchangeRates (Task 1), applied in persist (Task 2); checklist → CHECKLIST (Task 1); cover gradient → `coverGradient` + persist; share/calendar/globe/journal off → simply omitted. All covered.

**Placeholder scan:** No TBD/TODO/"implement later"/"add error handling" left; every code step contains complete file content. "Not booked yet — placeholder time" strings are intentional trip data, not plan placeholders.

**Type consistency:** `buildChristmasEurope2026` name identical across Tasks 1 & 3. Persist exports (`REAL_TRIP_NAME`, `REAL_USER`, `ensureRealUser`, `wipeRealTrip`, `persistRealTrip`) identical across Tasks 2 & 3. All builder data typed against `@/lib/demo/types` exports (`DemoTrip`/`DemoStop`/`DemoChapter`/`DemoTransport`/`DemoItem`/`DemoChecklistItem`), matching the persist's `DemoTrip` param. `hasOutboundLeg`/`hasReturnLeg` used with the exact `{depIsHome,arrIsHome,toStopId,fromStopId}` leg shape from `lib/home-base.ts`.
