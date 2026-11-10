# Per-person Packing lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split each Trip's Packing list into per-Traveller personal lists plus a Shared list, with an Open/Private per-Trip setting.

**Architecture:** Two nullable columns on `ChecklistItem` (`ownerId`: personal owner, null = Shared; `packedById`: who ticked it) and one Boolean on `Trip` (`packingListsOpen`). All permission rules live in one pure module (`lib/packing-access.ts`) consumed by the server actions; the MCP tools wrap those actions so they inherit the rules. Readers filter with a shared Prisma `where` fragment from the same module.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing/server-action conventions), Prisma + Postgres, React, Vitest, Zod, MCP SDK.

**Spec:** `docs/specs/2026-11-10-per-person-packing.md` — read it before your task. Glossary: `CONTEXT.md` **Packing list**.

## Global Constraints

- Verification per task: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never run the full suite or `next build` per task.
- Zero comments unless the WHY is non-obvious; no JSDoc on new code. Match local style of the file you're in.
- Every server action keeps the ADR 0074 failure contract: `ActionResult`, refusals via `formFail(message, code?)` from `@/lib/action-result`.
- Refusal copy (exact): editing/ticking another Traveller's item → `"That's on someone else's packing list."`; adding to another Traveller's list while Private → `"This trip's packing lists are private."`; target not a member → `"They aren't on this trip."`.
- Shared is represented as `ownerId: null`. The wire value for "Shared" in inputs is the string `"SHARED"`.
- `assignedToId` stays Pre-trip only; do not reuse it for Packing.
- Do not commit `AGENTS.md` (untracked, not ours).

## Review Focus

1. **Private mode leaking through a side door** — any reader of `checklistItem` (page, MCP, digest, shopping entries) that forgets the visibility filter shows a partner's personal items. Task 6, 7 and 8 each carry a Private-mode test.
2. **Toggling `done` without maintaining `packedById`** — untick must clear the packer; a tick from a write path other than `toggleChecklistItem` (Review fix) must not leave a stale packer. Task 3 tests untick clears it.
3. **Reorder crossing sections** — swapping sortOrder with an adjacent row in a different owner's section scrambles the visible order. Task 3 tests reorder stays within the same owner.
4. **Shopping tick on a partner's item** — NEEDED ↔ BOUGHT must succeed for a non-owner while null ↔ NEEDED must refuse. Task 3 tests both.
5. **Legacy template JSON** (`string[]`) must still apply and count. Task 4 tests it.

---

### Task 1: Remove AI packing suggestions and bulk add

**Files:**
- Delete: `components/trip/ai-packing-suggestions.tsx`, `components/trip/ai-packing-suggestions.test.tsx`
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx` (drop import + `<AiPackingSuggestions>`; drop `aiConfigured` if it becomes unused), `app/(app)/trips/[tripId]/checklists/page.test.tsx`
- Modify: `server/actions/ai.ts` (remove `aiDraftPackingList`), `lib/ai.ts` (remove `draftPackingList`, its schema/type), their tests
- Modify: `server/actions/checklists.ts` (remove `addChecklistItems`), `lib/validations/checklist.ts` (remove `checklistItemsSchema`, `checklistItemTextSchema`), `lib/activity.ts` (remove `checklistItemsAddedSummary`), `lib/server-action-exports.test.ts`, `server/actions/checklists.test.ts`

**Interfaces:** Produces nothing. Keep `AiSuggestButton` (used by `ai-activity-suggestions.tsx`).

- [ ] **Step 1:** `grep -rn 'aiDraftPackingList\|draftPackingList\|addChecklistItems\|checklistItemsSchema\|checklistItemsAddedSummary\|AiPackingSuggestions\|DraftPackingList' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=docs .` — every hit is in the file list above; if any other hit exists, stop and report it.
- [ ] **Step 2:** Delete/remove everything listed, including the tests that exercised removed code.
- [ ] **Step 3:** Re-run the grep: no hits outside `docs/` and design briefs.
- [ ] **Step 4:** Task-done verification (Global Constraints) on the modified files.
- [ ] **Step 5:** Commit `refactor(checklists): remove AI packing suggestions and bulk add`.

---

### Task 2: Schema, migration, permission module

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261110120000_per_person_packing/migration.sql`
- Create: `lib/packing-access.ts`, `lib/packing-access.test.ts`
- Create: `lib/packing-viewer.ts`

