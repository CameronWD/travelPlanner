# Travel row and Travel details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Transport stores seven optional Travel details shown by mode, and the Plan shows each Transport as a three-line sun-coloured row instead of a one-line pill.

**Architecture:** One zod-free module (`lib/transport-details.ts`) owns the field keys, the per-mode labels and the one-line summary; every other layer (storage, form, import, MCP, views) consumes it. Seven nullable columns are added in a migration-only commit so it can deploy ahead of the code. The Plan row is a restyle of `LegPill` fed by two new strings on `LegLabel`.

**Tech Stack:** Next.js 16, React 19, Prisma 7 (Postgres), zod 4, Tailwind 4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-travel-row-and-details.md`

## Global Constraints

- Branch `feat/travel-row-and-details-2026-11-25`. Commit with explicit paths (`git add <paths>`), never `git add -A` / `git commit -a`: other tasks commit in the same checkout at the same time. Leave the untracked `AGENTS.md` alone.
- Never push, merge, or run `feedback:*`, `usage:report`, `db:seed*`, `prisma migrate *`, `prisma db *`, or anything that reads `.env.production.local`. `npx prisma generate` is allowed. Do not call the Anthropic API.
- Never run `npm test` or `npm run build` in a task. Verification per task: inner loop `TZ=UTC npx vitest run <test file>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>` (zero warnings). When tasks run side by side, a `tsc` error in a file outside your task is the other lane mid-edit: ignore it and say so.
- The seven stored names are exactly `carrier`, `serviceNumber`, `seat`, `terminal`, `gate`, `coach`, `platform`. Each is optional text, trimmed, at most 60 characters, blank stored as `null`.
- Labels, order and which fields a mode shows come only from `lib/transport-details.ts`. No other file repeats them.
- None of the seven appears on a shared link (`app/share/**`) or in the Calendar feed (`lib/ics.ts`, `app/api/calendar/**`). The printed plan, the in-app Calendar and the Digest do not change.
- `lib/transport-details.ts` and anything a `"use client"` file imports from it stay zod-free (`lib/client-zod.guard.test.ts`).
- The form label "Booking ref · only people on the trip see this" keeps its exact text (`lib/help-guide.ts` `GUIDE_UI_STRINGS`).
- Next.js here differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before using a Next API you have not just seen used in this repo.
- Comments only where the why is not obvious; no new docstrings on obvious helpers. No features beyond the task.
- End every commit message with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. Editing a Transport from a form or tool that does not send a detail (an MCP patch with only `notes`, a drag that changes `sortOrder`) must not wipe the stored details. Test in Task 3 (`mergeTransportPatch`).
2. Emptying a detail in the form clears it; a detail hidden by the current mode is kept. Tests in Tasks 3 and 5.
3. A Transport with no details and no reference shows no third line and no stray " · ". Tests in Tasks 1 and 8.
4. A value typed with its own word ("Coach 7", "seat 42A") is not double-prefixed. Test in Task 1.
5. An overnight or multi-day leg shows "+1"/"+2" on the arrival, and a leg with only a departure time shows no dangling arrow. Tests in Task 8.

---

### Task 1: The Travel details module

**Files:**
- Create: `lib/transport-details.ts`
- Test: `lib/transport-details.test.ts`

**Interfaces — Produces:**

```ts
import type { TransportMode } from "@/lib/enum-values";
export const TRANSPORT_DETAIL_KEYS = ["carrier", "serviceNumber", "seat", "terminal", "gate", "coach", "platform"] as const;
export type TransportDetailKey = (typeof TRANSPORT_DETAIL_KEYS)[number];
export type TransportDetails = { [K in TransportDetailKey]?: string | null };
export const TRANSPORT_DETAIL_MAX = 60;
export interface TransportDetailField { key: TransportDetailKey; label: string }
/** The fields a mode shows, in form order. */
export function transportDetailFields(mode: TransportMode): TransportDetailField[];
/** The one-line summary; "" when nothing applies. */
export function transportDetailsLine(mode: TransportMode, details: TransportDetails): string;
/** All seven keys, trimmed, blank as null. */
export function pickTransportDetails(src: TransportDetails): Record<TransportDetailKey, string | null>;
```

Form order and labels (exact):
- FLIGHT: carrier "Airline", serviceNumber "Flight number", seat "Seat", terminal "Terminal", gate "Gate"
- TRAIN: carrier "Operator", serviceNumber "Train number", coach "Coach", seat "Seat", platform "Platform"
- BUS: carrier "Operator", serviceNumber "Bus number", seat "Seat"
- FERRY and OTHER: carrier "Operator", serviceNumber "Service number", seat "Seat"
- CAR: carrier "Hire company"

Line rules: only keys the mode shows; fixed order carrier, serviceNumber, coach, seat, terminal, gate, platform; joined with `" · "`; coach/seat/terminal/gate/platform prefixed with "Coach"/"Seat"/"Terminal"/"Gate"/"Platform" and a space unless the trimmed value already starts with that word (case-insensitive); carrier omitted when mode is FLIGHT and serviceNumber is non-blank; blank and null values skipped.

- [ ] **Step 1: Write the failing tests**

```ts
it("lists a mode's fields in form order with their labels", () => {
  expect(transportDetailFields("FLIGHT")).toEqual([
    { key: "carrier", label: "Airline" }, { key: "serviceNumber", label: "Flight number" }, { key: "seat", label: "Seat" },
    { key: "terminal", label: "Terminal" }, { key: "gate", label: "Gate" },
  ]);
  expect(transportDetailFields("TRAIN").map((f) => f.label)).toEqual(["Operator", "Train number", "Coach", "Seat", "Platform"]);
  expect(transportDetailFields("BUS").map((f) => f.label)).toEqual(["Operator", "Bus number", "Seat"]);
  expect(transportDetailFields("FERRY")).toEqual(transportDetailFields("OTHER"));
  expect(transportDetailFields("FERRY").map((f) => f.label)).toEqual(["Operator", "Service number", "Seat"]);
  expect(transportDetailFields("CAR")).toEqual([{ key: "carrier", label: "Hire company" }]);
});
it("writes the line in a fixed order with words on the short values", () => {
  expect(transportDetailsLine("TRAIN", { carrier: "DB", serviceNumber: "ICE 9572", coach: "7", seat: "42", platform: "12" })).toBe("DB · ICE 9572 · Coach 7 · Seat 42 · Platform 12");
  expect(transportDetailsLine("FLIGHT", { carrier: "Lufthansa", serviceNumber: "LH 2456", seat: "32A", terminal: "2", gate: "B14" })).toBe("LH 2456 · Seat 32A · Terminal 2 · Gate B14");
  expect(transportDetailsLine("FLIGHT", { carrier: "Lufthansa" })).toBe("Lufthansa");
});
it("does not repeat a word the Traveller typed (Review Focus 4)", () => {
  expect(transportDetailsLine("TRAIN", { coach: "Coach 7", seat: "seat 42A" })).toBe("Coach 7 · seat 42A");
});
it("leaves out what the mode does not show, and blanks (Review Focus 3)", () => {
  expect(transportDetailsLine("CAR", { carrier: "Hertz", seat: "1", gate: "4" })).toBe("Hertz");
  expect(transportDetailsLine("BUS", { carrier: "  ", serviceNumber: null })).toBe("");
  expect(transportDetailsLine("FLIGHT", {})).toBe("");
});
it("picks all seven keys, trimmed, blank as null", () => {
  expect(pickTransportDetails({ carrier: " DB ", seat: "" })).toEqual({ carrier: "DB", serviceNumber: null, seat: null, terminal: null, gate: null, coach: null, platform: null });
});
```

- [ ] **Step 2:** Run `TZ=UTC npx vitest run lib/transport-details.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the module. No zod, no React, no `server-only`.
- [ ] **Step 4:** Run the test file: PASS. Then `npx tsc --noEmit` and `npx eslint lib/transport-details.ts lib/transport-details.test.ts`.
- [ ] **Step 5:** Commit: `feat(transport): the Travel details a mode shows, and their one-line summary`

