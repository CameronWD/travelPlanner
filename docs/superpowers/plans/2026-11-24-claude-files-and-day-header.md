# Claude Files Attachments, Import Misconfiguration, Day Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude file a Trip's existing Attachments onto things, make a rejected AI key say so, add the missing paperclips, tidy the desktop Day header, and drop the Usage name CHECKs.

**Architecture:** One new server action (`fileAttachment`) beside the existing `moveAttachment`, exposed through one new MCP tool. The other four changes are independent, each inside its existing module. No new dependencies.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching framework APIs), Prisma, Vitest, Tailwind, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-11-24-claude-files-and-day-header.md`

## Global Constraints

- You are a subagent. Do NOT run `npm run feedback:pull`, `feedback:resolve` or `feedback:accept`, and do not read `.env.production.local`.
- Verification tiers: inner loop `npx vitest run <test file>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never `npm test` or `npm run build` per task.
- Traveller-facing copy never uses an em-dash (`test/copy-style.test.ts`).
- Use CONTEXT.md's words: Attachment, Booking confirmation, Item photo, Surprise, Traveller, Stop, Item, Transport, Accommodation, real plan.
- Zero comments unless the why is not obvious. No features beyond the spec.
- Commit after each task. End every commit message with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A `fileAttachment` call whose second target is bad: the first target must not have been moved.
2. A storage copy that throws halfway through several copies: no Attachment row without a stored object, and the caller is told what did happen.
3. The planner of a Surprise filing a file into it: the Activity line must be hidden from the surprised Traveller.
4. The same target named twice in one call: one file there, not two.
5. An Anthropic 401 on every import in a busy hour: one Admin push per 24 hours, not one per attempt.

---

### Task 1: Usage names are checked by the app only

**Files:**
- Create: `prisma/migrations/20261124140000_usage_names_unchecked/migration.sql`
- Modify: any test that pins the migration's lists to `lib/usage/lists.ts` (search `UsageRecord_screen_check` and `lists.test.ts`)
- Modify: `docs/audits/2026-11-24-usage-decisions.md` (U2 row), `docs/specs/2026-11-24-usage.md` (where it states the database CHECK)