**Interfaces — Produces:**
```ts
// lib/packing-access.ts (pure, no db import)
export type PackingViewer = { userId: string; open: boolean };
export type PackingOwnerRef = "SHARED" | string; // a user id
export function toOwnerId(ref: PackingOwnerRef): string | null;          // "SHARED" → null
export function canSeePackingItem(ownerId: string | null, v: PackingViewer): boolean;    // null || own || open
export function canManagePackingItem(ownerId: string | null, v: PackingViewer): boolean; // null || own  (tick/edit/delete/reorder/buy-mark/move-from)
export function canAddPackingTo(ownerId: string | null, v: PackingViewer): boolean;      // null || own || open
export function packingVisibleWhere(v: PackingViewer): Prisma.ChecklistItemWhereInput;
//   open → {} ; private → { OR: [{ kind: { not: "PACKING" } }, { ownerId: null }, { ownerId: v.userId }] }
export function packingMineOrSharedWhere(userId: string): Prisma.ChecklistItemWhereInput;
//   { kind: "PACKING", OR: [{ ownerId: null }, { ownerId: userId }] }

// lib/packing-viewer.ts
export async function loadPackingViewer(tripId: string, userId: string): Promise<PackingViewer>;
//   reads trip.packingListsOpen
```
(`Prisma` type-only import from `@prisma/client` or wherever the repo imports Prisma types — match existing usage.)

- [ ] **Step 1: Schema.** On `ChecklistItem` add `ownerId String?` (relation `owner User? @relation("ChecklistOwner", …, onDelete: Cascade)`) and `packedById String?` (relation `packedBy User? @relation("ChecklistPackedBy", …, onDelete: SetNull)`), plus `@@index([tripId, kind, ownerId])`. Add the back-relations on `User`. On `Trip` add `packingListsOpen Boolean @default(true)` next to `whatsAroundEnabled` with a one-line comment pointing at CONTEXT.md **Packing list**.
- [ ] **Step 2: Migration.** Hand-write additive SQL matching the existing migrations' style (header comment citing spec 2026-11-10-per-person-packing; existing rows stay `ownerId NULL` = Shared, no backfill). Verify with `npx prisma validate` and `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (needs shadow DB; if unavailable locally, `npx prisma format` + `npx prisma generate` and confirm the SQL by reading). Run `npx prisma generate`.
- [ ] **Step 3: Failing tests** in `lib/packing-access.test.ts`: a table over viewer `{userId:"me"}` × open true/false × ownerId `null | "me" | "them"`:
  - see: null→T/T, me→T/T, them→ open T / private F
  - manage: null→T, me→T, them→F (both modes)
  - addTo: null→T, me→T, them→ open T / private F
  - `toOwnerId("SHARED") === null`, `toOwnerId("u1") === "u1"`
  - `packingVisibleWhere({userId:"me",open:true})` toEqual `{}`; private toEqual the OR fragment above.
- [ ] **Step 4:** Run `npx vitest run lib/packing-access.test.ts` → FAIL. Implement. → PASS.
- [ ] **Step 5:** Task-done verification. Commit `feat(packing): owner, packer and Open/Private columns; permission module`.

---

### Task 3: Packing rules in the checklist actions

**Files:** Modify `server/actions/checklists.ts`, `lib/validations/checklist.ts`, `lib/checklists.ts` (`CHECKLIST_ITEM_ACTIVITY_SELECT` gains `ownerId: true`), `lib/activity.ts`; Test `server/actions/checklists.test.ts`, `lib/activity.test.ts` (if summaries are tested there).