---

### Task 2: Seven columns on Transport (migration-only commit)

**Files:**
- Modify: `prisma/schema.prisma` (model `Transport`, directly after `notes String?`)
- Create: `prisma/migrations/20261125120000_transport_travel_details/migration.sql`
- Modify: `docs/DEPLOY.md` (new section after the latest "§4m", named "§4n")

This commit must contain nothing but the schema, the migration and the DEPLOY.md section: it is deployed to `main` on its own, ahead of the code that reads the columns.

- [ ] **Step 1:** Add to the model: `carrier String?`, `serviceNumber String?`, `seat String?`, `terminal String?`, `gate String?`, `coach String?`, `platform String?`.
- [ ] **Step 2:** Write `migration.sql`, following `prisma/migrations/20261106120000_regions/migration.sql`'s style, with a header comment "Additive, nullable, no backfill — one deploy":

```sql
ALTER TABLE "Transport" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "serviceNumber" TEXT,
ADD COLUMN     "seat" TEXT,
ADD COLUMN     "terminal" TEXT,
ADD COLUMN     "gate" TEXT,
ADD COLUMN     "coach" TEXT,
ADD COLUMN     "platform" TEXT;
```

- [ ] **Step 3:** `npx prisma generate`. Do NOT run any `prisma migrate` command.
- [ ] **Step 4:** DEPLOY.md §4n, in the form of the earlier §4x sections: this migration adds seven nullable columns; deploy `main` with this commit first (the build runs `prisma migrate deploy`); beta and previews read the production database without migrating, so code that selects the new columns fails with P2022 on beta until `main` has deployed; rollback is redeploying the previous build, the columns can stay.
- [ ] **Step 5:** `npx tsc --noEmit`. If it names literals that now lack the new keys, the type forced a required key somewhere: report it, do not edit files outside this task.
- [ ] **Step 6:** Commit the three paths: `feat(db): seven optional Travel details columns on Transport`

