# Entering a layover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Traveller enters a journey with a layover in one form by ticking "This flight includes a layover", and one save makes the two joined Transports.

**Architecture:** A new server action in `server/actions/transport.ts` validates the whole journey, then writes both Transports in one database transaction by reusing the code paths `createTransport` and `updateTransport` already use for a single row. The form adds a tick box and a small group of fields and calls the new action only when the box is ticked; with it unticked the form submits exactly as today.

**Tech Stack:** Next.js 16 server actions (read `node_modules/next/dist/docs/` first), React 19, TypeScript, zod, Prisma, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-layover-entry.md` (and, for the rules a Connection must satisfy, `docs/superpowers/specs/2026-11-26-connections.md` and `lib/connections.ts`).

## Global Constraints

- No migration, no new dependency.
- Copy is exact: "This flight includes a layover"; "This journey includes a change"; field labels "Layover at", "Land there", "Leave" for a flight and "Change at", "Arrive there", "Leave" otherwise; "Second flight" / "Second train" / "Second bus" / "Second ferry" / "Second transport" and "Seat"; the error "A layover is under a day. For a longer stay, add a Stop."; the other errors "Add where the layover is.", "Landing must be after you depart.", "You can't leave before you land.", "Arriving must be after you leave the layover." (use "change" for "layover" in the two messages that name it when the mode is not a flight). No em dashes in user-facing strings. Never "leg" or "segment" in UI copy.
- With the box unticked, what the form submits and what the server does are byte-for-byte what they are today.
- Both Transports are written or neither is. A failure after the first write must leave no trace.
- The two layover ends carry the same place name, place id and coordinates, so `isConnection` and `sameBooking` in `lib/connections.ts` hold for the saved pair.
- Times at the layover are wall-clock strings read by the server in the layover place's own zone, through the same code a place end already uses. The client never sends a zone.
- `lib/tz-point.ts` is imported statically only by server code.
- Every rule that guards a single Transport save still runs for each of the two: trip access, Stop-belongs-to-trip, Surprise checks, booking state, audit entries, travel-time refresh, revalidation.
- Zero comments by default; no JSDoc; nothing beyond the task.
- Commits: `git add <paths>` then `git commit -m "…" -- <paths>`; confirm with `git show --stat HEAD`. No attribution lines.
- Verification per task: inner loop `TZ=UTC npx vitest run <test files>`; task done `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test`, `npm run build` or integration tests in a task.

## Review Focus

1. Editing an existing Transport with a paid Cost, files, notes and reminders, then ticking the box: all of them stay on the first Transport, and none is duplicated onto the second (Task 1).
2. The second write fails (for example the To Stop was deleted meanwhile): the first Transport is exactly as it was before the save (Task 1).
3. The journey ends at Home: the second Transport arrives Home and the first does not (Tasks 1, 2).
4. Other Transports already sit after this one in the same position in the plan: the second lands directly after the first, and the others keep their order (Task 1).
5. Unticking the box after filling the fields, then saving: an ordinary single Transport is saved and the layover fields are ignored (Task 2).

---

### Task 1: Save a journey with a layover as two Transports

**Files:**
- Modify: `lib/validations/transport.ts`, `server/actions/transport.ts`
- Test: `server/actions/transport.test.ts`, `lib/validations/transport.test.ts` (if present)

**Interfaces:**
- Produces:
  ```ts
  // lib/validations/transport.ts
  export const layoverSchema = z.object({
    place: z.string().trim().min(1),
    placeId: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    landAt: <the same wall-time/ISO type transportSchema uses for arrAt>,
    leaveAt: <the same type as depAt>,
    serviceNumber: z.string().max(60).optional(),
    seat: z.string().max(60).optional(),
  });
  export type LayoverInput = z.infer<typeof layoverSchema>;

  // server/actions/transport.ts
  export async function saveTransportWithLayover(
    target: { tripId: string; forkId?: string } | { transportId: string },
    input: TransportInput,          // the whole journey, exactly what the form builds today
    layover: LayoverInput,
  ): Promise<ActionResult<{ firstId: string; secondId: string }>>;   // use the file's existing result type
  ```
  Field errors for the layover come back keyed `layoverPlace`, `layoverLandAt`, `layoverLeaveAt`, with the exact messages from Global Constraints.

Rules: spec "What saving does". The first Transport is the journey with its arrival end replaced by the layover place and `arrAt` = `landAt`. The second is built from the layover place to the journey's own arrival end, `depAt` = `leaveAt`, `arrAt` = the journey's `arrAt`, copying `mode`, `carrier`, `reference` and the resolved booking state, with the layover's `serviceNumber` and `seat`, the same `anchorStopId`, and a `sortOrder` directly after the first's (shift later Transports in that slot up by one, inside the same transaction). The four time checks compare instants after each wall time is read in its own end's zone.

- [ ] **Step 1: Failing tests** in `transport.test.ts` (follow the file's existing fixtures and mocks):
  - `adding a journey with a layover saves two Transports`: Denpasar(Stop) → Munich(Stop), departs 2026-12-05T19:00, arrives 2026-12-06T06:45, layover Bangkok (13.69, 100.7501, placeId "bkk") land 2026-12-05T22:15 leave 2026-12-06T00:50, second flight "TG 924" seat "44J": the first row is Stop → place with `arrTimezone: "Asia/Bangkok"` and `arrAt` 2026-12-05T15:15Z; the second is place → Stop with `depTimezone: "Asia/Bangkok"`, `depAt` 2026-12-05T17:50Z, `serviceNumber: "TG 924"`, `seat: "44J"`, the same `reference`, `carrier`, `mode`, `anchorStopId`, and `sortOrder` = first + 1; `isConnection(first, second)` and `sameBooking(first, second)` are true.
  - `the Cost entered on the form goes on the first Transport only`.
  - `editing an existing Transport turns it into the first of the two and keeps its Cost, files, notes and reminders` (no attachment or cost row is created or moved; the second has none).
  - `a journey home: the second Transport arrives Home, the first does not`.
  - `the second lands directly after the first and later Transports in the slot keep their order`.
  - `nothing is saved when the second write fails` (make the second create throw: on add, no Transport exists; on edit, the existing row is unchanged).
  - One test per refusal with its exact message: missing place; landing not after departure; leaving before landing; arriving not after leaving; a wait of a day or more.
  - `both writes are audited, and the trip is revalidated once`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. Extract what `createTransport` and `updateTransport` do for one row into internal helpers that take the transaction client where they do not already, rather than copying their bodies; the two existing exports must behave exactly as before (their tests stay green untouched). **Step 4:** task-done verification.
- [ ] **Step 5: Commit** `feat(transport): one save makes the two Transports of a journey with a layover`.

---

### Task 2: "This flight includes a layover" in the form

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx`, its test; the callers that open the form (`components/trip/itinerary-manager.tsx`, `components/trip/day-entry-link.tsx`) only to pass one new prop
- Test: `components/trip/transport-form-dialog.test.tsx`, and the callers' tests for the prop