- [ ] **Step 1:** Write the migration: `ALTER TABLE "UsageRecord" DROP CONSTRAINT` for exactly `UsageRecord_screen_check`, `UsageRecord_action_check`, `UsageRecord_detail_check`. Leave `UsageRecord_kind_check`, `UsageRecord_phase_check` and every other constraint.
- [ ] **Step 2:** Remove or rewrite any test asserting that the migration SQL contains every name in the lists; keep `lib/usage/validate.test.ts` untouched and passing (it is now the only check).
- [ ] **Step 3:** In the decisions doc, change U2's "Built as" to "The app checks every name against the lists (`lib/usage/validate.ts`); the database does not. Changed 2026-11-24 at Cam's request: adding a name is a code change, not a migration." Make the usage spec agree.
- [ ] **Step 4:** Run `npx vitest related --run lib/usage/lists.ts lib/usage/validate.ts`, `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5:** Commit `chore(usage): the database no longer lists the allowed names`.

### Task 2: Booking import says when the key is rejected

**Files:**
- Create: `lib/booking-import/key-notice.ts`, `lib/booking-import/key-notice.test.ts`
- Modify: `lib/booking-import/messages.ts`, `lib/booking-import/types.ts` (`BookingImportFailureReason`), `server/actions/booking-import.ts:85-89`
- Test: the existing test file for `server/actions/booking-import.ts`

**Interfaces:**
- Produces: `notifyBookingImportKeyRejected(now?: Date): Promise<void>` (never throws); `BOOKING_IMPORT_MESSAGES.misconfigured`; failure reason `"misconfigured"`.

- [ ] **Step 1: Failing tests.**
  - `key-notice.test.ts`: first call pushes via `notifyAdmins("Booking import is failing", "Anthropic rejected the API key. Replace ANTHROPIC_API_KEY in Vercel and redeploy.", "/admin")` and upserts `OperatorNotice` key `booking-import-key`; a second call 23 hours later pushes nothing; a call 25 hours later pushes again; `notifyAdmins` throwing does not throw and does not start the quiet period.
  - action test: `extractBooking` returning `{ kind: "api_error", status: 401 }` gives failure message `"Booking import isn't set up correctly. We've been told and will fix it."` with code `"misconfigured"`, still records `AiUsage` outcome `api_error`, still calls `reportError`, and calls the notice once. Same for 403. Status 400 keeps `M.generic` / `"error"` and sends no notice.
- [ ] **Step 2:** Run them; expect failures.
- [ ] **Step 3:** Implement. `key-notice.ts` mirrors `lib/storage-ceiling-notice.ts` exactly (push before upsert, 24 h quiet period, whole body in try/catch reporting to `reportError`). Add the message and the reason; branch on `outcome.status === 401 || outcome.status === 403` in the action.
- [ ] **Step 4:** Check the sheet (`components/booking-import/booking-import-sheet.tsx`) shows an unknown failure code's message as-is; if it switches on the code, give `"misconfigured"` the same treatment as `"error"`.
- [ ] **Step 5:** Task-done verification on the changed files. Commit `fix(import): a rejected AI key says the import is not set up, and tells the Admins`.

### Task 3: `fileAttachment`, move to the first target and copy to the rest

**Files:**
- Modify: `server/actions/attachments.ts` (new export beside `moveAttachment`), `server/actions/attachments.test.ts`
- Create if copying needs a shared helper: `lib/attachment-copy.ts` (plain module, not `"use server"`, trusting its caller like `lib/item-photo-copy.ts`)

**Interfaces:**
- Consumes: `MoveTarget` from `lib/attachment-move.ts`; `requireAttachmentAccess`, `requireRowAccess(kind, id, { realPlanOnly: true })`, `normalizeAttachmentTitle`, `recordActivity`, `requireOutsideSurprise`, the quota check `createAttachmentFromFile` uses, `getStorage().copy`, `generateKey`.
- Produces:
  ```ts
  export async function fileAttachment(
    id: string,
    targets: MoveTarget[],
    title?: string,
  ): Promise<{ success: true; tripId: string; attachmentIds: string[] } | { success: false; error: string }>
  ```
  `attachmentIds[0]` is the moved file's id (`id`); the rest are the copies, in target order.

Rules, each with a test in `attachments.test.ts` (integration style against the test database, as the existing `moveAttachment` tests are):

- [ ] **Step 1: Failing tests.**
  - one target: behaves as `moveAttachment` (same refusals: globe-scoped "Only a trip's files can be moved.", Journal photo, an Item's photo "Remove it as the photo first.", target on another Trip or a Fork "That isn't on this trip.").
  - two targets (a Transport and another Transport): the original is on the first; a new Attachment row is on the second with a different `storageKey`, the same `filename`, `mime`, `size`, `uploadedById` = the acting user, and `url` `/api/attachments/<its id>`; deleting one leaves the other readable.
  - `title` given: every resulting row has the normalized title; blank title clears it; an invalid title fails with the normalizer's error and changes nothing.
  - empty `targets`: fails `"Say what to attach it to."`. More than 6: fails `"That's too many at once."`.
  - the same target twice: one file there, `attachmentIds` has one entry for it.
  - second target invalid: fails, and the original has not moved (validate every target before the first write).
  - `storage.copy` throws on the second of three targets: the first copy and the move stand, no row exists for the failed copy, result is a failure whose error says how many were attached: `"Attached to 2 of 3. Try the rest again."`
  - quota exceeded for the copies: fails before anything changes, with the same error an over-quota upload gives.
  - a Traveller surprised by the target, or by where the file sits now: refused exactly as `moveAttachment` / `requireAttachmentAccess` refuse today.
  - Activity: one line per resulting file. The moved file uses the verb the codebase uses for an edit (read `lib/activity-record.ts`), entityType `ATTACHMENT`; each copy uses `CREATED`. Label and `changes.excerpt` are `attachmentName({ filename, title })`. Each line carries `surpriseOf` for where that file now sits (compute with `requireOutsideSurprise(user.id, { target: <the updated row> })`), so the planner filing into their own Surprise hides the line from the surprised Traveller.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement `fileAttachment`. Leave `moveAttachment` as it is (the app's own move records no Activity today and that does not change). `revalidateTrip(tripId, "plan", "journal")` once at the end.
- [ ] **Step 4:** Task-done verification. Commit `feat(files): one file can be filed onto several things, moved to the first and copied to the rest`.

### Task 4: the `attach_file` connector tool

**Files:**
- Create: `lib/mcp/tools/attach-file.ts`, `lib/mcp/tools/attach-file.test.ts`
- Modify: `lib/mcp/server.ts` (register after `registerNothingToAttachTool`), any test that lists every tool name (`lib/mcp/tools/write-returns.test.ts`, `app/api/mcp/route.test.ts`), the server's instructions text if it lists what Claude cannot do with files, `docs/connect-claude.md`

**Interfaces:**
- Consumes: `fileAttachment` (Task 3), `runWrite`, `requireRealPlanRows`, `loadAttachmentIndexForMcp(tripId)`.
- Produces: `registerAttachFileTool(server: McpServer): void`; tool name `attach_file`.

- [ ] **Step 1: Failing tests** (use `lib/mcp/test-client.ts` as the sibling tool tests do):
  - schema: `{ attachmentId: string, targets: [{ kind: "TRIP" | "STOP" | "ITEM" | "TRANSPORT" | "ACCOMMODATION", id?: string }] (1 to 6), title?: string }`; a non-TRIP target without `id` is a field error.
  - a call moves and copies as Task 3 does and returns `{ attachments: McpAttachment[] }` holding only the resulting files (filter `loadAttachmentIndexForMcp` by `attachmentIds`).
  - a target on a Fork is refused with `NOT_FOUND_TEXT` behaviour of `requireRealPlanRows`.
  - the Activity lines carry source `CLAUDE`.
  - there is no tool that deletes or uploads an Attachment (assert the registered tool names contain no `delete_attachment` / `upload_attachment`).
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement, modelled on `lib/mcp/tools/nothing-to-attach.ts`. Title `"Attach a file"`. Description: `"Files an Attachment that is already on the Trip onto one or more things: it moves to the first and each further one gets its own copy. Optionally gives it a title. Find files with the files read first. Cannot upload or delete a file, and cannot touch an Item photo."`
- [ ] **Step 4:** `docs/connect-claude.md`: under "It can change" add `files: attach a file already on the Trip to a Stop, Transport, stay or thing to do (several at once, each further one gets its own copy), and give it a title`; change "It cannot touch" to say `uploading or deleting Attachments` (drop "renaming"); add one line: a file dropped into the Claude chat does not reach Teepee, add it in Teepee (or use Booking import) and then ask Claude to file it.
- [ ] **Step 5:** Task-done verification. Commit `feat(claude): Claude can file a Trip's files onto things` with the trailer `Resolves-Feedback: cmwt1bwt4000507jzzmw2cj1w`.