---

### Task 3: Writing and copying Travel details

**Files:**
- Modify: `lib/validations/transport.ts` (`transportSchema`, next to `reference` ~79)
- Modify: `server/actions/transport.ts` (`createTransport` data ~181-200, `updateTransport` write ~336-350)
- Modify: `lib/transport-patch.ts` (`TransportPatchRow`, `mergeTransportPatch`)
- Modify: `lib/transport-clearable.ts` (`CLEARABLE`)
- Modify: `lib/activity.ts` (`FIELD_SPECS.TRANSPORT` ~253-266)
- Modify: `lib/fork-plan.ts` (`ForkSourceTransport` ~67-96, the `data` type ~240-262, `buildForkPlan` ~363-373)
- Modify: `lib/duplicate-trip.ts` (`DuplicateSourceTransport`, the `data` type ~160, `buildDuplicatePlan` ~249-275)
- Modify, only where `tsc` demands: `prisma/demo/persist.ts`, `prisma/real/persist.ts`, `lib/demo/types.ts`, `prisma/seed.ts`
- Modify: `app/share/[token]/page.test.tsx` (`FORBIDDEN` ~268: add all seven)
- Test: `lib/validations/transport.test.ts` (or the file that tests `transportSchema`), `lib/transport-patch.test.ts`, `lib/transport-clearable.test.ts`, `lib/activity.test.ts`, `lib/fork-plan.test.ts`, `lib/duplicate-trip.test.ts`, `server/actions/transport.test.ts`

**Interfaces:**
- Consumes: `TRANSPORT_DETAIL_KEYS`, `TRANSPORT_DETAIL_MAX` from Task 1; the columns from Task 2.
- Produces: `TransportInput` (from `transportSchema`) has the seven optional string keys; `TransportPatch` accepts them (a key set to `null` clears, an absent key keeps).

Behaviour:
- `transportSchema`: each key `z.string().trim().max(TRANSPORT_DETAIL_MAX).optional()`.
- `createTransport` and `updateTransport` write `key: data.key ?? null` for all seven.
- `mergeTransportPatch` carries all seven with the same `patched(patch.x, current.x)` rule as `reference`.
- `CLEARABLE` gains all seven.
- Activity labels: carrier "Carrier", serviceNumber "Number", seat "Seat", terminal "Terminal", gate "Gate", coach "Coach", platform "Platform".
- Fork copies all seven. Duplicate Trip sets all seven to `null` (like `reference`).

