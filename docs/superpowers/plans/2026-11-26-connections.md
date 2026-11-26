# Connections (layovers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two Transports that meet at a place nobody stays at read as one journey: the wait is shown between them on the Plan, the Day view and a shared link, their tickets are seen on both, and each end's time is in that place's own zone.

**Architecture:** One pure module, `lib/connections.ts`, owns every rule (same place, wait, label, one booking, the journey home and out). A Transport gains two optional stored zones for ends that are a place and not a Stop; `lib/leg-zones.ts` is the one function that picks an end's zone and every reader goes through it. The surfaces only render what those two modules return.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing, server components or server actions), React 19, TypeScript, Tailwind 4, Prisma (one additive migration), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-connections.md`

## Global Constraints

- One migration only: `depTimezone String?` and `arrTimezone String?` on `Transport`. No other schema change, no new dependency.
- Copy is exact: "Layover in {place}", "Change at {place}", joined to the wait with " · " ("Layover in Bangkok · 2h 35m"). The wait uses `formatDuration` from `lib/transport.ts`. A file from a booking partner is labelled "on {leg}" where {leg} is that leg's `legLabel(...).label` without its leading mode word when one is present, else the full label. No em dashes in any user-facing string.
- Glossary words (CONTEXT.md): **Transport** (never "leg" or "segment" in UI copy; identifiers in existing code already say `leg` and may keep it), **Stop**, **Home base**, **Connection** (new; "layover" appears only in the flight wording of the line), **Booking confirmation**, **Attachment**.
- The public shared page must select, pass to a client component and render nothing new about a Transport except the Connection line's place and wait. Never: carrier, seat, terminal, gate, coach, platform, booking reference, notes, Costs, files, a Home end's place, the Home timezone's name.
- A Traveller surprised by a Stop must learn nothing new: every rule here runs on rows already masked by `lib/surprise-visibility` (`v.where.*`).
- `lib/tz-point.ts` (the timezone lookup table) is imported statically only by server code; client code loads it with `import("@/lib/tz-point")`. A static import from `components/` or `app/` is an ESLint error.
- Zero comments by default (only a non-obvious WHY); no JSDoc; no defensive checks for impossible cases; nothing beyond the task.
- Do not run `feedback:pull`, `feedback:resolve` or `feedback:accept`. Do not read `.env.production.local` or `.env.vercel-prod`. Never run a migration against anything but the local docker database.
- Commits are path-scoped: `git add <paths>` then `git commit -m "…" -- <paths>`; confirm with `git show --stat HEAD`. No attribution or co-author lines in commit messages.
- Verification per task: inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test`, `npm run build` or `npm run test:integration` in a task.

## Review Focus

1. A Transport with no stored zone (every Transport that exists today) must display and save exactly as before, at every reader (Tasks 2, 3).
2. Editing a Connection leg's time in the form and saving without touching anything else must not move the instant (round trip in the place's zone) (Task 3).
3. A journey home in two legs: the trip's "home on" date, the soft end and the "no way home" Flag read the last leg, not the first (Task 5).
4. Three legs in one booking (two layovers): each shows the other two's files once, and none is nudged (Tasks 1, 7).
5. Two legs that meet at the same place but with different booking references, or the same reference at different places, are not one booking (Task 1).

## Lanes

**First:** 1 ∥ 2 (no common file). **Then, concurrently:** 3, 4, 6. **Then:** 5 (after 4). **Then, concurrently:** 7, 8, 10 (10 after 5 and 6). **Last:** 9.

---

### Task 1: The Connection rules, pure

**Files:**
- Create: `lib/connections.ts`, `lib/connections.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ConnectionLeg {
    id: string; mode: string;
    depPlace?: string | null; arrPlace?: string | null;
    depPlaceId?: string | null; arrPlaceId?: string | null;
    depAt?: Date | null; arrAt?: Date | null;
    fromStopId?: string | null; toStopId?: string | null;
    depIsHome?: boolean | null; arrIsHome?: boolean | null;
    reference?: string | null;
  }
  export function meetingPlace(a: ConnectionLeg, b: ConnectionLeg): string | null;   // a's arrival place, trimmed, when it is b's departure place (names equal ignoring case, or both place ids set and equal)
  export function isConnection(a: ConnectionLeg, b: ConnectionLeg): boolean;          // meetingPlace != null AND a has no toStopId and !arrIsHome AND b has no fromStopId and !depIsHome
  export function waitMinutes(a: ConnectionLeg, b: ConnectionLeg): number | null;     // whole minutes a.arrAt → b.depAt; null when either is missing, negative, or >= 1440
  export function changeLabel(a: ConnectionLeg, b: ConnectionLeg): string | null;     // null when meetingPlace is null
  export function changeLabels(legs: readonly ConnectionLeg[]): (string | null)[];    // index i = the line above leg i; index 0 null
  export function sameBooking(a: ConnectionLeg, b: ConnectionLeg): boolean;           // isConnection AND references equal (trimmed, case-insensitive, non-empty)
  export function bookingPartners<T extends ConnectionLeg>(legs: readonly T[]): Map<string, T[]>; // id → the other legs of its booking, travel order; absent or [] when alone
  export function journeyHome<T extends ConnectionLeg>(legs: readonly T[], lastStopId: string | null): T[];
  export function journeyOut<T extends ConnectionLeg>(legs: readonly T[], firstStopId: string | null): T[];
  ```
- `changeLabel`: both modes `"FLIGHT"` → "Layover in {place}", else "Change at {place}"; place has one trailing ` (…)` group removed; when `waitMinutes` is a number append ` · ${formatDuration(n)}`.
- `bookingPartners`: sort a copy by `depAt` (nulls last, then id); chain consecutive legs while `sameBooking(prev, next)`.
- `journeyHome`: the first leg is `findReturnLeg(legs, lastStopId)` from `lib/home-base.ts`; then repeatedly append the leg `n` (not already taken) with `isConnection(last, n)`, choosing the earliest `depAt` at or after `last.arrAt` when several match; stop when none. `journeyOut` is the mirror: start from `findOutboundLeg(legs, firstStopId)` and prepend. Both return `[]` when there is no first leg.

- [ ] **Step 1: Failing tests** (fixtures: `dps` Denpasar Stop, `muc` Munich Stop; `a` = FLIGHT Stop dps → "Bangkok (BKK)", arr `2026-12-05T15:15Z`, ref "DHZU24"; `b` = FLIGHT "Bangkok (BKK)" → Stop muc, dep `2026-12-05T17:50Z`, ref "dhzu24 "):
  - `meetingPlace: names equal ignoring case and spaces`; `…or the same place id when the names differ` ("Doha" / "Hamad International", both placeId "p1" → "Doha"); `…null when neither matches`; `…null when a name is empty`.
  - `isConnection: a place nobody stays at` → true for a,b; false when `a.toStopId` is set, when `b.depIsHome`, when the places differ.
  - `waitMinutes` → 155 for a,b; null with a missing time; null when b leaves before a arrives; null at exactly 24 hours.
  - `changeLabel` → "Layover in Bangkok · 2h 35m"; a TRAIN/TRAIN pair at "Lyon Part-Dieu" 12 minutes apart → "Change at Lyon Part-Dieu · 12m"; a FLIGHT/TRAIN pair → "Change at …"; no times → "Layover in Bangkok"; two legs meeting at a Stop still get a label (it does not require `isConnection`).
  - `changeLabels` → `[null, "Layover in Bangkok · 2h 35m"]`; `[null, null]` for unrelated legs.
  - `sameBooking` → true for a,b; false with different references; false when either reference is blank; false for the same reference at different places.
  - `bookingPartners`: three legs in one booking → each maps to the other two in travel order; a lone leg has no entry or `[]`; input order does not matter.
  - `journeyHome`: Rome(Stop) → "Doha", "Doha" → Home(arrIsHome) → both, in order; one leg straight home → that leg; no leg from the last Stop → `[]`; a second, unrelated leg from "Doha" the next week is not taken when an earlier one fits.
  - `journeyOut`: Home → "Singapore", "Singapore" → first Stop → both, in order.
- [ ] **Step 2:** run → FAIL (module missing). **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(connections): the rules for a Connection, its wait, one booking and the journey home`.

