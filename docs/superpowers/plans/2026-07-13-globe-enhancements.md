# Globe enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Globe map interactive — a plain click selects/flies-to/highlights a Marker while Edit/Delete become explicit buttons — and let Markers carry file **Attachments** (Globe-scoped).

**Architecture:** Part A is UI-only on the existing Globe components (`globe-view`/`globe-map`/`marker-list`): a shared `selectedId` drives a Leaflet `flyTo` + highlighted pin, click handlers switch from "open edit" to "select", and Edit/Delete move to buttons. Part B **dual-scopes the existing `Attachment` stack** (ADR 0031): `Attachment.tripId` becomes nullable and a nullable `globeId` is added, `TARGET_TYPES` gains `MARKER`, and upload/serve/delete + storage + the `AttachmentList` component branch on scope (`requireTripAccess`/`trips/…` vs `requireGlobeAccess`/`globes/…`) — reusing the whole tested attachment stack rather than duplicating it. Notes are untouched (Markers keep their single `note` field).

**Tech Stack:** Next.js (App Router, RSC + server actions), TypeScript, Prisma + Postgres, Zod, Leaflet (raw instance via ref, dynamically imported), Radix UI primitives, lucide-react, vitest + React Testing Library.

## Global Constraints

- **Terminology (CONTEXT.md):** the entry is a **Marker** (never "pin"/"place" in code/UI copy). A Marker's Attachments are **Globe-scoped**; other Attachments are **Trip-scoped** (ADR 0031).
- **One Globe per user.** `requireGlobeAccess()` (`lib/globe.ts`) takes no id and returns `{ user: { id }, globe: { id } }` — the caller's single Globe. A Globe-scoped attachment's `globeId` must be verified to equal that Globe's id.
- **Attachment ownership invariant:** exactly one of `tripId` / `globeId` is set per `Attachment` row. Do not break existing trip attachments — trip callers keep passing `tripId`.
- **Notes are NOT touched.** No `Note` changes, no comment thread on Markers.
- **Action returns:** trip/globe mutating actions return `ActionResult` via `ok()`/`fail()`/`validationResult()` from `@/lib/action-result`, EXCEPT the attachment actions, which return `{ success: true; id? } | { success: false; error: string }`.
- **SANDBOX:** no Postgres/Docker/browser. Do NOT run `npm run build`/`next dev`/`prisma migrate dev`. Gates = `npx tsc --noEmit` (0) + `npx eslint <touched>` (0) + `npx vitest run` (green; 0 suites fail to load). Migrations are HAND-AUTHORED SQL (see `prisma/migrations/20260712000000_add_home_base`) + `npx prisma generate` + `npx prisma validate`. Leaflet map rendering (flyTo, highlight, popup buttons) is VISUAL — deferred to a human browser pass; never fabricate a visual confirmation.
- **next-auth test trap:** importing `AttachmentList` (which imports the attachment server actions) into a jsdom test pulls in next-auth and crashes the suite at load. Any new/edited test that renders such a component must `vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }))` (mirror existing tests).
- **Commit** after each task's tests pass. End every commit message with exactly `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Work stays on branch `feat/globe-enhancements`; never touch main/push/deploy. Do not `git add` under `.superpowers/`.

---

# Part A — Marker interaction redesign (G2 + G3)

### Task A1: Selection state + list-row Edit/Delete buttons

**Files:**
- Modify: `components/globe/globe-view.tsx` (add selection state; pass to map + list)
- Modify: `components/globe/marker-list.tsx` (row click → select; add Edit + Delete buttons)
- Test: `components/globe/marker-list.test.tsx` (create if absent)

**Interfaces:**
- Produces: `GlobeView` holds `selectedId: string | null` + `setSelectedId`; `MarkerList` gains props `onSelect(id)`, `onEdit(id)`, `onDelete(id)`, `selectedId`.
- Consumes: existing `deleteMarker(markerId)` from `@/server/actions/globe`; existing `openEdit(id)` (rename usage to `onEdit`).