- [ ] **Step 1: Write the failing tests**, in each file's existing style:
  - schema: accepts `{ ...valid, seat: " 42A " }` and yields `seat: "42A"`; rejects a 61-character `gate`.
  - `mergeTransportPatch` (Review Focus 1): a current row with `seat: "42"`, `serviceNumber: "ICE 9572"` merged with patch `{ notes: "x" }` keeps both; merged with `{ seat: null }` gives `seat: null` (the action then stores null) and keeps `serviceNumber`. Update the file's exact `toEqual` expectation to include the seven keys.
  - clearable (Review Focus 2): an input with `seat` absent lists `seat` as clearable, with `seat: "42"` it does not.
  - activity: changing `seat` from "42" to "43" yields a change labelled "Seat".
  - fork: a source transport with `carrier: "DB", platform: "12"` forks with both. Duplicate: the same source duplicates with all seven `null`.
  - actions: `createTransport` with `serviceNumber: "LH 2456"` passes it to `db.transport.create`; `updateTransport` with patch `{ gate: "B14" }` on a row holding `seat: "32A"` writes `gate: "B14"` and `seat: "32A"`.
- [ ] **Step 2:** Run those files: the new tests FAIL.
- [ ] **Step 3:** Implement. Where a seed or demo type fails `tsc`, add the keys as optional or `null`; do not invent demo values.
- [ ] **Step 4:** Add the seven names to the share page test's `FORBIDDEN` list (it must still pass: the share select is not changed).
- [ ] **Step 5:** `TZ=UTC npx vitest related --run` on the changed source files, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 6:** Commit: `feat(transport): Travel details are saved, cleared, forked and recorded`

---

### Task 4: Reading and showing Travel details

