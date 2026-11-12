# Booking confirmations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nudge Travellers to attach a Booking confirmation to every Booked Transport, Accommodation and Item, let them say "Nothing to attach", let Files move any file to the right thing, and have Booking import keep its file on every confirmed Proposal.

**Architecture:** One pure rule (`lib/booking-confirmation.ts`) and one Surprise-aware loader (`lib/booking-confirmations-loader.ts`) are the single source of truth; Home's Next steps, Files, the plan editor, the Timeline (Day + Today) and the MCP reads all consume the loader's result. A new `nothingToAttach` column on the three tables is written by its own action (no Activity). Files' link-to-Item becomes a general Move action.

**Tech Stack:** Next.js 16 (app router, server actions), Prisma 7 / Postgres, React 19, Vitest (unit + `vitest.integration.config.ts`), MCP server in `lib/mcp`.

**Spec:** `docs/specs/2026-11-12-booking-confirmations.md` (glossary: CONTEXT.md **Booking confirmation**, **Attachment**, **Booking import**, **Next steps**)

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing server actions or pages; this Next.js differs from training data.
- Commit trailer, exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (not your own model name).
- Never run any `npm run feedback:*` script. Never touch production env files.
- Unit tests run with `TZ=UTC`: `TZ=UTC npx vitest run <file>`; task-done check is `TZ=UTC npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Integration (needs local docker DB): `INTEGRATION=1 TZ=UTC npx vitest run --config vitest.integration.config.ts <file>`.
- Every new exported server action goes in `lib/server-action-exports.test.ts`'s `ALLOWLIST`; a removed one comes out.
- No em-dashes (—) in any Traveller-facing string, MCP tool text included (`test/copy-style.test.ts` scans app/, components/, server/, lib/).
- `react-hooks/set-state-in-effect` lint rule is on. Non-component exports of `"use client"` files become client references: pure helpers live in `lib/`.
- Zero comments unless the why is non-obvious. No JSDoc.
- Copy, verbatim: card `No booking confirmation yet`; action `Nothing to attach`; Next steps title `Add booking confirmations (${n})`, subtitle `Booked, but no ticket or confirmation attached.`; Files group heading `Booking confirmations to add`; photo move refusal `Remove it as the photo first.`

## Review Focus

1. An Item whose only Attachment is its photo still needs a confirmation (photo identified only by `attachment.id === item.photoAttachmentId`; photos appear in every attachment map). Task 2 + Task 3 tests.
2. Today's things still count: an Item dated today, an Accommodation checking out today, a leg departing today. Task 2 tests.
3. A Traveller surprised by a Stop/Item never sees its contents counted, listed or marked; the planner does. Task 3 integration test.
4. Move must refuse a target on a Fork, a target on another Trip, a Globe file and a file that is currently an Item photo. Task 6 tests.
5. An .eml with two PDFs attaches both, each titled with its own filename; an .eml with none attaches nothing; each file goes through upload validation and quota. Task 11 tests.

---

### Task 1: `nothingToAttach` column and copy sites

**Files:**
- Create: `prisma/migrations/20261112120000_nothing_to_attach/migration.sql`, `prisma/nothing-to-attach-migration.test.ts`
- Modify: `prisma/schema.prisma` (Transport ~757, Accommodation ~797, Item ~835), `lib/fork-plan.ts` (source types 93/113/150, data types 250/269/299, data 358/367/382), `lib/booking-state-patch.ts` (`BookingFields` ~30, `copiedBookingFields` :68), `lib/surprise-visibility.ts` (`PlaceholderItem` 17-50, literal 185-205)
- Test: `prisma/nothing-to-attach-migration.test.ts`, `lib/fork-plan.test.ts`, `lib/booking-state-patch.test.ts`

**Interfaces:**
- Produces: `nothingToAttach Boolean @default(false)` on `Transport`, `Accommodation`, `Item`; `copiedBookingFields` returns `nothingToAttach`; `buildForkPlan` copies it.

- [ ] **Step 1: Failing tests.** Migration test modelled on `prisma/share-show-travellers-migration.test.ts`: SQL adds `"nothingToAttach" BOOLEAN NOT NULL DEFAULT false` to `"Transport"`, `"Accommodation"`, `"Item"`; schema has `nothingToAttach Boolean @default(false)` three times. `fork-plan.test.ts`: a source Transport/Accommodation/Item with `nothingToAttach: true` yields fork data with `nothingToAttach: true`. `booking-state-patch.test.ts`: `copiedBookingFields({...,nothingToAttach:true}).nothingToAttach === true`.
- [ ] **Step 2: Run, expect FAIL.** `TZ=UTC npx vitest run prisma/nothing-to-attach-migration.test.ts lib/fork-plan.test.ts lib/booking-state-patch.test.ts`
- [ ] **Step 3: Implement.** Additive migration with the latest migration's header style; schema fields next to `bookBy`; `npx prisma generate`. Add the field to `BookingFields`/`copiedBookingFields` (covers `ideaCopyData`) and to `buildForkPlan`. `PlaceholderItem` gets `nothingToAttach: false`. Promote, Duplicate and route copy need no change.
- [ ] **Step 4: Run, expect PASS**, then the task-done check.
- [ ] **Step 5: Commit** `feat(db): nothingToAttach on transport, accommodation, item`.

### Task 2: The rule

**Files:**
- Create: `lib/booking-confirmation.ts`, `lib/booking-confirmation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ConfirmationKind = "TRANSPORT" | "ACCOMMODATION" | "ITEM";
  export interface ConfirmationSubject {
    kind: ConfirmationKind; id: string; bookingState: string; nothingToAttach: boolean;
    lastDay: string | null; // Transport: departure local date; Accommodation: checkOut; Item: date
    photoAttachmentId?: string | null;
  }
  export function needsBookingConfirmation(s: ConfirmationSubject, attachmentIds: readonly string[], today: string): boolean
  ```

- [ ] **Step 1: Failing tests** (`today = "2026-12-10"`): BOOKED, no files → true; TO_BOOK → false; NONE → false; `nothingToAttach` → false; one file → false; only file is the photo → true; photo plus another file → false; `lastDay "2026-12-09"` → false; `lastDay "2026-12-10"` → true; `lastDay null` → true.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (string compare on ISO dates).
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat: booking confirmation rule`.