- [ ] **Step 1: Write the failing test.** `components/globe/marker-list.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MarkerList } from "@/components/globe/marker-list";

const markers = [{ id: "m1", title: "Tokyo Tower", category: "SIGHTS", timing: null, lat: 35.6, lng: 139.7 }];

it("selects on row click, and edit/delete are separate buttons", async () => {
  const onSelect = vi.fn(), onEdit = vi.fn(), onDelete = vi.fn();
  render(<MarkerList markers={markers as never} selectedId={null} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: /tokyo tower/i }));
  expect(onSelect).toHaveBeenCalledWith("m1");
  expect(onEdit).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /edit tokyo tower/i }));
  expect(onEdit).toHaveBeenCalledWith("m1");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/globe/marker-list.test.tsx`
Expected: FAIL (row click currently maps to edit; no edit/delete buttons).

- [ ] **Step 3: Rewire the list row.** In `marker-list.tsx`, change the row so the main button calls `onSelect(mk.id)` (select, not edit), apply a selected style when `mk.id === selectedId` (e.g. `aria-current` + a ring/bg class), and add two icon buttons per row using the shared `Button` (`@/components/ui/button`, `variant="ghost" size="icon" className="size-8"`) + lucide `Pencil`/`Trash2`:

```tsx
<Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${mk.title}`} onClick={() => onEdit(mk.id)}><Pencil className="size-4" /></Button>
<Button variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Delete ${mk.title}`} onClick={() => onDelete(mk.id)}><Trash2 className="size-4" /></Button>
```

- [ ] **Step 4: Wire GlobeView.** In `globe-view.tsx`: add `const [selectedId, setSelectedId] = React.useState<string | null>(null)`. Pass to `MarkerList`: `onSelect={setSelectedId}` (also flows to the map in A2), `onEdit={openEdit}`, `onDelete={handleDelete}`, `selectedId`. Implement `handleDelete(id)` = confirm (use the existing confirm-dialog pattern in the repo, e.g. the `ConfirmDialog`/`useConfirm` used by other delete buttons — search for how `deleteTransport`/`deleteMarker` confirms today) then `await deleteMarker(id)` + `router.refresh()`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run components/globe/marker-list.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add components/globe/marker-list.tsx components/globe/marker-list.test.tsx components/globe/globe-view.tsx
git commit -m "feat(globe): select on row click; Edit/Delete as explicit buttons"
```

### Task A2: Map fly-to + highlight + pin-select + popup buttons

**Files:**
- Modify: `components/globe/globe-map.tsx` (accept `selectedId`; flyTo + highlight; pin click → select; popup with Edit/Delete)
- Modify: `components/globe/globe-view.tsx` (pass `selectedId`, `onSelect`, `onEdit`, `onDelete` to `GlobeMap`)

**Interfaces:**
- Consumes: `selectedId` + `setSelectedId`/`onEdit`/`onDelete` from `GlobeView` (Task A1).
- Produces: `GlobeMap` props gain `selectedId: string | null`, `onSelect(id)`, `onEdit(id)`, `onDelete(id)`.

- [ ] **Step 1: Pin click selects (not edit).** In `globe-map.tsx`, change the marker click handler from `onSelectRef.current(mk.id)` opening edit to calling `onSelect(mk.id)` (select). Keep the ref pattern.

- [ ] **Step 2: Fly-to + highlight the selected marker.** Add a `useEffect` keyed on `selectedId` that, when set and the marker has coords, calls `leafletMapRef.current.flyTo([lat, lng], Math.max(map.getZoom(), 9), { duration: 0.6 })` and opens that marker's popup; and restyle the selected marker distinctly (e.g. a larger/coloured `divIcon`, or `setZIndexOffset` + a CSS class) vs the others. Guard against a null map / missing coords.

- [ ] **Step 3: Popup Edit/Delete buttons.** Build each marker's popup as an HTML string with the title, a `📎 <count>` when it has attachments (count comes in A2 only if available; otherwise omit — the count wiring lands in Task B4), and two buttons `data-edit="<id>"` / `data-delete="<id>"`. After `bindPopup`, on the map's `popupopen` event, query the popup DOM node for those buttons and attach listeners calling `onEdit(id)` / `onDelete(id)` (Leaflet popups are raw DOM — this manual wiring is required). Escape the title with the existing `escapeHtml` helper used by `route-map.tsx`.

- [ ] **Step 4: Pass props from GlobeView.** In `globe-view.tsx`, pass `selectedId={selectedId} onSelect={setSelectedId} onEdit={openEdit} onDelete={handleDelete}` to `<GlobeMap>`.

- [ ] **Step 5: Verify (no rendering test — Leaflet is visual).**

Run: `npx tsc --noEmit && npx eslint components/globe/globe-map.tsx components/globe/globe-view.tsx`
Expected: clean. In the report, flag the flyTo/highlight/popup-buttons as VISUAL — needs human browser verification. Run `npx vitest run` to confirm nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add components/globe/globe-map.tsx components/globe/globe-view.tsx
git commit -m "feat(globe): map flies to + highlights the selected marker; popup Edit/Delete"
```