**Files:**
- Modify: `lib/plan-reads.ts` (`PLAN_TRANSPORT_SELECT` ~59-85)
- Modify: `lib/day-reads.ts` (transport select ~85-92), `lib/day-view-model.ts` (`DayTransportRow` ~185-191, the map ~314-319), `lib/itinerary.ts` (`ItineraryTransport` ~70-90)
- Modify: `lib/plan-entity-views.ts` (`TransportCardTransport` ~58-90)
- Modify: `lib/booking-import/types.ts` (`ProposedTransportInput` ~53-70: type only, so Tasks 5 and 6 can both rely on it)
- Modify: `components/trip/itinerary-manager.tsx` (the `ItineraryTransport` interface ~135-161 only; do not touch `renderLegPill` or the leg rows, that is Task 8)
- Modify: `app/api/calendar/[token]/route.ts` only if `tsc` demands, keeping its narrowing so no new field reaches `lib/ics.ts`
- Modify: `lib/details-view.ts` (`DetailsView`, `transportDetails`, and the other builders' `bare()`), `components/trip/details-sheet.tsx`
- Modify: `components/trip/timeline.tsx` (`TransportRow` ~375-446)
- Modify: `components/trip/transport-card.tsx` (subline ~120-135)
- Test: `lib/details-view.test.ts`, `components/trip/details-sheet.test.tsx`, `components/trip/timeline.test.tsx`, `components/trip/transport-card.test.tsx`, `lib/day-view-model.test.ts`

**Interfaces:**
- Consumes: `TransportDetails`, `transportDetailsLine` (Task 1).
- Produces: `TransportCardTransport`, both `ItineraryTransport` types and `DayTransportRow` extend `TransportDetails` (seven optional `string | null` keys). `DetailsView` gains `travelDetails: string | null`. `ProposedTransportInput extends ProposalCostFields, TransportDetails` (in a Proposal the keys are optional strings; omit a key rather than set null).

Behaviour:
- Both selects read the seven columns; the Day map passes them through.
- `transportDetails()` sets `travelDetails` to `transportDetailsLine(t.mode, t)` or `null`; every other builder sets `null`.
- Details sheet: a row `data-row="travel-details"` labelled "Details", placed directly before the `reference` row, shown only when non-null.
- Day view `TransportRow`: on the **departure** row only, the line as a `<p data-travel-details className="mt-0.5 text-xs font-medium text-muted-foreground break-words">` directly under the from → to line; nothing when the line is empty.
- `TransportCard`: the line as its own `<span>` in the subline after the mode label and before the reference chip, with `highlightAttrs(highlight, "details")`.

- [ ] **Step 1: Write the failing tests:**
  - `details-view`: a TRAIN with `serviceNumber: "ICE 9572", seat: "42"` gives `travelDetails: "ICE 9572 · Seat 42"`; with none, `null`. Update the two exact `toEqual` expectations (~41, ~74) to include `travelDetails`.
  - `details-sheet`: the row order test (~58-60) includes `travel-details` directly before `reference` when present, and is unchanged when absent.
  - `timeline`: a departure entry whose transport has `serviceNumber: "LH 2456", seat: "32A"` renders `[data-travel-details]` with text "LH 2456 · Seat 32A"; the arrival entry of the same transport renders none; a transport with no details renders none.
  - `transport-card`: renders "LH 2456 · Seat 32A" in the subline for that transport.
  - `day-view-model`: a day row with `gate: "B14"` reaches `entry.transport.gate`.
- [ ] **Step 2:** Run those files: new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `TZ=UTC npx vitest related --run` on changed source files, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 5:** Commit: `feat(transport): Travel details show on the Day view, the details sheet and the Transport card`

---

### Task 5: The form shows a mode's Travel details

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`
- Test: `components/trip/transport-form-dialog.test.tsx`

**Interfaces — Consumes:** `transportDetailFields`, `pickTransportDetails`, `TRANSPORT_DETAIL_KEYS`, `TRANSPORT_DETAIL_MAX` (Task 1); the seven keys on `TransportCardTransport` (Task 4), on `TransportInput` (Task 3) and on `ProposedTransportInput` (Task 4).

Behaviour:
- A group headed "Travel details", `data-group="travel-details"`, placed after the times and before the `data-pair="booking"` grid. One text `Input` per field of `transportDetailFields(mode)`, labelled with the field's label, `maxLength={TRANSPORT_DETAIL_MAX}`, in a two-column grid on a wide screen and one column on a phone. Follow the file's existing field/label components.
- State: one `Record<TransportDetailKey, string>` seeded from `transport ?? proposed` (blank for missing). All seven values feed `useFormDirty`.
- Changing mode re-renders the fields for the new mode; values of hidden keys stay in state.
- `buildInput` sends all seven: `key: value.trim() || undefined`. So emptying a shown field clears it (via `transportClearable`), and a hidden key that holds a value is sent unchanged.

- [ ] **Step 1: Write the failing tests** (RTL + userEvent, the file's `baseProps` / `existingTransport` fixtures):
  - Flight mode shows inputs labelled Airline, Flight number, Seat, Terminal, Gate and none labelled Coach or Platform; switching the mode tile to Train shows Operator, Train number, Coach, Seat, Platform and none labelled Gate.
  - Car mode shows only "Hire company".
  - Creating a Train with Train number "ICE 9572" and Seat "42" calls `createTransport` with `expect.objectContaining({ serviceNumber: "ICE 9572", seat: "42" })`.
  - Editing a transport that holds `seat: "42"` and emptying Seat calls `updateTransport` with `expect.objectContaining({ seat: null })` (Review Focus 2).
  - Editing a Flight that holds `gate: "B14"`, switching to Train and saving sends `gate: "B14"` unchanged, not `null` (Review Focus 2).
  - Typing in a details field makes the form dirty (the file's existing dirty assertion style).
  - The existing "Booking ref · only people on the trip see this" label test still passes untouched.
- [ ] **Step 2:** Run the test file: new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx`, then `vitest related --run components/trip/transport-form-dialog.tsx`, `npx tsc --noEmit`, `npx eslint` on the two files.
- [ ] **Step 5:** Commit: `feat(transport): the Transport form asks for a mode's Travel details`

---

### Task 6: The Booking import fills Travel details

**Files:**
- Modify: `lib/booking-import/build.ts` (notes composition ~443-449, `UNCERTAIN_TO_HIGHLIGHT` ~47-58)
- Modify: `lib/booking-import/preview.ts` (`TransportPreview` and its mapping ~28-85)
- Modify: `lib/booking-import/edit.ts` only if `mergeTransportEdit` drops unknown keys (it spreads `edited`; confirm with a test)
- Test: `lib/booking-import/build.test.ts`, `lib/booking-import/preview.test.ts`, `lib/booking-import/edit.test.ts`

**Interfaces — Consumes:** `TransportDetails` (Task 1); `ProposedTransportInput` carrying the seven keys as optional strings (Task 4; no `null`s in a Proposal: omit the key).

Behaviour:
- `input.carrier` = trimmed `t.carrier` when present (always, including flights: the row's summary decides whether to show it). `input.serviceNumber` = trimmed `t.serviceNumber`. `input.seat` = trimmed `t.seat` (no "Seat " prefix).
- `input.notes` = trimmed `t.travelClass` only, absent when blank.
- `UNCERTAIN_TO_HIGHLIGHT`: `carrier`, `serviceNumber` and `seat` map to `"details"`; `travelClass` stays `"notes"`.
- `transportPreview` carries the three keys to the card.
- Confirm needs no change (`confirm.ts` spreads the input into `createTransport`); add no code there.

- [ ] **Step 1: Write the failing tests:**
  - Update the exact p1 expectation (~48-65): `notes: "Economy"`, `serviceNumber: "SK101"`, `seat: "32A"`, `carrier: "Skylark Air"`.
  - Update the car hire expectation (~376): `carrier: "Hertz"` and no `notes`.
  - A transport with `uncertainFields: ["seat"]` highlights `"details"`; with `["travelClass"]` highlights `"notes"`.
  - `preview`: a Proposal with `serviceNumber: "SK101", seat: "32A"` previews with both.
  - `edit`: `mergeTransportEdit(prev, { ...prev, seat: "30C" })` keeps `seat: "30C"` and `serviceNumber`.
- [ ] **Step 2:** Run the three files: new and updated tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `TZ=UTC npx vitest related --run lib/booking-import/build.ts lib/booking-import/preview.ts`, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 5:** Commit: `feat(booking-import): the flight or train number, carrier and seat go to Travel details, not Notes`

---

### Task 7: Claude's tools read and set Travel details

**Files:**
- Modify: `lib/mcp/tools/bookings-write.ts` (`transportCreateShape` ~128-143, `transportPatchShape` ~145-168, and the `add_transport` / `update_transport` descriptions)
- Modify: `lib/mcp/reads/plan-shapes.ts` (`McpTransport` ~195-221, `MCP_TRANSPORT_SELECT` ~290-294, `McpTransportRow`, `toMcpTransport` ~519-546)
- Modify: the server instructions text only if it lists a Transport's fields (search `lib/mcp/` for the sentence that describes a Transport); add one sentence: "A Transport can carry Travel details: carrier, serviceNumber (the flight or train number), seat, terminal and gate for a flight, coach and platform for a train."
- Test: `lib/mcp/tools/bookings-write.test.ts`, `lib/mcp/reads/plan-shapes.test.ts`, `lib/mcp/reads/trip-plan.test.ts`, `lib/mcp/vocab.test.ts` if it pins the instructions

**Interfaces — Consumes:** `TRANSPORT_DETAIL_KEYS`, `TRANSPORT_DETAIL_MAX` (Task 1); `TransportInput` / `TransportPatch` with the seven keys (Task 3).

Behaviour:
- Create shape: each key `z.string().trim().max(60).optional()` with a one-line `.describe()` (e.g. serviceNumber: "Flight or train number, e.g. LH 2456").
- Patch shape: each key optional and nullable in the same way `reference` is in that shape (null clears).
- `get_transport` and `get_trip_plan` return all seven on every Transport (null when unset).
- The AI Review reads the same shape (`lib/review/input-shape.ts`); the seven are NOT added to its `OMIT` set.

- [ ] **Step 1: Write the failing tests:**
  - `add_transport` with `serviceNumber: "LH 2456", seat: "32A"` calls `createTransport` with both.
  - `update_transport` with `{ gate: "B14" }` passes `gate: "B14"`; with `{ seat: null }` passes `seat: null`.
  - `toMcpTransport` on a row with `carrier: "DB", platform: "12"` returns both, and `null` for the other five. Extend the full `McpTransportRow` literals in `plan-shapes.test.ts` (~209) and `trip-plan.test.ts` (~303).
- [ ] **Step 2:** Run those files: new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `TZ=UTC npx vitest related --run lib/mcp/tools/bookings-write.ts lib/mcp/reads/plan-shapes.ts`, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 5:** Commit: `feat(mcp): Claude's tools read and set a Transport's Travel details`

---

### Task 8: The travel row on the Plan

**Files:**
- Modify: `lib/plan/leg-label.ts` (+ `lib/plan/leg-label.test.ts`)
- Modify: `components/plan/leg-pill.tsx` (+ `components/plan/leg-pill.test.tsx`)
- Modify: `components/trip/itinerary-manager.tsx` (`renderLegPill` ~1376-1391 only, if it must pass anything new) (+ `components/trip/itinerary-manager.test.tsx` only where an assertion about the pill's classes or structure breaks)

**Interfaces — Consumes:** `TransportDetails`, `transportDetailsLine` (Task 1); the Plan's `ItineraryTransport` carrying `reference`, `arrAt` and the seven keys (Task 4).

**Produces:**
- `LegTransport` (in `leg-label.ts`) gains `reference?: string | null` and extends `TransportDetails`.
- `LegLabel` gains `arrival: string` and `detail: string`. `icon`, `label`, `sub`, `missing` and `accessibleName` keep their current values for every existing test.
  - `arrival`: `""` unless both `depAt` and `arrAt` are set; otherwise `→ ${arrTime}${plus} · ${duration}` where `arrTime` is the arrival's local time from `transportTimeDisplay`, `plus` is `" +N"` when its `dayDelta` N is 1 or more (else nothing), and `duration` is `formatDuration(minutes between depAt and arrAt)`; when `arrAt` is set but the minutes are not positive, leave off `" · duration"`.
  - `detail`: `[transportDetailsLine(t.mode, t), t.reference?.trim()].filter(Boolean).join(" · ")`.
  - `missingLegLabel` returns `arrival: ""`, `detail: ""`.

**The component.** `LegRow` keeps its props, data attributes and connector. `LegPill` keeps its props and name. The missing prompt (`label.missing`) renders exactly as today. A real leg renders:

```tsx
<button type="button" aria-label={accessibleName} onClick={onClick} data-travel-row
  className={cn(
    "group tap-target pressable flex min-w-0 max-w-full items-start gap-2.5 rounded-2xl border-2 border-border bg-sun/15 text-left max-md:w-full",
    compact ? "px-2.5 py-2" : "px-3 py-2.5",
  )}>
  <span aria-hidden className={cn("island flex shrink-0 items-center justify-center rounded-lg bg-sun text-on-accent", compact ? "size-7" : "size-8")}>
    {Icon ? <Icon className="size-4" /> : null}
  </span>
  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
    <span className={cn("flex min-w-0 items-center gap-2 font-bold", compact ? "text-xs" : "text-[13px]")}>
      <span className="min-w-0 truncate">{label.label}</span>
      {attached ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
      <BookingStateBadge state={bookingState} bookBy={bookBy} compact hidden className="ml-auto text-xs" />
    </span>
    {when ? <span data-travel-line="when" className="text-xs font-semibold tabular-nums text-foreground">{when}</span> : null}
    {label.detail ? <span data-travel-line="detail" className="break-words text-xs font-medium text-muted-foreground">{label.detail}</span> : null}
  </span>
</button>
```

with `const when = [label.sub, label.arrival].filter(Boolean).join(" ")`. The station dot in `LegRow` is re-centred on the icon tile: `top-6` when compact (2px border + 8px padding + half of 28px), `top-7` otherwise (2 + 10 + 16); its horizontal offsets do not change. The `LegRow` minimum heights stay.

- [ ] **Step 1: Write the failing tests.**

`leg-label.test.ts` (use the file's existing stop and transport fixtures; times below are local to the fixture's zones):
  - a train leaving 09:28 and arriving 13:05 the same day: `arrival` is `"→ 13:05 · 3h 37m"`.
  - a flight arriving on the next local day: `arrival` starts `"→ "` and contains `" +1 · "` (Review Focus 5); arriving two local days later contains `" +2 · "`.
  - a leg with `depAt` and no `arrAt`: `arrival` is `""` (Review Focus 5).
  - a train with `serviceNumber: "ICE 9572", coach: "7", seat: "42", reference: "QX7P2M"`: `detail` is `"ICE 9572 · Coach 7 · Seat 42 · QX7P2M"`; with only a reference: `"QX7P2M"`; with neither: `""` (Review Focus 3).
  - `missingLegLabel(...)` has `arrival: ""` and `detail: ""`.
  - every existing expectation on `label`, `sub` and `accessibleName` passes unchanged.

`leg-pill.test.tsx` (rewrite the class assertions that pinned the one-line pill: `h-7`, `h-[34px]`, `whitespace-nowrap`, `rounded-full`, `bg-card`, `shrink-[100]` for a real leg; keep every assertion about the missing prompt and about `LegRow`'s data attributes):
  - a real leg renders `[data-travel-row]` with class `bg-sun/15` and `rounded-2xl`, and a tile with `bg-sun`.
  - with `sub: "Thu 10 Dec 09:28"`, `arrival: "→ 13:05 · 3h 37m"`: `[data-travel-line="when"]` has text `"Thu 10 Dec 09:28 → 13:05 · 3h 37m"`.
  - with `detail: ""`: no `[data-travel-line="detail"]` (Review Focus 3); with `detail: "ICE 9572 · QX7P2M"`: it shows that text.
  - the missing prompt has no `[data-travel-row]`, no `bg-sun` class, and keeps `border-dashed`.
  - the accessible name is unchanged (the existing booking-state and "File attached." cases).
  - the station dot has `top-6` when compact and `top-7` otherwise.
  - the banned-class list test still passes.

- [ ] **Step 2:** Run both files: new tests FAIL.
- [ ] **Step 3:** Implement `leg-label.ts`, then `leg-pill.tsx`. In `itinerary-manager.tsx` change `renderLegPill` only if `legLabel` does not already receive the whole transport.
- [ ] **Step 4:** `TZ=UTC npx vitest run components/trip/itinerary-manager.test.tsx`; fix only assertions about the pill's old classes or single-line structure. Queries by accessible name must pass unchanged; if one does not, the accessible name regressed: fix the code, not the test.
- [ ] **Step 5:** `TZ=UTC npx vitest related --run lib/plan/leg-label.ts components/plan/leg-pill.tsx`, `npx tsc --noEmit`, `npx eslint` on changed files.
- [ ] **Step 6:** Commit: `feat(plan): a Transport is a three-line sun row with its times, Travel details and reference`

---

### Task 9: Words

**Files:**
- Modify: `CONTEXT.md` (the **Transport** entry ~57-59; a new **Travel details** entry directly after it)
- Modify: `lib/release-notes.ts`
- Modify: `lib/help-guide.ts` only if a guide step describes the Transport form's fields or the Plan's travel pill (search it for "Booking ref" and "transport"); then add one plain sentence and keep `GUIDE_UI_STRINGS` true.

- [ ] **Step 1:** CONTEXT.md, **Transport**: change "a reference (flight/train number)" to "a booking reference". Add:

```markdown
**Travel details**:
The optional particulars of a **Transport** beyond its places and times: the carrier, the flight or train number, the seat, and by mode the terminal and gate (a flight) or the coach and platform (a train). A car has only its hire company. Each is short free text the Traveller types or a **Booking import** fills. Changing a Transport's mode hides the ones that no longer apply without clearing them. Distinct from the **booking reference** (what you quote to the carrier) and from Notes (anything else). Never shown on a shared link or in the **Calendar feed**.
_Avoid_: Details line (that is only how they are summarised on a row), flight info, ticket info
```

- [ ] **Step 2:** Release note at the top of `RELEASE_NOTES`. Run `date -u +%Y-%m-%dT%H:%M:00Z` and use a `publishedAt` that is later than the current newest note and not in the future:

```ts
{ publishedAt: "<that time>", text: "The Plan shows travel as a proper row with arrival time and duration. A Transport can now hold its flight or train number, seat, gate and platform." },
```

- [ ] **Step 3:** `TZ=UTC npx vitest run lib/release-notes.test.ts lib/help-guide.test.ts` (and any CONTEXT.md test that `npx vitest related --run CONTEXT.md` finds), `npx tsc --noEmit`, `npx eslint lib/release-notes.ts`.
- [ ] **Step 4:** Commit: `docs: Travel details in the glossary, and the release note`

---

## Order

Task 1 and Task 2 side by side. Then Task 3. Then Task 4. Then Tasks 5, 6, 7, 8 and 9 side by side (no shared files).

## After the tasks (orchestrator)

1. Apply the migration to the local databases the tests use, then the branch tier: `npm test`, `npm run build`, `npm run test:integration`.
2. Look at the Plan in a browser on the local demo trip at phone and desktop widths, light and dark: the row, a stacked pair of legs, a Home leg, a missing-leg prompt, a leg with no details.
3. Deploy order for Cam, last: the Task 2 commit to `main` alone; then this branch to beta for his phone; then `main`.