### Task 5: Paperclip on thing-to-do rows and the Tonight card

**Files:**
- Modify: `components/plan/day-section.tsx` (`DayRow`, its props, and `DaySection`'s props), `components/plan/mobile/stop-sheet.tsx` (the `items.map` rows near line 270), their callers up to `components/trip/itinerary-manager.tsx` (which holds `attachmentsByItemId`), `components/trip/day/tonight-card.tsx`, `lib/day-view-loader.ts` (`DayViewData["tonight"]`)
- Test: `components/plan/day-section.test.tsx`, the Stop sheet's test, `components/trip/day/tonight-card` test, `lib/day-view-loader` test

**Interfaces:**
- Produces: `attached: boolean` on `DayViewData["tonight"]`; an `attachedItemIds?: ReadonlySet<string>` prop passed from `itinerary-manager.tsx` down to the day section and the Stop sheet.

- [ ] **Step 1: Failing tests.**
  - a `DayRow` whose item id is in `attachedItemIds` renders the `Paperclip` icon (`aria-hidden`) and an `sr-only` "File attached"; one that is not renders neither; a Surprise placeholder row (`item.surprise.youAreSurprised`) never does.
  - `attachedItemIds` is built in `itinerary-manager.tsx` from `attachmentsByItemId`, counting only Attachments that are not the Item's photo (`photoAttachmentId`).
  - the Stop sheet row: same three cases.
  - loader: `tonight.attached` is true when an Attachment with `targetType: "ACCOMMODATION"`, `targetId: <bed id>` exists, false otherwise.
  - `TonightCard`: collapsed card shows the paperclip and "File attached" when `tonight.attached`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement. Icon markup copies `components/trip/accommodation-row.tsx` (`<Paperclip className="size-3.5 shrink-0 text-foreground/80" aria-hidden="true" />` plus the `sr-only` span). In a row the title truncates before the paperclip is pushed out. The loader adds one `db.attachment.count` (or folds into a query it already makes for that Accommodation).
- [ ] **Step 4:** Task-done verification. Commit `feat(plan): a thing to do and tonight's stay show a paperclip when a file is attached`.

### Task 6: Desktop Day header without the name, buttons in the date row

**Files:**
- Modify: `components/trip/day/day-header.tsx` (the `day-trip-switcher` row and the `day-header-row` header), `components/trip/day/day-header.test.tsx`
- Modify: `docs/adr/0063-*.md` only if it describes the name; the audit `docs/audits/2026-11-23-shift-and-feedback-check.md` "Waiting on Cam" entry for the name (mark it decided 2026-11-24: removed).

- [ ] **Step 1: Failing tests.**
  - no element with `data-slot="day-trip-name"` at any width.
  - the `day-trip-switcher` row carries `xl:hidden` (it still shows the pill and cluster from `md` to below `xl`, unchanged).
  - `day-header-cluster` is shown from `xl` (class `xl:flex`), and the header row is a grid from `xl` with columns `minmax(0,1fr) auto minmax(max-content,1fr)`; the `day-header-spacer` is shown from `xl`.
- [ ] **Step 2:** Run; expect failures.
- [ ] **Step 3:** Implement: delete the name paragraph and its comment; replace every `@min-[84rem]:` on the switcher row, spacer, header row and cluster with the `xl:` equivalent, and change the grid columns to `grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)]` so the right column is never narrower than the buttons and the date centres only when there is room. Update the comments that explain the 84rem threshold. Phone and tablet markup unchanged.
- [ ] **Step 4:** Task-done verification. Commit `fix(day): on desktop the trip name is gone and the buttons sit in the date row`.

### Task 7: Browser checks, release note, branch verification

**Files:**
- Modify: `lib/release-notes.ts` (one line per Traveller-visible change, in the file's existing style; the Claude-files line names Cam as the note's author, as other notes that close a Feedback note do)
- Modify only if a check fails: the component at fault

- [ ] **Step 1:** Start the app against the local demo data (never the real trip). Desktop Day view at 1280, 1512 and 1728 wide, on the day with the longest heading and a Trip with at least `MAX_AVATARS` Travellers: the row above the date is gone, nothing overlaps or wraps, the date is centred where it fits. Record the three measurements (date centre offset in px) in the plan's final report. Fix and re-measure if anything overlaps.
- [ ] **Step 2:** Plan editor at 869 wide (the note's width) on a day with three Transport/thing-to-do rows, some Booked without a file: compare with `docs/feedback/pictures/cmwt1k4rq000607jztb3y34wg/1.webp`. Row heights and gaps must be even. If even, change nothing and say so. If not, fix the spacing and commit with `Resolves-Feedback: cmwt1k4rq000607jztb3y34wg`.
- [ ] **Step 3:** Paperclips visible on a thing-to-do row with a file, in the phone Stop sheet, and on the Tonight card; absent without a file.
- [ ] **Step 4:** Add the release notes. Commit `docs(release-notes): Claude files your files, and the Day view's top row`.
- [ ] **Step 5:** Once for the branch: `npm test`, `npm run build`, and `npm run test:integration` if the local database is up. All must pass; report the output.