**Interfaces:**
- Consumes: Task 2's `lib/packing-access.ts`, `loadPackingViewer`.
- Produces:
```ts
// checklistItemSchema gains: owner: z.union([z.literal("SHARED"), z.string().trim().min(1)]).optional()
addChecklistItem(tripId, input: ChecklistItemInput): Promise<ActionResult<{ id: string }>>
//   PACKING: owner undefined → caller; resolved via toOwnerId; non-PACKING ignores owner
movePackingItem(itemId: string, to: PackingOwnerRef): Promise<ActionResult>
// lib/activity.ts
packingMovedSummary(text: string, toName: string | null): ActivitySummary
//   toName null → `moved "${text}" to Shared`; else `moved "${text}" to ${toName}'s packing list`
```

Rules (PACKING items only; other kinds unchanged):
- `addChecklistItem`: target must be a trip member (else `"They aren't on this trip."`) and `canAddPackingTo` (else `"This trip's packing lists are private."`). sortOrder stays max+1 within (trip, kind).
- `toggleChecklistItem`: `canManagePackingItem` else refuse; writes `packedById: done ? user.id : null` alongside `done`.
- `updateChecklistItem`, `deleteChecklistItem`: `canManagePackingItem` else refuse.
- `setBuyState`: if the change is between `NEEDED` and `BOUGHT` → allowed when `canSeePackingItem`; any change to or from `null` → `canManagePackingItem`. Else refuse.
- `reorderChecklistItem`: `canManagePackingItem`; for PACKING the locked sibling set is the same owner only (`AND "ownerId" IS NOT DISTINCT FROM ${item.ownerId}`).
- `movePackingItem`: item must be PACKING; `canManagePackingItem(from)` and member + `canAddPackingTo(to)`; no-op success when unchanged; sets `ownerId`, keeps `done`/`packedById`/`buy`; sortOrder = max+1 within PACKING; records `recordActivity({ verb: "UPDATED", entityType: "CHECKLIST_ITEM", … changes: packingMovedSummary(...) })`; `revalidateTrip(tripId, "lists")`.
- The viewer is `loadPackingViewer(item.tripId, user.id)` with the user from `requireTripAccess`/`requireRowAccess`.

- [ ] **Step 1: Failing tests** (follow the file's existing mockDb style):
  - `addChecklistItem PACKING without owner creates ownerId = caller`
  - `addChecklistItem PACKING owner "SHARED" creates ownerId null`
  - `addChecklistItem PACKING to another member when Private refuses "This trip's packing lists are private."`; when Open succeeds with ownerId = them
  - `addChecklistItem PACKING to a non-member refuses "They aren't on this trip."`
  - `toggleChecklistItem on Shared sets packedById to caller; untick sets null`
  - `toggleChecklistItem on another Traveller's item refuses "That's on someone else's packing list." and writes nothing`
  - `updateChecklistItem / deleteChecklistItem on another Traveller's item refuse`
  - `setBuyState NEEDED→BOUGHT on another Traveller's item (Open) succeeds; null→NEEDED refuses`
  - `reorderChecklistItem PACKING only swaps with same-owner neighbours` (assert the raw query includes the owner condition, or the swap target)
  - `movePackingItem Shared → partner when Open sets ownerId and records Activity`; `when Private refuses`; `partner's item → anywhere refuses`