---

### Task 2: A place end's own zone, stored and read

**Files:**
- Create: `prisma/migrations/20261126120000_transport_end_timezones/migration.sql`, `lib/leg-zones.ts`, `lib/leg-zones.test.ts`
- Modify: `prisma/schema.prisma` (model `Transport`), `server/actions/transport.ts` (both write paths, ~lines 160-200 and 325-355), and every reader that passes a Stop's zone into `resolveEndpointZones` or `transportTimeDisplay` (list in Step 5)
- Test: `server/actions/transport.test.ts`, plus the test beside each reader you change where one exists

**Interfaces:**
- Produces:
  ```ts
  // lib/leg-zones.ts (pure; no tz-point import)
  export function endZones(
    t: { fromStopId?: string | null; toStopId?: string | null; depTimezone?: string | null; arrTimezone?: string | null },
    stopZone: (stopId: string | null | undefined) => string | null | undefined,
  ): { fromTimezone: string | null; toTimezone: string | null };
  // fromTimezone = stopZone(fromStopId) ?? depTimezone ?? null   (a Stop's zone wins); same for the arrival end
  ```
  The result is passed, unchanged, as the `fromTimezone` / `toTimezone` arguments the existing functions already take. `resolveEndpointZones` and `transportTimeDisplay` themselves do not change: Home still wins over both, and an end with neither still borrows the other end's.
