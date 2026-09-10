# Christmas in Europe 2026 — Trip Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Cam's real Christmas 2026 Europe trip as a correct, complete, committed data builder, and persist it to production as a **new** Trip beside the existing broken "THE Trip".

**Architecture:** The trip is expressed as a pure `DemoTrip` descriptor in `lib/real-trip/christmas-europe-2026.ts` — no Prisma, no network, no clock. A unit test asserts date continuity, booking alignment and cost integrity without a database (there is no local Postgres in this environment, so all pre-flight verification must be pure). `prisma/real/persist.ts` writes the descriptor additively, refusing to run if a trip of the same name already exists. A pure `summariseRealTrip()` renders the dry-run printout from the same descriptor the writer consumes.

**Tech Stack:** TypeScript, Prisma 7 (Postgres/Neon), Vitest, tsx.

## Global Constraints

- **Nothing may be deleted.** No `delete`, no `deleteMany`, no wipe. The write is purely additive.
- **Never run `wipeRealTrip()` against production.** It deletes every trip matching `REAL_TRIP_NAME`.
- **Do not write to production during implementation.** The prod write is a gated manual step after Cam approves the dry-run. Tasks 1–6 must not open a write transaction against Neon.
- **Times are local wall-clock stored as `Z`.** `08:55` at Rome means `2027-01-07T08:55:00Z`. Never convert to real UTC — every existing row in this trip uses this convention.
- **Dates are `"YYYY-MM-DD"` strings.** Money is `Int` minor units. Lat/lng are `Float`.
- **Builders stay pure.** No `Date.now()`, no `new Date()` without an argument, no network calls in `lib/real-trip/`.
- **Country codes lowercase ISO 3166-1 alpha-2.** Currencies uppercase ISO 4217.
- **Chapters stay off.** Do not create `Chapter` rows; `chaptersEnabled` defaults to `false`.
- Run `npx tsc --noEmit` and `npx eslint` before each commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/demo/types.ts` | MODIFY — `DemoInlineCost` gains an optional `paidAt` so real payment dates survive persistence |
| `lib/real-trip/christmas-europe-2026.ts` | REWRITE — the corrected trip descriptor + `summariseRealTrip()` |
| `lib/real-trip/christmas-europe-2026.test.ts` | REWRITE — continuity, alignment and cost-integrity assertions |
| `prisma/real/persist.ts` | MODIFY — additive write, duplicate guard, real `paidAt`, lazy storage |
| `prisma/real/persist.test.ts` | CREATE — pure tests for the extracted helpers |
| `prisma/seed-real.ts` | MODIFY — `--dry-run` flag |
| `package.json` | MODIFY — `db:seed:real:dry` script |
| `docs/adr/0042-real-trips-generated-from-committed-builders.md` | CREATE |

## The Data (authoritative — copy exactly)

### Trip envelope
name `Christmas in Europe 2026` · start `2026-12-04` · end `2027-01-08` · hardEnd `null` · currency `AUD` · home `Gold Coast` / `-28.0023731` / `153.4145987` / `au` · roundTrip `true` · chapters `[]`
Exchange rate: `{ base: "EUR", quote: "AUD", rate: 1.63, manual: true, fetchedAt: "2026-09-10T00:00:00.000Z" }`

### Stops (11)

| sort | key suffix | name | country | cc | arrive | depart | nights | tz | lat | lng |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | denpasar | Denpasar | Indonesia | id | 2026-12-04 | 2026-12-05 | 1 | Asia/Makassar | -8.6653349 | 115.2176191 |
| 1 | munich | Munich | Germany | de | 2026-12-06 | 2026-12-10 | 4 | Europe/Berlin | 48.1371079 | 11.5753822 |
| 2 | strasbourg | Strasbourg | France | fr | 2026-12-10 | 2026-12-13 | 3 | Europe/Paris | 48.584614 | 7.7507127 |
| 3 | frankfurt | Frankfurt | Germany | de | 2026-12-13 | 2026-12-15 | 2 | Europe/Berlin | 50.1106444 | 8.6820917 |
| 4 | paris | Paris | France | fr | 2026-12-15 | 2026-12-19 | 4 | Europe/Paris | 48.8588897 | 2.320041 |
| 5 | london | London | United Kingdom | gb | 2026-12-19 | 2026-12-22 | 3 | Europe/London | 51.5074456 | -0.1277653 |
| 6 | aghalee | Aghalee | United Kingdom | gb | 2026-12-22 | 2026-12-29 | 7 | Europe/London | 54.5057 | -6.3183 |
| 7 | dublin | Dublin | Ireland | ie | 2026-12-29 | 2026-12-30 | 1 | Europe/Dublin | 53.3493795 | -6.2605593 |
| 8 | como | Como | Italy | it | 2026-12-30 | 2027-01-01 | 2 | Europe/Rome | 45.9395857 | 9.1493609 |
| 9 | milan | Milan | Italy | it | 2027-01-01 | 2027-01-02 | 1 | Europe/Rome | 45.4641943 | 9.1896346 |
| 10 | rome | Rome | Italy | it | 2027-01-02 | 2027-01-07 | 5 | Europe/Rome | 41.8933203 | 12.4829321 |

Aghalee's coordinates are approximate (village centre); everything else is carried over from existing geocoded rows.

### Accommodations (11) — every stop has exactly one

| stop | name | in | out | confirmation | cost (minor) | cur | paid |
|---|---|---|---|---|---|---|---|
| denpasar | 1 Bedroom private pool @Kuta | 2026-12-04 | 2026-12-05 | HM2EDZ4CB5 | 11520 | AUD | no |
| munich | B&B Hotel München-Hbf | 2026-12-06 | 2026-12-10 | 5201106083 | 80609 | AUD | no |
| strasbourg | B&B Hotel Kehl | 2026-12-10 | 2026-12-13 | 6031790255 PIN:4046 | 81000 | AUD | no |
| frankfurt | Premier Inn Frankfurt City Europaviertel | 2026-12-13 | 2026-12-15 | 6925281379, PIN:8192 | 18700 | AUD | no |
| paris | Villa Margaux Opéra Montmartre | 2026-12-15 | 2026-12-19 | 5887236633, PIN:7856 | 91652 | AUD | no |
| london | Zedwell Underground Hotel Tottenham Court Rd | 2026-12-19 | 2026-12-22 | 5012646116, PIN:8416 | 54535 | AUD | no |
| aghalee | Clenaghans | 2026-12-22 | 2026-12-29 | HM855WTW9F | 130417 | AUD | no |
| dublin | Point A Dublin The Liberties | 2026-12-29 | 2026-12-30 | HMKSN99TRQ | 15642 | AUD | **yes, 2026-08-11** |
| como | attico capicci | 2026-12-30 | 2027-01-01 | HMXAXCW8QE | 116873 | AUD | no |
| milan | Ibis Milano Centro | 2027-01-01 | 2027-01-02 | 5622902959, PIN:1094 | 16900 | AUD | no |
| rome | The Club Navona | 2027-01-02 | 2027-01-07 | 6243212144 (PIN: 4820) | 53610 | **EUR** | no |

Addresses and notes are given verbatim in Task 3.

### Transports (13)

| sort | from → to | mode | depPlace / depAt | arrPlace / arrAt | ref | cost |
|---|---|---|---|---|---|---|
| 0 | HOME → denpasar | FLIGHT | Gold Coast (OOL) / 2026-12-04T17:50:00Z | Denpasar (DPS) / 2026-12-04T22:15:00Z | WNIQHG | 89559 AUD paid 2026-07-13 |
| 1 | denpasar → munich | FLIGHT | Denpasar (DPS) / 2026-12-05T19:00:00Z | Munich (MUC) / **2026-12-06T06:45:00Z** | DHZU24 | 163569 AUD paid 2026-07-19 |
| 2 | munich → strasbourg | TRAIN | Munich Hbf / 2026-12-10T06:51:00Z | Strasbourg / 2026-12-10T10:40:00Z | 300186503818 | 23521 AUD paid 2026-07-26 |
| 3 | strasbourg → frankfurt | TRAIN | — (unbooked) | — | — | — |
| 4 | frankfurt → paris | TRAIN | — (unbooked) | — | — | — |
| 5 | paris → london | TRAIN | Paris Gare du Nord / 2026-12-19T08:02:00Z | London St Pancras / 2026-12-19T09:30:00Z | WXFVKQ | 41438 AUD paid 2026-07-26 |
| 6 | london → aghalee | FLIGHT | London Heathrow (LHR) / 2026-12-22T09:15:00Z | Belfast City (BHD) / 2026-12-22T10:40:00Z | XHARUZ | — |
| 7 | aghalee → dublin | TRAIN | — (unbooked) | — | — | — |
| 8 | dublin → como | FLIGHT | Dublin (DUB) / 2026-12-30T08:15:00Z | Milan Malpensa (MXP) / 2026-12-30T11:45:00Z | FR7799 · H4WP7Q | 35862 **EUR** paid, **date unknown** |
| 9 | *(none)* → como | TRAIN | Milan Malpensa (MXP) / — | Como / — | — | — |
| 10 | como → milan | TRAIN | — (unbooked) | — | — | — |
| 11 | milan → rome | TRAIN | — (unbooked) | — | — | — |
| 12 | rome → HOME | FLIGHT | Rome (FCO) / 2027-01-07T08:55:00Z | Brisbane (BNE) / 2027-01-08T17:30:00Z | 8QPEWK | — |

Transport 9 is deliberately **between-legs travel**: `fromStopKey: null`, `toStopKey: como`. Per CONTEXT.md a leg with an unset endpoint stays out of the date engine.

### Standalone cost (1)
`{ ownerType: "OTHER", label: "Rome city tax", costMinor: 7000, currency: "EUR", paid: false }` — €7 pp per night × 5 nights × 2, cash on arrival, excluded from the room rate.

**Totals for assertion:** 17 costs (5 transport + 11 accommodation + 1 other) · AUD cost sum `935935` · EUR cost sum `96472`.

---

### Task 1: Cost descriptors carry their real payment date

`persistRealTrip` currently stamps `paidAt: new Date()` for anything paid, so all four known payment dates would be overwritten with the run date — and the seed would be non-deterministic. Give the descriptor an optional `paidAt` and honour it.

**Files:**
- Modify: `lib/demo/types.ts` (the `DemoInlineCost` union)
- Modify: `prisma/real/persist.ts` (extract + use `resolvePaidAt`)
- Test: `prisma/real/persist.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DemoInlineCost` paid variant gains `paidAt?: string | null`. Exported pure helper `resolvePaidAt(cost: { paid?: boolean; paidAt?: string | null } | null | undefined, fallback: Date): Date | null`.

- [ ] **Step 1: Write the failing test**

Create `prisma/real/persist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePaidAt } from "./persist";