---

# Part B — Attachments on Markers (G1)

### Task B1: Schema + migration — dual-scope Attachment + MARKER target

**Files:**
- Modify: `prisma/schema.prisma` (model `Attachment` ~line 457; enum list in `lib/enums.ts`)
- Modify: `lib/enums.ts` (add `"MARKER"` to `TARGET_TYPES`)
- Create: `prisma/migrations/20260713000000_globe_marker_attachments/migration.sql`

**Interfaces:**
- Produces: `Attachment.tripId String?` (nullable), `Attachment.globeId String?` (nullable, FK → Globe), relation `globe`; `TARGET_TYPES` includes `"MARKER"`.

- [ ] **Step 1: Edit the schema.** In `model Attachment`: change `tripId String` → `tripId String?`; add `globeId String?`; change the trip relation to optional (`trip Trip? @relation(...)`); add `globe Globe? @relation(fields: [globeId], references: [id], onDelete: Cascade)`; add `@@index([globeId])`. In `model Globe`, add the back-relation `attachments Attachment[]`. In `model Trip`, the `attachments Attachment[]` relation stays.

- [ ] **Step 2: Add the enum value.** In `lib/enums.ts`, add `"MARKER"` to `TARGET_TYPES`.

- [ ] **Step 3: Hand-author the migration.** Create `prisma/migrations/20260713000000_globe_marker_attachments/migration.sql` (Postgres, repo style). It must: drop NOT NULL on `Attachment.tripId`, add `globeId TEXT`, add the FK to `Globe(id)` ON DELETE CASCADE, and create the index:

```sql
-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "tripId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN     "globeId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_globeId_idx" ON "Attachment"("globeId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_globeId_fkey" FOREIGN KEY ("globeId") REFERENCES "Globe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

(Verify the existing `Attachment_tripId_fkey` doesn't need re-stating; `ALTER COLUMN ... DROP NOT NULL` leaves the existing FK intact.)

- [ ] **Step 4: Verify (no DB in sandbox).**

Run: `npx prisma generate && npx prisma validate && npx tsc --noEmit`
Expected: client regenerates, "schema is valid", clean typecheck. Do NOT run `prisma migrate dev`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/enums.ts prisma/migrations
git commit -m "feat(globe): dual-scope Attachment with nullable globeId + MARKER target"
```

### Task B2: Backend — storage scope + upload/delete/serve branch on trip vs globe

**Files:**
- Modify: `lib/storage.ts` (`generateKey` gains a scope)
- Modify: `server/actions/attachments.ts` (`uploadAttachment`, `deleteAttachment`, `requireAttachmentAccess`)
- Modify: `app/api/attachments/[id]/route.ts` (branch guard on scope)
- Test: `server/actions/attachments.test.ts` (extend)