- [ ] **Step 2:** `npx vitest run server/actions/checklists.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS. Task-done verification.
- [ ] **Step 5:** Commit `feat(packing): personal and Shared rules in the checklist actions`.

---

### Task 4: Templates remember personal vs Shared

**Files:** Modify `lib/checklists.ts`, `server/actions/checklists.ts` (`saveAsTemplate`, `applyTemplate`, `listTemplates`); Test `lib/checklists.test.ts`, `server/actions/checklists.test.ts`.

**Interfaces — Produces:**
```ts
export type TemplateEntry = { text: string; shared: boolean };
export function parseTemplateItems(itemsJson: string): TemplateEntry[] | null;
//   null on unparseable JSON; a legacy string element → { text, shared: false }
```
- `saveAsTemplate` stores `JSON.stringify(TemplateEntry[])` of the caller's own PACKING items then Shared items, each in sortOrder.
- `applyTemplate`: personal entries → `mergeTemplateTexts(callerOwnTexts, …)` → create with `ownerId: user.id`; shared entries → `mergeTemplateTexts(sharedTexts, …)` → `ownerId: null`. sortOrder continues from PACKING max. Activity unchanged (`templateAppliedSummary(totalAdded, name)`). Corrupt JSON keeps the existing `"Template data is corrupted"` error.
- `listTemplates` count = `parseTemplateItems(...)?.length ?? 0`.

- [ ] **Step 1: Failing tests:** `parseTemplateItems('["Socks"]')` → `[{text:"Socks",shared:false}]`; mixed new format round-trips; `"nope"` → null. `saveAsTemplate excludes another Traveller's items`; `applyTemplate puts shared entries in Shared and personal in the caller's list, deduping each against its own section` (an existing Shared "Adapter" skips a shared "adapter" entry, but a personal "Adapter" on the partner's list does not block the caller's personal "Adapter").
- [ ] **Step 2–4:** FAIL → implement → PASS, task-done verification.
- [ ] **Step 5:** Commit `feat(packing): templates remember personal and Shared items`.

---

### Task 5: Open/Private setting

**Files:** Modify `server/actions/trips.ts` (add `setPackingListsOpen` beside `setWhatsAroundEnabled`), `app/(app)/trips/[tripId]/settings/page.tsx`; Create `components/trip/settings/packing-lists-switch.tsx` + `.test.tsx` modelled on `whats-around-switch.tsx`; update `lib/server-action-exports.test.ts` if it enumerates exports.

**Interfaces — Produces:** `setPackingListsOpen(tripId: string, open: boolean): Promise<ActionResult>` (requireTripAccess; any member; `revalidateTrip(tripId, "trip")` and `"lists"`).

Copy: label `"Open packing lists"`; description `"See each other's packing lists and add to them. Only the owner of a list can tick it off."`

- [ ] **Step 1: Failing tests:** switch renders checked from prop and calls `setPackingListsOpen(tripId, false)` on toggle (mirror the whats-around test); action test that a non-owner member can set it.
- [ ] **Step 2–4:** FAIL → implement (place the switch in the same settings card group as What's around) → PASS, verification.
- [ ] **Step 5:** Commit `feat(packing): Open/Private packing lists setting`.

---

### Task 6: Packing tab sections, Shopping owners, help copy

**Files:**
- Create: `lib/packing-sections.ts`, `lib/packing-sections.test.ts`, `components/trip/packing-list.tsx`, `components/trip/packing-list.test.tsx`
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx` (+ test), `components/trip/checklist.tsx`, `lib/shopping-list.ts` (+ test), `components/trip/shopping-list.tsx` (+ test), `components/trip/help-guide.tsx`