**Interfaces:**
- Consumes: `saveTransportWithLayover`, `LayoverInput` (Task 1); `isConnection` (`lib/connections.ts`).
- Produces: `TransportFormDialogProps.inConnection?: boolean` — true when the Transport being edited is already one of two joined Transports; the callers compute it from the Transports they hold.

Rules: spec "What changes" and "What it does not do". The box sits directly under the Departs/Arrives pair. It is absent when the mode is CAR, when `inConnection`, and when the form is used through `onSubmitOverride` (the booking import's proposal editor). The layover fields appear only while it is ticked; "Second flight" and its "Seat" appear beside the Transport's own flight number and seat. Ticked, submit calls `saveTransportWithLayover` with the same `input` the form builds today plus the layover; unticked, submit is unchanged. Server field errors keyed `layoverPlace` / `layoverLandAt` / `layoverLeaveAt` show beside their fields. After a successful save the dialog closes as it does today.

- [ ] **Step 1: Failing tests:**
  - `a flight offers "This flight includes a layover"; a train offers "This journey includes a change"; a drive offers neither`.
  - `ticking it shows Layover at, Land there, Leave, and Second flight with its Seat; unticking hides them`.
  - `saving with the box ticked sends the whole journey and the layover in one call` (assert the arguments of the mocked `saveTransportWithLayover`: `input` equals what an unticked save would send to `createTransport`; `layover` has the picked place with its id and coordinates and the two wall strings as typed).
  - `editing with the box ticked sends the Transport's id` (target is `{ transportId }`).
  - `unticking after filling the fields saves an ordinary Transport` (`createTransport` called, `saveTransportWithLayover` not).
  - `a Transport already in a Connection has no box`.
  - `a refusal from the server shows beside its field` (e.g. the under-a-day message under Leave).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement, reusing `PlaceCombobox` and the datetime-local inputs the form already has. **Step 4:** callers pass `inConnection` (true when `isConnection` holds between this Transport and the one before or after it among the Trip's Transports), with one test each. **Step 5:** task-done verification.
- [ ] **Step 6: Commit** `feat(transport): tick "This flight includes a layover" to enter the whole journey in one form`.

---

### Task 3: Help text

**Files:**
- Modify: `components/trip/help-guide.tsx` (+ `lib/help-guide.ts` only if its string list requires)

- [ ] **Step 1:** Replace the paragraph that begins "When you change planes or trains somewhere you’re not staying, add the second ticket as its own transport." with: when a flight has a layover, enter it from where you leave to where you end up and tick **This flight includes a layover** (**This journey includes a change** for a train), then say where the layover is and when you land and leave; Teepee saves it as two flights and draws them together with the wait in between, for example "Layover in Bangkok · 2h 35m". Keep the last sentence about the journey home. Match the surrounding voice and markup.
- [ ] **Step 2:** `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx`; add the two tick-box labels to the guide's UI-string list if the test requires quoted UI strings to be listed.
- [ ] **Step 3: Commit** `docs(help): enter a layover by ticking the box on the flight`.

---

## Once, at the end of the branch

`npm test`, `npm run build` (stop the dev server first), `npm run test:integration` against the local database.