- Transport rows gain `depTimezone: string | null`, `arrTimezone: string | null`.

- [ ] **Step 1: Migration.** `ALTER TABLE "Transport" ADD COLUMN "depTimezone" TEXT, ADD COLUMN "arrTimezone" TEXT;` and the two optional fields in the schema, each with a one-line `//` note in the schema's existing style. Run `npx prisma migrate dev` against the local docker database only (`DATABASE_URL` / `DIRECT_URL` pointing at localhost) and `npx prisma generate`.
- [ ] **Step 2: Failing tests** in `lib/leg-zones.test.ts`: `a Stop's zone wins over a stored zone`; `a place end with a stored zone uses it`; `an end with neither is null`; `each end is decided on its own`.
- [ ] **Step 3:** implement `endZones`.
- [ ] **Step 4: Write path, test first.** In `transport.test.ts`: `a place end with coordinates and no Stop is saved with the zone at that point, and its time is read in it` — create Denpasar(Stop, Asia/Makassar) → place at 13.69, 100.75 with `arrAt` wall time "2026-12-05T22:15": the stored `arrTimezone` is "Asia/Bangkok" and `arrAt` is `2026-12-05T15:15:00.000Z`; `…an end that is a Stop or Home stores no zone`; `…a place end with no coordinates stores no zone and borrows the other end's, as before` (instant equals today's behaviour); the same three for update, plus `clearing the place clears its zone`. Implement in both write paths: `depTimezone = fromStopId || depIsHome ? null : pointTimezone(depLat, depLng)` (same for arrival), then `resolveEndpointZones(...endZones(...), home)`, and persist both columns.
- [ ] **Step 5: Readers.** At each of these, select the two new columns where the Transport is read and replace the pair of Stop-zone arguments with `endZones(t, stopZone)`: `lib/plan/leg-label.ts`, `lib/itinerary.ts` (~282), `lib/now-next.ts`, `lib/soft-end.ts`, `lib/travelling-home-loader.ts` (~176), `lib/desktop-home-loader.ts` (~357), `lib/booking-confirmations-loader.ts`, `lib/details-view.ts`, `lib/plan-entity-views.ts`, `lib/day-view-model.ts`, `lib/mcp/reads/plan-shapes.ts`, `lib/home-timezone-refile.ts`, `lib/booking-import/preview.ts`, `lib/booking-import/load-context.ts`, `components/trip/transport-card.tsx`, `components/trip/itinerary-manager.tsx`, `app/(app)/trips/[tripId]/summary/page.tsx`, `app/share/[token]/share-leg.ts`. Run `git grep -nE "resolveEndpointZones|transportTimeDisplay"` at the end and account for every hit in your report (changed, or why not). `components/trip/transport-form-dialog.tsx` is Task 3's: leave it. `lib/real-trip/christmas-europe-2026.ts` is a fixture: leave it.
- [ ] **Step 6: One reader test** proving the point end to end: in the test beside `lib/plan/leg-label.ts`, `a leg to a place with its own zone shows the arrival in that zone` (Denpasar 19:00 → 22:15, not 23:15); and `a leg with no stored zone reads exactly as before`.
- [ ] **Step 7: Other writers.** `git grep -nE "transport\.(create|createMany|update|upsert)" -- lib server scripts`: for each writer other than `server/actions/transport.ts` (booking import confirm, fork copy, MCP writes, seeds), either it copies a whole row (the new columns travel with it: confirm the select/spread includes them) or it builds a row from places (set the zones the same way). Name each in the report.
- [ ] **Step 8:** Task-done verification. **Commit** `feat(transport): a place end that is not a Stop keeps its own timezone`.

---

### Task 3: The Transport form reads and writes a place end in its zone

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (~lines 470-610), its test file
- Possibly: the type of the Transport the form is opened with (add `depTimezone` / `arrTimezone`), in whichever file declares it

**Interfaces:**
- Consumes: `endZones` (Task 2); stored `depTimezone` / `arrTimezone` on the Transport being edited.

- [ ] **Step 1: Failing tests:**
  - `editing a leg to a place with a stored zone shows the arrival in that zone` (22:15 in the arrival input for the Bangkok fixture).
  - `saving without changing anything sends the same wall times back` (the submitted `depAt` / `arrAt` strings equal the initial ones).
  - `picking a place for an end with no Stop switches that end to the place's zone`: mock `@/lib/tz-point`'s `pointTimezone` to return "Asia/Bangkok"; after picking, the zone label beside the arrival time names Bangkok's zone; a time typed after that is submitted as typed.
  - `choosing a Stop for the end goes back to the Stop's zone`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `initialZones` and `currentZones` go through `endZones` with, for each end, the Stop's zone, else the zone of the picked place held in form state (seeded from the stored column; set by `(await import("@/lib/tz-point")).pointTimezone(lat, lng)` when a place with coordinates is picked; cleared when the place is cleared). Follow how the Stop form already loads `tz-point` lazily (`git grep -n 'import("@/lib/tz-point")'`). When an end's zone changes, keep the wall time the Traveller sees in the input (the existing behaviour when a Stop changes: match it).
- [ ] **Step 4:** Task-done verification. **Commit** `feat(transport): the form shows a place end's time in that place's zone`.

---

### Task 4: The wait on the Plan's travel stack

**Files:**
- Modify: `components/plan/leg-pill.tsx` (`LegRow`), `components/trip/itinerary-manager.tsx` (`renderLegStack`, ~line 1420), `lib/plan/leg-label.ts` (remove `changeoverPlaces`), and their tests

**Interfaces:**
- Consumes: `changeLabels` (Task 1).
- `LegRowProps.changeovers` keeps its name and position but now carries the finished line for each child (`readonly (string | null)[]`); `LegRow` prints it as given in the existing `data-changeover` span.

- [ ] **Step 1: Failing tests:** in the `leg-pill` test, `the line above a leg is printed as given` ("Layover in Bangkok · 2h 35m" appears once, in a `[data-changeover]`, above the second card; nothing above the first). In the `itinerary-manager` test, `two flights meeting at a place show the layover and its wait between their cards`, and `two trains meeting at a place show Change at … with the wait`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; the Transports the manager holds must carry `depPlaceId` / `arrPlaceId` and `reference` for the rules (add them to its Transport type and to the loader's select if missing). Delete `changeoverPlaces` and its tests; `git grep changeoverPlaces` is empty afterwards.
- [ ] **Step 4:** Task-done verification. **Commit** `feat(plan): the line between two travel cards says how long the wait is`.

---

### Task 5: The journey home and the journey out

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (the outbound and return bookends, ~lines 1257-1285, 1810-1880, 1950-2055), and each caller of `findOutboundLeg` / `findReturnLeg` / `hasOutboundLeg` / `hasReturnLeg`: `lib/flags.ts`, `lib/next-steps.ts`, `lib/next-steps-builder.ts`, `lib/soft-end.ts`, `lib/trip-deadline.ts`, `lib/desktop-home-loader.ts`, `lib/day-view-model.ts`; tests beside each

**Interfaces:**
- Consumes: `journeyHome`, `journeyOut`, `changeLabels` (Task 1).

Rules (spec §1): a bookend draws its whole journey as one `LegRow` stack with `changeLabels`; every journey leg is in `bookendLegIds`, so none is drawn a second time in a Stop's slot. For each other caller decide which leg it needs and say so in the report: "is there one" → the journey is non-empty; "when do we get home" / the trip's end → the **last** leg's arrival; "when do we leave home" / the trip's start → the **first** leg's departure; "the leg leaving the last Stop" (for that Stop's day) → still the first.

- [ ] **Step 1: Failing tests:**
  - itinerary-manager: `a journey home in two legs is one stack under the last Stop with its layover line, and neither leg is drawn anywhere else` (each card's accessible name appears once); the same for a journey out.
  - `lib/soft-end.ts`: `a journey home in two legs ends on the last leg's arrival day`.
  - `lib/trip-deadline.ts`, `lib/flags.ts`, `lib/next-steps*.ts`: one test each that a two-leg journey home (first leg to a place, second leg Home-flagged) is treated exactly like a one-leg return for that module's purpose (no "no way home" Flag or step; the deadline unchanged).
  - A one-leg journey behaves exactly as before in each (existing tests stay green untouched).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, caller by caller. If a caller is correct already, leave it and add only its test.
- [ ] **Step 4:** Task-done verification. **Commit** `feat(plan): a journey home or out in more than one leg is drawn and counted as one journey`.

---

### Task 6: The wait on a shared link

**Files:**
- Modify: `app/share/[token]/share-leg.ts`, `app/share/[token]/share-rows.tsx` and/or `share-route-list.tsx` (wherever consecutive travel cards are laid out), `app/share/[token]/page.tsx` (only if the select needs `depPlaceId` / `arrPlaceId`; do NOT select `reference`), and their tests

**Interfaces:**
- Consumes: `changeLabels`, `journeyHome`, `journeyOut` (Task 1). Pass `reference: null` on every leg handed to the rules: one booking is not a public notion.

- [ ] **Step 1: Failing tests:** `two legs that meet at a place show the layover line between their cards` (text "Layover in Bangkok · 2h 35m"); `the journey home in two legs is listed together at the end of the route, in order`; `no leg hands its booking reference, carrier or seat to a client component` (extend the page's existing privacy test: the props of every client component under the share page contain none of those keys or values).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, computing the labels on the server and passing only the finished strings down. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(share): a shared link shows the wait between two legs of a journey`.

---

### Task 7: One booking's tickets are seen on every leg

**Files:**
- Create: `lib/booking-files.ts`, `lib/booking-files.test.ts`
- Modify: `lib/booking-confirmations-loader.ts`, the places a Transport's Attachments are listed (the transport card / details view / form: find them with `git grep -nE "attachmentsByTransportId|attachmentsByTarget\[" -- components lib app`), `lib/mcp/reads/plan-shapes.ts` or `lib/mcp/reads/entities.ts` (a leg's `files` and `needsBookingConfirmation`), and their tests

**Interfaces:**
- Consumes: `bookingPartners` (Task 1).
- Produces:
  ```ts
  // lib/booking-files.ts (pure)
  export interface SharedFile<A> { attachment: A; filedOn: string | null }   // filedOn = null for the leg's own files, else the partner's short label
  export function filesForLeg<A, T extends ConnectionLeg>(
    leg: T, legs: readonly T[], ownFiles: (id: string) => readonly A[], labelOf: (leg: T) => string,
  ): SharedFile<A>[];   // own files first, then each partner's in travel order
  export function partnerIds<T extends ConnectionLeg>(leg: T, legs: readonly T[]): string[];
  ```

- [ ] **Step 1: Failing tests** in `booking-files.test.ts`: `a leg lists its own files, then its booking partner's, each partner file labelled with that leg`; `three legs in one booking: the middle one shows both others' files once each`; `a leg alone lists only its own`; `two legs at the same place with different references share nothing`.
- [ ] **Step 2:** implement.
- [ ] **Step 3: The nudge, test first.** In the loader's test: `a Booked leg with no file whose booking partner has one needs no Booking confirmation`; `…when no leg of the booking has a file, each still needs one`; `…a partner's file hidden from this Traveller by a Surprise does not count`. Implement by giving each Transport subject the attachment ids of its partners as well as its own before `needsBookingConfirmation` runs (the function itself does not change). The loader must select the fields `bookingPartners` reads.
- [ ] **Step 4: Listing, test first.** Wherever a Transport's files are listed for a Traveller, a partner's file appears after the leg's own with the muted text "on {leg}" beside it, opens the same file, and offers no remove or rename control there (those stay on the leg it is filed on). The **Files** page is unchanged: assert in its test that each file is still listed once.
- [ ] **Step 5: Claude connection.** A leg's `needsBookingConfirmation` is false when a partner has a file; its `files` gain the partners' with a `filedOn` field naming the leg (own files omit it). Update the tool descriptions only if they describe `files`.
- [ ] **Step 6:** Task-done verification. **Commit** `feat(files): the tickets of one booking are seen on every leg of it`.

---

### Task 8: The wait in the Day view

**Files:**
- Modify: `lib/itinerary.ts` (the `TransportArrivalEntry`, ~line 140 and ~395), the component that renders a `transport-arrival` entry in the Timeline (`git grep -n '"transport-arrival"' -- components`), and their tests

**Interfaces:**
- Consumes: `isConnection`, `changeLabel` (Task 1); correct arrival days from Task 2.
- Produces: `TransportArrivalEntry.connection?: string` — the finished line, present only when the next leg (by departure time, among the Trip's Transports already in hand) makes a Connection with this one.

- [ ] **Step 1: Failing tests:** in `lib/itinerary.test.ts`, `an arrival that starts a Connection carries its line` ("Layover in Bangkok · 2h 35m") and `an arrival at a Stop carries none`; in the Timeline component's test, `the line is shown directly under the arrival` and is absent otherwise.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; the line is plain muted text under the arrival row, not a row of its own with controls. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(day): the Day view says how long a layover is, under the arrival that starts it`.

---

### Task 9: Documents

**Files:**
- Modify: `CONTEXT.md`, `components/trip/help-guide.tsx` (+ `lib/help-guide.ts` if its string list requires), `docs/open.md`

- [ ] **Step 1:** CONTEXT.md, a new entry after **Transport**, in the file's form: `**Connection**:` Two **Transport**s in a row where the first arrives at the place the second leaves from and the Travellers do not stay there (neither end is a **Stop** or the **Home base**). The Plan, the Day view and a shared link show the wait between them. Two Transports of a Connection with the same booking reference are **one booking**: each shows the other's **Attachment**s and they share a **Booking confirmation**. `_Avoid_: Layover (only the wording of the line between two flights), stopover, transfer, via, leg`
- [ ] **Step 2:** **Transport** entry: one sentence that an end which is a place with no Stop keeps that place's own zone, and one that the journey home (or out) may be several Transports joined by Connections. **Booking confirmation** entry: one sentence that it is shared across one booking.
- [ ] **Step 3:** Help guide: where it describes travel on the Plan, one sentence on the layover line; where it describes adding a ticket, one sentence that a ticket added to one flight of a booking shows on the connecting flight too. Match the surrounding voice and markup.
- [ ] **Step 4:** `docs/open.md`, "Ideas, not commitments": `- **Short Connection Flag** (Cam, 2026-11-26) Warn when the wait between two Transports of a Connection is too short for the mode. Left out of the Connections work to keep Flags untouched before the freeze.`
- [ ] **Step 5:** `TZ=UTC npx vitest run lib/help-guide.test.ts`. **Commit** `docs: Connections, a place end's own zone, and one booking's shared tickets`.

---

### Task 10: Two joined cards for a journey (added 2026-11-26, after Cam saw the first screenshots)

Cam's words on the Task 4 look: "that's not great, it's a bit confusing, it looks like there are 3 flights". He chose, from three mock-ups, "Two cards, clearly joined":

```
● Denpasar
│
│  ┌──────────────────────────────────────┐
✈──│ Flight Denpasar → Bangkok             │
│  │ Sat 5 Dec 19:00 → 22:15 · 4h 15m      │
│  │ TG 440 · Seat 32J, 32K · DHZU24       │
│  └──────────────────┬───────────────────┘
│        ( ◷ Layover in Bangkok · 2h 35m )
│  ┌──────────────────┴───────────────────┐
│  │ Flight Bangkok → Munich               │
│  │ Sun 6 Dec 00:50 → 06:45 · 11h 55m     │
│  │ TG 924 · Seat 44J, 44K · DHZU24       │
│  └──────────────────────────────────────┘
│
● Munich
```

**Files:**
- Modify: `components/plan/leg-pill.tsx` (`LegRow`, and a new exported `JourneyJoin`), its test; the shared page's travel list where Task 6 put its line (`app/share/[token]/…`), its test
- Create: nothing else

**Interfaces:**
- Produces: `export function JourneyJoin({ label, compact }: { label: string; compact?: boolean }): JSX.Element` — the join between two cards of one journey: a short vertical line from the card above to the card below with the label in a pill on it.
- `LegRow`'s `changeovers` prop is unchanged: a non-null entry at index i now means "card i is joined to card i-1".

Rules:
- A card whose `changeovers[i]` is non-null is **joined** to the card above: no gap between them beyond the join itself; the join is a vertical line (2px, `border-border`) centred under the cards' left third, about 28px tall, with the pill centred on it.
- The pill: `rounded-full border-2 border-border bg-background`, text `text-xs font-bold text-foreground`, a lucide `Clock` icon (`size-3.5`, `aria-hidden`) before the label, the label exactly as given ("Layover in Bangkok · 2h 35m"). It replaces the old muted `data-changeover` span; keep `data-changeover` on the pill.
- **One marker per journey:** only the first card of a run of joined cards gets the station dot and stub on the connector; joined cards after it get none.
- A card that is not joined (its entry is null) starts a new run with the normal gap and its own marker, exactly as today. So an unrelated third card in the same slot still reads as separate.
- Below `md` the cards are full width; the join and pill sit the same way, pill left-aligned with the cards' text inset if centring would look detached.
- Dark mode uses the existing tokens only; no raw colours.
- Reading order for a screen reader stays: card, the label text, card.
- The shared page uses the same `JourneyJoin` between its read-only cards, in place of whatever line Task 6 rendered.

- [ ] **Step 1: Failing tests** in the `leg-pill` test: `a joined card has no marker of its own` (two children, `changeovers=[null, "Layover in Bangkok · 2h 35m"]`: exactly one `[data-station-dot]`, on the first); `the join carries the label in a pill with a clock` (`[data-changeover]` contains the label text and an `svg[aria-hidden]`); `an unjoined card after a journey keeps its own marker and gap` (three children, `[null, "…", null]`: two dots); `the label is read between the two cards` (DOM order). In the shared page's test: `two legs of a journey are joined by the same pill`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(plan): two Transports of one journey are drawn as joined cards with the wait on the join`.

---

## Once, at the end of the branch

`npm test`, `npm run build` (stop the dev server first), and `npm run test:integration` against the local database (after `npx prisma migrate deploy` there).