### Task 3: The loader

**Files:**
- Create: `lib/booking-confirmations-loader.ts`, `test/integration/booking-confirmations-loader.test.ts`

**Interfaces:**
- Consumes: `needsBookingConfirmation` (Task 2); `loadSurpriseVisibility(tripId, viewerId)` (`lib/surprise-visibility.ts:110`, use `where.item`, `where.accommodation`, `where.attachment`); `tripTodayISO(stops)` (`lib/trip-today.ts`); `computeTripPhase` (`lib/trip-phase.ts:26`); departure local date via `transportTimeDisplay(...).dep.dateISO` (`lib/time-display.ts:55`) as in `lib/desktop-home-loader.ts:340-349`.
- Produces:
  ```ts
  export interface BookingConfirmationToAdd { kind: ConfirmationKind; id: string }
  export async function loadBookingConfirmationsToAdd(tripId: string, viewerId: string): Promise<BookingConfirmationToAdd[]>
  ```
  Ordered by `lastDay` ascending (nulls last). Returns `[]` for a Past trip. Does no access check (callers already have).

- [ ] **Step 1: Failing integration test** (follow an existing `test/integration/*` setup, e.g. `day-reads.test.ts`): seed a trip with today before its dates containing: BOOKED transport no file (listed), BOOKED accommodation with an ACCOMMODATION file (not listed), BOOKED item whose only file is its photo (listed), BOOKED item with `nothingToAttach` (not), TO_BOOK item (not), Wishlist item BOOKED with no stopId (not), Fork transport BOOKED (not), BOOKED item inside a Surprise stop planned by user A for user B: listed for A, absent for B. A trip whose dates are all past → `[]`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**: real-plan (`forkId: null`) BOOKED rows (items need `stopId: { not: null }`), attachments of those ids (`targetType` in the three, `targetId` in ids, plus `v.where.attachment`), map to `ConfirmationSubject`, filter.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat: load bookings missing a confirmation`.

### Task 4: `setNothingToAttach` action

**Files:**
- Create: `server/actions/booking-confirmation.ts`, `server/actions/booking-confirmation.test.ts`
- Modify: `lib/server-action-exports.test.ts` (ALLOWLIST :32)

**Interfaces:**
- Consumes: `requireRowAccess(kind, id, { realPlanOnly: true })` (`lib/guards.ts:356`).
- Produces: `export async function setNothingToAttach(kind: ConfirmationKind, id: string, nothingToAttach: boolean): Promise<ActionResult>`. Revalidates `revalidateTrip(tripId, "plan", "journal")`. Writes no Activity.

- [ ] **Step 1: Failing tests** (mock style of `server/actions/attachments.test.ts`): updates the right table's `nothingToAttach`; calls `requireRowAccess` with `realPlanOnly: true`; no activity write; revalidates.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; add to ALLOWLIST.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat: Nothing to attach action`.