**Interfaces:**
- Consumes: Task 2 module + viewer, Task 3 `movePackingItem`, `addChecklistItem` `owner`.
- Produces:
```ts
// lib/packing-sections.ts (pure)
export type PackingRow = { id: string; text: string; done: boolean; sortOrder: number; buy: string | null;
  ownerId: string | null; packedBy: TravellerLike | null };
export type PackingSections = {
  mine: PackingRow[]; shared: PackingRow[];
  others: Array<{ traveller: TravellerLike & { id: string }; items: PackingRow[] }>; // member order, viewer excluded; [] when Private
  packed: number; total: number; // Mine + Shared only
};
export function buildPackingSections(rows: PackingRow[], members: Array<TravellerLike & { id: string }>, v: PackingViewer): PackingSections;
// lib/shopping-list.ts: buildShoppingEntries' packing input gains ownerId + owner: TravellerLike | null;
//   packing entries gain `owner: TravellerLike | null` and `canUnmark: boolean` (canManagePackingItem)
```
- `Checklist` (components/trip/checklist.tsx) gains optional props, all inert when absent so Pre-trip is untouched: `addOwner?: PackingOwnerRef` (passed as `owner` to `addChecklistItem`), `addLabel?: string` (aria-label/placeholder override), `readOnly?: boolean` (no tickbox — render a packed/unpacked state glyph with text "Packed"/"Not packed" for screen readers — and no edit/delete/reorder/buy controls; add row still shown), `showPackedBy?: boolean` (ticked row with `packedBy` shows `packed by {travellerName}`), `moveTargets?: Array<{ to: PackingOwnerRef; label: string }>` (row menu items calling `movePackingItem`, excluding the row's current list).
- `PackingList` (client) props: `{ tripId; sections: PackingSections; viewerId; open: boolean }`. Renders "Mine", "Shared", then each other Traveller ("{name}") collapsed by default (reuse the repo's existing collapsible/disclosure primitive; look in `components/ui/`). Add rows: Mine → `addOwner = viewerId`, Shared → `"SHARED"`, other → their id with `addLabel` `"Add to {name}'s list"`. Move targets for manageable rows: "Move to Shared", "Move to me", and (Open only) "Move to {name}" per other member.
- Page: reads `trip.packingListsOpen`, the viewer id (from `requireTripAccess` / existing session read), selects `ownerId` and `packedBy: { select: TRAVELLER_SELECT }`, filters rows with `canSeePackingItem`, member list with ids. Header `checklistsMeta(pretrip, mine+shared)`. Replaces the PACKING `<Checklist>` with `<PackingList>`; templates bar stays above it.
- Help guide Checklists paragraph: replace the Packing sentence with: "**Packing** is split into your own list, your partner's, and **Shared** for the things you only need one of; whoever packs a Shared item gets their name on it. You can see and add to each other's lists but only tick your own, unless the trip's settings make packing lists private. Save your list as a template to pull into your next trip instead of starting from nothing."

- [ ] **Step 1: Failing tests:**
  - `buildPackingSections`: splits mine/shared/others; Private → `others: []` and partner rows excluded; `packed/total` count Mine+Shared only.
  - `buildShoppingEntries`: packing entry carries `owner`; `canUnmark` false for partner's item.
  - `PackingList`: renders three section headings with partner collapsed; partner rows have no checkbox; Shared ticked row shows "packed by Cam"; adding in Shared calls `addChecklistItem(tripId, expect.objectContaining({ kind: "PACKING", owner: "SHARED" }))`; Private hides partner section and "Move to {name}".
  - `ShoppingList`: owner avatar rendered for a personal entry; no unmark control when `canUnmark` false.
  - Page test: Private mode never passes partner rows to `PackingList` or Shopping entries.
- [ ] **Step 2–4:** FAIL → implement → PASS, verification (include `components/trip/checklist.tsx` related tests to prove Pre-trip unchanged).
- [ ] **Step 5:** Commit `feat(packing): Mine, Shared and partner sections on the Packing tab` with trailer line `Resolves-Feedback: cmw923ld8000808l6jb2xsstw` (plus the Co-Authored-By line).

---

### Task 7: Claude connection

**Files:** Modify `lib/mcp/reads/lists.ts`, `lib/mcp/tools/reads.ts` (`loadChecklists`), `lib/mcp/tools/lists-write.ts`; Tests alongside (`lists-write.test.ts`, reads tests).

**Interfaces:**
- `CHECKLIST_VIEW_SELECT` adds `ownerId`, `owner: { select: { id: true, ...TRAVELLER_SELECT } }`, `packedBy: { select: TRAVELLER_SELECT }`.
- `McpChecklistItem` adds `owner: { id: string; name: string } | null` and `packedBy: string | null` (present on every item; always null for non-PACKING).
- `readChecklist(tripId, kind, viewer: PackingViewer)` and `loadChecklists` apply `packingVisibleWhere(viewer)`; viewer from `loadPackingViewer(tripId, user.id)`.
- `add_checklist_item` input gains `whose: z.union([z.literal("me"), z.literal("shared"), z.string()]).optional().describe("Packing only: whose list — \"me\" (default), \"shared\", or a Traveller's user id (another Traveller's list only when the trip's packing lists are Open).")`; maps to `owner` (`"me"`/undefined → omit, `"shared"` → `"SHARED"`, else the id). Update `tick_checklist_item` description: "A Packing item on another Traveller's list can't be ticked."
- File-header doc comment: one sentence noting personal/Shared Packing items.

- [ ] **Step 1: Failing tests:** `get_checklists` in Private omits a partner's personal Packing item and includes Shared with `owner: null`; `add_checklist_item` `whose: "shared"` calls `addChecklistItem` with `owner: "SHARED"`; `whose` omitted → no `owner`; `tick_checklist_item` on a partner item surfaces the refusal.
- [ ] **Step 2–4:** FAIL → implement → PASS, verification.
- [ ] **Step 5:** Commit `feat(mcp): personal and Shared Packing items over the Claude connection`.

---

### Task 8: Leaving, Duplicate, nudges, Digest, Review fixes

**Files:** Modify `server/actions/trips.ts` (`leaveTrip`, `removeTripMember`, duplicate source select), `lib/duplicate-trip.ts`, `lib/next-steps-loader.ts`, `lib/desktop-home-loader.ts`, `lib/digest-dispatch.ts`, `server/actions/reviews.ts`; tests alongside each.

**Interfaces:**
- `leaveTrip` / `removeTripMember`: after the TripMember delete, `db.checklistItem.deleteMany({ where: { tripId, kind: "PACKING", ownerId: userId } })` and `db.checklistItem.updateMany({ where: { tripId, packedById: userId }, data: { packedById: null } })`.
- `DuplicateSourceChecklistItem` gains `ownerId: string | null`; `buildDuplicatePlan(source, newName, duplicatorId: string)` drops PACKING items whose `ownerId` is neither null nor `duplicatorId`, copies `ownerId` (no `packedById`). Update the one caller.
- Next steps / desktop Home: packing count uses `packingMineOrSharedWhere(viewerId)` (both loaders already have `viewerId`).
- Digest `collectDigestInput`: checklist query's `where` adds `packingVisibleWhere({ userId, open: false })` (a Digest is one Traveller's, so it never carries another's personal items regardless of the setting).
- Review `applyChecklistFix`: the `existing` read for a PACKING fix adds `packingMineOrSharedWhere(userId)`; the `addChecklistItem` call passes `owner: "SHARED"` when `fix.list === "PACKING"`.

- [ ] **Step 1: Failing tests:** leaveTrip deletes only the leaver's personal PACKING items and nulls their `packedById`; removeTripMember same for the removed user; `buildDuplicatePlan` keeps duplicator + Shared items, drops partner's, `ownerId` preserved; next-steps "no packing list" nudge present when only the partner has items; digest excludes partner's personal Packing item; review PACKING fix adds with `owner: "SHARED"` and ignores a partner's matching item when looking for an existing one.
- [ ] **Step 2–4:** FAIL → implement → PASS, verification.
- [ ] **Step 5:** Commit `feat(packing): leaving, Duplicate, nudges, Digest and Review fixes respect personal lists`.

---

## Branch finish (main session, once)

`npm test` + `npm run build` + `npm run test:integration` (if the local DB is up). Then report to Cam; Cam's steps (deploy, prod clear of the EU Packing list, feedback:resolve/pull) go last.