**Interfaces:**
- Consumes: `requireGlobeAccess()` from `@/lib/globe` → `{ user: { id }, globe: { id } }`; schema columns from B1.
- Produces: `uploadAttachment(formData)` accepts an optional `globeId` (instead of `tripId`) in the FormData; storage keys become `globes/<globeId>/…` for globe rows; serve/delete verify globe membership for globe rows.

- [ ] **Step 1: Write the failing test.** In `server/actions/attachments.test.ts` add (hoist a `requireGlobeAccessMock`, `vi.mock("@/lib/globe", () => ({ requireGlobeAccess: requireGlobeAccessMock }))`):

```typescript
it("uploads a globe-scoped attachment to a marker", async () => {
  requireGlobeAccessMock.mockResolvedValue({ user: { id: "u1" }, globe: { id: "g1" } });
  attachmentCreateMock.mockResolvedValue({ id: "at1", globeId: "g1" });
  const fd = makeFormData({ globeId: "g1", targetType: "MARKER", targetId: "m1", filename: "tickets.pdf" });
  const result = await uploadAttachment(fd);
  expect(result.success).toBe(true);
  expect(requireGlobeAccessMock).toHaveBeenCalled();
  expect(requireTripAccessMock).not.toHaveBeenCalled();
  // storage key is globe-scoped
  expect(storageSaveMock).toHaveBeenCalledWith(expect.stringMatching(/^globes\/g1\//), expect.anything(), expect.any(String));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/attachments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Scope-aware storage key.** In `lib/storage.ts`, generalise `generateKey`:

```typescript
export function generateKey(scope: { trip: string } | { globe: string }, uniqueId: string, filename: string): string {
  const safe = sanitiseFilename(filename);
  const prefix = "trip" in scope ? `trips/${scope.trip}` : `globes/${scope.globe}`;
  return `${prefix}/${uniqueId}-${safe}`;
}
```

Update the existing trip call site in `attachments.ts` to `generateKey({ trip: tripId }, …)`.

- [ ] **Step 4: Branch the actions.** In `uploadAttachment`: read `globeId` from the FormData; if present, `await requireGlobeAccess()` and verify it equals `globeId` (else fail), create the row with `{ globeId, targetType, targetId }`, key `generateKey({ globe: globeId }, id, name)`, and `revalidatePath("/globe")`; otherwise keep the existing trip path unchanged. In `requireAttachmentAccess(id)`: after loading the row, if `attachment.globeId` is set, `requireGlobeAccess()` + verify match; else `requireTripAccess(attachment.tripId)`. `deleteAttachment` uses that guard and revalidates `/globe` for globe rows.

- [ ] **Step 5: Branch the serve route.** In `app/api/attachments/[id]/route.ts`, after loading the attachment + `requireUser()`: if `attachment.globeId` is set, `requireGlobeAccess()` and verify `globe.id === attachment.globeId`; else `requireTripAccess(attachment.tripId)`. Everything else (storage read, headers) unchanged.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run server/actions/attachments.test.ts && npx tsc --noEmit`
Expected: PASS + clean. (Existing trip-attachment tests must stay green.)

- [ ] **Step 7: Commit**

```bash
git add lib/storage.ts server/actions/attachments.ts "app/api/attachments/[id]/route.ts" server/actions/attachments.test.ts
git commit -m "feat(globe): scope attachment storage/access to trip OR globe"
```

### Task B3: `AttachmentList` accepts a Globe scope

**Files:**
- Modify: `components/trip/attachment-list.tsx` (accept `globeId` as an alternative to `tripId`)
- Modify: `components/trip/attachment-popover.tsx` (pass a scope through)
- Test: `components/trip/attachment-list.test.tsx` (create/extend)

**Interfaces:**
- Produces: `AttachmentList` + `AttachmentPopover` accept `tripId?: string` OR `globeId?: string` (exactly one); the upload FormData carries whichever is set.