### Task 5: Next steps nudge (Home)

**Files:**
- Modify: `lib/next-steps.ts` (`NudgeInput` :29, priority table 131-140, nudges 156-191), `lib/next-steps-builder.ts` (`BuildTripNextStepsInput`, NudgeInput ~115-125), `lib/desktop-home-loader.ts` (:366 and Sketching branch ~398)
- Test: `lib/next-steps.test.ts`, `lib/next-steps-builder.test.ts`

**Interfaces:**
- Consumes: `loadBookingConfirmationsToAdd` (Task 3).
- Produces: `NudgeInput.bookingConfirmationsToAdd: number`; `BuildTripNextStepsInput.bookingConfirmationsToAdd?: number` (default 0). Nudge id `nudge-booking-confirmations`, href `tripSubPath(tripBasePath, "/files")`, priority 21 (7 in final-prep). `loadNextSteps` (trips page) passes 0: Home only.

- [ ] **Step 1: Failing tests**: count 3 → step titled `Add booking confirmations (3)` with the subtitle, href ending `/files`, priority 21; final-prep → 7; count 0 → absent. Update `makeNudges` helpers.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; desktop-home-loader calls the loader and passes the length. Add the row to the priority comment table.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(home): Add booking confirmations nudge`.

### Task 6: `moveAttachment` action

**Files:**
- Modify: `server/actions/attachments.ts` (add next to `linkAttachmentToItem` :414; leave that in place for Task 7), `lib/server-action-exports.test.ts`
- Test: `server/actions/attachments.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MoveTarget = { type: "TRIP" } | { type: "STOP" | "TRANSPORT" | "ACCOMMODATION" | "ITEM"; id: string };
  export async function moveAttachment(id: string, target: MoveTarget): Promise<ActionResult>
  ```
  (`MoveTarget` type in `lib/` if the "use server" module can't export types usefully.) Uses `requireAttachmentAccess(id)`; for a non-TRIP target `requireRowAccess(kind, targetId, { realPlanOnly: true })` and checks the row's `tripId === attachment.tripId`. Refusals via `formFail`: Globe file `Only a trip's files can be moved.`; current photo (`db.item.findFirst({ where: { photoAttachmentId: id } })`) `Remove it as the photo first.`; other trip / fork `That isn't on this trip.` Updates `targetType`/`targetId` (TRIP → `targetId: null`). `revalidateTrip(tripId, "plan", "journal")`. No Activity.

- [ ] **Step 1: Failing tests**: moves TRIP file to TRANSPORT; moves ITEM file to ACCOMMODATION; moves to TRIP sets null targetId; refuses photo, Globe file, fork target, other-trip target; surprised-target refusal propagates from `requireRowAccess`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; add to ALLOWLIST.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(files): move a file to any thing on the trip`.

### Task 7: Files page: confirmations group and Move dialog

**Files:**
- Modify: `app/(app)/trips/[tripId]/files/page.tsx`, `components/trip/files-index.tsx` (:25), `lib/files-index-loader.ts` (`loadFileOwners` :25)
- Create: `components/trip/file-move-dialog.tsx` (replaces `components/trip/file-link-dialog.tsx`, delete it)
- Modify: `server/actions/attachments.ts` (delete `linkAttachmentToItem`), `lib/server-action-exports.test.ts`
- Test: `components/trip/files-index.test.tsx` (or the existing files-index test), `components/trip/file-move-dialog.test.tsx`

**Interfaces:**
- Consumes: `loadBookingConfirmationsToAdd` (Task 3), `moveAttachment`/`MoveTarget` (Task 6), `loadFileOwners` for labels/hrefs.
- Produces: `FilesIndex` prop `toAdd: { kind: ConfirmationKind; id: string; label: string; href: string }[]`; `FileMoveDialog({ attachmentId, targets, onDone })` where targets are grouped Trip / Stops / Transport / Stays / Things to do (real plan, Surprise-masked with `v.where.*`).