const FALLBACK = new Date("2026-09-10T00:00:00.000Z");

describe("resolvePaidAt", () => {
  it("returns null for an unpaid cost", () => {
    expect(resolvePaidAt({ paid: false }, FALLBACK)).toBeNull();
  });

  it("returns null for a missing cost", () => {
    expect(resolvePaidAt(undefined, FALLBACK)).toBeNull();
    expect(resolvePaidAt(null, FALLBACK)).toBeNull();
  });

  it("uses the recorded payment date when the cost has one", () => {
    const got = resolvePaidAt({ paid: true, paidAt: "2026-07-13" }, FALLBACK);
    expect(got).toEqual(new Date("2026-07-13"));
  });

  it("falls back when a paid cost has no recorded date", () => {
    expect(resolvePaidAt({ paid: true }, FALLBACK)).toEqual(FALLBACK);
    expect(resolvePaidAt({ paid: true, paidAt: null }, FALLBACK)).toEqual(FALLBACK);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/real/persist.test.ts`
Expected: FAIL — `resolvePaidAt` is not exported from `./persist`.

- [ ] **Step 3: Add `paidAt` to the cost descriptor**

In `lib/demo/types.ts`, add `paidAt` to the paid arm of `DemoInlineCost` only (an unpaid cost has no payment date):

```ts
export type DemoInlineCost =
  | { costMinor: number; currency: string; category?: string | null; paid?: false; paidMinor?: number | null }
  | { costMinor: number; currency: string; category?: string | null; paid: true; paidMinor: number; paidAt?: string | null };
```

- [ ] **Step 4: Extract and export the helper in `prisma/real/persist.ts`**

Replace the existing inline `paidAt` arrow:

```ts
const paidAt = (paid: boolean | undefined): Date | null => (paid ? new Date() : null);
```

with an exported pure helper near the top of the module:

```ts
/**
 * The date a Cost's money actually left the account. A paid Cost must carry a
 * date (see CONTEXT.md "Paid"), so when the descriptor doesn't record one we
 * fall back to a caller-supplied instant rather than inventing `now` inside
 * the persister — that kept the seed non-deterministic and silently discarded
 * real payment dates.
 */
export function resolvePaidAt(
  cost: { paid?: boolean; paidAt?: string | null } | null | undefined,
  fallback: Date,
): Date | null {
  if (!cost?.paid) return null;
  return cost.paidAt ? new Date(cost.paidAt) : fallback;
}
```

- [ ] **Step 5: Thread it through every cost write**

`persistRealTrip` gains a `now` parameter so the fallback is injected, not read from the clock:

```ts
export async function persistRealTrip(trip: DemoTrip, user: User, now: Date = new Date()): Promise<void> {
```

Then replace each of the five `paidAt: paidAt(x.cost.paid)` / `paidAt: paidAt(c.paid)` call sites with `paidAt: resolvePaidAt(x.cost, now)` (and `resolvePaidAt(c, now)` for the standalone-costs loop). Delete the old `paidAt` arrow.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run prisma/real/persist.test.ts && npx tsc --noEmit && npx eslint prisma lib`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add lib/demo/types.ts prisma/real/persist.ts prisma/real/persist.test.ts
git commit -m "fix(real-trip): preserve real payment dates instead of stamping now"
```

---

### Task 2: Trip envelope and the 11 corrected stops

Rewrite `lib/real-trip/christmas-europe-2026.ts` from scratch. This task lands the envelope and stops only; accommodations, transports and costs arrive in Tasks 3–4. The module must still typecheck and its test must pass at the end of this task, so temporarily return empty arrays for the not-yet-built collections.

**Files:**
- Modify (rewrite): `lib/real-trip/christmas-europe-2026.ts`
- Test: `lib/real-trip/christmas-europe-2026.test.ts` (rewrite)

**Interfaces:**
- Consumes: `DemoTrip`, `DemoStop` from `@/lib/demo/types`; `HomeBase` from `@/lib/home-base`.
- Produces: `buildChristmasEurope2026(): DemoTrip` (unchanged signature) and exported `const SK` — a record of stop keys keyed by `denpasar | munich | strasbourg | frankfurt | paris | london | aghalee | dublin | como | milan | rome`, each value `xmas26:stop:<name>`. Tasks 3 and 4 reference `SK` to attach beds and legs.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `lib/real-trip/christmas-europe-2026.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildChristmasEurope2026 } from "./christmas-europe-2026";

const t = buildChristmasEurope2026();
const ordered = [...t.stops].sort((a, b) => a.sortOrder - b.sortOrder);

describe("envelope", () => {
  it("is the real trip under Cam's home base", () => {
    expect(t.name).toBe("Christmas in Europe 2026");
    expect(t.startDate).toBe("2026-12-04");
    expect(t.endDate).toBe("2027-01-08");
    expect(t.hardEndDate ?? null).toBeNull();
    expect(t.homeCurrency).toBe("AUD");
    expect(t.roundTrip).toBe(true);
    expect(t.home).toEqual({
      name: "Gold Coast", lat: -28.0023731, lng: 153.4145987, countryCode: "au",
    });
  });

  it("has chapters switched off — no chapter rows at all", () => {
    expect(t.chapters).toHaveLength(0);
  });
});

describe("stops", () => {
  it("has 11 fully-dated stops with unique sort order", () => {
    expect(t.stops).toHaveLength(11);
    expect(new Set(t.stops.map((s) => s.sortOrder)).size).toBe(11);
    expect(new Set(t.stops.map((s) => s.key)).size).toBe(11);
  });

  it("gives every stop a date range, timezone, country and point", () => {
    for (const s of t.stops) {
      expect(s.arriveDate, s.name).toBeTruthy();
      expect(s.departDate, s.name).toBeTruthy();
      expect(s.timezone, s.name).toBeTruthy();
      expect(s.timezone, s.name).not.toBe("UTC");
      expect(s.countryCode, s.name).toBe(s.countryCode?.toLowerCase());
      expect(typeof s.lat, s.name).toBe("number");
      expect(typeof s.lng, s.name).toBe("number");
    }
  });

  it("runs strictly forward with no gap and no overlap between consecutive stops", () => {
    for (let i = 0; i < ordered.length - 1; i++) {
      const here = ordered[i];
      const next = ordered[i + 1];
      expect(here.departDate! > here.arriveDate!, here.name).toBe(true);
      // Denpasar → Munich is the one intentional break: an overnight flight via
      // Bangkok, so the night of the 5th is spent in the air, not in a bed.
      const expected = here.key.endsWith("denpasar") ? "2026-12-06" : here.departDate;
      expect(next.arriveDate, `${here.name} → ${next.name}`).toBe(expected);
    }
  });

  it("declares nights matching the date span", () => {
    const DAY = 86_400_000;
    for (const s of ordered) {
      const span = (Date.parse(s.departDate!) - Date.parse(s.arriveDate!)) / DAY;
      expect(s.nights, s.name).toBe(span);
    }
  });

  it("starts and ends inside the trip envelope", () => {
    expect(ordered[0].arriveDate).toBe(t.startDate);
    expect(ordered[ordered.length - 1].departDate! <= t.endDate!).toBe(true);
  });

  it("spends 33 nights in beds across the trip", () => {
    expect(ordered.reduce((n, s) => n + (s.nights ?? 0), 0)).toBe(33);
  });

  it("visits the expected route in order", () => {
    expect(ordered.map((s) => s.name)).toEqual([
      "Denpasar", "Munich", "Strasbourg", "Frankfurt", "Paris", "London",
      "Aghalee", "Dublin", "Como", "Milan", "Rome",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: FAIL — the current builder has 10 stops, 4 chapters and the old dates.

- [ ] **Step 3: Rewrite the builder with the envelope and stops**

Replace the entire contents of `lib/real-trip/christmas-europe-2026.ts`:

```ts
/**
 * "Christmas in Europe 2026" — Cam & Xanthia's real trip.
 *
 * Pure builder returning the trip as a DemoTrip descriptor for persistence by
 * prisma/seed-real.ts. Rebuilt 2026-09-10 from the booking confirmations after
 * the hand-entered version ("THE Trip") drifted: every Stop sat one day before
 * its Accommodation, Rome was undated, and two flight Costs recorded $0.
 *
 * Round trip from the Gold Coast (AUD): a Bali overnight, then Munich →
 * Strasbourg → Frankfurt → Paris → London → Aghalee → Dublin → Como → Milan →
 * Rome, home via Doha. Chapters are off. Times are local wall-clock stored
 * with a Z suffix, matching every existing row in this trip.
 *
 * Pure module — no Prisma, no React, no network, no clock.
 */

import type {
  DemoTrip,
  DemoStop,
  DemoTransport,
  DemoAccommodation,
  DemoCost,
} from "@/lib/demo/types";

// --- keys ------------------------------------------------------------------

export const SK = {
  denpasar: "xmas26:stop:denpasar",
  munich: "xmas26:stop:munich",
  strasbourg: "xmas26:stop:strasbourg",
  frankfurt: "xmas26:stop:frankfurt",
  paris: "xmas26:stop:paris",
  london: "xmas26:stop:london",
  aghalee: "xmas26:stop:aghalee",
  dublin: "xmas26:stop:dublin",
  como: "xmas26:stop:como",
  milan: "xmas26:stop:milan",
  rome: "xmas26:stop:rome",
} as const;

// --- stops -----------------------------------------------------------------

const STOPS: DemoStop[] = [
  { key: SK.denpasar, name: "Denpasar", country: "Indonesia", countryCode: "id", lat: -8.6653349, lng: 115.2176191, timezone: "Asia/Makassar", arriveDate: "2026-12-04", departDate: "2026-12-05", nights: 1, sortOrder: 0, notes: "Overnight stopover on the way to Europe." },
  { key: SK.munich, name: "Munich", country: "Germany", countryCode: "de", lat: 48.1371079, lng: 11.5753822, timezone: "Europe/Berlin", arriveDate: "2026-12-06", departDate: "2026-12-10", nights: 4, sortOrder: 1 },
  { key: SK.strasbourg, name: "Strasbourg", country: "France", countryCode: "fr", lat: 48.584614, lng: 7.7507127, timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-13", nights: 3, sortOrder: 2, notes: "Sleeping across the border in Kehl." },
  { key: SK.frankfurt, name: "Frankfurt", country: "Germany", countryCode: "de", lat: 50.1106444, lng: 8.6820917, timezone: "Europe/Berlin", arriveDate: "2026-12-13", departDate: "2026-12-15", nights: 2, sortOrder: 3 },
  { key: SK.paris, name: "Paris", country: "France", countryCode: "fr", lat: 48.8588897, lng: 2.320041, timezone: "Europe/Paris", arriveDate: "2026-12-15", departDate: "2026-12-19", nights: 4, sortOrder: 4 },
  { key: SK.london, name: "London", country: "United Kingdom", countryCode: "gb", lat: 51.5074456, lng: -0.1277653, timezone: "Europe/London", arriveDate: "2026-12-19", departDate: "2026-12-22", nights: 3, sortOrder: 5 },
  { key: SK.aghalee, name: "Aghalee", country: "United Kingdom", countryCode: "gb", lat: 54.5057, lng: -6.3183, timezone: "Europe/London", arriveDate: "2026-12-22", departDate: "2026-12-29", nights: 7, sortOrder: 6, notes: "Christmas in Northern Ireland." },
  { key: SK.dublin, name: "Dublin", country: "Ireland", countryCode: "ie", lat: 53.3493795, lng: -6.2605593, timezone: "Europe/Dublin", arriveDate: "2026-12-29", departDate: "2026-12-30", nights: 1, sortOrder: 7 },
  { key: SK.como, name: "Como", country: "Italy", countryCode: "it", lat: 45.9395857, lng: 9.1493609, timezone: "Europe/Rome", arriveDate: "2026-12-30", departDate: "2027-01-01", nights: 2, sortOrder: 8, notes: "New Year's Eve on Lake Como." },
  { key: SK.milan, name: "Milan", country: "Italy", countryCode: "it", lat: 45.4641943, lng: 9.1896346, timezone: "Europe/Rome", arriveDate: "2027-01-01", departDate: "2027-01-02", nights: 1, sortOrder: 9, notes: "One night back in Milan between Como and Rome." },
  { key: SK.rome, name: "Rome", country: "Italy", countryCode: "it", lat: 41.8933203, lng: 12.4829321, timezone: "Europe/Rome", arriveDate: "2027-01-02", departDate: "2027-01-07", nights: 5, sortOrder: 10 },
];

// --- accommodations (Task 3) -----------------------------------------------

const ACCOMMODATIONS: DemoAccommodation[] = [];

// --- transports (Task 4) ---------------------------------------------------

const TRANSPORTS: DemoTransport[] = [];

// --- standalone costs (Task 4) ---------------------------------------------

const COSTS: DemoCost[] = [];

// --- builder ---------------------------------------------------------------

export function buildChristmasEurope2026(): DemoTrip {
  return {
    key: "xmas26:trip",
    name: "Christmas in Europe 2026",
    createdBy: "you",
    startDate: "2026-12-04",
    endDate: "2027-01-08",
    hardEndDate: null,
    homeCurrency: "AUD",
    home: { name: "Gold Coast", lat: -28.0023731, lng: 153.4145987, countryCode: "au" },
    roundTrip: true,
    chapters: [],
    stops: STOPS,
    transports: TRANSPORTS,
    accommodations: ACCOMMODATIONS,
    items: [],
    costs: COSTS,
    exchangeRates: [
      { base: "EUR", quote: "AUD", rate: 1.63, manual: true, fetchedAt: "2026-09-10T00:00:00.000Z" },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/real-trip/christmas-europe-2026.ts lib/real-trip/christmas-europe-2026.test.ts
git commit -m "feat(real-trip): rebuild stop spine from booking confirmations"
```

---

### Task 3: The 11 beds, each aligned to its stop

**Files:**
- Modify: `lib/real-trip/christmas-europe-2026.ts` (fill `ACCOMMODATIONS`)
- Test: `lib/real-trip/christmas-europe-2026.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `SK` from Task 2.
- Produces: accommodation keys `xmas26:acc:<stop>` for each of the 11 stops. Task 4 does not depend on these.

- [ ] **Step 1: Write the failing test**

Append to `lib/real-trip/christmas-europe-2026.test.ts`:

```ts
describe("accommodations", () => {
  it("gives every stop exactly one bed", () => {
    expect(t.accommodations).toHaveLength(11);
    const byStop = new Map(t.accommodations.map((a) => [a.stopKey, a]));
    expect(byStop.size).toBe(11);
    for (const s of t.stops) expect(byStop.has(s.key), s.name).toBe(true);
  });

  it("matches each bed's dates to its stop's dates exactly", () => {
    const stopByKey = new Map(t.stops.map((s) => [s.key, s]));
    for (const a of t.accommodations) {
      const s = stopByKey.get(a.stopKey)!;
      expect(a.checkIn, a.name).toBe(s.arriveDate);
      expect(a.checkOut, a.name).toBe(s.departDate);
    }
  });

  it("carries an address, a confirmation and a real cost on every bed", () => {
    for (const a of t.accommodations) {
      expect(a.address, a.name).toBeTruthy();
      expect(a.confirmation, a.name).toBeTruthy();
      expect(a.cost, a.name).toBeTruthy();
      expect(a.cost!.costMinor, a.name).toBeGreaterThan(0);
    }
  });

  it("records the Dublin bed as paid on the day it was charged", () => {
    const dublin = t.accommodations.find((a) => a.stopKey.endsWith("dublin"))!;
    expect(dublin.name).toBe("Point A Dublin The Liberties");
    expect(dublin.cost).toMatchObject({
      costMinor: 15642, paidMinor: 15642, currency: "AUD", paid: true, paidAt: "2026-08-11",
    });
  });

  it("prices Rome in euro and leaves it unpaid — it is cash on arrival", () => {
    const rome = t.accommodations.find((a) => a.stopKey.endsWith("rome"))!;
    expect(rome.cost).toMatchObject({ costMinor: 53610, currency: "EUR" });
    expect(rome.cost!.paid ?? false).toBe(false);
  });

  it("leaves every other bed unpaid", () => {
    const paid = t.accommodations.filter((a) => a.cost?.paid);
    expect(paid.map((a) => a.stopKey)).toEqual([SK_DUBLIN]);
  });
});
```

Add `const SK_DUBLIN = "xmas26:stop:dublin";` beside the other consts at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: FAIL — `t.accommodations` is empty.

- [ ] **Step 3: Fill in the accommodations**

Replace the `ACCOMMODATIONS` placeholder in `lib/real-trip/christmas-europe-2026.ts`:

```ts
const ACCOMMODATIONS: DemoAccommodation[] = [
  { key: "xmas26:acc:denpasar", stopKey: SK.denpasar, name: "1 Bedroom private pool @Kuta", address: "758F+272, Jalan Bhineka Jati Jaya XI, Kuta, Kuta, Bali, 80361, Indonesia", checkIn: "2026-12-04", checkOut: "2026-12-05", confirmation: "HM2EDZ4CB5", notes: "Check-in after 2:00pm, check-out by 12:00pm.\nSelf check-in with building staff. 2 guests maximum.\nHost has not reported a smoke/carbon monoxide detector.\nBalance auto-debits 2026-11-25 (Visa 4190).", cost: { costMinor: 11520, currency: "AUD" } },
  { key: "xmas26:acc:munich", stopKey: SK.munich, name: "B&B Hotel München-Hbf", address: "Landwehrstraße 77, Ludwigsvorstadt, 80336 Munich, Germany", checkIn: "2026-12-06", checkOut: "2026-12-10", confirmation: "5201106083", notes: "Pin Code: 8460", cost: { costMinor: 80609, currency: "AUD" } },
  { key: "xmas26:acc:strasbourg", stopKey: SK.strasbourg, name: "B&B Hotel Kehl", address: "15 Allensteiner Straße, 77694 Kehl am Rhein, Germany", checkIn: "2026-12-10", checkOut: "2026-12-13", confirmation: "6031790255 PIN:4046", notes: "Staying in Kehl, across the Rhine from Strasbourg — tram back each night.", cost: { costMinor: 81000, currency: "AUD" } },
  { key: "xmas26:acc:frankfurt", stopKey: SK.frankfurt, name: "Premier Inn Frankfurt City Europaviertel", address: "Mainzer Landstr. 117+119, Gallusviertel, 60327 Frankfurt/Main, Germany", checkIn: "2026-12-13", checkOut: "2026-12-15", confirmation: "6925281379, PIN:8192", cost: { costMinor: 18700, currency: "AUD" } },
  { key: "xmas26:acc:paris", stopKey: SK.paris, name: "Villa Margaux Opéra Montmartre", address: "23, Rue Henry Monnier, 9th arr., 75009 Paris, France", checkIn: "2026-12-15", checkOut: "2026-12-19", confirmation: "5887236633, PIN:7856", notes: "Check in after 3pm\nCheckout before 11", cost: { costMinor: 91652, currency: "AUD" } },
  { key: "xmas26:acc:london", stopKey: SK.london, name: "Zedwell Underground Hotel Tottenham Court Rd", address: "112 Great Russell Street, Camden, London, WC1B 3NQ, United Kingdom", checkIn: "2026-12-19", checkOut: "2026-12-22", confirmation: "5012646116, PIN:8416", notes: "Check in after 3pm\nCheckout before 10am", cost: { costMinor: 54535, currency: "AUD" } },
  { key: "xmas26:acc:aghalee", stopKey: SK.aghalee, name: "Clenaghans", address: "48 Soldierstown Road, Aghalee", checkIn: "2026-12-22", checkOut: "2026-12-29", confirmation: "HM855WTW9F", cost: { costMinor: 130417, currency: "AUD" } },
  { key: "xmas26:acc:dublin", stopKey: SK.dublin, name: "Point A Dublin The Liberties", address: "Oliver Bond St, The Liberties, Dublin, Ireland", checkIn: "2026-12-29", checkOut: "2026-12-30", confirmation: "HMKSN99TRQ", notes: "Check-in from 3:00pm, check-out by 11:00am.\nCashless hotel — photo ID and credit card required at check-in.\nEarly check-in from 12:00pm for €15; late check-out €25.\n100% non-smoking.", cost: { costMinor: 15642, currency: "AUD", paid: true, paidMinor: 15642, paidAt: "2026-08-11" } },
  { key: "xmas26:acc:como", stopKey: SK.como, name: "attico capicci", address: "Via Fratelli Bronzetti, 21, 22100 Como CO, Italy", checkIn: "2026-12-30", checkOut: "2027-01-01", confirmation: "HMXAXCW8QE", notes: "Check-in after 3:00pm, check-out by 10:00am.\nItalian law requires the host to register passport/ID details.\nNo pets, no commercial photography.\nBalance auto-debits 2026-11-23 (Visa 4190).", cost: { costMinor: 116873, currency: "AUD" } },
  { key: "xmas26:acc:milan", stopKey: SK.milan, name: "Ibis Milano Centro", address: "Via Finocchiaro Aprile 2, Stazione Centrale, 20124 Milan, Italy", checkIn: "2027-01-01", checkOut: "2027-01-02", confirmation: "5622902959, PIN:1094", cost: { costMinor: 16900, currency: "AUD" } },
  { key: "xmas26:acc:rome", stopKey: SK.rome, name: "The Club Navona", address: "Corso Vittorio Emanuele II 184, Navona, Rome, 00186, Italy", checkIn: "2027-01-02", checkOut: "2027-01-07", confirmation: "6243212144 (PIN: 4820)", notes: "Check-in 14:00–23:30, check-out 00:00–10:00.\nCASH ONLY — full payment due on arrival, no credit cards accepted.\nLate-arrival surcharge: €10 (18:00–20:00), €15 (20:00–22:00), €20 (22:00–00:00).\nCity tax of €70 is collected separately at the property.", cost: { costMinor: 53610, currency: "EUR" } },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/real-trip/christmas-europe-2026.ts lib/real-trip/christmas-europe-2026.test.ts
git commit -m "feat(real-trip): add all 11 beds aligned to their stops"
```

---

### Task 4: The 13 legs, their costs, and the Rome city tax

**Files:**
- Modify: `lib/real-trip/christmas-europe-2026.ts` (fill `TRANSPORTS` and `COSTS`)
- Test: `lib/real-trip/christmas-europe-2026.test.ts` (append two `describe`s)

**Interfaces:**
- Consumes: `SK` from Task 2.
- Produces: transport keys `xmas26:tr:<slug>`. Task 5's summariser reads `trip.transports` and `trip.costs` generically — no key coupling.

- [ ] **Step 1: Write the failing test**

Append to `lib/real-trip/christmas-europe-2026.test.ts`:

Add these two imports to the **top** of the test file, beside the existing ones — do not leave imports part-way down the file:

```ts
import { hasOutboundLeg, hasReturnLeg } from "@/lib/home-base";
import { TRANSPORT_MODES } from "@/lib/enums";
```

Then append the describes:

```ts
describe("transports", () => {
  it("has 13 legs with unique keys, valid modes and real stop references", () => {
    expect(t.transports).toHaveLength(13);
    expect(new Set(t.transports.map((x) => x.key)).size).toBe(13);
    expect(new Set(t.transports.map((x) => x.sortOrder)).size).toBe(13);
    const stopKeys = new Set(t.stops.map((s) => s.key));
    for (const tr of t.transports) {
      expect(TRANSPORT_MODES, tr.key).toContain(tr.mode);
      if (tr.fromStopKey) expect(stopKeys.has(tr.fromStopKey), tr.key).toBe(true);
      if (tr.toStopKey) expect(stopKeys.has(tr.toStopKey), tr.key).toBe(true);
    }
  });

  it("closes the round trip from and back to the home base", () => {
    const legs = t.transports.map((x) => ({
      depIsHome: x.depIsHome, arrIsHome: x.arrIsHome,
      toStopId: x.toStopKey ?? null, fromStopId: x.fromStopKey ?? null,
    }));
    expect(hasOutboundLeg(legs, ordered[0].key)).toBe(true);
    expect(hasReturnLeg(legs, ordered[ordered.length - 1].key)).toBe(true);
  });

  it("connects every consecutive pair of stops", () => {
    for (let i = 0; i < ordered.length - 1; i++) {
      const leg = t.transports.find(
        (x) => x.fromStopKey === ordered[i].key && x.toStopKey === ordered[i + 1].key,
      );
      expect(leg, `${ordered[i].name} → ${ordered[i + 1].name}`).toBeTruthy();
    }
  });

  it("keeps the Malpensa transfer as between-legs travel", () => {
    const hop = t.transports.find((x) => x.key === "xmas26:tr:mxp-como")!;
    expect(hop.fromStopKey ?? null).toBeNull();
    expect(hop.toStopKey).toBe(SK_COMO);
    expect(hop.depPlace).toBe("Milan Malpensa (MXP)");
  });

  it("lands the Bangkok overnight in Munich on the 6th", () => {
    const leg = t.transports.find((x) => x.reference === "DHZU24")!;
    expect(leg.depAt).toBe("2026-12-05T19:00:00Z");
    expect(leg.arrAt).toBe("2026-12-06T06:45:00Z");
  });

  it("never lets a leg arrive before it departs", () => {
    for (const tr of t.transports) {
      if (tr.depAt && tr.arrAt) expect(tr.arrAt > tr.depAt, tr.key).toBe(true);
    }
  });

  it("leaves exactly the six unbooked legs without times or references", () => {
    const unbooked = t.transports.filter((x) => !x.depAt);
    expect(unbooked.map((x) => x.key).sort()).toEqual([
      "xmas26:tr:aghalee-dublin", "xmas26:tr:como-milan", "xmas26:tr:frankfurt-paris",
      "xmas26:tr:milan-rome", "xmas26:tr:mxp-como", "xmas26:tr:strasbourg-frankfurt",
    ]);
    for (const x of unbooked) {
      expect(x.arrAt ?? null, x.key).toBeNull();
      expect(x.cost ?? null, x.key).toBeNull();
    }
  });
});

describe("costs", () => {
  const inline = [
    ...t.transports.map((x) => x.cost),
    ...t.accommodations.map((a) => a.cost),
  ].filter(Boolean);
  const all = [...inline, ...t.costs];

  it("records 17 costs in total", () => {
    expect(all).toHaveLength(17);
  });

  it("never records a cost of zero — a Cost with no number is not a Cost", () => {
    for (const c of all) expect(c!.costMinor).toBeGreaterThan(0);
  });

  it("gives every paid cost a paid amount", () => {
    for (const c of all) {
      if (c!.paid) expect(typeof c!.paidMinor).toBe("number");
    }
  });

  it("totals 935935 AUD and 96472 EUR", () => {
    const sum = (cur: string) =>
      all.filter((c) => c!.currency === cur).reduce((n, c) => n + c!.costMinor, 0);
    expect(sum("AUD")).toBe(935935);
    expect(sum("EUR")).toBe(96472);
  });

  it("seeds a EUR rate so the euro costs convert to the home currency", () => {
    const currencies = new Set(all.map((c) => c!.currency));
    for (const cur of currencies) {
      if (cur === t.homeCurrency) continue;
      const rate = (t.exchangeRates ?? []).find((r) => r.base === cur);
      expect(rate, cur).toBeTruthy();
      expect(rate!.quote).toBe("AUD");
    }
  });

  it("carries the Rome city tax as a standalone other cost", () => {
    expect(t.costs).toHaveLength(1);
    expect(t.costs[0]).toMatchObject({
      ownerType: "OTHER", label: "Rome city tax", costMinor: 7000, currency: "EUR",
    });
  });

  it("records the two flights that previously showed a zero cost", () => {
    for (const ref of ["WNIQHG", "DHZU24"]) {
      const leg = t.transports.find((x) => x.reference === ref)!;
      expect(leg.cost!.costMinor, ref).toBe(leg.cost!.paidMinor);
      expect(leg.cost!.paid, ref).toBe(true);
    }
  });
});
```

Add `const SK_COMO = "xmas26:stop:como";` beside the other consts at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: FAIL — `t.transports` is empty.

- [ ] **Step 3: Fill in the transports and the standalone cost**

Replace the `TRANSPORTS` and `COSTS` placeholders:

```ts
const TRANSPORTS: DemoTransport[] = [
  { key: "xmas26:tr:home-denpasar", mode: "FLIGHT", fromStopKey: null, toStopKey: SK.denpasar, depIsHome: true, depPlace: "Gold Coast (OOL)", depAt: "2026-12-04T17:50:00Z", arrPlace: "Denpasar (DPS)", arrAt: "2026-12-04T22:15:00Z", reference: "WNIQHG", sortOrder: 0, cost: { costMinor: 89559, currency: "AUD", paid: true, paidMinor: 89559, paidAt: "2026-07-13" } },
  { key: "xmas26:tr:denpasar-munich", mode: "FLIGHT", fromStopKey: SK.denpasar, toStopKey: SK.munich, depPlace: "Denpasar (DPS)", depAt: "2026-12-05T19:00:00Z", arrPlace: "Munich (MUC)", arrAt: "2026-12-06T06:45:00Z", reference: "DHZU24", notes: "Thai Airways via Bangkok.\nArrives BKK 22:15 on 5 Dec; onward TG924 lands Munich 06:45 on 6 Dec.\nOvernight in the air — no bed booked for the night of the 5th.", sortOrder: 1, cost: { costMinor: 163569, currency: "AUD", paid: true, paidMinor: 163569, paidAt: "2026-07-19" } },
  { key: "xmas26:tr:munich-strasbourg", mode: "TRAIN", fromStopKey: SK.munich, toStopKey: SK.strasbourg, depPlace: "Munich Hbf", depAt: "2026-12-10T06:51:00Z", arrPlace: "Strasbourg", arrAt: "2026-12-10T10:40:00Z", reference: "300186503818", notes: "1st Class\nCarriage 13 - Seat 350,351\nBring ID\nArrive at least 20 minutes early\nWill need to catch tram back to accom in Kehl", sortOrder: 2, cost: { costMinor: 23521, currency: "AUD", paid: true, paidMinor: 23521, paidAt: "2026-07-26" } },
  { key: "xmas26:tr:strasbourg-frankfurt", mode: "TRAIN", fromStopKey: SK.strasbourg, toStopKey: SK.frankfurt, notes: "Not booked yet — travelling 13 Dec.", sortOrder: 3 },
  { key: "xmas26:tr:frankfurt-paris", mode: "TRAIN", fromStopKey: SK.frankfurt, toStopKey: SK.paris, notes: "Not booked yet — travelling 15 Dec.", sortOrder: 4 },
  { key: "xmas26:tr:paris-london", mode: "TRAIN", fromStopKey: SK.paris, toStopKey: SK.london, depPlace: "Paris Gare du Nord", depAt: "2026-12-19T08:02:00Z", arrPlace: "London St Pancras", arrAt: "2026-12-19T09:30:00Z", reference: "WXFVKQ", notes: "Carriage 15\nSeats 53 and 54", sortOrder: 5, cost: { costMinor: 41438, currency: "AUD", paid: true, paidMinor: 41438, paidAt: "2026-07-26" } },
  { key: "xmas26:tr:london-aghalee", mode: "FLIGHT", fromStopKey: SK.london, toStopKey: SK.aghalee, depPlace: "London Heathrow (LHR)", depAt: "2026-12-22T09:15:00Z", arrPlace: "Belfast City (BHD)", arrAt: "2026-12-22T10:40:00Z", reference: "XHARUZ", notes: "British Airways\nHeathrow (LHR) - Terminal 5\n1hr 25 mins\nBelfast City Airport (BHD)", sortOrder: 6 },
  { key: "xmas26:tr:aghalee-dublin", mode: "TRAIN", fromStopKey: SK.aghalee, toStopKey: SK.dublin, notes: "Not booked yet — travelling 29 Dec. Train or coach.", sortOrder: 7 },
  { key: "xmas26:tr:dublin-como", mode: "FLIGHT", fromStopKey: SK.dublin, toStopKey: SK.como, depPlace: "Dublin (DUB)", depAt: "2026-12-30T08:15:00Z", arrPlace: "Milan Malpensa (MXP)", arrAt: "2026-12-30T11:45:00Z", reference: "FR7799 · H4WP7Q", notes: "Ryanair.\n2x 20kg checked bags included. Seats 16A and 16B.\nMust use the Ryanair app for boarding passes — printed passes are not accepted.\nOnward transfer to Como is a separate leg.", sortOrder: 8, cost: { costMinor: 35862, currency: "EUR", paid: true, paidMinor: 35862 } },
  { key: "xmas26:tr:mxp-como", mode: "TRAIN", fromStopKey: null, toStopKey: SK.como, depPlace: "Milan Malpensa (MXP)", arrPlace: "Como", notes: "Not booked yet — airport transfer on arrival, 30 Dec.", sortOrder: 9 },
  { key: "xmas26:tr:como-milan", mode: "TRAIN", fromStopKey: SK.como, toStopKey: SK.milan, notes: "Not booked yet — travelling 1 Jan.", sortOrder: 10 },
  { key: "xmas26:tr:milan-rome", mode: "TRAIN", fromStopKey: SK.milan, toStopKey: SK.rome, notes: "Not booked yet — travelling 2 Jan.", sortOrder: 11 },
  { key: "xmas26:tr:rome-home", mode: "FLIGHT", fromStopKey: SK.rome, toStopKey: null, arrIsHome: true, depPlace: "Rome (FCO)", depAt: "2027-01-07T08:55:00Z", arrPlace: "Brisbane (BNE)", arrAt: "2027-01-08T17:30:00Z", reference: "8QPEWK", notes: "Leave Rome 8:55am 7th Jan\n5 hours 10 minutes\nArrive Doha 4:05pm 7th Jan\nLeave Doha 8:25pm\n14 hours 5 minutes\nArrive Brisbane 5:30pm 8th Jan", sortOrder: 12 },
];

const COSTS: DemoCost[] = [
  { ownerType: "OTHER", label: "Rome city tax", costMinor: 7000, currency: "EUR" },
];
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx vitest run lib/real-trip && npx tsc --noEmit && npx eslint lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/real-trip/christmas-europe-2026.ts lib/real-trip/christmas-europe-2026.test.ts
git commit -m "feat(real-trip): add all 13 legs, their costs and the Rome city tax"
```

---

### Task 5: Additive persister, duplicate guard and dry-run

The existing seed path calls `wipeRealTrip()`, which deletes every trip named "Christmas in Europe 2026". Pointed at production that would destroy the trip we are about to write. Make the write additive and make a second run fail loudly instead of overwriting.

**Files:**
- Modify: `lib/real-trip/christmas-europe-2026.ts` (add `summariseRealTrip`)
- Modify: `prisma/real/persist.ts` (add `assertNoExistingRealTrip`, lazy storage)
- Modify: `prisma/seed-real.ts` (`--dry-run`, no wipe)
- Modify: `package.json`
- Test: `lib/real-trip/christmas-europe-2026.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `buildChristmasEurope2026()` from Task 2–4; `resolvePaidAt` from Task 1.
- Produces: `summariseRealTrip(trip: DemoTrip): string`; `assertNoExistingRealTrip(name: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `lib/real-trip/christmas-europe-2026.test.ts`:

Extend the existing top-of-file import from `./christmas-europe-2026` to also pull in `summariseRealTrip`, then append:

```ts
describe("summariseRealTrip", () => {
  const out = summariseRealTrip(t);

  it("names the trip and its span", () => {
    expect(out).toContain("Christmas in Europe 2026");
    expect(out).toContain("2026-12-04");
    expect(out).toContain("2027-01-08");
  });

  it("counts every row that will be written", () => {
    expect(out).toContain("11 stops");
    expect(out).toContain("11 accommodations");
    expect(out).toContain("13 transports");
    expect(out).toContain("17 costs");
  });

  it("lists every stop with its dates so the dry-run can be eyeballed", () => {
    for (const s of t.stops) expect(out).toContain(s.name);
    expect(out).toContain("2026-12-22 → 2026-12-29");
  });

  it("reports both currency totals", () => {
    expect(out).toContain("9359.35 AUD");
    expect(out).toContain("964.72 EUR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: FAIL — `summariseRealTrip` is not exported.

- [ ] **Step 3: Add the pure summariser**

Append to `lib/real-trip/christmas-europe-2026.ts`:

```ts
/**
 * Render the trip as a human-readable printout for the dry-run. Pure: it reads
 * the same descriptor the persister consumes, so what it prints is exactly
 * what would be written. There is no local Postgres in this project's sandbox,
 * so this is the last line of defence before a production write.
 */
export function summariseRealTrip(trip: DemoTrip): string {
  const allCosts = [
    ...trip.transports.map((x) => x.cost),
    ...trip.accommodations.map((a) => a.cost),
    ...trip.costs,
  ].filter((c): c is NonNullable<typeof c> => !!c);

  const totals = new Map<string, number>();
  for (const c of allCosts) totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.costMinor);

  const bedByStop = new Map(trip.accommodations.map((a) => [a.stopKey, a]));
  const lines: string[] = [];

  lines.push(`${trip.name}  ${trip.startDate} → ${trip.endDate}  (${trip.homeCurrency})`);
  lines.push(`home base: ${trip.home?.name ?? "none"} · round trip: ${trip.roundTrip ?? true} · chapters: ${trip.chapters.length}`);
  lines.push("");
  lines.push(`${trip.stops.length} stops, ${trip.accommodations.length} accommodations, ${trip.transports.length} transports, ${allCosts.length} costs`);
  lines.push("");

  for (const s of [...trip.stops].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const bed = bedByStop.get(s.key);
    lines.push(`  ${s.arriveDate} → ${s.departDate}  ${s.name} (${s.nights}n)  ${bed ? bed.name : "NO BED"}`);
  }

  lines.push("");
  for (const [cur, minor] of [...totals].sort()) {
    lines.push(`  total ${(minor / 100).toFixed(2)} ${cur}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/real-trip/christmas-europe-2026.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the duplicate guard and make storage lazy**

In `prisma/real/persist.ts`, add beside `wipeRealTrip`:

```ts
/**
 * Refuse to write if a trip of this name already exists. The additive seed
 * path never deletes, so a second run would silently create a duplicate;
 * failing loudly is the safe outcome. Deliberately NOT wipeRealTrip() — that
 * function deletes real data and must never be pointed at production.
 */
export async function assertNoExistingRealTrip(name: string = REAL_TRIP_NAME): Promise<void> {
  const existing = await db.trip.findMany({ where: { name }, select: { id: true } });
  if (existing.length > 0) {
    throw new Error(
      `Refusing to write: ${existing.length} trip(s) already named "${name}" ` +
        `(${existing.map((t) => t.id).join(", ")}). This seed is additive and never deletes. ` +
        `Remove or rename the existing trip in the app first.`,
    );
  }
}
```

Then move the `const storage = getStorage();` call at the top of `persistRealTrip` inside the `if (trip.coverGradient)` block, so a run with no cover image performs no storage I/O and needs no storage credentials.

- [ ] **Step 6: Rewire the seed script**

Replace the body of `prisma/seed-real.ts`:

```ts
import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { buildChristmasEurope2026, summariseRealTrip } from "../lib/real-trip/christmas-europe-2026";
import { ensureRealUser, assertNoExistingRealTrip, persistRealTrip } from "./real/persist";

/**
 * Seeds Cam's real "Christmas in Europe 2026" trip under his account.
 *
 * ADDITIVE — it never deletes. If a trip of the same name already exists the
 * run aborts rather than wiping or duplicating it.
 *
 *   npm run db:seed:real:dry   # print what would be written, touch nothing
 *   npm run db:seed:real       # write it
 */
export async function seedReal(opts: { dryRun?: boolean } = {}): Promise<void> {
  const trip = buildChristmasEurope2026();

  if (opts.dryRun) {
    console.log("\n--- DRY RUN — nothing will be written ---\n");
    console.log(summariseRealTrip(trip));
    console.log("\n--- end dry run ---\n");
    return;
  }

  await assertNoExistingRealTrip(trip.name);
  const user = await ensureRealUser();
  await persistRealTrip(trip, user);
  console.log(`\n✅ Seeded "${trip.name}" for ${user.email}.\n`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedReal({ dryRun: process.argv.includes("--dry-run") })
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
```

Note the dry-run path returns **before** `ensureRealUser()`, so it opens no write transaction.

- [ ] **Step 7: Add the npm script**

In `package.json`, beside `"db:seed:real"`, add:

```json
"db:seed:real:dry": "tsx prisma/seed-real.ts --dry-run",
```

- [ ] **Step 8: Verify the dry run prints and writes nothing**

Run: `npm run db:seed:real:dry`
Expected: the itinerary printout, ending "end dry run". It reads no tables and writes none.

Then confirm the whole suite is green:
Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/real-trip/christmas-europe-2026.ts lib/real-trip/christmas-europe-2026.test.ts prisma/real/persist.ts prisma/seed-real.ts package.json
git commit -m "feat(real-trip): additive seed with duplicate guard and dry-run"
```

---

### Task 6: Xanthia joins the trip as a member

`persistRealTrip` creates only the owner (`members: { create: [{ userId: user.id, role: "owner" }] }`). The spec requires Cam as owner **and** Xanthia as member, mirroring "THE Trip". Her account already exists (`xanni99.m@hotmail.com`), so this is a direct `TripMember` row, not an `Invite` — she should see the trip immediately with no acceptance round-trip.

**Files:**
- Modify: `prisma/real/persist.ts` (add `addExistingUserAsMember`)
- Modify: `prisma/seed-real.ts` (call it after the write)
- Test: `prisma/real/persist.test.ts` (append)

**Interfaces:**
- Consumes: `persistRealTrip` from Task 1.
- Produces: `REAL_PARTNER_EMAIL` constant and
  `addExistingUserAsMember(tripId: string, email: string, role?: "owner" | "member"): Promise<boolean>` — resolves `true` if a member row was created, `false` if no user with that email exists. It must never create a `User`.

- [ ] **Step 1: Write the failing test**

Append to `prisma/real/persist.test.ts`:

```ts
import { REAL_PARTNER_EMAIL, REAL_USER } from "./persist";

describe("real trip participants", () => {
  it("names Cam as the owner and Xanthia as the partner", () => {
    expect(REAL_USER.email).toBe("cammark.williams@gmail.com");
    expect(REAL_PARTNER_EMAIL).toBe("xanni99.m@hotmail.com");
  });

  it("keeps the two participants distinct", () => {
    expect(REAL_PARTNER_EMAIL).not.toBe(REAL_USER.email);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run prisma/real/persist.test.ts`
Expected: FAIL — `REAL_PARTNER_EMAIL` is not exported.

- [ ] **Step 3: Add the constant and the helper**

In `prisma/real/persist.ts`, beside `REAL_USER`:

```ts
/** Cam's partner. Her account already exists; she is added directly as a member. */
export const REAL_PARTNER_EMAIL = "xanni99.m@hotmail.com";
```

And beside `assertNoExistingRealTrip`:

```ts
/**
 * Add an already-registered user to a trip as a member. Deliberately does NOT
 * upsert a User — inviting someone who has never signed in is the Invite
 * flow's job, and silently creating an empty account here would be worse than
 * failing to add them. Returns whether a membership was created.
 */
export async function addExistingUserAsMember(
  tripId: string,
  email: string,
  role: "owner" | "member" = "member",
): Promise<boolean> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return false;
  await db.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: user.id } },
    update: {},
    create: { tripId, userId: user.id, role },
  });
  return true;
}
```

`persistRealTrip` currently returns `void`; change its return type to `Promise<string>` and `return tripId;` at the end so the caller can attach the member.

- [ ] **Step 4: Call it from the seed script**

In `prisma/seed-real.ts`, replace the write block:

```ts
  await assertNoExistingRealTrip(trip.name);
  const user = await ensureRealUser();
  const tripId = await persistRealTrip(trip, user);
  const added = await addExistingUserAsMember(tripId, REAL_PARTNER_EMAIL);
  console.log(`\n✅ Seeded "${trip.name}" for ${user.email}.`);
  console.log(
    added
      ? `   ${REAL_PARTNER_EMAIL} added as a member.\n`
      : `   ⚠️  No account found for ${REAL_PARTNER_EMAIL} — invite them from the app.\n`,
  );
```

and extend the import to `import { ensureRealUser, assertNoExistingRealTrip, persistRealTrip, addExistingUserAsMember, REAL_PARTNER_EMAIL } from "./real/persist";`.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/real/persist.ts prisma/real/persist.test.ts prisma/seed-real.ts
git commit -m "feat(real-trip): add Xanthia to the trip as a member"
```

---

### Task 7: ADR 0042 — real trips generated from committed builders

**Files:**
- Create: `docs/adr/0042-real-trips-generated-from-committed-builders.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Read the ADR format**

Read `docs/adr/0041-feedback-notes-may-queue-offline.md` and match its heading structure, tone and front-matter exactly.

- [ ] **Step 2: Write the ADR**

Cover: the context (a hand-entered real trip drifted — a systematic one-day offset between every Stop and its bookings, an undated Rome, two Costs recording $0 against real payments); the decision (a real trip may be *generated once* from a committed pure builder with tests, then owned by the app thereafter); the consequence that matters most — **the builder is a one-time origin, not a synced source of truth**, so after the write the app wins and re-running the seed is an error, enforced by `assertNoExistingRealTrip`; the alternatives rejected (repairing in place on live data with no way to test first; wipe-and-recreate idempotency, rejected because it destroys in-app edits and, pointed at prod, real data); and the constraint that forced pure-and-testable — this project has no local Postgres, so a builder that cannot be verified without a database cannot be verified at all.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0042-real-trips-generated-from-committed-builders.md
git commit -m "docs(adr): record real trips as generated from committed builders"
```

---

## Gated manual step — NOT a task

After Task 7, **stop**. Show Cam the dry-run output and wait for explicit approval before running `npm run db:seed:real` against production. Do not run it as part of executing this plan.

Post-write verification (read-only) should confirm: one new Trip named "Christmas in Europe 2026" owned by `cammark.williams@gmail.com` with `xanni99.m@hotmail.com` as member; 11 stops, 11 accommodations, 13 transports, 17 costs, 1 exchange rate; and **"THE Trip" still present and unmodified**.

## Known gaps, carried deliberately

- **Ryanair payment date unknown.** `paidMinor` is recorded, `paidAt` is not. Fill it in the app when Cam has the date.
- **Six unbooked legs** are placeholders with no times: Strasbourg→Frankfurt, Frankfurt→Paris, Aghalee→Dublin, MXP→Como, Como→Milan, Milan→Rome.
- **Aghalee coordinates are approximate.** `npm run backfill:geocode` can refine them.
- **No wishlist items and no pre-trip checklist.** The old builder's 20-item checklist was stale (it listed accommodation as unbooked). Out of scope; add in-app.