- [ ] **Step 1: Write the failing test.**

```typescript
it("sends globeId when globe-scoped", async () => {
  const uploadMock = vi.fn().mockResolvedValue({ success: true });
  // mock @/server/actions/attachments -> uploadAttachment: uploadMock
  render(<AttachmentList globeId="g1" targetType="MARKER" targetId="m1" attachments={[]} />);
  // simulate selecting a file on the hidden input; assert the FormData passed to uploadMock has globeId=g1 and no tripId
});
```

(Adapt to how the component currently triggers upload — it builds a FormData and calls `uploadAttachment`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/trip/attachment-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Generalise the props.** Change `AttachmentListProps.tripId: string` to `tripId?: string` + add `globeId?: string`. Where it builds the upload FormData, set `tripId` or `globeId` accordingly (`if (tripId) fd.set("tripId", tripId); if (globeId) fd.set("globeId", globeId);`). Do the same in `AttachmentPopover` (add `globeId?`, pass through). All existing trip callers keep passing `tripId`, so they're unaffected.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run components/trip/attachment-list.test.tsx && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add components/trip/attachment-list.tsx components/trip/attachment-popover.tsx components/trip/attachment-list.test.tsx
git commit -m "feat(globe): AttachmentList/Popover accept a globe scope"
```

### Task B4: Marker attachment UI — edit dialog box + list-row badge + popup count

**Files:**
- Modify: `components/globe/marker-form.tsx` (upload box below the note field; "save first" on create)
- Modify: `components/globe/marker-list.tsx` (paperclip count-badge/popover per row)
- Modify: `components/globe/globe-view.tsx` + the Globe page (`app/(app)/globe/page.tsx`) to fetch marker attachments + thread them
- Test: `components/globe/marker-list.test.tsx` (extend)

**Interfaces:**
- Consumes: `AttachmentList`/`AttachmentPopover` globe scope (B3); `AttachmentView` from `@/components/trip/attachment-list`.
- Produces: markers render an attachment badge/popover + an edit-dialog upload box, fed by `attachmentsByMarkerId`.

- [ ] **Step 1: Fetch attachments on the Globe page.** In `app/(app)/globe/page.tsx`, after `requireGlobeAccess()`, query `db.attachment.findMany({ where: { globeId: globe.id, targetType: "MARKER" } })`, group into `attachmentsByMarkerId: Record<string, AttachmentView[]>` (by `targetId`), and pass `globeId` + the map into `GlobeView`.

- [ ] **Step 2: Edit-dialog upload box.** In `marker-form.tsx`, below the note field, add: when editing an existing marker (`marker?.id`), `<AttachmentList globeId={globeId} targetType="MARKER" targetId={marker.id} attachments={attachments ?? []} compact />`; when creating (no id), a `<p className="text-xs text-muted-foreground">Save this marker first, then reopen it to attach files.</p>`. Thread `globeId` + the marker's `attachments` into `MarkerForm` props.

- [ ] **Step 3: List-row badge/popover.** In `marker-list.tsx`, render `{attachments !== undefined && globeId && (<AttachmentPopover globeId={globeId} targetType="MARKER" targetId={mk.id} attachments={attachments} />)}` in the row's button group (next to Edit/Delete from A1). Thread `attachmentsByMarkerId` + `globeId` through `GlobeView` → `MarkerList`.

- [ ] **Step 4: Popup count (wire the A2 placeholder).** In `globe-map.tsx`, include `📎 <count>` in a marker's popup HTML when `attachmentsByMarkerId[mk.id]?.length` — pass the counts (or the map) into `GlobeMap`.

- [ ] **Step 5: Test.** Extend `marker-list.test.tsx`: a marker given `attachments=[one file]` + `globeId` renders the paperclip badge with the count. Add the `vi.mock("@/server/actions/attachments", …)` per the next-auth trap.

- [ ] **Step 6: Run tests + typecheck + full suite**

Run: `npx vitest run components/globe/marker-list.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: PASS + clean + 0 suites fail to load.

- [ ] **Step 7: Commit**

```bash
git add components/globe/marker-form.tsx components/globe/marker-list.tsx components/globe/globe-view.tsx components/globe/globe-map.tsx "app/(app)/globe/page.tsx" components/globe/marker-list.test.tsx
git commit -m "feat(globe): attach files to Markers — edit-dialog box, row badge, popup count"
```

### Task B5: Clean up a Marker's attachments when it is deleted

**Files:**
- Modify: `server/actions/globe.ts` (`deleteMarker`)
- Modify: `server/actions/target-cleanup.ts` (add a globe-scoped cleanup helper) — or extend the existing one
- Test: `server/actions/globe.test.ts` (create/extend)

**Interfaces:**
- Consumes: `getStorage()` from `@/lib/storage`.
- Produces: `deleteMarker` deletes the marker's `MARKER` attachments (rows + stored files) after removing the marker.

- [ ] **Step 1: Write the failing test.** In `server/actions/globe.test.ts` (mock db/globe-guard/storage):

```typescript
it("deletes a marker's attachments (rows + blobs) on delete", async () => {
  requireGlobeAccessMock.mockResolvedValue({ user: { id: "u1" }, globe: { id: "g1" } });
  markerFindUniqueMock.mockResolvedValue({ id: "m1", globeId: "g1" });
  attachmentFindManyMock.mockResolvedValue([{ id: "a1", storageKey: "globes/g1/a1-tickets.pdf" }]);
  await deleteMarker("m1");
  expect(storageDeleteMock).toHaveBeenCalledWith("globes/g1/a1-tickets.pdf");
  expect(attachmentDeleteManyMock).toHaveBeenCalledWith({ where: { globeId: "g1", targetType: "MARKER", targetId: "m1" } });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/actions/globe.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add a globe-scoped cleanup helper.** In `server/actions/target-cleanup.ts` add:

```typescript
export async function cleanupGlobeAttachments(globeId: string, targetType: TargetType, targetId: string): Promise<void> {
  const attachments = await db.attachment.findMany({ where: { globeId, targetType, targetId }, select: { id: true, storageKey: true } });
  const storage = getStorage();
  for (const a of attachments) { if (a.storageKey) { try { await storage.delete(a.storageKey); } catch { /* best-effort */ } } }
  await db.attachment.deleteMany({ where: { globeId, targetType, targetId } });
}
```

(No note cleanup — Markers have no Note rows.)

- [ ] **Step 4: Call it in `deleteMarker`.** In `server/actions/globe.ts` `deleteMarker`, after `requireMarkerOnGlobe` + the marker delete, call `await cleanupGlobeAttachments(globe.id, "MARKER", markerId)` before `revalidatePath("/globe")`.

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `npx vitest run server/actions/globe.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS + clean + 0 suites fail to load.

- [ ] **Step 6: Commit**

```bash
git add server/actions/globe.ts server/actions/target-cleanup.ts server/actions/globe.test.ts
git commit -m "fix(globe): clean up a marker's attachments + files on delete"
```

---

## Final verification (after all tasks)
- `npx vitest run` (all green, 0 suites fail to load) + `npx tsc --noEmit` + `npx eslint` on all changed files.
- Human browser pass (can't run here): click a Marker in the list AND on the map → map flies to + highlights the pin, popup shows Edit/Delete (+ 📎 count); Edit opens the form, Delete confirms; upload a file to a Marker from its edit dialog and from the row popover; confirm the file opens (globe-scoped serve route); delete the Marker and confirm its file is gone from storage.

## Out of scope (do NOT build)
- Collaborative note threads on Markers (single `note` field stays); any `Note` Globe-scoping; a Globe activity feed.
- Attachments on the Globe itself (only Markers).
- Offline caching of marker files.