- [ ] **Step 1: Failing tests**: `FilesIndex` renders heading `Booking confirmations to add` above other groups with one link per entry, and no heading when empty; every file row except an Item photo shows a Move control; `FileMoveDialog` calls `moveAttachment` with the chosen `MoveTarget` and shows the returned form error.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; page loads photo ids (`item.photoAttachmentId` on the trip's items) to hide Move on photos; remove `linkAttachmentToItem`, its ALLOWLIST entry and the old dialog + tests.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(files): Booking confirmations to add, and Move`.

### Task 8: Marker component and plan editor

**Files:**
- Create: `components/trip/booking-confirmation-marker.tsx`, `components/trip/booking-confirmation-marker.test.tsx`
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (175-214), `components/trip/itinerary-manager.tsx` (`renderLegPill` :1302, `StopOpenBody` :1512), `components/plan/leg-pill.tsx`, `components/plan/stay-panel.tsx`, `components/trip/accommodation-row.tsx`, `components/plan/day-section.tsx` (`DayRow` 182-195), `components/plan/ideas-box.tsx`, `components/plan/mobile/stop-sheet.tsx`
- Test: the marker test plus the existing tests of each touched component

**Interfaces:**
- Consumes: `loadBookingConfirmationsToAdd`, `setNothingToAttach`.
- Produces: `BookingConfirmationMarker({ kind: ConfirmationKind; id: string })` (client): text `No booking confirmation yet` and a `Nothing to attach` button calling `setNothingToAttach(kind, id, true)` then `router.refresh()`. Plan page passes `needsConfirmationIds: string[]` to `ItineraryManager`, which builds a `Set` and passes `needsConfirmation: boolean` to each card.

- [ ] **Step 1: Failing tests**: marker renders copy and calls the action with `(kind, id, true)`; LegPill / StayBlock / AccommodationRow / DayRow / a things-to-do row render the marker when `needsConfirmation` and not otherwise.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Keep it a quiet secondary-text line under the card's main line, matching the card's existing muted text styles.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(plan): mark bookings with no confirmation`.

### Task 9: Timeline (Day view and Today view)

**Files:**
- Modify: `components/trip/timeline.tsx` (51-80; rows `TransportRow` 360, `TimedItemRow` 437, `UntimedItemRow` 477, `AccomCheckinRow` 514), the Day page that renders `Timeline` (find via `components/trip/day/`), `components/trip/home/phase-travelling.tsx` (183/417) and its loader (`lib/travelling-home-loader.ts`)
- Test: `components/trip/timeline.test.tsx` (existing)

**Interfaces:**
- Consumes: `BookingConfirmationMarker` (Task 8), `loadBookingConfirmationsToAdd` (Task 3).
- Produces: `Timeline` prop `needsConfirmationIds?: readonly string[]`.

- [ ] **Step 1: Failing tests**: a transport row, timed item row, untimed item row and check-in row render the marker when their id is listed; the check-out row never does.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; Day and Travelling loaders call the loader and pass ids.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(day): mark bookings with no confirmation on the timeline`.

### Task 10: Undo in the edit dialogs

**Files:**
- Create: `components/trip/nothing-to-attach-switch.tsx`, `components/trip/nothing-to-attach-switch.test.tsx`
- Modify: `components/trip/transport-form-dialog.tsx` (:886), `components/trip/item-form-dialog.tsx` (:965), `components/trip/accommodation-form-dialog.tsx` (:298); read plumbing so those dialogs receive `nothingToAttach`: `lib/plan-reads.ts` (79/98/124), `lib/day-reads.ts` (82/91/101/142), `lib/itinerary.ts` (46/78/99), `lib/plan-entity-views.ts` (26/69/99), `lib/day-view-model.ts` (170-191, 305-319), `components/plan/types.ts` (55/90), `lib/stop-days.ts` (25-55)

**Interfaces:**
- Consumes: `setNothingToAttach` (Task 4).
- Produces: `NothingToAttachSwitch({ kind, id, value })`: a switch labelled `Nothing to attach`, saving immediately via `setNothingToAttach` then `router.refresh()`; not part of the form's submit.

- [ ] **Step 1: Failing tests**: switch calls the action with the toggled value; each dialog shows it only when editing an existing thing whose Booking state is Booked.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, placing it directly under `BookingStateField`.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat: Nothing to attach switch in edit dialogs`.

### Task 11: Booking import keeps its file on every Proposal

**Files:**
- Create: `lib/booking-import/confirmation-files.ts`, `lib/booking-import/confirmation-files.test.ts`
- Modify: `server/actions/booking-import.ts`, `components/booking-import/booking-import-sheet.tsx` (`read()` :112, `attachOriginal` 139-157, call at :275), `lib/server-action-exports.test.ts`
- Test: `server/actions/booking-import.test.ts`, the sheet's existing test

**Interfaces:**
- Produces: `bookingConfirmationFiles(file: File): Promise<File[]>`: PDF or image → `[file]`; `.eml` → each PDF attachment as a `File` named by its own `filename` (PostalMime, as `prepareEml` in `lib/booking-import/input.ts:59-96`), images ignored; anything else → `[]`. Server action `attachImportedBooking(formData: FormData): Promise<ActionResult>` (fields `tripId`, `targetType`, `targetId`, `file`) that runs `bookingConfirmationFiles` and sends each through `uploadAttachment` (keeps access, Surprise, validation, quota and its Activity line).

- [ ] **Step 1: Failing tests**: PDF → itself; image → itself; eml with two PDFs → two Files with their own names; eml with none → `[]`; text → `[]`. Sheet: confirming two Proposals from one PDF calls `attachImportedBooking` twice (once per thing, never for a new Stop); pasted text calls it never; an .eml file is kept and sent.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; drop the `attached.current` single-shot; add the action to ALLOWLIST.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(import): every confirmed booking keeps its file`.

### Task 12: Claude connection

**Files:**
- Modify: `lib/mcp/reads/plan-shapes.ts` (interfaces 43-231, selects 236-266, `toMcpAccommodation` 346, `toMcpThingToDo` 350, `toMcpDayItem` 361, `toMcpItem` 386, `buildMcpStops` 427, `toMcpTransport` 481), `lib/mcp/reads/trip-plan.ts`, `lib/mcp/reads/entities.ts`, `lib/mcp/reads/day.ts` (`McpBooking` :25, 106-109), `lib/mcp/server.ts` (instructions :33, registration 69-79)
- Create: `lib/mcp/tools/nothing-to-attach.ts`
- Test: `lib/mcp/tools/write-returns.test.ts` (ARGS ~110-160, mocks 22-40), the existing reads tests, `test/integration/mcp-owner-reads.test.ts`

**Interfaces:**
- Consumes: `loadBookingConfirmationsToAdd` (Task 3), `setNothingToAttach` (Task 4), `requireRealPlanRow` (`lib/mcp/real-plan.ts:21`), `runWrite` (`lib/mcp/run-tool.ts:59`), the `loadItemForMcp` / `loadTransportForMcp` / `loadAccommodationForMcp` read-backs.
- Produces: every MCP Transport, Accommodation and Item shape (plan, day, single-entity reads) gains `nothingToAttach: boolean` and `needsBookingConfirmation: boolean`. Tool `set_nothing_to_attach` with input `{ kind: "ITEM" | "TRANSPORT" | "ACCOMMODATION", id: string, nothingToAttach: boolean }`, description (no em-dashes): `Marks a Booked thing as having nothing to attach (its confirmation lives in an app, say), so TEEPEE stops asking for a Booking confirmation. Pass false to ask again.` One sentence added to the server instructions next to Booking state: `A Booked thing with needsBookingConfirmation true has no ticket or confirmation file yet; you cannot upload files, so tell the user, or use set_nothing_to_attach if they say there is nothing to attach.`

- [ ] **Step 1: Failing tests**: write-returns ARGS entry for the new tool returns the thing with `nothingToAttach: true`; a plan read marks a fileless Booked transport `needsBookingConfirmation: true` and one with a file `false`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**; reads call the loader once per request and build a `Set` of ids.
- [ ] **Step 4: Run, expect PASS**, task-done check.
- [ ] **Step 5: Commit** `feat(mcp): booking confirmation state and set_nothing_to_attach`.

### Task 13: Branch verification (orchestrator)

- [ ] `npm test`, `npm run build`, `npm run test:integration` (local DB up). All green, or failures reported with output. Known node 22 Intl failures (money.test ×2, two home tiles) are not regressions.
