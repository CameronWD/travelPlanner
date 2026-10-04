# Feedback batch 2026-10-04 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eleven parts of the 2026-10-04 feedback spec — stacked plan days, a stay panel, a near-full-screen route map, honest Transport positions, a required display name, light mode for everyone, a fixed and visibly-sticky dialog footer, the bank-details hint, the folded-in plan fixes, "N nights" on desktop, and working Transport attachment delete.

**Architecture:** Mostly client components in the plan editor (`components/plan/*`, `components/trip/itinerary-manager.tsx`) and shared UI primitives (`components/ui/dialog.tsx`, `sheet.tsx`, `theme-provider.tsx`), plus small server-side changes (`WelcomeGate`, the `(app)` layout, Transport creation paths, `feedback.ts`). No schema change, no new server action.

**Tech Stack:** Next.js (repo-pinned version — read `node_modules/next/dist/docs/` before using any Next API), React 19, Tailwind v4, Radix Dialog, dnd-kit 6.3.1, Leaflet 1.9.4, Prisma, Vitest + Testing Library.

**Spec:** `docs/specs/2026-10-04-feedback-batch-plan-stay-map-names-light.md`

## Global Constraints

- Work only on branch `feat/feedback-batch-2026-10-04`. Never touch `main`, never deploy, never run `npm run feedback:*`, never connect to a database.
- Copy uses `CONTEXT.md` terms (Stop, Day title, Changeover day, Accommodation, Transport, Traveller, Share link, Sign-in link, display name). "Stay" never names the thing — "Where you're staying" is only a display heading.
- A commit that does the work for a feedback note ends its body with `Resolves-Feedback: <id>` (ids in the spec table), then a blank line, then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Every other commit carries only the Co-Authored-By line.
- Tests: `TZ=UTC npx vitest run <paths>`. Each task leaves `npx tsc --noEmit`, `npx eslint <touched paths>` and the touched test files green; run the full `npm test` at the end of each Part.
- Phone (`< lg`) plan editor layout is unchanged except §A6's owner marker and §B's times on rows.
- New files obey `banned-classes.test.ts` (no `shadow-soft`, `border-border/70`, `bg-card/40`, raw hex).
- Bank details hint is exactly: `Only the people on your Trips ever see this — never a Share link.` (U+2014 em dash).
- Dark mode is parked, not deleted: `.dark` CSS, map dark variants, `ThemeProvider`, `ThemeToggle` stay; `FORCED_THEME = "light"` is the one switch.
- localStorage is a per-device convenience only: every access in try/catch; the UI works without it.

## Review Focus

1. **Dialogs with focusable hidden inputs, scrolled** (Checkbox, file inputs) — frame/header/footer never move (G1); short dialogs show no rule, shadow or phantom scroll (G2/G3).
2. **Buttons inside forms** — no file-row button in `AttachmentList` submits a surrounding form; unsaved edits survive a delete (K1).
3. **Transport picker on a null-anchor leg whose endpoints change before Save** — reads the live resolved slot; saving untouched never moves the leg (D1).
4. **Stacked days with storage blocked or junk, and `#day=` on a Changeover day with both Stops open** — folds work for the visit, one scroll, first Stop only (A1/A3).
5. **Nameless Traveller saving offline / failing** — dialog stays, name kept, never dismissable; whitespace names count as none (E2/E3).

Each line's test lives in the owning task below.

## Execution order

Tasks run in number order 1–32 (K1 → G1–G3 → H1 → J1 → F1–F4 → E1–E4 → D1–D4 → A1–A6 → B1–B4 → C1–C3 → Z1); headings read "Task N — <part label>".

Cross-part notes:
- **C2 after G:** C2 adds `size="full"` to `DialogContent`. Keep G1's frame classes (`overflow-hidden supports-[overflow:clip]:overflow-clip`) and scroll-body `relative`, and G3's `group` / data attributes on the scroll body, when editing it.
- **B after A:** both edit `components/plan/stop-open-body.tsx`, its test, and `itinerary-manager.tsx`. A owns the days area; B owns the top row (stay + ideas).
- **C3 after A:** if A3 changed `PlanBody`'s props, update the render helpers in `plan-mini-map.test.tsx` the same way.
- **K1 and D both touch `transport-form-dialog.test.tsx`:** K1 appends a new `describe` at the end; D edits the position-picker tests (~:833-901).
- **F2 before F3** (sidebar tests render the real `SearchField`).
- **F4 creates `## 2026-10-04 · Feedback batch …` in `docs/open-follow-ups.md`;** Z1 appends to it.

---

# Part K

## Part K notes

- **Root cause: CONFIRMED by a reproduction test.** It is not the server action and not a scope check. In `components/trip/attachment-list.tsx`, the file-row `<Button>`s (Delete, and Rename/Link on the Files page) have no `type`. `components/ui/button.tsx` doesn't set a default either, so each renders as a plain `<button>`, which means `type="submit"`. In `TransportForm` the `AttachmentList` sits inside `<form id={formId} onSubmit={onSubmit}>` (`components/trip/transport-form-dialog.tsx` :595–864). Clicking the trash icon does two things. First its `onClick` opens the `useConfirm` dialog. Then the browser's default submit runs `useEntityForm.onSubmit`, which calls `updateTransport`, and on success `onClose()` → `onOpenChange(false)`. `ItineraryManager` clears `editingTransport` (:2273–2295), so the whole sheet unmounts, taking the AttachmentList and its half-open confirm dialog with it. `deleteAttachment` is never called, and as a side effect the leg is silently saved with whatever is in the fields.
- **Evidence.** A scratch repro rendered `TransportFormDialog` in edit mode with one attachment and clicked "Delete boarding-pass.pdf". Result: the button's `type` attribute was null, `button.form` was the leg's form, `updateTransport` was called once and `onOpenChange` was called with `[false]`. The four tests in K1 Step 1 fail on the current code and pass with only the `type="button"` change applied. I checked that by running them against a patched copy of the component through `vi.mock`; no file under /work was touched.
- **Conflicts with the spec's premise.** §K says Item/Accommodation Attachments "delete correctly". That holds for the card-level surfaces: `AttachmentPopover` and the `CardActionCluster` sheet, which are not inside a form. The **edit dialogs** for Item (`item-form-dialog.tsx` :637–898), Accommodation (`accommodation-form-dialog.tsx` :297–449) and Stop (`stop-form-dialog.tsx` :220–378) all put `AttachmentList` inside their `<form>` and have exactly the same bug. The repro shows `updateItem` called and `onOpenChange(false)` for Item. Transport stands out only because its edit dialog is the *only* place a leg's Attachments can be deleted (the leg pill dropped them, Task 13). Fixing the shared component fixes all four dialogs. Flag this to Cam rather than widening the spec. No extra work is needed.
- **Ruled out:** the server action. `deleteAttachment` → `requireAttachmentAccess` → `requireTripAccess` has no `targetType` branch except the JOURNAL author check, and no fork/plan scope check. Also ruled out: `window.confirm` (the code uses the in-app `useConfirm` / `ConfirmDialog`), and the nested Radix dialog (the confirm's buttons are portalled outside the form's DOM, so they never submit it). The export allowlist is ruled out too: `deleteAttachment` is an existing export and already works from the Files page.
- **Why upload works:** the upload trigger is a `<label htmlFor>` over a hidden file input, not a `<button>`, so it never submits the form.
- **Refresh after delete.** `deleteAttachment` revalidates only `/trips/${tripId}/files`, which is the same path `uploadAttachment` revalidates. Cam sees new uploads appear in the open leg dialog, so the same refresh will drop a deleted file. No change is planned. The implementer's browser check (K1 Step 4) confirms it.
- **Fix choice:** add `type="button"` to the six file-row Buttons in `AttachmentList`. I deliberately chose not to change `Button`'s global default: many forms across the app rely on its implicit submit, and that would be a much wider change than §K asks for.
- **Part D also edits `transport-form-dialog.test.tsx`** (Task 13 describe :828–901). K1 adds its test as a **new top-level `describe` at the end of the file**, so the two never touch the same lines.

## Review-focus candidates

- **A Traveller edits a leg's fields, then deletes a ticket before saving.** The confirm appears, the sheet stays open with the unsaved edits intact, and `updateTransport` is not called, either by the trash click or by confirming. Covered by K1's Transport test.
- **Same click in the Item edit dialog** (the spec assumes it works, but it shares the bug). The confirm appears, `updateItem` is not called, the dialog stays open, and the file is deleted on confirm. Covered by K1's Item test.
- **Files page Rename / Link-to buttons, if an AttachmentList is ever placed inside a form.** They call their handler and never submit the surrounding form, in both the compact and full layouts. Covered by K1's AttachmentList-in-a-form test (`it.each` over both layouts).

### Task 1 — K1: Attachment row buttons never submit the surrounding form (Transport ticket delete works)

**Files:**
- Modify: `components/trip/attachment-list.tsx` (compact Rename :273–282, Link :284–293, Delete :302–315; full Rename :428–437, Link :439–448, Delete :457–470)
- Test: `components/trip/attachment-list.test.tsx` (new test appended inside the `describe("AttachmentList")` block, before its closing `});` at end of file; one new `import type`)
- Test: `components/trip/transport-form-dialog.test.tsx` (new top-level `describe` appended at end of file; one import added after the `@/server/actions/transport` import at :26)
- Test: `components/trip/item-form-dialog.test.tsx` (new top-level `describe` appended at end of file; one import added after the `@/server/actions/item-photo` import at :27)

**Interfaces:**
- Consumes: `AttachmentList` (unchanged props), `useConfirm`, `deleteAttachment(id)`.
- Produces: no new exports. Behavioural contract: every `<button>` that `AttachmentList` renders for a file row has `type="button"`, so placing the list inside a `<form>` never submits that form.

- [ ] **Step 1: Write the failing tests**

In `components/trip/attachment-list.test.tsx`, add under the existing imports:

```tsx
import type { FormEvent } from "react";
```

and append this test as the last `it` inside `describe("AttachmentList", …)`:

```tsx
  // Spec 2026-10-04 §K: the Transport, Item, Accommodation and Stop edit
  // dialogs all render this list INSIDE their <form>. A <button> with no
  // type is a submit button, so the trash icon used to save the entity and
  // close the dialog — unmounting the "Delete …?" confirm before it could
  // be answered.
  it.each([
    ["compact", true],
    ["full", false],
  ])("%s: its file buttons never submit a surrounding form", async (_layout, compact) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const onRename = vi.fn();
    const onLink = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <AttachmentList
          tripId="trip-1"
          targetType="TRANSPORT"
          targetId="transport-1"
          attachments={[sampleAttachments[0]]}
          compact={compact}
          onRename={onRename}
          onLink={onLink}
        />
      </form>,
    );

    for (const name of [
      /rename boarding-pass\.pdf/i,
      /link boarding-pass\.pdf to an item/i,
      /delete boarding-pass\.pdf/i,
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("type", "button");
    }

    await user.click(screen.getByRole("button", { name: /rename boarding-pass\.pdf/i }));
    await user.click(screen.getByRole("button", { name: /link boarding-pass\.pdf to an item/i }));
    await user.click(screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "boarding-pass\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(onSubmit).not.toHaveBeenCalled();
  });
```

In `components/trip/transport-form-dialog.test.tsx`, add after `import { createTransport, updateTransport } from "@/server/actions/transport";` (:26):

```tsx
import { deleteAttachment } from "@/server/actions/attachments";
```

and append at the very end of the file:

```tsx
// ---------------------------------------------------------------------------
// Spec 2026-10-04 §K: deleting a ticket on a leg. The trash icon sat inside
// the leg's <form> as an implicit submit button — clicking it saved the leg
// and closed the sheet, so the "Delete …?" confirm vanished unanswered.
// ---------------------------------------------------------------------------

describe("TransportFormDialog — deleting an Attachment", () => {
  beforeEach(() => vi.clearAllMocks());

  const ticket = {
    id: "att-1",
    filename: "eurostar-ticket.pdf",
    mime: "application/pdf",
    size: 120_000,
    url: "/api/attachments/att-1",
    uploadedById: "user-1",
    createdAt: new Date("2026-07-01"),
  };

  it("asks to confirm, deletes the ticket, and neither saves nor closes the leg", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <TransportFormDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        transport={existingTransport}
        attachments={[ticket]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete eurostar-ticket\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "eurostar-ticket\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(updateTransport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(updateTransport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

In `components/trip/item-form-dialog.test.tsx`, add after `import { setItemPhoto, removeItemPhoto } from "@/server/actions/item-photo";` (:27):

```tsx
import { deleteAttachment } from "@/server/actions/attachments";
```

and append at the very end of the file:

```tsx
// ---------------------------------------------------------------------------
// Spec 2026-10-04 §K: the Item edit dialog shares AttachmentList-inside-a-
// <form> with the Transport sheet, so it had the same implicit-submit bug.
// ---------------------------------------------------------------------------

describe("ItemFormDialog — deleting an Attachment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks to confirm, deletes the file, and neither saves nor closes the Item", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ItemFormDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        item={existingItem}
        attachments={[
          {
            id: "att-1",
            filename: "museum-tickets.pdf",
            mime: "application/pdf",
            size: 80_000,
            url: "/api/attachments/att-1",
            uploadedById: "user-1",
            createdAt: new Date("2026-07-01"),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete museum-tickets\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "museum-tickets\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(updateItem).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(updateItem).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

(`deleteAttachment` is mocked as a bare `vi.fn()` in this file; `handleDelete` awaits its `undefined` result without reading it, so no mock change is needed.)

- [ ] **Step 2: Run it, expect FAIL**

`TZ=UTC npx vitest run components/trip/attachment-list.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx`

Expected: 4 new failures.
- The two `AttachmentList` layouts fail on `expect(element).toHaveAttribute("type", "button")`, because the attribute is missing.
- The Transport test fails on `expect(updateTransport).not.toHaveBeenCalled()`, which was "called 1 times".
- The Item test fails on `expect(updateItem).not.toHaveBeenCalled()`, also "called 1 times".

All existing tests stay green.

- [ ] **Step 3: Implement**

In `components/trip/attachment-list.tsx`, give each of the six file-row Buttons `type="button"`: Rename, Link and Delete in the compact layout, and the same three in the full layout. Compact layout:

```tsx
                <div className="flex shrink-0 items-center gap-1">
                  {onRename && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn("size-8 hover:bg-muted")}
                      aria-label={`Rename ${attachmentName(att)}`}
                      onClick={() => onRename(att)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                  {onLink && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn("size-8 hover:bg-muted")}
                      aria-label={`Link ${attachmentName(att)} to an Item`}
                      onClick={() => onLink(att)}
                    >
                      <Link2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                  <AttachmentLink
                    …unchanged…
                  </AttachmentLink>
                  {/* type="button": the entity edit dialogs render this list
                      inside their <form>; an untyped <button> would submit it
                      (save + close the dialog) instead of deleting (spec §K). */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:bg-destructive/10"
                    aria-label={`Delete ${attachmentName(att)}`}
                    disabled={isPending && deletingId === att.id}
                    onClick={() => handleDelete(att.id, attachmentName(att))}
                  >
```

Full layout:

```tsx
              <div className="flex shrink-0 items-center md:absolute md:right-2 md:top-2">
                {onRename && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(CARD_ACTION, "hover:bg-muted")}
                    aria-label={`Rename ${attachmentName(att)}`}
                    onClick={() => onRename(att)}
                  >
                …
                {onLink && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(CARD_ACTION, "hover:bg-muted")}
                    aria-label={`Link ${attachmentName(att)} to an Item`}
                    onClick={() => onLink(att)}
                  >
                …
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(CARD_ACTION, "text-destructive hover:bg-destructive/10")}
                  aria-label={`Delete ${attachmentName(att)}`}
                  disabled={isPending && deletingId === att.id}
                  onClick={() => handleDelete(att.id, attachmentName(att))}
                >
```

Change nothing else: no `Button` default, no server action, no `revalidatePath`.

- [ ] **Step 4: Run, expect PASS**

`TZ=UTC npx vitest run components/trip/attachment-list.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx components/trip/accommodation-form-dialog.test.tsx components/trip/stop-form-dialog.test.tsx components/trip/attachment-popover.test.tsx components/trip/card-action-cluster.test.tsx components/trip/files-index.test.tsx components/globe/marker-form.test.tsx`

All should pass. No existing test needs updating, because the change only adds an attribute. Then run:

`npx tsc --noEmit` and `npx eslint components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx`

**Browser check (implementer, local dev only):**
1. Open a Trip's plan and open a leg's edit sheet.
2. Attach a PDF, then click its trash icon. The sheet must stay open and show "Delete "<file>"?".
3. Confirm. The row must disappear from the sheet (via the same revalidation that makes uploads appear) while the sheet stays open.
4. Repeat once in an Item's edit dialog.

If the row only disappears after reopening, the refresh does not reach the plan route. Report that as a finding; don't patch it in this task.

- [ ] **Step 5: Commit**

```
git add components/trip/attachment-list.tsx components/trip/attachment-list.test.tsx components/trip/transport-form-dialog.test.tsx components/trip/item-form-dialog.test.tsx
git commit -m "fix(attachments): row buttons never submit the parent form

The trash icon in AttachmentList had no type, so inside the Transport
(and Item, Accommodation, Stop) edit dialogs it was a submit button:
clicking it saved the entity and closed the dialog, unmounting the
Delete confirm before it could be answered. Rename/Link get the same
type=\"button\" for safety.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

# Part G

## Part G notes

- **Root cause: CONFIRMED, reproduced in a real browser** (Playwright + Chromium against the *real* `ItemFormDialog`/`DialogContent`/`AttachmentList`, bundled with esbuild with server actions stubbed, plus the app's real compiled Tailwind CSS; harness in `/tmp/claude-1000/-work/63431a35-413e-4ee1-b8b9-fb17ca7502b5/scratchpad/g-harness/`). It is **not** the grid footer row. Every `sr-only` control (`position: absolute`) in a dialog body — the Attachments "Add file" `<input type=file>` (`components/trip/attachment-list.tsx:216-226`), the Photo input (`components/trip/item-form-dialog.tsx:288-296`), and the native input in **every `Checkbox`** (`components/ui/checkbox.tsx:16`, whose `<label>` isn't positioned) — gets its containing block from the nearest *positioned* ancestor. That's `DialogPrimitive.Content` (`fixed`), not the scroll body (`components/ui/dialog.tsx:115`, not positioned). So the input doesn't scroll with the body. Its box stays at its unscrolled spot, below the frame's clipped bottom edge. Clicking the label (or Tab-ing to the input) focuses it, and Chromium scrolls it into view in the nearest scrollable ancestor. That's the **frame**: `overflow-hidden` still makes it a scroll container you can scroll from code. Measured on the Item dialog: frame `scrollTop` went 0 → **302px** at 1920×911 and 0 → **607px** at 390×844. Header and body slid up out of view, and the footer ended up mid-dialog (top 741 → 439 desktop, 692 → **85** phone) over a band of blank dialog background. It stays like that until the dialog closes, so after adding an attachment the footer bar "covers most of the dialog". Same result from clicking "Hide from shared links". `revealFocusedField` is not involved: it only scrolls the body.
- **Fix, verified in the same harness:** `relative` on the scroll body, plus `overflow-hidden supports-[overflow:clip]:overflow-clip` on the frame. After the fix, frame `scrollTop` stays 0 on every path (label click, Tab, checkbox, desktop and phone). Either change alone stops the slide. `relative` is the real fix: the input then scrolls with its row and focus scrolling moves the body. `overflow: clip` is the guard: a clip frame can't be scrolled at all, so no other absolutely positioned descendant can do this again. `overflow-hidden` stays as the fallback because Safari < 16 would drop `clip` and stop clipping the rounded corners. `Sheet` (`components/ui/sheet.tsx:36-39, 92`) has the same frame/body structure, so it gets the same two changes. The fix lives in the shared dialog, so it covers every entity dialog with an AttachmentList or Checkbox: Item, Stop, Transport, Accommodation, Stop extras, Marker.
- **Second, pre-existing bug found (it blocks "short dialogs look unchanged"):** the footer's iOS overscroll cover (`after:` with `absolute top-full h-[22px+safe-area]`, `dialog.tsx:221`) hangs below the content. An absolutely positioned box adds *scrollable overflow*, so **every dialog with a DialogFooter scrolls by a phantom 22px** even when its content fits (measured: scroll range 22 with the pseudo, 0 without). With a scroll-aware footer, every short dialog would show "more below" all the time. G3 replaces the pseudo with a solid background-coloured box-shadow dropped 22px+safe-area below the footer. It paints the same strip, and shadows never add scroll range. Verified: range 0 on a short dialog, and the cover still paints.
- **The spec's grid suspect, checked:** in the `sm:grid` forms the footer's `-mb-[…]` does *not* shrink the grid (form bottom = footer bottom). So on desktop the stuck footer sits 22px above the frame's bottom edge, and that strip is covered by the same cover (pseudo today, shadow after G3). This is pre-existing and not changed here. It's harmless with the cover, but it is why the cover has to stay.
- **Scroll-aware edges (G2/G3):** `trackScrollEdges` is a React 19 **callback ref** (React 19.2.4), not a `useEffect` over a ref object. Verified in the harness: Radix's Portal mounts its children one commit late, so an effect in `DialogContent` runs while `ref.current` is still null and never runs again. The edges silently never appeared. The ref writes `data-scrolled` / `data-more-below` straight onto the body (no re-render on scroll). It re-measures on scroll, on ResizeObserver changes (the body plus its content boxes, looking through FormDialog's `display: contents` wrapper), and on MutationObserver child changes. Header and footer style off `group/dialog-body` with **non-inset** box-shadows only. An inset shadow would make the list impossible to interpolate, so the fade would snap. Verified: the shadow interpolates over `--dur-base`, and a `border` would have shifted layout by 2px. Attribute name is `data-scrolled`, not the brief's suggested `data-scrolled-top`.
- **Sheet** has no sticky header or footer (`SheetHeader`/`SheetFooter` are plain flow), so the scroll-aware edges don't apply there. It only gets the G1 containment fix.
- **Overlap with other parts:** Part C (near-full-screen map dialog) may pass a `className` to `DialogContent`. The base `overflow-hidden supports-[overflow:clip]:overflow-clip` must survive any merge in `dialog.tsx:125`. All of G was run together in a scratch copy of the repo: `npx tsc --noEmit` clean, eslint clean, `vitest run components app lib test/helpers` → 586 files / 6521 tests green.
- **Out of scope, worth knowing:** AttachmentList also renders in popovers (`components/trip/attachment-popover.tsx`, `card-action-cluster.tsx`). Any `overflow-hidden` popover container could show the same frame-scroll on focus; not checked or changed. `notification-bell.tsx:49-122` has its own `moreBelow` logic that could later reuse `scrollEdges`; not touched.

## Review-focus candidates

1. **Clicking any Checkbox ("Hide from shared links", Paid) or Tab-ing to a hidden file input while the body is scrolled.** Expected: the body scrolls if needed; the frame, header and footer never move. Pinned by G1's containing-block tests (dialog, sheet, and the real Item form with all three controls).
2. **Content grows while you're at the scroll end without scrolling** (an attachment row arrives, an upload error or server error appears, a photo loads). Expected: the footer's rule and shadow come back immediately, with no scroll needed. Pinned by G2's ResizeObserver and MutationObserver tests. Seen in the browser too: after the attachment was added, `moreBelow` went false → true with no scroll.
3. **Short dialogs** (ConfirmDialog, a two-field form). Expected: no rule, no shadow, and no phantom 22px scroll. Pinned by G2 "sets nothing on a body whose content fits" and G3's "not an `after:` box" cover test. The phantom scroll itself can only be measured in a browser (G3 Step 4b).

---

### Task 2 — G1: Anchor sr-only controls to the dialog's scroll body; a clip frame that can't be scrolled

**Files:**
- Create: `test/helpers/containing-block.ts`
- Test: `test/helpers/containing-block.test.ts` (create)
- Modify: `components/ui/dialog.tsx:115` (scroll body), `:125` (frame classes)
- Modify: `components/ui/sheet.tsx:36-39` (frame variants), `:91-92` (scroll body)
- Test: `components/ui/dialog.test.tsx` (imports at :51; new describe before `describe("DialogContent size"` at :239)
- Test: `components/ui/sheet.test.tsx` (imports at :3; new `it.each` before the final `});`)
- Test: `components/trip/item-form-dialog.test.tsx` (import after :30; new describe appended at end of file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `nearestPositionedAncestor(el: Element): HTMLElement | null` from `@/test/helpers/containing-block`. The scroll body carries `data-slot="dialog-body"`; G3 adds its ref and group class on that element.

- [ ] **Step 0: (Optional, recommended) Re-watch the bug in a browser before changing anything.** The harness bundles the *current* `/work` code. Playwright is installed globally and the scripts import it by absolute path:

  ```bash
  H=/tmp/claude-1000/-work/63431a35-413e-4ee1-b8b9-fb17ca7502b5/scratchpad/g-harness
  cd /work && node $H/build-css.mjs $H/app.css && node $H/build.mjs $H
  node $H/run3.mjs $H none click      # expect after: contentScroll=302 footer=[439,517]
  node $H/run3.mjs $H none tab        # expect after: contentScroll=302
  ```
  If the scratchpad is gone, the reproduction is: open Edit Item at 1920×911, scroll to the bottom, click "Add file" (or "Hide from shared links"), then read `document.querySelector('[role=dialog]').scrollTop`. It is non-zero before the fix and 0 after.

- [ ] **Step 1: Write the failing tests**

  `test/helpers/containing-block.ts`:
  ```ts
  /**
   * The ancestor an absolutely positioned element resolves its containing block
   * against, read off Tailwind's position utilities — jsdom has no layout, so
   * this is what a test can pin. Only bare (unprefixed) utilities count: a
   * `sm:relative` is not positioned at every width.
   */
  const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);

  export function nearestPositionedAncestor(el: Element): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (node.className.split(/\s+/).some((c) => POSITIONED.has(c))) return node;
    }
    return null;
  }
  ```

  `test/helpers/containing-block.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { nearestPositionedAncestor } from "./containing-block";

  describe("nearestPositionedAncestor", () => {
    it("finds the closest ancestor with a bare position utility", () => {
      document.body.innerHTML =
        '<div id="far" class="fixed"><div id="near" class="relative flex"><span><input id="x" class="sr-only" /></span></div></div>';
      expect(nearestPositionedAncestor(document.getElementById("x")!)?.id).toBe("near");
    });

    it("ignores breakpoint-prefixed utilities, which are not positioned at every width", () => {
      document.body.innerHTML = '<div id="far" class="fixed"><div class="sm:relative"><input id="x" /></div></div>';
      expect(nearestPositionedAncestor(document.getElementById("x")!)?.id).toBe("far");
    });

    it("returns null when nothing above is positioned", () => {
      document.body.innerHTML = '<div><input id="x" /></div>';
      expect(nearestPositionedAncestor(document.getElementById("x")!)).toBeNull();
    });
  });
  ```

  `components/ui/dialog.test.tsx`: extend the imports after `import { Field } from "./field";`:
  ```tsx
  import { Checkbox } from "./checkbox";
  import { nearestPositionedAncestor } from "@/test/helpers/containing-block";
  ```
  and insert this describe immediately before `describe("DialogContent size", () => {`:
  ```tsx
  describe("Dialog scroll containment (spec 2026-10-04 §G)", () => {
    // Reproduced in-browser (Item dialog, 1920×911 and 390×844): clicking a
    // visually-hidden control — the Attachments "Add file" input, a Checkbox —
    // whose containing block was the fixed frame made Chromium scroll the
    // *frame* to reveal it (overflow: hidden is still programmatically
    // scrollable). The frame slid up 302px (607px on a phone), carrying header
    // and body with it and leaving the footer mid-dialog over blank background
    // until the dialog closed. jsdom has no layout, so these pin the two
    // invariants that make it impossible.
    function renderWithCheckbox() {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
            </DialogHeader>
            <Checkbox label="Hide from shared links" />
            <DialogFooter>
              <button type="button">Cancel</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      return screen.getByRole("dialog");
    }

    it("makes the scroll body the containing block for absolutely positioned controls inside it", () => {
      const content = renderWithCheckbox();
      const body = content.querySelector<HTMLElement>('[data-slot="dialog-body"]');
      expect(body).not.toBeNull();
      expect(body!.className).toContain("overflow-y-auto");
      // The Checkbox's native input is sr-only (position: absolute). Anchored to
      // the scroll body it scrolls with its row, so focus scrolling moves the
      // body — never the frame.
      const input = screen.getByRole("checkbox", { name: "Hide from shared links" });
      expect(nearestPositionedAncestor(input)).toBe(body);
    });

    it("clips the frame without making it a scroll container, wherever overflow: clip is supported", () => {
      const content = renderWithCheckbox();
      const classes = content.className.split(/\s+/);
      // overflow-hidden stays as the fallback (Safari < 16 would drop an
      // unsupported `overflow: clip` and stop clipping the rounded corners).
      expect(classes).toContain("overflow-hidden");
      expect(classes).toContain("supports-[overflow:clip]:overflow-clip");
    });
  });
  ```

  `components/ui/sheet.test.tsx`: extend the imports after the `./sheet` import:
  ```tsx
  import { Checkbox } from "./checkbox";
  import { nearestPositionedAncestor } from "@/test/helpers/containing-block";
  ```
  and add, as the last test inside `describe("Sheet", …)` (just before its closing `});`):
  ```tsx
    // Same frame/body structure as dialog.tsx, so the same fix (spec
    // 2026-10-04 §G): an sr-only control's focus scroll must move the body,
    // never the frame.
    it.each(["bottom", "right", "left"] as const)(
      "anchors absolutely positioned controls to the %s sheet's scroll body, and clips its frame without scrolling it",
      (side) => {
        render(
          <Sheet open>
            <SheetContent side={side}>
              <SheetTitle>Filters</SheetTitle>
              <Checkbox label="Only booked" />
            </SheetContent>
          </Sheet>,
        );
        const panel = screen.getByRole("dialog");
        const body = panel.querySelector<HTMLElement>('[class*="overflow-y-auto"]');
        expect(nearestPositionedAncestor(screen.getByRole("checkbox", { name: "Only booked" }))).toBe(body);
        const classes = panel.className.split(/\s+/);
        expect(classes).toContain("overflow-hidden");
        expect(classes).toContain("supports-[overflow:clip]:overflow-clip");
      },
    );
  ```

  `components/trip/item-form-dialog.test.tsx`: add after `import type { ItemCardItem } from "./item-card";`:
  ```tsx
  import { nearestPositionedAncestor } from "@/test/helpers/containing-block";
  ```
  and append at the end of the file:
  ```tsx
  describe("Dialog scroll containment (spec 2026-10-04 §G)", () => {
    // The reported bug: after adding an attachment the footer bar covered most
    // of the dialog. Clicking "Add file" focuses the Attachments' sr-only file
    // input; anchored to the fixed frame, focusing it scrolled the frame itself.
    // Every visually-hidden control in this form must resolve its containing
    // block to the scroll body instead.
    it("anchors the Attachments input, the Photo input and the Hide-from-shared-links checkbox to the scroll body", () => {
      render(<ItemFormDialog {...baseProps} item={existingItem} attachments={[]} />);
      const body = screen.getByRole("dialog").querySelector<HTMLElement>('[data-slot="dialog-body"]');
      expect(body).not.toBeNull();

      const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
      expect(fileInputs).toHaveLength(2); // Photo + Attachments
      const checkbox = screen.getByRole("checkbox", { name: "Hide from shared links" });

      for (const control of [...fileInputs, checkbox]) {
        expect(nearestPositionedAncestor(control)).toBe(body);
      }
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**
  ```bash
  npx vitest run test/helpers/containing-block.test.ts components/ui/dialog.test.tsx components/ui/sheet.test.tsx components/trip/item-form-dialog.test.tsx
  ```
  Expected: the 3 helper tests pass. These 6 fail: the two dialog containment tests (`expected null not to be null`, because there's no `data-slot="dialog-body"` yet, and `…to include 'supports-[overflow:clip]:overflow-clip'`), the three sheet `it.each` cases (nearest positioned is `<div role="dialog">`, not the body), and the Item-form test (`expected null not to be null`).

- [ ] **Step 3: Implement**

  `components/ui/dialog.tsx`: replace the one-line scroll body (line 115):
  ```tsx
  -      <div onFocus={revealFocusedField} className="flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6">{children}</div>
  +      {/* `relative` makes this body — not the fixed frame — the containing
  +          block for absolutely positioned controls inside it (every sr-only
  +          input: Checkbox, the Attachments and Photo file pickers). Anchored to
  +          the frame they did not scroll with the body, and focusing one made
  +          the browser scroll the frame to reveal it: header and body slid up
  +          and the footer was left mid-dialog over blank background (spec
  +          2026-10-04 §G, reproduced in-browser at 1920×911 and 390×844). */}
  +      <div
  +        data-slot="dialog-body"
  +        onFocus={revealFocusedField}
  +        className="relative flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6"
  +      >
  +        {children}
  +      </div>
  ```
  and the first frame class string (line 125):
  ```tsx
           className={cn(
  -          "fixed z-50 flex flex-col overflow-hidden border-2 border-border bg-background text-foreground",
  +          // overflow: clip, where supported, clips the rounded frame without
  +          // making it a scroll container, so nothing — focus scrolling
  +          // included — can ever scroll the frame itself (spec 2026-10-04 §G).
  +          // overflow-hidden stays as the fallback for browsers without clip.
  +          "fixed z-50 flex flex-col overflow-hidden supports-[overflow:clip]:overflow-clip border-2 border-border bg-background text-foreground",
             "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-b-0",
  ```

  `components/ui/sheet.tsx`: the three framed variants (lines 36-39):
  ```tsx
           bottom:
  -          "inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
  +          "inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden supports-[overflow:clip]:overflow-clip rounded-t-2xl border-t-2 data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
           right:
  -          "inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden border-l-2 data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
  -        left: "inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden border-r-2 data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
  +          "inset-y-0 right-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden supports-[overflow:clip]:overflow-clip border-l-2 data-[state=open]:tp-slide-in-right data-[state=closed]:tp-slide-out-right",
  +        left: "inset-y-0 left-0 h-full w-[calc(100%-2rem)] max-w-sm overflow-hidden supports-[overflow:clip]:overflow-clip border-r-2 data-[state=open]:tp-slide-in-left data-[state=closed]:tp-slide-out-left",
  ```
  and the scroll body (lines 91-92):
  ```tsx
  -          {/* Scrollable body — the frame never scrolls, so the ✕ and handle stay put (mirrors dialog.tsx). */}
  -          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
  +          {/* Scrollable body — the frame never scrolls, so the ✕ and handle stay put (mirrors dialog.tsx).
  +              `relative` anchors sr-only controls here so focusing one scrolls this body, not the frame (spec 2026-10-04 §G). */}
  +          <div className="relative flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
  ```
  (The `docked` variant has no frame scroll body and is left alone.)

- [ ] **Step 4: Run, expect PASS**
  ```bash
  npx vitest run test/helpers/containing-block.test.ts components/ui/dialog.test.tsx components/ui/sheet.test.tsx components/trip/item-form-dialog.test.tsx
  npx vitest run components/trip components/plan components/globe components/ui
  npx tsc --noEmit
  ```
  Expect all green. No existing test needs changing: the sheet tests that check for `overflow-hidden` still pass because it stays, and the `[class*="overflow-y-auto"]` selectors still match. Optional browser check, using the Step 0 harness rebuilt against the fixed `/work`: `node $H/build-css.mjs $H/app.css && node $H/build.mjs $H && node $H/run3.mjs $H none click` should now print `contentScroll=0` in the `after` line, with the footer still at `[741,819]`.

- [ ] **Step 5: Commit**
  ```bash
  git add test/helpers/containing-block.ts test/helpers/containing-block.test.ts components/ui/dialog.tsx components/ui/sheet.tsx components/ui/dialog.test.tsx components/ui/sheet.test.tsx components/trip/item-form-dialog.test.tsx
  git commit -m "fix(dialog): focusing a hidden input no longer scrolls the dialog frame

  The Attachments file input, the Photo input and every Checkbox's native
  input are sr-only (position: absolute). Their containing block was the
  fixed dialog frame, not the scroll body, so focusing one (clicking Add
  file) made the browser scroll the overflow-hidden frame by up to 600px:
  header and body slid away and the footer sat mid-dialog over blank
  background. The scroll body is now relative, and the frame uses overflow:
  clip where supported so it can't be scrolled at all. Same fix for Sheet.

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 3 — G2: `scrollEdges` / `trackScrollEdges` — which edges of a scroll body hide content

**Files:**
- Create: `components/ui/scroll-edges.ts`
- Test: `components/ui/scroll-edges.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `scrollEdges(m: ScrollMetrics): { scrolled: boolean; moreBelow: boolean }`, where `ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number }`.
  - `trackScrollEdges(el: HTMLElement | null): (() => void) | undefined`. This is a React 19 callback ref: pass it straight to `ref={…}`. It keeps the boolean attributes `data-scrolled` and `data-more-below` on `el`, and the function it returns is the cleanup.

- [ ] **Step 1: Write the failing test** — `components/ui/scroll-edges.test.ts`:
  ```ts
  import { describe, it, expect, afterEach } from "vitest";
  import { scrollEdges, trackScrollEdges } from "./scroll-edges";

  describe("scrollEdges", () => {
    it("reports nothing hidden when the content fits", () => {
      expect(scrollEdges({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toEqual({ scrolled: false, moreBelow: false });
    });

    it("reports content below at the top of a tall body", () => {
      expect(scrollEdges({ scrollTop: 0, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: false, moreBelow: true });
    });

    it("reports both edges mid-scroll", () => {
      expect(scrollEdges({ scrollTop: 250, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: true, moreBelow: true });
    });

    it("reports only the top edge at the end", () => {
      expect(scrollEdges({ scrollTop: 512, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: true, moreBelow: false });
    });

    it("treats a sub-pixel shortfall at the end as the end (fractional zoom)", () => {
      expect(scrollEdges({ scrollTop: 511.4, scrollHeight: 1282, clientHeight: 770 }).moreBelow).toBe(false);
    });
  });

  describe("trackScrollEdges", () => {
    const realResizeObserver = globalThis.ResizeObserver;
    afterEach(() => {
      globalThis.ResizeObserver = realResizeObserver;
      document.body.innerHTML = "";
    });

    function sized(el: HTMLElement, scrollHeight: number, clientHeight: number) {
      Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
      Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
    }

    function body() {
      const el = document.createElement("div");
      el.innerHTML = "<header></header><div style=\"display: contents\"><form></form></div>";
      document.body.appendChild(el);
      return el;
    }

    it("sets nothing on a body whose content fits — a short dialog looks unchanged", () => {
      const el = body();
      sized(el, 400, 400);
      trackScrollEdges(el);
      expect(el.hasAttribute("data-scrolled")).toBe(false);
      expect(el.hasAttribute("data-more-below")).toBe(false);
    });

    it("marks more-below at rest, both mid-scroll, and only scrolled at the end", () => {
      const el = body();
      sized(el, 1282, 770);
      trackScrollEdges(el);
      expect(el.hasAttribute("data-more-below")).toBe(true);
      expect(el.hasAttribute("data-scrolled")).toBe(false);

      el.scrollTop = 250;
      el.dispatchEvent(new Event("scroll"));
      expect(el.hasAttribute("data-more-below")).toBe(true);
      expect(el.hasAttribute("data-scrolled")).toBe(true);

      el.scrollTop = 512;
      el.dispatchEvent(new Event("scroll"));
      expect(el.hasAttribute("data-more-below")).toBe(false);
      expect(el.hasAttribute("data-scrolled")).toBe(true);
    });

    it("re-measures when content grows without a scroll — an attachment arriving while scrolled to the end", () => {
      const callbacks: ResizeObserverCallback[] = [];
      const observed: Element[] = [];
      globalThis.ResizeObserver = class {
        constructor(cb: ResizeObserverCallback) {
          callbacks.push(cb);
        }
        observe(target: Element) {
          observed.push(target);
        }
        unobserve() {}
        disconnect() {
          observed.length = 0;
        }
      } as unknown as typeof ResizeObserver;

      const el = body();
      sized(el, 1282, 770);
      el.scrollTop = 512;
      trackScrollEdges(el);
      expect(el.hasAttribute("data-more-below")).toBe(false);
      // Watches the body and the form inside FormDialog's display:contents wrapper.
      expect(observed).toContain(el);
      expect(observed).toContain(el.querySelector("form"));

      sized(el, 1354, 770); // the form grew by an attachment row
      callbacks[0]([], {} as ResizeObserver);
      expect(el.hasAttribute("data-more-below")).toBe(true);
    });

    it("re-measures when content is added or removed", async () => {
      const el = body();
      sized(el, 770, 770);
      trackScrollEdges(el);
      expect(el.hasAttribute("data-more-below")).toBe(false);

      sized(el, 900, 770);
      el.querySelector("form")!.appendChild(document.createElement("p"));
      await Promise.resolve(); // MutationObserver delivers on a microtask
      expect(el.hasAttribute("data-more-below")).toBe(true);
    });

    it("stops listening once detached", () => {
      const el = body();
      sized(el, 1282, 770);
      const cleanup = trackScrollEdges(el)!;
      cleanup();
      el.scrollTop = 512;
      el.dispatchEvent(new Event("scroll"));
      expect(el.hasAttribute("data-scrolled")).toBe(false);
    });

    it("does nothing for a null element (React detaching the ref)", () => {
      expect(trackScrollEdges(null)).toBeUndefined();
    });

    it("works without ResizeObserver (jsdom, very old browsers): scroll still updates", () => {
      globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
      const el = body();
      sized(el, 1282, 770);
      expect(() => trackScrollEdges(el)).not.toThrow();
      el.scrollTop = 600;
      el.dispatchEvent(new Event("scroll"));
      expect(el.hasAttribute("data-scrolled")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**
  ```bash
  npx vitest run components/ui/scroll-edges.test.ts
  ```
  Expected: the file fails to load: `Failed to resolve import "./scroll-edges"`.

- [ ] **Step 3: Implement** — `components/ui/scroll-edges.ts` (full file):
  ```ts
  export interface ScrollMetrics {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  }

  /**
   * Sub-pixel slack at the far end: at a fractional zoom or devicePixelRatio a
   * body scrolled all the way down can still report scrollTop a fraction short
   * of scrollHeight - clientHeight, which must not read as "more below".
   */
  const END_SLACK = 1;

  /** Which edges of a scroll body have content hidden past them. Pure, so it is unit-tested directly. */
  export function scrollEdges({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): {
    scrolled: boolean;
    moreBelow: boolean;
  } {
    return {
      scrolled: scrollTop > 0,
      moreBelow: scrollHeight - clientHeight - scrollTop > END_SLACK,
    };
  }

  /** The boxes whose size changes move scrollHeight: element children, looking through `display: contents` wrappers (FormDialog keys its form in one). */
  function contentBoxes(el: Element): Element[] {
    const boxes: Element[] = [];
    for (const child of Array.from(el.children)) {
      if (getComputedStyle(child).display === "contents") boxes.push(...contentBoxes(child));
      else boxes.push(child);
    }
    return boxes;
  }

  /**
   * Keeps `data-scrolled` (content hidden above) and `data-more-below` (content
   * hidden below) on a scroll body, for its sticky header/footer to style off.
   * A React 19 callback ref — pass it straight to `ref` — rather than an effect
   * over a ref object: Radix's Portal mounts its children a commit late, so an
   * effect in DialogContent would run before the body exists and never again.
   * Attributes are written straight to the DOM, not React state, so scrolling
   * never re-renders the dialog. Re-measured on scroll, when the body or any
   * content box resizes (an attachment row arriving, a photo loading, a textarea
   * dragged taller), and when content is added or removed.
   */
  export function trackScrollEdges(el: HTMLElement | null): (() => void) | undefined {
    if (!el) return undefined;

    const update = () => {
      const { scrolled, moreBelow } = scrollEdges(el);
      el.toggleAttribute("data-scrolled", scrolled);
      el.toggleAttribute("data-more-below", moreBelow);
    };

    el.addEventListener("scroll", update, { passive: true });

    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const observeBoxes = () => {
      if (!resize) return;
      resize.disconnect();
      resize.observe(el);
      for (const box of contentBoxes(el)) resize.observe(box);
    };
    observeBoxes();

    const mutation =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeBoxes();
            update();
          });
    mutation?.observe(el, { childList: true, subtree: true });

    update();
    return () => {
      el.removeEventListener("scroll", update);
      resize?.disconnect();
      mutation?.disconnect();
    };
  }
  ```

- [ ] **Step 4: Run, expect PASS**
  ```bash
  npx vitest run components/ui/scroll-edges.test.ts
  npx eslint components/ui/scroll-edges.ts components/ui/scroll-edges.test.ts
  npx tsc --noEmit
  ```
  12 tests pass. Nothing else imports the module yet, so no other tests are affected.

- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/scroll-edges.ts components/ui/scroll-edges.test.ts
  git commit -m "feat(ui): trackScrollEdges marks which edges of a scroll body hide content

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4 — G3: Scroll-aware rule and shadow on the dialog's sticky header and footer

**Files:**
- Modify: `components/ui/dialog.tsx` (imports :8; the scroll body G1 rewrote around :115; `DialogHeader` classes :203-205; `DialogFooter` comment and classes :214-222)
- Test: `components/ui/dialog.test.tsx` (the existing "covers the footer's negative-margin gap during iOS elastic overscroll" test at ~:321-336 (~:447 after G1's insert); a new describe before `describe("DialogContent size"`)

**Interfaces:**
- Consumes: `trackScrollEdges` from `./scroll-edges` (G2), and the `data-slot="dialog-body"` element (G1).
- Produces: the scroll body is `group/dialog-body` with `data-scrolled` / `data-more-below`. `DialogHeader` and `DialogFooter` style off those attributes. No new props.

- [ ] **Step 1: Write the failing tests** — in `components/ui/dialog.test.tsx`.

  Replace the body of the existing overscroll-cover test:
  ```tsx
    it("covers the footer's negative-margin gap during iOS elastic overscroll", () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Test</DialogTitle>
            <DialogFooter>
              <button>Cancel</button>
              <button>Save</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      const footer = screen.getByRole("button", { name: "Cancel" }).closest("div")!;
      // A solid background-coloured shadow dropped the gap's height below the
      // footer. Not an `after:` box: an absolutely positioned pseudo hanging
      // past the content adds that much *scrollable* overflow, so every short
      // dialog scrolled by a phantom 22px and would read as "more below" (spec
      // 2026-10-04 §G, measured in-browser). Shadows never add scroll range.
      expect(footer.className).toContain("shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background)]");
      expect(footer.className).not.toMatch(/\bafter:/);
    });
  ```
  Then insert this describe immediately before `describe("DialogContent size", () => {`, after G1's containment describe. `fireEvent` is already imported.
  ```tsx
  describe("Scroll-aware edges (spec 2026-10-04 §G)", () => {
    const FOOTER_EDGE =
      "group-data-[more-below]/dialog-body:shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background),0_-2px_0_var(--color-border),0_-10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]";
    const HEADER_EDGE =
      "group-data-[scrolled]/dialog-body:shadow-[0_2px_0_var(--color-border),0_10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]";

    function renderTall() {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
            </DialogHeader>
            <p>Body copy</p>
            <DialogFooter>
              <button type="button">Cancel</button>
              <button type="submit">Save changes</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      const body = screen.getByRole("dialog").querySelector<HTMLElement>('[data-slot="dialog-body"]')!;
      const header = screen.getByText("Edit Item").closest<HTMLElement>('[data-slot="dialog-header"]')!;
      const footer = screen.getByRole("button", { name: "Save changes" }).closest<HTMLElement>('[data-slot="dialog-footer"]')!;
      return { body, header, footer };
    }

    function size(el: HTMLElement, scrollHeight: number, clientHeight: number) {
      Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
      Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
    }

    it("names the scroll body as the group its sticky edges style off", () => {
      const { body } = renderTall();
      expect(body.className.split(/\s+/)).toContain("group/dialog-body");
    });

    it("tracks which edges have content hidden past them", () => {
      const { body } = renderTall();
      // jsdom lays nothing out, so a fresh body measures 0×0: nothing hidden.
      expect(body.hasAttribute("data-more-below")).toBe(false);
      expect(body.hasAttribute("data-scrolled")).toBe(false);

      size(body, 1282, 770);
      body.scrollTop = 250;
      fireEvent.scroll(body);
      expect(body.hasAttribute("data-more-below")).toBe(true);
      expect(body.hasAttribute("data-scrolled")).toBe(true);

      body.scrollTop = 512;
      fireEvent.scroll(body);
      expect(body.hasAttribute("data-more-below")).toBe(false);
      expect(body.hasAttribute("data-scrolled")).toBe(true);
    });

    it("gives the footer a 2px rule and a soft upward shadow while content hides beneath it, keeping its overscroll cover", () => {
      const { footer } = renderTall();
      expect(footer.className).toContain(FOOTER_EDGE);
    });

    it("mirrors it on the header once the body is scrolled", () => {
      const { header } = renderTall();
      expect(header.className).toContain(HEADER_EDGE);
    });

    it("fades both edges in and out, instantly under reduced motion", () => {
      const { header, footer } = renderTall();
      for (const edge of [header, footer]) {
        const classes = edge.className.split(/\s+/);
        expect(classes).toContain("transition-shadow");
        expect(classes).toContain("duration-[var(--dur-base)]");
        expect(classes).toContain("motion-reduce:transition-none");
      }
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL**
  ```bash
  npx vitest run components/ui/dialog.test.tsx
  ```
  Expected: 6 failures. The 5 new edge tests fail: no `group/dialog-body` class, the attributes never appear because nothing tracks the body, and the edge/transition classes are missing. The rewritten overscroll test fails because the footer still has the `after:` cover.

- [ ] **Step 3: Implement** — `components/ui/dialog.tsx`

  Import (after the `SPRING_POP` import):
  ```tsx
   import { SPRING_POP } from "@/lib/motion";
  +import { trackScrollEdges } from "./scroll-edges";
  ```
  Scroll body (G1's version). Add to the comment, add the ref, and add the group class:
  ```tsx
            and the footer was left mid-dialog over blank background (spec
  -          2026-10-04 §G, reproduced in-browser at 1920×911 and 390×844). */}
  +          2026-10-04 §G, reproduced in-browser at 1920×911 and 390×844).
  +          trackScrollEdges keeps data-scrolled / data-more-below on it for
  +          the sticky header and footer edges (group/dialog-body). */}
         <div
  +        ref={trackScrollEdges}
           data-slot="dialog-body"
           onFocus={revealFocusedField}
  -        className="relative flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6"
  +        className="group/dialog-body relative flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6"
         >
  ```
  `DialogHeader` (add two class strings after the `before:` line):
  ```tsx
           "before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-3.5 before:bg-background sm:before:h-6",
  +        // Scroll-aware edge (spec 2026-10-04 §G): once the body is scrolled,
  +        // a 2px rule in the border colour and a soft downward shadow show
  +        // content is passing beneath. Shadows, not a border, so the header
  +        // never changes height; all non-inset, so the fade interpolates.
  +        "transition-shadow duration-[var(--dur-base)] motion-reduce:transition-none",
  +        "group-data-[scrolled]/dialog-body:shadow-[0_2px_0_var(--color-border),0_10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]",
           className,
  ```
  `DialogFooter` (replace the comment and the `after:` line):
  ```tsx
   function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  -  // after: covers the gap the negative bottom margin opens below the sticky
  -  // footer during elastic/rubber-band overscroll on iOS Safari.
  +  // The first shadow covers the gap the negative bottom margin opens below
  +  // the sticky footer during elastic/rubber-band overscroll on iOS Safari (it
  +  // also covers the strip under the stuck footer in grid forms, where the
  +  // negative margin doesn't shrink the grid). It was an `after:` box, but an
  +  // absolutely positioned pseudo hanging past the content adds scrollable
  +  // overflow: every short dialog scrolled a phantom 22px. A shadow never
  +  // does. The scroll-aware edge (spec 2026-10-04 §G) appends a 2px rule in
  +  // the border colour and a soft upward shadow while content is hidden
  +  // beneath; scrolled to the end, both fade out.
     return (
       <div
         data-slot="dialog-footer"
         className={cn(
           "sticky bottom-0 z-10 -mx-[18px] -mb-[calc(1.375rem+env(safe-area-inset-bottom))] mt-2 bg-background px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6",
  -        "after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-[calc(1.375rem+env(safe-area-inset-bottom))] after:bg-background",
  +        "shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background)]",
  +        "transition-shadow duration-[var(--dur-base)] motion-reduce:transition-none",
  +        "group-data-[more-below]/dialog-body:shadow-[0_calc(1.375rem+env(safe-area-inset-bottom))_0_var(--color-background),0_-2px_0_var(--color-border),0_-10px_16px_-10px_hsl(var(--shadow-ink)/0.3)]",
           "flex flex-row flex-wrap gap-2 [&>*]:flex-1 [&>*]:min-w-[8rem] [&>*]:whitespace-normal sm:justify-end sm:[&>*]:flex-initial",
  ```
  Note: the more-below shadow list repeats the cover as its first entry. A `shadow-*` utility replaces the whole `box-shadow`, so leaving the cover out would drop it while the edge shows. Keeping all entries non-inset lets the transition interpolate entry by entry; verified in Chromium, where the shadow fades over ~150ms instead of snapping.

- [ ] **Step 4: Run, expect PASS**
  ```bash
  npx vitest run components/ui/dialog.test.tsx components/ui/scroll-edges.test.ts components/ui/sheet.test.tsx components/trip/item-form-dialog.test.tsx
  npx vitest run components app lib
  npx eslint components/ui/dialog.tsx components/ui/dialog.test.tsx
  npx tsc --noEmit
  ```
  All green: in the scratch copy the full `components app lib test/helpers` run was 586 files / 6521 tests. The only existing test that changes is the overscroll-cover test rewritten in Step 1. The focus-reveal tests (`renderForm`) still find the body as `header.parentElement`, and jsdom has no `ResizeObserver`, which `trackScrollEdges` guards against.

- [ ] **Step 4b: (Optional) Check it in a browser.** Uses the harness against the fixed `/work` (rebuild the CSS too, so the new arbitrary classes get compiled):
  ```bash
  H=/tmp/claude-1000/-work/63431a35-413e-4ee1-b8b9-fb17ca7502b5/scratchpad/g-harness
  cd /work && node $H/build-css.mjs $H/app.css && node $H/build.mjs $H
  sed -e 's#final.html#index.html#' $H/run6.mjs > $H/run6-work.mjs && node $H/run6-work.mjs $H index.html   # expect range=0 (no phantom scroll) on a 1700px-tall viewport
  sed -e 's#final.html#index.html#' -e 's#f-\${tag}#w-${tag}#g' $H/run8.mjs > $H/run8-work.mjs
  node $H/run8-work.mjs $H 1920 911 desk   # initial: moreBelow=true footer rule; mid: both; end: header only; after checkbox click: contentScroll=0
  node $H/run8-work.mjs $H 1920 1700 tall  # every line: scrolled=false moreBelow=false (short dialog unchanged)
  ```
  The same scripts already passed against this exact code in the scratch copy (`f-desk-*.png`, `f-phone-*.png` in the harness dir). iOS rubber-band overscroll can't be reproduced here, so check it on a real iPhone if one is handy: drag past the end of the Item dialog, and no content should show below the footer.

- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/dialog.tsx components/ui/dialog.test.tsx
  git commit -m "feat(dialog): sticky header and footer show a rule and shadow while content hides past them

  The footer gets a 2px border-colour rule and a soft upward shadow while
  content is hidden beneath it and fades them out at the end; the header
  mirrors it once the body is scrolled. Short dialogs look unchanged. The
  footer's iOS overscroll cover moves from an after: box to a box-shadow:
  the pseudo added 22px of scrollable overflow, so every short dialog
  scrolled and would have shown the edge.

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
  ```

---

# Part H — bank details hint

### Task 5 — H1: Bank details hint copy

**Files:**
- Modify: `components/account/traveller-details-card.tsx` (:86)
- Test: `components/account/traveller-details-card.test.tsx` (:25)

**Interfaces:**
- Consumes: nothing.
- Produces: the bank details helper line reads exactly `Only the people on your Trips ever see this — never a Share link.` (with an em dash, U+2014).

- [ ] **Step 1: Write the failing test.** In `components/account/traveller-details-card.test.tsx`, replace line 25 with:

```tsx
    expect(screen.getByText("Only the people on your Trips ever see this — never a Share link.")).toBeInTheDocument();
    expect(screen.queryByText(/Never on a Share link/)).toBeNull();
```

(Line 24's `getAllByText("Only the people on your Trips ever see this.")` stays at length 2. `getByText` matches the whole string exactly, so the new, longer bank hint is not counted.)

- [ ] **Step 2: Run it, expect FAIL.** `TZ=UTC npx vitest run components/account/traveller-details-card.test.tsx`. Expected: `TestingLibraryElementError: Unable to find an element with the text: Only the people on your Trips ever see this — never a Share link.`

- [ ] **Step 3: Implement.** In `components/account/traveller-details-card.tsx:86`:

```tsx
      {field("bankDetails", "Bank details", "Only the people on your Trips ever see this — never a Share link.", "textarea", { maxLength: 500 })}
```

- [ ] **Step 4: Run, expect PASS.** `TZ=UTC npx vitest run components/account/traveller-details-card.test.tsx`, then `grep -rn "Never on a Share link" components app` (expect no hits; `server/actions/item-photo.ts:16` is an unrelated code comment and is outside these paths). No other test asserts the old string.

- [ ] **Step 5: Commit.**

```bash
git add components/account/traveller-details-card.tsx components/account/traveller-details-card.test.tsx
git commit -m "$(cat <<'EOF'
fix(account): reword the bank details hint

"Never on a Share link" read oddly; it now matches the emergency
contact hints (spec 2026-10-04 §H).

Resolves-Feedback: cmut4ckfz000004jpegpl8x2i

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Part J

## Part J notes
- Added by Cam mid-planning (2026-10-04): "On desktop we have lots of room — add the word nights instead of just 2n."
- `components/plan/stop-row.tsx` is desktop-only (rendered inside `plan-desktop-list`, `hidden lg:flex`), so changing its pill needs no breakpoint logic. The phone `MobileStopRow` keeps `2n`.
- `lib/dates.ts:43` already has `formatNights(nights, { rough })` → "1 night" / "3 nights" / "~2 nights". Reuse it; no new helper.
- Out of scope: the Fork compare table's dense `3n` cells and the sketching Home card (shared phone/desktop).

## Review-focus candidates
- A 1-night stay must read "1 night", not "1 nights" (covered by the test below).

### Task 6 — J1: Desktop Stop row says "N nights", not "Nn"

**Files:**
- Modify: `components/plan/stop-row.tsx:8` (import), `:159` (scheduled pill), `:167` (rough pill)
- Test: `components/plan/stop-row.test.tsx:45`, `:94` (+ one new case)

**Interfaces:**
- Consumes: `formatNights(nights: number, opts?: { rough?: boolean }): string` from `@/lib/dates`.
- Produces: nothing new.

- [ ] **Step 1: Update the tests first**

In `components/plan/stop-row.test.tsx` change line 45 and line 94, and add a 1-night case beside "dates, nights pill and chips" (copy the fixture shape `renderRow` already uses — it takes a `stop` override):

```tsx
    expect(screen.getByText("7 nights")).toBeInTheDocument();
```
```tsx
    expect(screen.getByText("~5 nights")).toBeInTheDocument();
```
```tsx
  it("a one-night stay reads singular", () => {
    renderRow({ stop: { ...SCHEDULED, arriveDate: "2026-12-15", departDate: "2026-12-16" } });
    expect(screen.getByText("1 night")).toBeInTheDocument();
  });
```
(Use the scheduled fixture constant the file already defines — read the top of the file for its name; if it is not named `SCHEDULED`, use the real name.)

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run components/plan/stop-row.test.tsx`
Expected: FAIL — unable to find "7 nights" / "~5 nights" / "1 night".

- [ ] **Step 3: Implement**

`components/plan/stop-row.tsx`:
```tsx
import { formatNights, nightsBetween, tzAbbrev } from "@/lib/dates";
```
Scheduled pill (was `{nights}n`):
```tsx
                    {formatNights(nights)}
```
Rough pill (was `~{stop.nights ?? 1}n`):
```tsx
                ~{formatNights(stop.nights ?? 1)}
```
→ simpler and identical output: `{formatNights(stop.nights ?? 1, { rough: true })}`. Use that form.

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run components/plan/stop-row.test.tsx components/trip/itinerary-manager.test.tsx "app/(app)/trips/[tripId]/plan/page.test.tsx"`
Expected: PASS. If any other test queried `"Nn"` text on the desktop row, update it to the "N nights" form (grep: `grep -rn '[0-9]n")' components app --include=*.test.tsx`). Mobile row tests stay on `Nn`.

- [ ] **Step 5: Commit**

```bash
git add components/plan/stop-row.tsx components/plan/stop-row.test.tsx
git commit -m "feat(plan): desktop Stop row spells out nights

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

# Part F

## Part F notes

- **One switch parks dark mode.** `components/ui/theme-provider.tsx` gains `export const FORCED_THEME: Theme | null = "light"`. The pre-paint script is built by a new exported `noFlashScript(forced)`, and `resolveTheme(forced = FORCED_THEME)` is exported too. While parked, both apply light and write `"light"` over any stored `trip-planner-theme`. To un-park, set `FORCED_THEME = null`. `setTheme`/`toggleTheme` are **not** gated, so the dormant `ThemeToggle` and its existing test (`components/ui/theme-toggle.test.tsx`) keep working unchanged. If someone re-mounted the toggle while parked, it would switch to dark until the next load. That is intended: it is dormant code, not a feature.
- **CSP:** none is set. `next.config.ts:3-9` says it skips a strict CSP *because of* this inline script. The script is still injected with `dangerouslySetInnerHTML` inside `ThemeProvider` exactly as now, so nothing changes. The forced script removes the class *before* its `try`, so a throwing `localStorage` (private mode) can't leave a parked Traveller dark.
- **Hidden coupling found:** `lib/help-guide.ts:377` lists `"Toggle theme"` in `GUIDE_UI_STRINGS`. The drift guard (`lib/help-guide.test.ts:351`) fails as soon as the palette command is gone, so F2 removes that entry with the command.
- **Order matters:** do F2 (palette) before F3 (shell toggles). `components/shell/sidebar.test.tsx` renders the real `SearchField`, whose `useRunCommand` calls `useTheme()` today. F3 deletes that test's `theme-provider` mock, which is only safe once F2 has removed `useTheme` from `components/command-palette-results.tsx`.
- **`app/global-error.test.tsx:42`** computes `localDark` at describe level via `src.indexOf("prefers-color-scheme: dark")`. Once the block is gone that throws at collection and the whole file fails, so F4 rewrites that describe block, not just the two dark `it`s.
- **Dead code removed, not kept dormant:** `ThemeMenuItem` + the `showTheme` prop (`components/shell/account-menu.tsx`) and `CommandItem.action` / the `"toggle-theme"` branch (`components/command-palette-results.tsx`). The spec names only `ThemeProvider`, `ThemeToggle`, the `.dark` palette and map dark tiles as kept. Leaving an unused prop and an unused action union would be lint/review noise. DM-01 says how to bring them back.
- **Resolves-Feedback trailer:** it goes on **F1**, the commit that makes everyone render light. F2–F4 remove the controls and residue. Every F commit subject ends "(dark mode parked)" so `git log --grep "dark mode parked"` lists everything to revert when un-parking, and DM-01 says so.
- Left alone on purpose: `app/landing/landing.tsx:24-26` ("ignores the theme toggle" is still true of the dormant toggle), `README.md:120`, `DESIGN-BRIEF.md`, ADR 0061, and the Share page's own light lock (SL-01). The lock is redundant while parked but harmless, and DM-01 notes the overlap. F4 updates the Share page's stale comment about the root `themeColor`.

## Review-focus candidates

- **A returning Traveller who chose dark, on a dark-OS phone:** the first paint is light (no dark flash), `useTheme().theme` is `"light"` and the stored value is rewritten to `"light"`. Tested in F1 (provider test + pre-paint script test).
- **`localStorage` blocked (private mode / storage disabled) with `.dark` already on `<html>`:** the script and the provider still end light and never throw. Tested in F1 (script with throwing `setItem`; provider with throwing `getItem`/`setItem`).
- **Typing "theme" into Search (palette or sidebar field):** no theme option and no empty **Do** group, just Find's "No results" notice. Tested in F2.

### Task 7 — F1: ThemeProvider always resolves light (dark mode parked)
**Files:**
- Modify: `components/ui/theme-provider.tsx:5-43` (constant, script builder, `resolveTheme`)
- Create/Test: `components/ui/theme-provider.test.tsx`
- Test (unchanged, must stay green): `components/ui/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const FORCED_THEME: Theme | null` (= `"light"`), `export function noFlashScript(forced: Theme | null): string`, `export function resolveTheme(forced?: Theme | null): Theme`. `useTheme()` keeps its shape `{ theme, setTheme, toggleTheme }`. DM-01 (F4) names `FORCED_THEME` as the switch.

- [ ] **Step 1: Write the failing test.** Create `components/ui/theme-provider.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { FORCED_THEME, ThemeProvider, noFlashScript, resolveTheme, useTheme } from "./theme-provider";

const KEY = "trip-planner-theme";
const html = () => document.documentElement;
const darkOS = (q: string) => q === "(prefers-color-scheme: dark)";
/** Runs the pre-paint script the way the browser would: as plain global code. */
const runScript = (script: string) => new Function(script)();

function ShowTheme() {
  const { theme } = useTheme();
  return <p>theme: {theme}</p>;
}

// Spec 2026-10-04 §F: dark mode is parked — everyone renders light, whatever
// they chose before or their OS prefers (docs/open-follow-ups.md DM-01).
describe("ThemeProvider while dark mode is parked", () => {
  beforeEach(() => {
    html().classList.remove("dark");
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // test/setup's default: light, and only Tailwind's sm breakpoint matches.
    setMatchMedia((q) => q === "(min-width: 640px)");
  });

  it("forces light", () => {
    expect(FORCED_THEME).toBe("light");
  });

  it("renders light for a Traveller who chose dark on a dark OS, and overwrites the stored choice", async () => {
    setMatchMedia(darkOS);
    window.localStorage.setItem(KEY, "dark");
    html().classList.add("dark");

    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );

    expect(await screen.findByText("theme: light")).toBeInTheDocument();
    expect(html().classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("renders light when localStorage is unavailable", async () => {
    setMatchMedia(darkOS);
    html().classList.add("dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );

    expect(await screen.findByText("theme: light")).toBeInTheDocument();
    expect(html().classList.contains("dark")).toBe(false);
  });

  it("injects the forced pre-paint script", () => {
    render(
      <ThemeProvider>
        <ShowTheme />
      </ThemeProvider>,
    );
    expect(document.querySelector("script")?.innerHTML).toBe(noFlashScript("light"));
  });

  it("the pre-paint script clears .dark and stores light, ignoring a stored dark and a dark OS", () => {
    setMatchMedia(darkOS);
    window.localStorage.setItem(KEY, "dark");
    html().classList.add("dark");

    runScript(noFlashScript(FORCED_THEME));

    expect(html().classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("the pre-paint script still clears .dark when localStorage throws", () => {
    html().classList.add("dark");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => runScript(noFlashScript(FORCED_THEME))).not.toThrow();
    expect(html().classList.contains("dark")).toBe(false);
  });

  it("un-parked (null), the stored choice and then the OS preference win again", () => {
    window.localStorage.setItem(KEY, "dark");
    expect(resolveTheme(null)).toBe("dark");
    runScript(noFlashScript(null));
    expect(html().classList.contains("dark")).toBe(true);

    window.localStorage.clear();
    setMatchMedia(darkOS);
    expect(resolveTheme(null)).toBe("dark");
    setMatchMedia(false);
    expect(resolveTheme(null)).toBe("light");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run components/ui/theme-provider.test.tsx`. Expected: `FORCED_THEME` is `undefined` ("forces light" fails), and `noFlashScript is not a function` / `resolveTheme is not a function` in the script tests. The first provider test fails because `.dark` survives (stored `"dark"` wins today).

- [ ] **Step 3: Implement.** In `components/ui/theme-provider.tsx`, replace lines 7 and 22-43 (the `STORAGE_KEY` line, the `NO_FLASH_SCRIPT` comment + constant, `applyThemeClass`, `resolveTheme`) with:

```tsx
const STORAGE_KEY = "trip-planner-theme";

/**
 * Dark mode is parked (spec 2026-10-04 §F; docs/open-follow-ups.md DM-01):
 * every Traveller renders in this theme, whatever they chose before or their
 * OS prefers, and a stored choice is overwritten with it on the next load.
 * `null` un-parks it — the stored choice, then the OS preference, win again.
 * Kept dormant meanwhile: the `.dark` palette, the maps' dark tiles,
 * setTheme/toggleTheme below and ThemeToggle (mounted nowhere).
 */
export const FORCED_THEME: Theme | null = "light";
```

(keep the `ThemeContextValue` type and `ThemeContext` where they are), then:

```tsx
/**
 * Inline script run before hydration so the correct `.dark` class is on
 * <html> before first paint — avoids a flash of the wrong theme. With a
 * forced theme it applies that and overwrites the stored choice; the class
 * is set before the try, so a throwing localStorage (private mode) still
 * can't leave the page in the wrong theme. Otherwise it reads the persisted
 * choice, falling back to the OS preference.
 */
export function noFlashScript(forced: Theme | null): string {
  if (forced) {
    return `(function(){document.documentElement.classList.toggle('dark',${forced === "dark"});try{localStorage.setItem('${STORAGE_KEY}','${forced}');}catch(e){}})();`;
  }
  return `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
}

const NO_FLASH_SCRIPT = noFlashScript(FORCED_THEME);

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** The theme to apply on load: the forced one while parked, else stored, else the OS's. */
export function resolveTheme(forced: Theme | null = FORCED_THEME): Theme {
  if (forced) return forced;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fall through.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
```

Leave the rest untouched. The first-load effect (`commitTheme(resolveTheme())`, :91-93) now commits `"light"`: it removes `.dark`, persists `"light"` (overwriting a stored `"dark"`) and notifies. The `<script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />` injection (:110-113) is unchanged, so CSP behaviour is unchanged (none is set; see `next.config.ts:3-9`).

- [ ] **Step 4: Run, expect PASS.** `npx vitest run components/ui/theme-provider.test.tsx components/ui/theme-toggle.test.tsx components/command-palette.test.tsx components/shell/search-field.test.tsx components/command-palette-mount.test.tsx`. The ThemeToggle tests pass unchanged: the effect commits light first, then the click still toggles to dark, because `toggleTheme` is not gated. The palette/search tests still pass because their "Toggle theme" click goes through the real provider's `toggleTheme`. Then `npx tsc --noEmit` and `npx eslint components/ui/theme-provider.tsx components/ui/theme-provider.test.tsx`.

- [ ] **Step 5: Commit.**

```bash
git add components/ui/theme-provider.tsx components/ui/theme-provider.test.tsx
git commit -m "$(cat <<'EOF'
feat(theme): everyone renders light (dark mode parked)

FORCED_THEME = "light" in ThemeProvider: the pre-paint script and
resolveTheme ignore the OS preference and any stored choice, and a
stored "dark" is overwritten with "light" on the next visit. Set it to
null to un-park. setTheme/toggleTheme and ThemeToggle stay, dormant.

Resolves-Feedback: cmurqppcj000004l5fla4t4sc

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 8 — F2: Search drops "Toggle theme" (dark mode parked)
**Files:**
- Modify: `components/command-palette-results.tsx:6` (import), `:28-30` (`CommandItem.href` comment, `action`), `:155` (Do entry), `:190-201` (`useRunCommand`)
- Modify: `lib/help-guide.ts:377` (drop `"Toggle theme"` from `GUIDE_UI_STRINGS`)
- Modify: `components/trip/help-guide.tsx:1049-1055` (Do bullet)
- Modify: `CONTEXT.md:206` (Search entry's Do list)
- Test: `components/command-palette.test.tsx:5,29-43,106-145`; `components/shell/search-field.test.tsx:5,24-33,80,194-201`; `components/command-palette-mount.test.tsx:4,67-110` (drop the ThemeProvider wrappers); `components/trip/help-guide.test.tsx` (new test after :152)

**Interfaces:**
- Consumes: nothing from F1.
- Produces: `CommandItem` without `action`. `useRunCommand(onDone)` only navigates (`router.push(item.href)`) and no longer calls `useTheme()`. F3 relies on this: once it lands, nothing under `SearchField` needs a `ThemeProvider`.

- [ ] **Step 1: Write the failing test.**

In `components/command-palette.test.tsx`, replace the whole `describe("Do section", …)` block (lines 106-145) with:

```tsx
  describe("Do section", () => {
    // Dark mode is parked (spec 2026-10-04 §F): Search offers no theme command.
    it("offers no theme command, even when you type 'theme'", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("New trip");
      expect(screen.queryByText("Toggle theme")).not.toBeInTheDocument();

      await user.type(screen.getByRole("textbox", { name: /command search/i }), "theme");
      expect(screen.queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Do" })).not.toBeInTheDocument();
    });

    it("renders 'New trip', 'Add Item', 'Add Stop' commands when tripId is set", async () => {
      renderPalette();
      expect(await screen.findByText("New trip")).toBeInTheDocument();
      expect(screen.getByText("Add Item")).toBeInTheDocument();
      expect(screen.getByText("Add Stop")).toBeInTheDocument();
    });

    it("filters Do commands by query", async () => {
      const user = userEvent.setup();
      renderPalette();
      await screen.findByText("New trip");

      await user.type(screen.getByRole("textbox", { name: /command search/i }), "add");

      expect(screen.getByText("Add Item")).toBeInTheDocument();
      expect(screen.getByText("Add Stop")).toBeInTheDocument();
      expect(screen.queryByText("New trip")).not.toBeInTheDocument();
    });
  });
```

In `components/shell/search-field.test.tsx` line 80, replace the positive assertion with:

```tsx
    // Dark mode is parked (spec 2026-10-04 §F): no theme command in Do.
    expect(within(listbox).queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
```

and add a test after that `it` (after line 81):

```tsx
  it("typing 'theme' offers no theme command and no empty Do group", async () => {
    const user = userEvent.setup();
    renderField();
    await user.type(field(), "theme");
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: /theme/i })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole("group", { name: "Do" })).not.toBeInTheDocument();
  });
```

In `components/trip/help-guide.test.tsx`, after the "never mentions Discreet mode" test (line 152) add:

```tsx
  it("never mentions the theme toggle — dark mode is parked (spec 2026-10-04 §F)", () => {
    const { container } = render(<HelpGuide tripId="t1" />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("toggle theme");
    expect(text).not.toContain("light and dark");
  });
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run components/command-palette.test.tsx components/shell/search-field.test.tsx components/trip/help-guide.test.tsx`. Expected failures:
  - "offers no theme command…": `Toggle theme` is found.
  - search-field: the focus test, because a `Toggle theme` option exists; the typing test, because the option and the Do group are present.
  - help-guide: the text contains "toggle theme".

- [ ] **Step 3: Implement.**

`components/command-palette-results.tsx`: delete line 6 (`import { useTheme } from "@/components/ui/theme-provider";`). In `CommandItem`, replace

```tsx
  /** Where the command navigates. Absent for pure actions. */
  href?: string;
  action?: "toggle-theme";
```

with

```tsx
  /** Where the command navigates. */
  href?: string;
```

Delete the Do entry at line 155:

```tsx
      { key: "do:theme", label: "Toggle theme", action: "toggle-theme" as const },
```

Replace `useRunCommand` (lines 190-201) with:

```tsx
/** Runs a command, then calls `onDone` (close the dialog, collapse the field). */
export function useRunCommand(onDone: () => void): (item: CommandItem) => void {
  const router = useAppRouter();
  return React.useCallback(
    (item: CommandItem) => {
      if (item.href) router.push(item.href);
      onDone();
    },
    [router, onDone],
  );
}
```

`lib/help-guide.ts`: delete line 377 `  "Toggle theme",` (under `// Search`). The drift guard would otherwise fail: no file under `components/` or `app/` shows it any more.

`components/trip/help-guide.tsx` lines 1049-1055: replace the Do bullet's body with:

```tsx
              <li>
                <strong className="font-semibold">Do</strong> — a short list of
                things rather than places: start a{" "}
                <strong className="font-semibold">New trip</strong>, open your
                Globe, or jump to adding a Stop or an idea.
              </li>
```

`CONTEXT.md:206`: change `**Do** — a short list of actions (Globe, New trip, Add Item, Add Stop, Toggle theme);` to `**Do** — a short list of actions (Globe, New trip, Add Item, Add Stop);`.

Test wrappers. Nothing under the palette reads the theme any more, so drop the provider:
- `components/command-palette.test.tsx`: delete the `ThemeProvider` import (line 5) and the `Wrapper` function (lines 29-31). Change `renderPalette`'s render to `return render(<CommandPalette {...defaults} {...props} />);`.
- `components/shell/search-field.test.tsx`: delete the `ThemeProvider` import (line 5). In `renderField`, replace `<ThemeProvider>…</ThemeProvider>` with the inner `<div>…</div>`. In `renderWithMount` (lines 194-201), replace it with a fragment: `<><CommandPaletteMount /><SearchField tripId="t1" /></>`.
- `components/command-palette-mount.test.tsx`: delete the `ThemeProvider` import (line 4), and in each of the three renders (lines 67-72, 86-91, 105-110) unwrap `<ThemeProvider>…</ThemeProvider>` so `<ShellUserProvider value={shell}>…</ShellUserProvider>` is the root.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run components/command-palette.test.tsx components/shell/search-field.test.tsx components/command-palette-mount.test.tsx components/trip/help-guide.test.tsx lib/help-guide.test.ts components/shell/sidebar.test.tsx`. `lib/help-guide.test.ts`'s `it.each(GUIDE_UI_STRINGS)` no longer has a "Toggle theme" row. `sidebar.test.tsx` still passes because its `theme-provider` mock stays until F3. Then `npx tsc --noEmit`, which confirms no remaining reader of `CommandItem.action` (only `useRunCommand` read it), and `npx eslint components/command-palette-results.tsx components/command-palette.test.tsx components/shell/search-field.test.tsx components/command-palette-mount.test.tsx components/trip/help-guide.tsx lib/help-guide.ts`.

- [ ] **Step 5: Commit.**

```bash
git add components/command-palette-results.tsx components/command-palette.test.tsx components/shell/search-field.test.tsx components/command-palette-mount.test.tsx lib/help-guide.ts components/trip/help-guide.tsx components/trip/help-guide.test.tsx CONTEXT.md
git commit -m "$(cat <<'EOF'
feat(search): drop Toggle theme from Do (dark mode parked)

Removes the command, its action branch and the guide/CONTEXT mentions
(including its GUIDE_UI_STRINGS drift-guard entry).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 9 — F3: Remove the shell theme toggles (dark mode parked)
**Depends on F2** (`sidebar.test.tsx` loses its `theme-provider` mock here).

**Files:**
- Modify: `app/(app)/layout.tsx:19` (import), `:44-49` (docblock), `:187` (`<ThemeToggle />`)
- Modify: `components/shell/sidebar-footer.tsx:5,7,13,15-20,50-52`
- Modify: `components/shell/account-menu.tsx:4,14,18-34,39-40,57,97`
- Modify: `components/shell/dock-extras.tsx:32-33,49`
- Modify: `components/account/phone-extras.tsx:5,13-14,25-28`
- Modify: `app/(app)/account/page.tsx:69-70` (comment)
- Test: `app/(app)/layout.test.tsx:100-109,263,399-408` (+ new test); `components/shell/sidebar.test.tsx:32-37,285-302`; `components/trip/trip-nav.test.tsx:19-21,264`; `app/(app)/account/page.test.tsx:44-51,235-242`; `components/app-rail.test.tsx:7-10`; `components/shell/app-shell-rail.test.tsx:27-28`

**Interfaces:**
- Consumes: F2's `useRunCommand` without `useTheme`.
- Produces: `AccountMenuContentProps` without `showTheme`. `ThemeToggle` is no longer imported by any non-test file (`components/ui/theme-toggle.tsx` stays, unmounted).

- [ ] **Step 1: Write the failing test.** Keep every existing mock for now. Assertions only:

`app/(app)/layout.test.tsx`: after the "fits the header's right-hand controls inside a 360px phone" test (ends line 272), add:

```tsx
  // Dark mode is parked (spec 2026-10-04 §F): no theme toggle anywhere.
  it("gives the phone header no theme toggle", async () => {
    mockUsePathname.mockReturnValue("/trips/t1");
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(within(header()).queryByRole("button", { name: /theme/i })).toBeNull();
  });
```

and replace the Dock test (lines 399-408) with:

```tsx
  // Controller ruling R1: at Dock widths the Dock carries search and the avatar menu.
  it("gives the Dock a search button and the Traveller's avatar menu (no theme row — dark mode is parked)", async () => {
    render(await AppLayout({ children: <div /> }));
    const dock = dockNav();
    expect(within(dock).getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(within(dock).getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
    expect(within(dock).getByRole("link", { name: /^account$/i }).getAttribute("href")).toBe("/account");
    expect(within(dock).queryByText(/switch to (dark|light) theme/i)).toBeNull();
    expect(within(dock).getByText("Sign out")).toBeInTheDocument();
  });
```

Also change the comment on line 263 to `// Logo (~131px) + search, Globe and avatar must fit 360 - 2 x 16px:`.

`components/shell/sidebar.test.tsx`: replace the "has a 36px-square bordered theme toggle" test (lines 285-291) and the next test's title/body (293-302) with:

```tsx
    // Dark mode is parked (spec 2026-10-04 §F).
    it("has no theme toggle", () => {
      renderSidebar();
      expect(within(screen.getByTestId("sidebar")).queryByRole("button", { name: /theme/i })).toBeNull();
    });

    it("the avatar opens a menu with Help, What's new and Sign out (Account sits beside it; no theme row)", () => {
      renderSidebar();
      expect(screen.getByRole("button", { name: "Open traveller menu" })).toBeInTheDocument();
      const menu = screen.getByTestId("account-menu");
      expect(within(menu).getByRole("link", { name: /how to use teepee/i }).getAttribute("href")).toBe("/help");
      expect(within(menu).getByRole("link", { name: /what's new/i }).getAttribute("href")).toBe("/whats-new");
      expect(within(menu).getByText("Sign out")).toBeInTheDocument();
      expect(within(menu).queryByRole("link", { name: /^account$/i })).toBeNull();
      expect(within(menu).queryByRole("link", { name: /^admin/i })).toBeNull();
      expect(within(menu).queryByText(/switch to (dark|light) theme/i)).toBeNull();
    });
```

`components/trip/trip-nav.test.tsx` line 264: replace with

```tsx
    // Dark mode is parked (spec 2026-10-04 §F): the Dock menu has no theme row.
    expect(within(menu).queryByText(/switch to (dark|light) theme/i)).toBeNull();
```

`app/(app)/account/page.test.tsx` lines 235-242: replace the test with

```tsx
    it("offers search, help, what's new and sign out for phones — no theme (dark mode is parked)", async () => {
      const jsx = await AccountPage();
      render(jsx);
      const region = screen.getByRole("region", { name: "Phone shortcuts" });
      expect(within(region).getByRole("link", { name: /how to use teepee/i }).getAttribute("href")).toBe("/help");
      expect(within(region).getByRole("link", { name: /what's new/i }).getAttribute("href")).toBe("/whats-new");
      expect(within(region).queryByRole("button", { name: /theme/i })).toBeNull();
      expect(within(region).queryByText("Theme")).toBeNull();
      expect(within(region).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run "app/(app)/layout.test.tsx" components/shell/sidebar.test.tsx components/trip/trip-nav.test.tsx "app/(app)/account/page.test.tsx"`. Expected failures:
  - Header and sidebar tests: the mocked `<button>ThemeToggle</button>` is found.
  - Dock and trip-nav: "Switch to dark theme" is found.
  - Account: the "Switch to dark theme" button and the "Theme" label are found.

- [ ] **Step 3: Implement.**

`app/(app)/layout.tsx`: delete line 19 (`import { ThemeToggle } …`) and line 187 (`<ThemeToggle />`). Docblock lines 44-49 become:

```tsx
 *   - Phones (<768px): inside a Trip, the sticky top bar (wordmark, search,
 *     Globe, traveller avatar menu) — unchanged. Outside a Trip
 *     (trips-level pages: /trips, /globe, /account, /help, /whats-new,
 *     /admin — spec D4), there is no top bar; a Trips / Globe / You tab bar
 *     (AppTabBar) sits at the bottom instead, and Search, Help, What's new,
 *     Admin and Sign out move onto the account page
 *     (components/account/phone-extras.tsx). There is NO top bar from md up.
```

`components/shell/sidebar-footer.tsx`: delete the imports of `ThemeToggle` (line 5), `SM_HIT` (line 7) and `cn` (line 13). All three are used only by the toggle. Delete the `<ThemeToggle … />` element (lines 50-52). Replace the docblock (lines 15-20) with:

```tsx
/**
 * The sidebar's foot (≥1280px): avatar (opens the account menu — Help,
 * What's new, Admin + badge, Sign out) and display name over an "Account"
 * link. Account has its own control here, so the menu leaves it out. The
 * theme toggle that used to end the row is parked with dark mode (spec
 * 2026-10-04 §F, docs/open-follow-ups.md DM-01).
 */
```

`components/shell/account-menu.tsx`: delete `import { Moon, Sun } from "lucide-react";` (line 4), `import { useTheme } …` (line 14), the whole `ThemeMenuItem` function with its comment (lines 18-34), the `showTheme` prop and its doc comment from `AccountMenuContentProps` (lines 39-40), `showTheme = false,` from the destructuring (line 57) and `{showTheme && <ThemeMenuItem />}` plus its blank line (line 97).

`components/shell/dock-extras.tsx` line 49: `<AccountMenuContent {...shell} side="right" align="end" />`. Docblock lines 32-33: "…widths this is the only way to Help, What's new, Admin and Sign out. Renders nothing…".

`components/account/phone-extras.tsx`: delete the `ThemeToggle` import (line 5) and the Theme row (lines 25-28):

```tsx
        <div className={ROW}>
          <span>Theme</span>
          <ThemeToggle />
        </div>
```

Docblock lines 13-14: "(spec D4) — search, Help, What's new, Admin and Sign out (the theme toggle is parked with dark mode, spec 2026-10-04 §F)."

`app/(app)/account/page.tsx` lines 69-70: `// carry (search, Help, What's new, Admin, Sign out) lives here now.`

Now drop the stale theme mocks. Nothing in these trees calls `useTheme` or renders `ThemeToggle` any more:
- `app/(app)/layout.test.tsx` lines 100-109: both `vi.mock`s and their comments.
- `components/shell/sidebar.test.tsx` lines 32-37: both `vi.mock`s.
- `components/trip/trip-nav.test.tsx` lines 19-21: the `theme-provider` mock.
- `app/(app)/account/page.test.tsx` lines 49-51: the `theme-provider` mock. Comment lines 44-47 become "PhoneExtras (Task 12, spec D4) pulls these in; stub them … AccountPage's own wiring, not of Search/sign-out internals (each has its own tests)."
- `components/app-rail.test.tsx` lines 7-10 and `components/shell/app-shell-rail.test.tsx` lines 27-28: both theme `vi.mock`s.

If a test then throws "useTheme must be used within a ThemeProvider", a theme reader is still mounted in that tree. Find it with `grep -rn "useTheme\|ThemeToggle" app components --include=*.tsx | grep -v test`; don't restore the mock. The only readers left should be `components/ui/theme-toggle.tsx` and the map components (`route-map`, `day-map`, `wishlist-map`, `travel-map`, `globe-map`, `route-map-tile-canvas`), none of which these shells render.

- [ ] **Step 4: Run, expect PASS.** `npx vitest run "app/(app)/layout.test.tsx" components/shell components/trip/trip-nav.test.tsx "app/(app)/account/page.test.tsx" components/app-rail.test.tsx components/ui/theme-toggle.test.tsx`. Then `npx tsc --noEmit`, which confirms no caller still passes `showTheme`. Then `npx eslint "app/(app)/layout.tsx" components/shell components/account/phone-extras.tsx "app/(app)/account/page.tsx" components/trip/trip-nav.test.tsx components/app-rail.test.tsx "app/(app)/layout.test.tsx" "app/(app)/account/page.test.tsx"`. Finally `grep -rn "ThemeToggle\|showTheme\|toggleTheme" app components --include=*.tsx | grep -v "\.test\.tsx"` must list only `components/ui/theme-toggle.tsx` and `components/ui/theme-provider.tsx`.

- [ ] **Step 5: Commit.**

```bash
git add "app/(app)/layout.tsx" components/shell/sidebar-footer.tsx components/shell/account-menu.tsx components/shell/dock-extras.tsx components/account/phone-extras.tsx "app/(app)/account/page.tsx" "app/(app)/layout.test.tsx" components/shell/sidebar.test.tsx components/trip/trip-nav.test.tsx "app/(app)/account/page.test.tsx" components/app-rail.test.tsx components/shell/app-shell-rail.test.tsx
git commit -m "$(cat <<'EOF'
feat(shell): remove every theme toggle (dark mode parked)

Phone header, sidebar footer, the Dock menu's theme row and the Account
page's phone Theme row. ThemeToggle itself stays, unmounted.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10 — F4: Light-only address bar and error page; DM-01 follow-up (dark mode parked)
**Files:**
- Modify: `app/layout.tsx:26-32` (`viewport.themeColor`)
- Modify: `app/global-error.tsx:12-22` (docblock), `:38-47` (dark `@media` block)
- Modify: `app/share/[token]/page.tsx:62-65` (stale comment only)
- Modify: `docs/open-follow-ups.md` (append a section at the end, after SL-05)
- Test: `app/layout.test.tsx` (new `it`), `app/global-error.test.tsx:29-56` (rewrite the mirror describe)

**Interfaces:**
- Consumes: `FORCED_THEME` from F1 (named in DM-01); the removals of F2/F3 (listed in DM-01).
- Produces: `viewport.themeColor === "#FFFBF3"` (a plain string).

- [ ] **Step 1: Write the failing test.**

`app/layout.test.tsx`, inside `describe("root layout PWA metadata", …)` add:

```tsx
  // Dark mode is parked (spec 2026-10-04 §F): one light address-bar colour,
  // not one keyed on prefers-color-scheme (= globals.css :root --background).
  it("uses the light theme colour only", () => {
    expect(viewport.themeColor).toBe("#FFFBF3");
  });
```

`app/global-error.test.tsx`: replace the second describe (lines 29-56) with:

```tsx
// The boundary replaces the whole document, so it re-declares the tokens it
// uses. ADR 0060 exempts it on condition that each triple equals globals.css.
// Light only while dark mode is parked (spec 2026-10-04 §F, DM-01).
describe("global-error CSS variables mirror globals.css", () => {
  const src = readFileSync("app/global-error.tsx", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");
  const block = (css: string, opener: string) => {
    const start = css.indexOf(opener);
    if (start < 0) throw new Error(`${opener} not found`);
    return css.slice(start, css.indexOf("}", start));
  };
  const vars = (css: string) =>
    Object.fromEntries([...css.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

  const localLight = vars(block(src, ":root{"));
  const rootLight = vars(block(globals, ":root {"));

  it("declares its variables", () => {
    expect(Object.keys(localLight).length).toBeGreaterThan(0);
  });

  it("has no dark block — the error page is light like everything else", () => {
    expect(src).not.toContain("prefers-color-scheme");
  });

  it.each(Object.keys(localLight))("light --%s === globals.css :root", (name) => {
    expect(localLight[name]).toBe(rootLight[name]);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `npx vitest run app/layout.test.tsx app/global-error.test.tsx`. Expected:
  - "uses the light theme colour only" fails: `themeColor` is the two-entry array.
  - "has no dark block" fails: the source contains `prefers-color-scheme`.

- [ ] **Step 3: Implement.**

`app/layout.tsx` lines 26-32:

```tsx
export const viewport: Viewport = {
  viewportFit: "cover",
  // Light only while dark mode is parked (spec 2026-10-04 §F; see
  // docs/open-follow-ups.md DM-01 for the dark entry to restore).
  themeColor: "#FFFBF3",
};
```

`app/global-error.tsx`: delete the `@media (prefers-color-scheme: dark) { :root{ … } }` block (lines 38-47) from `CSS`. Replace the docblock's last sentence (lines 18-22, "Their HSL triples are copied … the layout that just failed.") with:

```tsx
 * Colours are `hsl(var(--x))` against CSS variables this file declares in its
 * own <style> block — never raw hex (see ADR 0060, "Exemptions to the 'no new
 * hex, no inline styles' rule"). Their HSL triples are copied exactly from
 * `app/globals.css`'s `:root`. Light only while dark mode is parked (spec
 * 2026-10-04 §F): un-parking restores a `prefers-color-scheme: dark` block
 * with the `.dark` triples (the `.dark` class on <html> came from the layout
 * that just failed, so a media query is the only signal here) and its mirror
 * test — `git log -S "prefers-color-scheme: dark" -- app/global-error.tsx`.
 */
```

`app/share/[token]/page.tsx` lines 62-65 comment becomes:

```tsx
// Light-only until the share page has had its own dark pass (spec 2026-10-01
// §A): the root below forces the light tokens, the map is pinned light, and
// this pins the address bar light. Redundant while dark mode is parked app-wide
// (spec 2026-10-04 §F, DM-01), and kept so un-parking leaves this page as is.
```

(The following "Sourced from lib/map-palette's MAP_INK…" lines stay.)

`docs/open-follow-ups.md`: append at the end of the file:

```markdown

## 2026-10-04 · Feedback batch (spec 2026-10-04-feedback-batch-plan-stay-map-names-light)

- **DM-01 · Dark mode is parked.** Cam wasn't happy with it, so everyone
  renders light (§F). One switch does it: `FORCED_THEME = "light"` in
  `components/ui/theme-provider.tsx` makes the pre-paint script and
  `resolveTheme` apply light and overwrite any stored `trip-planner-theme`.
  Kept, dormant: the `.dark` palette in `app/globals.css`, the maps' dark
  tiles and palette, `setTheme`/`toggleTheme` and `ThemeToggle` (mounted
  nowhere). To bring it back: set `FORCED_THEME = null`, then revert the
  other "(dark mode parked)" commits (`git log --grep "dark mode parked"`).
  They re-mount `ThemeToggle` in the phone header, sidebar footer and Account
  page's Phone shortcuts, and restore the Dock menu's theme row
  (`ThemeMenuItem`/`showTheme`). They also bring back Search's "Toggle theme"
  (with its `GUIDE_UI_STRINGS` entry, the Help guide line and `CONTEXT.md`'s
  Search entry), the dark `themeColor` in `app/layout.tsx` and
  `app/global-error.tsx`'s dark block and mirror test. SL-01's Share page
  light lock is redundant meanwhile; its not-found dark-address-bar caveat
  doesn't arise while parked.
```

- [ ] **Step 4: Run, expect PASS.** `npx vitest run app/layout.test.tsx app/global-error.test.tsx "app/share/[token]/page.test.tsx" app/globals-tokens.test.ts`. The Share page's own `viewport` test (`toEqual({ themeColor: "#FFFBF3" })`) is unaffected. Then `npx tsc --noEmit` and `npx eslint app/layout.tsx app/global-error.tsx app/global-error.test.tsx app/layout.test.tsx "app/share/[token]/page.tsx"`. Finally the whole suite once, since Part F touched shared shell code: `npm test`.

- [ ] **Step 5: Commit.**

```bash
git add app/layout.tsx app/layout.test.tsx app/global-error.tsx app/global-error.test.tsx "app/share/[token]/page.tsx" docs/open-follow-ups.md
git commit -m "$(cat <<'EOF'
feat(theme): light-only address bar and error page (dark mode parked)

themeColor is the light colour only; global-error drops its
prefers-color-scheme dark block. DM-01 in open-follow-ups records what
is kept dormant and how to bring dark mode back.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Part E

## Part E notes

- **Key files:** `components/welcome/welcome-gate.tsx` (server component, the only mount is `app/(app)/trips/page.tsx:46`), `components/welcome/welcome-dialog.tsx` (unchanged), new `components/welcome/name-dialog.tsx`, `lib/traveller.ts` (new `needsDisplayName`), `components/account/profile-card.tsx:34,201-207`. No schema change and no new server action: the dialog reuses `setDisplayName` (`server/actions/profile.ts:32`), so `lib/server-action-exports.test.ts` needs no allowlist change.
- **Sequencing design:** `WelcomeGate` reads `{ welcomeSeenAt, name, displayName }` in its one query. Nameless → `<NameDialog />` (whatever `welcomeSeenAt` says, so existing Travellers are asked too). Named and unseen → `<WelcomeDialog />`. `setDisplayName` already calls `revalidatePath("/", "layout")`, and this Next version's docs say a Server Function's revalidatePath "updates the UI immediately (if viewing the affected path)" (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:19`). So after Save the Trips page re-renders on the server, the gate now returns `WelcomeDialog`, and React swaps the component in place. No `router.refresh()` is needed. NameDialog also closes itself once the save succeeds, so the page can't stay stuck behind it if the re-render is slow.
- **Blank is rejected on the client.** `setDisplayName("")` clears the name to null, which is harmless here: the Traveller stays nameless and gets asked again. The dialog refuses blank or whitespace-only input before it calls the action, and it sends the trimmed value.
- **JWT / session name:** `lib/auth.ts` uses the JWT strategy, and `session.user.name` is frozen at sign-in. Nothing that shows a Traveller reads it. The nav (`app/(app)/layout.tsx:69`), Account and the Trips greeting all read the DB row through `TRAVELLER_SELECT`, so the layout revalidation is enough and the session doesn't need refreshing. **Gap (flagged, not in spec):** `server/actions/feedback.ts:64` stores `authorName: user.name` from the JWT. A Sign-in-link Traveller's Feedback notes therefore stay "Traveller" (`lib/feedback-view.ts:86`) even after they set a name, and a Google user's notes ignore their display name. A one-line fix would read the row and use `travellerName`. Left for the main session to decide.
- **Edge case of the rule (flagged):** someone who first came in by Sign-in link and later pressed Google is linked by `allowDangerousEmailAccountLinking`. Auth.js links the Account but never updates `User.name`, so this Traveller still has `name = null` and *will* see the dialog. That follows the spec's rule ("no `displayName` and no provider `name`"). "Google users never see it" holds only for Travellers whose row Google created.
- **Superseded by the E3 amendment:** NameDialog mounts in the (app) layout, so an invited Traveller landing on a Trip is asked too.
- **Account and the rule interact:** clearing Display name on Account (Save with the field empty) still clears it, as the spec leaves it. For a Traveller with no provider name, that means the dialog asks again on their next Trips visit. That is consistent with "every Traveller has a name". No Account-side refusal was added.
- Part G restyles `DialogFooter`/`DialogHeader` in `components/ui/dialog.tsx`. NameDialog only *uses* `DialogFooter` (inside a `<form>`, the same as `accommodation-form-dialog.tsx:297`), so there's no conflict.

## Review-focus candidates

- **A provider name that is only whitespace** (`name: "  "`) counts as no name → the dialog shows. Covered by the `needsDisplayName` test and the gate test in E3.
- **Saving offline, or the action throwing** → the dialog stays open with "Couldn't save that — please try again." and the typed name kept. It is never dismissed, and the name is never left half-set. Covered in E2.
- **Pressing Save on Account without touching the empty Display name** (a Sign-in-link Traveller, so the placeholder shows the email local-part) → `setDisplayName("")` is called, never `"cam"` or `"Traveller"`. Covered in E1.

---

### Task 11 — E1: Account's Display name starts empty, fallback as placeholder

**Files:**
- Modify: `components/account/profile-card.tsx:34` (initial state), `:201-207` (Input placeholder)
- Test: `components/account/profile-card.test.tsx` (replace the "falls back to the provider name" test at ~:68-72; add two tests)

**Interfaces:**
- Consumes: `travellerName` from `lib/traveller.ts` (unchanged).
- Produces: nothing new. `ProfileCard` props are unchanged.

- [ ] **Step 1: Write the failing test** — in `components/account/profile-card.test.tsx`, replace the test `"falls back to the provider name when no display name is set"` with these three:

```tsx
  it("starts empty when no display name is set, showing the provider name as placeholder", () => {
    render(<ProfileCard user={baseUser} />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Cameron Williams");
  });

  it("a Sign-in link Traveller (no provider name) sees the email local-part as placeholder, not as a value", () => {
    render(<ProfileCard user={{ ...baseUser, name: null }} />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("cam");
  });

  // Spec 2026-10-04 §E: Save can no longer store "Traveller" or an email
  // prefix by accident — an untouched empty field saves as "no display name".
  it("Save on the untouched empty field never stores the fallback", async () => {
    const user = userEvent.setup();
    render(<ProfileCard user={{ ...baseUser, name: null }} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(setDisplayNameMock).toHaveBeenCalledWith("");
    expect(setDisplayNameMock).not.toHaveBeenCalledWith("cam");
    expect(setDisplayNameMock).not.toHaveBeenCalledWith("Traveller");
  });
```

  (The existing `"renders the current display name..."` test stays as it is: a set `displayName` is still the value. `"calls setDisplayName with the edited name on Save"` still passes, because `user.clear` on an empty field is a no-op.)

- [ ] **Step 2: Run it, expect FAIL** — `TZ=UTC npx vitest run components/account/profile-card.test.tsx`. Expected: the first two new tests fail with `expected 'Cameron Williams' to be ''` / `expected 'cam' to be ''`. The third fails because `setDisplayNameMock` was called with `"cam"`.

- [ ] **Step 3: Implement** — in `components/account/profile-card.tsx`:

```tsx
export function ProfileCard({ user: initialUser }: ProfileCardProps) {
  const [user, setUser] = React.useState(initialUser);
  // Spec 2026-10-04 §E: the field holds only a name the Traveller set. The
  // fallback (provider name → email local-part → "Traveller") is shown as a
  // placeholder, so an untouched Save can't store it as if it were chosen.
  const [name, setName] = React.useState(initialUser.displayName ?? "");
```

  and at the Display name field (~:201):

```tsx
      <Field label="Display name">
        <Input
          value={name}
          maxLength={60}
          placeholder={travellerName({ ...user, displayName: null })}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
```

- [ ] **Step 4: Run, expect PASS** — `TZ=UTC npx vitest run components/account/profile-card.test.tsx` (all pass), then `npx tsc --noEmit` and `npx eslint components/account/profile-card.tsx components/account/profile-card.test.tsx`. No other test renders `ProfileCard` (`app/(app)/account/page.tsx:103` is its only mount).

- [ ] **Step 5: Commit**

```bash
git add components/account/profile-card.tsx components/account/profile-card.test.tsx
git commit -m "$(cat <<'EOF'
fix(account): Display name starts empty with the fallback as placeholder

Save on an untouched field no longer stores "Traveller" or an email
prefix as if the Traveller had chosen it (spec 2026-10-04 §E).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12 — E2: NameDialog — "What should we call you?", not dismissable

**Files:**
- Create: `components/welcome/name-dialog.tsx`
- Test (create): `components/welcome/name-dialog.test.tsx`

**Interfaces:**
- Consumes: `setDisplayName(name: string): Promise<ActionResult>` from `@/server/actions/profile`; `Dialog`, `DialogContent` (`hideClose`), `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`; `Field`, `Input`, `Button`.
- Produces: `export function NameDialog(): JSX.Element` (no props, opens on mount) and `export const NAME_DIALOG_COPY`. E3 mounts `NameDialog`.

- [ ] **Step 1: Write the failing test** — `components/welcome/name-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/profile", () => ({
  setDisplayName: vi.fn(async () => ({ success: true })),
}));

import { setDisplayName } from "@/server/actions/profile";
import { NameDialog, NAME_DIALOG_COPY } from "./name-dialog";

const mockSetDisplayName = setDisplayName as unknown as ReturnType<typeof vi.fn>;

describe("NameDialog (spec 2026-10-04 §E)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on mount with the question, one empty Display name field and Save — and no close button", () => {
    render(<NameDialog />);
    const dialog = screen.getByRole("dialog", { name: "What should we call you?" });
    expect(dialog).toHaveTextContent(NAME_DIALOG_COPY.body);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.maxLength).toBe(60);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("Escape does nothing", async () => {
    render(<NameDialog />);
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mockSetDisplayName).not.toHaveBeenCalled();
  });

  it("a tap outside the sheet does nothing", async () => {
    render(<NameDialog />);
    // Radix attaches its outside-pointerdown listener on a macrotask after mount.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "touch" });
    fireEvent.click(document.body);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses a blank or whitespace-only name without calling the server", async () => {
    render(<NameDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(NAME_DIALOG_COPY.blank)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Display name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(NAME_DIALOG_COPY.blank)).toBeInTheDocument();
    expect(mockSetDisplayName).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Save sends the trimmed name and closes once it is stored", async () => {
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "  Xanthia ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockSetDisplayName).toHaveBeenCalledWith("Xanthia");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Enter in the field saves too", async () => {
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam{Enter}");
    expect(mockSetDisplayName).toHaveBeenCalledWith("Cam");
  });

  it("shows the server's validation message and stays open", async () => {
    mockSetDisplayName.mockResolvedValueOnce({
      success: false,
      errors: { displayName: ["Display name must be 60 characters or fewer."] },
    });
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Display name must be 60 characters or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offline (the action throws) keeps it open with the name still typed", async () => {
    mockSetDisplayName.mockRejectedValueOnce(new Error("offline"));
    render(<NameDialog />);
    await userEvent.type(screen.getByLabelText("Display name"), "Cam");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(NAME_DIALOG_COPY.failed)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Cam");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `TZ=UTC npx vitest run components/welcome/name-dialog.test.tsx`. Expected: `Failed to resolve import "./name-dialog"`.

- [ ] **Step 3: Implement** — create `components/welcome/name-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setDisplayName } from "@/server/actions/profile";

export const NAME_DIALOG_COPY = {
  title: "What should we call you?",
  body: "This is the name the people on your Trips will see. You can change it any time on Account.",
  label: "Display name",
  button: "Save",
  blank: "Enter a name to carry on.",
  failed: "Couldn't save that — please try again.",
} as const;

/** Same ceiling as setDisplayName (server/actions/profile.ts DISPLAY_NAME_MAX). */
const MAX = 60;

/**
 * "Every Traveller has a name" (CONTEXT.md "Profile photo and display name";
 * spec 2026-10-04 §E). Mounted by WelcomeGate on the Trips page while the
 * Traveller has neither a display name nor a provider name — a Sign-in link
 * carries none. It opens on mount and cannot be dismissed: no close button,
 * and Escape and outside taps are swallowed. The only way out is a saved
 * name.
 *
 * A blank name is refused here rather than sent: setDisplayName treats ""
 * as "clear it", which would leave the Traveller nameless. Once the save
 * lands, the action's layout revalidation re-renders the Trips page, so
 * WelcomeGate brings on the Welcome if it is still owed. The dialog also
 * closes itself on success, so it never lingers waiting for that re-render.
 */
export function NameDialog() {
  const [open, setOpen] = React.useState(true);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(NAME_DIALOG_COPY.blank);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await setDisplayName(trimmed);
      if (!result.success) {
        setError(result.errors.displayName?.[0] ?? result.errors._?.[0] ?? NAME_DIALOG_COPY.failed);
        return;
      }
      setOpen(false);
    } catch {
      // Offline or a dropped request: stay open with the name still typed.
      setError(NAME_DIALOG_COPY.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    // No onOpenChange: nothing Radix reports can close it.
    <Dialog open={open}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-[26px]">{NAME_DIALOG_COPY.title}</DialogTitle>
        <DialogDescription className="text-[15px] font-medium leading-[1.5] text-foreground">
          {NAME_DIALOG_COPY.body}
        </DialogDescription>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Field label={NAME_DIALOG_COPY.label} error={error ?? undefined}>
            <Input
              value={name}
              maxLength={MAX}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" size="lg" loading={saving}>
              {NAME_DIALOG_COPY.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run, expect PASS** — `TZ=UTC npx vitest run components/welcome/name-dialog.test.tsx`, then `npx tsc --noEmit` and `npx eslint components/welcome/name-dialog.tsx components/welcome/name-dialog.test.tsx`. Nothing mounts it yet, so no other test is affected.

- [ ] **Step 5: Commit**

```bash
git add components/welcome/name-dialog.tsx components/welcome/name-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(welcome): NameDialog asks a nameless Traveller what to call them

Not dismissable (no X; Escape and outside taps swallowed). Blank is
refused before it reaches setDisplayName, which would clear the name.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13 — E3: Ask for a name on every signed-in page; the Welcome waits for it

> **Main-session amendment (2026-10-04):** the drafted version mounted NameDialog only on
> Trips. An invited Sign-in link Traveller whose link lands on a Trip would then stay
> nameless. So NameDialog mounts in the **`(app)` layout** (every signed-in page), which
> already reads `name` and `displayName` from the DB row; `WelcomeGate` on Trips simply
> holds the Welcome back while the Traveller is nameless. The CONTEXT.md wording ("asked
> for a display name before going further") already fits.

**Files:**
- Modify: `lib/traveller.ts` (add `needsDisplayName` after `travellerName`, ~:52)
- Modify: `app/(app)/layout.tsx` (import + mount beside `<FeedbackLauncher />`, ~:158)
- Modify: `components/welcome/welcome-gate.tsx` (whole file, 19 lines)
- Test: `lib/traveller.test.ts` (add a `describe`), `components/welcome/welcome-gate.test.tsx` (rewrite), `app/(app)/layout.test.tsx` (two new cases)

**Interfaces:**
- Consumes: `NameDialog` (E2), `WelcomeDialog` (unchanged).
- Produces: `export function needsDisplayName(u: Pick<TravellerLike, "name" | "displayName">): boolean` in `lib/traveller.ts`. `WelcomeGate()` keeps its name and signature.

- [ ] **Step 1: Write the failing tests**

Append to `lib/traveller.test.ts` (add `needsDisplayName` to its import from `"./traveller"`):

```tsx
describe("needsDisplayName (spec 2026-10-04 §E)", () => {
  it("is true only with no display name and no provider name", () => {
    expect(needsDisplayName({ name: null, displayName: null })).toBe(true);
    expect(needsDisplayName({ name: null })).toBe(true);
    expect(needsDisplayName({ name: "Cameron Williams", displayName: null })).toBe(false);
    expect(needsDisplayName({ name: null, displayName: "Cam" })).toBe(false);
  });

  it("treats a whitespace-only name as no name", () => {
    expect(needsDisplayName({ name: "   ", displayName: " " })).toBe(true);
  });
});
```

Replace `components/welcome/welcome-gate.test.tsx` with:

```tsx
import type { ReactElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./welcome-dialog", () => ({
  WelcomeDialog: () => "welcome-dialog",
}));

import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { WelcomeDialog } from "./welcome-dialog";
import { WelcomeGate } from "./welcome-gate";

const mockFindUnique = db.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;

const SEEN = new Date("2026-10-01T00:00:00Z");

describe("WelcomeGate (spec 2026-10-01 §G; waits for a name, spec 2026-10-04 §E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "u1" });
  });

  it("reads the Welcome stamp and both names in one query", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cam", displayName: null });
    await WelcomeGate();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { welcomeSeenAt: true, name: true, displayName: true },
    });
  });

  it("a named Traveller who hasn't seen the Welcome gets it", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "Cameron Williams", displayName: null });
    expect(((await WelcomeGate()) as ReactElement | null)?.type).toBe(WelcomeDialog);
  });

  it("holds the Welcome back while the Traveller is nameless (the layout's NameDialog asks first)", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: null, displayName: null });
    expect(await WelcomeGate()).toBeNull();
  });

  it("a whitespace-only provider name counts as nameless", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: "   ", displayName: null });
    expect(await WelcomeGate()).toBeNull();
  });

  it("once a display name is saved, the still-owed Welcome follows", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: null, name: null, displayName: "Xanthia" });
    expect(((await WelcomeGate()) as ReactElement | null)?.type).toBe(WelcomeDialog);
  });

  it("renders nothing once named and seen", async () => {
    mockFindUnique.mockResolvedValue({ welcomeSeenAt: SEEN, name: null, displayName: "Xanthia" });
    expect(await WelcomeGate()).toBeNull();
  });

  it("renders nothing rather than throwing when the user row is missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await WelcomeGate()).toBeNull();
  });
});
```

In `app/(app)/layout.test.tsx`, mock NameDialog near the other `vi.mock` calls and add two cases inside `describe("AppLayout")`. Copy the render lines from the neighbouring test "mounts the feedback launcher for a signed-in traveller" (~:334); `userFindUniqueMock` is the row mock and its default row (top of file) has a name:

```tsx
vi.mock("@/components/welcome/name-dialog", () => ({
  NameDialog: () => <div data-testid="name-dialog" />,
}));
```
```tsx
  it("asks a nameless Traveller for a name on any signed-in page (spec 2026-10-04 §E)", async () => {
    // Copy every key of the file's default userFindUniqueMock row, with name and displayName null.
    userFindUniqueMock.mockResolvedValueOnce({ ...DEFAULT_ROW_KEYS_COPIED, name: null, displayName: null });
    mockUsePathname.mockReturnValue("/trips/christmas-in-europe-2026");
    // ...render AppLayout exactly as the neighbouring tests do...
    expect(screen.getByTestId("name-dialog")).toBeInTheDocument();
    mockUsePathname.mockReturnValue("/trips");
  });

  it("never asks a Traveller who has a name", async () => {
    // ...render AppLayout with the default row...
    expect(screen.queryByTestId("name-dialog")).not.toBeInTheDocument();
  });
```
(`DEFAULT_ROW_KEYS_COPIED` stands for the literal keys of that default row — write them out; the file defines the row inline in `vi.hoisted`.)

- [ ] **Step 2: Run, expect FAIL** — `TZ=UTC npx vitest run lib/traveller.test.ts components/welcome/welcome-gate.test.tsx "app/(app)/layout.test.tsx"`. Expected: `needsDisplayName is not a function`; the gate's select assertion and nameless cases fail; the layout's name-dialog case fails.

- [ ] **Step 3: Implement**

`lib/traveller.ts`, directly after `travellerName`:

```ts
/**
 * True when nothing names this Traveller but their email: no display name
 * they set and no name from their sign-in (a Sign-in link carries none).
 * Such a Traveller is asked for a display name and cannot skip it
 * (CONTEXT.md "Profile photo and display name"; spec 2026-10-04 §E).
 */
export function needsDisplayName(u: Pick<TravellerLike, "name" | "displayName">): boolean {
  return !u.displayName?.trim() && !u.name?.trim();
}
```

`app/(app)/layout.tsx` — the row read at ~:69 already selects `name` and `displayName` via `TRAVELLER_SELECT`. Add `needsDisplayName` to the existing `@/lib/traveller` import (or add the import), import `NameDialog`, and mount it beside the launcher:

```tsx
import { NameDialog } from "@/components/welcome/name-dialog";
```
```tsx
      <FeedbackLauncher />
      {/* Every Traveller has a name (spec 2026-10-04 §E): a sign-in that
          brought none is asked here, on whatever page they landed. */}
      {needsDisplayName(traveller) && <NameDialog />}
```

Replace `components/welcome/welcome-gate.tsx` with:

```tsx
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { needsDisplayName } from "@/lib/traveller";
import { WelcomeDialog } from "./welcome-dialog";

/**
 * The first-sign-in Welcome (spec 2026-10-01 §G), decided on the server — the
 * same shape as WhatsNewBanner. Shows while `welcomeSeenAt` is null, but only
 * once the Traveller has a name: a nameless one is being asked by the
 * layout's NameDialog first (spec 2026-10-04 §E), and saving revalidates the
 * layout so this re-runs and the Welcome follows.
 *
 * Returns null for a row that has gone missing, where saying nothing beats
 * failing the Trips page over a greeting.
 */
export async function WelcomeGate() {
  const user = await requireUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { welcomeSeenAt: true, name: true, displayName: true },
  });
  if (!row || row.welcomeSeenAt || needsDisplayName(row)) return null;
  return <WelcomeDialog />;
}
```

- [ ] **Step 4: Run, expect PASS** — `TZ=UTC npx vitest run lib/traveller.test.ts components/welcome "app/(app)/layout.test.tsx" "app/(app)/trips/page.test.tsx" server/actions/welcome.test.ts lib/server-action-exports.test.ts`, then `npx tsc --noEmit` and `npx eslint lib/traveller.ts "app/(app)/layout.tsx" components/welcome`.

- [ ] **Step 5: Commit** — message:

```
feat(welcome): every signed-in page asks a nameless Traveller for a name

NameDialog mounts in the (app) layout for any Traveller with no display
name and no provider name, new or existing, on whatever page they land.
The Trips Welcome waits until a name is saved.

Resolves-Feedback: cmut6e3c6000004lfadafz4ju

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```
`git add lib/traveller.ts lib/traveller.test.ts "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" components/welcome/welcome-gate.tsx components/welcome/welcome-gate.test.tsx`

### Task 14 — E4: Feedback notes carry the author's current name

> **Main-session addition (2026-10-04):** `server/actions/feedback.ts:64` stores
> `authorName: user.name` from the JWT, frozen at sign-in — so a Sign-in link Traveller's
> notes say "Traveller" even after E3 names them, and a Google user's ignore their display name.

**Files:**
- Modify: `server/actions/feedback.ts` (~:55-66)
- Test: `server/actions/feedback.test.ts`

**Interfaces:**
- Consumes: `travellerName`, `TRAVELLER_SELECT` from `@/lib/traveller`; `db.user.findUnique`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** — in `server/actions/feedback.test.ts`, using the file's existing `db` mock, guard mock, action name, valid-input fixture and upsert mock (read the top of the file; add `user: { findUnique: vi.fn() }` to the `db` mock if absent, exposed as `mockUserFindUnique`):

```tsx
  it("stores the author's current display name, not the sign-in session's name", async () => {
    // The guard's session user should have name: null here (a Sign-in link) — override if needed.
    mockUserFindUnique.mockResolvedValue({ id: "u1", name: null, displayName: "Xanthia", image: null,
      photoKey: null, photoUpdatedAt: null, photoFocalX: null, photoFocalY: null });
    await submitFeedbackActionFromFile(validInputFromFile());
    expect(upsertMockFromFile.mock.calls[0][0].create.authorName).toBe("Xanthia");
  });
```
(The three `…FromFile` names stand for the real names in that test file — substitute them.)

- [ ] **Step 2: Run, expect FAIL** — `TZ=UTC npx vitest run server/actions/feedback.test.ts` → `authorName` is the session's name/null, not "Xanthia".

- [ ] **Step 3: Implement** — in `server/actions/feedback.ts`, before the upsert:

```ts
  // The Traveller's name as everyone else sees it now (CONTEXT.md "Profile
  // photo and display name") — the session's copy is frozen at sign-in and a
  // Sign-in link one is null (spec 2026-10-04 §E).
  const author = await db.user.findUnique({ where: { id: user.id }, select: TRAVELLER_SELECT });
```
and in `create`:
```ts
      authorName: author ? travellerName(author) : (user.name ?? null),
```
Import `{ TRAVELLER_SELECT, travellerName }` from `@/lib/traveller`.

- [ ] **Step 4: Run, expect PASS** — `TZ=UTC npx vitest run server/actions/feedback.test.ts lib/feedback-view.test.ts`, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add server/actions/feedback.ts server/actions/feedback.test.ts`; message `fix(feedback): a note carries its author's current display name` + blank line + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

# Part D

## Part D notes

- **Key files.** `lib/transport-anchor.ts` (`resolveTransportSlot`, `HEAD_SLOT = "__head__"`), `components/trip/transport-form-dialog.tsx` (state :384-388, submit mapping :496, picker :835-861, `HEAD_SENTINEL` :302-307 has the same value as `HEAD_SLOT`, so it goes), `components/trip/itinerary-manager.tsx` (edit dialog :2273-2295, `bookendLegIds` :1215-1220), `lib/fork-plan.ts` + `server/actions/forks.ts` :232-244, `lib/duplicate-trip.ts` + `server/actions/trips.ts` :536-545, `prisma/real/persist.ts` :226-238, `prisma/demo/persist.ts` :439-461. The server actions don't change: `createTransport`/`updateTransport` already store `"" → null`.
- **Conflict with the spec's head rule (please confirm).** "Before {first Stop}" is stored as **no anchor** (null). A null-anchor leg is placed by the fallback, so the head holds only where that fallback actually lands on it: **no from-Stop, and arriving at the first Stop or at no Stop at all.** The spec's wording ("a leg arriving at the first Stop, *or* one with no from-Stop") would still offer options that can't hold. Malpensa → Como (no from-Stop) saved as head would render after Dublin. A Rome → Denpasar leg saved as head would render after Rome. I implement the "can hold" rule as `canSitBeforeFirstStop`, which is the spec's stated intent. To make a head hold for *any* leg you would need a storable head marker, which means a schema change, and that is out of scope ("no migration").
- **Untouched picker = stored anchor sent back unchanged** (a null anchor stays null). It does not write the displayed slot. With no endpoint changes this sits the leg in the same place, so "does not move" holds. It also means a null-anchor leg whose From is changed in the same edit still follows its new From, which matches today's behaviour. While untouched, the picker *displays* the slot resolved from the endpoints as they stand, so it follows a changed From live.
- **Home base bookends (outbound/return).** These render with the Home base card whatever their anchor (`findOutboundLeg`/`findReturnLeg` ignore `anchorStopId`), so every option in the picker did nothing visible. Proposal: a new `bookend` prop hides the picker. `ItineraryManager` passes `bookendLegIds.has(id)`. The Day page (`DayEntryLink`) doesn't know which legs are bookends, so it still shows the picker. That's harmless because an untouched save keeps the anchor, and anchors don't affect bookends.
- **Day page stop list differs.** The `lib/day-view-loader.ts` `stopOptions` are dated Stops only, in `sortOrder` order, not `orderPlanStops`. So the picker opened from a Day page can show a different slot than the plan editor when a leg is anchored to a rough Stop, or when date order and sortOrder disagree. Saving untouched is still safe (stored anchor sent back). I haven't fixed this; it's flagged.
- **Pre-existing bugs found, not fixed (flag to Cam):**
  - (a) `duplicateTrip` reads `stops/transports: true` with no `forkId` filter, so a Trip's variant rows get copied into the copy's real plan. My Duplicate anchor resolves against *all* copied Stops in sortOrder, which is exactly what the copy's timeline will do.
  - (b) Fork and Duplicate both drop `depIsHome`/`arrIsHome`.
  - (c) With **no Home base** (or a one-way trip, for the return leg), `bookendLegIds` still drops the outbound/return leg from `legsBySlot`, but no bookend renders it, so that leg appears to vanish from the desktop/phone plan list.
- **Copy-path ordering.**
  - Fork keeps dates and sortOrder, so it resolves against `orderPlanStops(source stops)`.
  - Duplicate makes every Stop rough, so it resolves against plain sortOrder order (the copy's real order), not the source's dates.
  - Both carry an explicit source anchor that still names a Stop, and the server action maps the source id to the **new** Stop id through `stopIdMap`.
  - The real importer and the demo seed share `demoLegAnchorKeys(plan)` (keys mapped to new ids through `id`).
  - The demo `persistTrip` has no unit harness, so its wiring is covered by the helper test plus `tsc`.
- **Trailer.** `Resolves-Feedback: cmut6hx92000204lfpn25yavf` goes on D1, the commit that fixes what the note reports (the picker). D2–D4 are the creation-path half of the same spec part, with no trailer.

## Review-focus candidates

- **Endpoint changed while the picker is untouched.** Example: edit a London → Rome leg (no anchor) and change From to Paris. The picker reads "After Paris" live, and Save sends the stored anchor back unchanged (`""` → null), so the leg follows its new From. Tested in D1.
- **A picked "Before {first Stop}" that stops holding.** Pick head on a Brisbane → London leg, then change From to Paris. The picker falls back to "After Paris" (the head option disappears), and Save sends the stored anchor back, not `""`-as-a-choice. Tested in D1.
- **Home base bookend leg opened from the plan editor.** No Position in plan picker. An ordinary leg in the same plan opens on its resolved slot. Tested in D1 (form + `itinerary-manager`).

---

### Task 15 — D1: Position picker opens on the slot the leg really renders in; head only where it holds; hidden for bookends

**Files:**
- Modify: `lib/transport-anchor.ts` (append after `resolveTransportSlot`, after :28)
- Test: `lib/transport-anchor.test.ts` (append)
- Modify: `components/trip/transport-form-dialog.tsx` (imports :1-40; props :72-116; `TransportFormDialog` :141-200; `TransportFormProps` :263-281; `HEAD_SENTINEL` :302-307; `TransportForm` destructure :309-327; anchor state :384-388; submit :496; picker :835-861)
- Modify: `components/trip/itinerary-manager.tsx` (edit `TransportFormDialog` :2273-2295)
- Test: `components/trip/transport-form-dialog.test.tsx` (Task 13 describe :828-901)
- Test: `components/trip/itinerary-manager.test.tsx` (new describe after the "home base bookends" describe, ~:1810)

**Interfaces:**
- Consumes: `resolveTransportSlot`, `HEAD_SLOT`, `AnchorStopLike` (existing).
- Produces:
  - `canSitBeforeFirstStop(t: { fromStopId?: string | null; toStopId?: string | null }, orderedStops: readonly AnchorStopLike[]): boolean`
  - `creationAnchor(t: { anchorStopId?: string | null; fromStopId?: string | null; toStopId?: string | null }, orderedStops: readonly AnchorStopLike[]): string | null` (used by D2–D4)
  - `TransportFormDialogProps.bookend?: boolean`

- [ ] **Step 1: Write the failing tests**

Append to `lib/transport-anchor.test.ts` (and extend its import to `import { resolveTransportSlot, groupTransportsBySlot, canSitBeforeFirstStop, creationAnchor, HEAD_SLOT } from "./transport-anchor";`):

```tsx
describe("canSitBeforeFirstStop", () => {
  it("holds for a leg arriving at the first stop with no from-stop", () => {
    expect(canSitBeforeFirstStop({ toStopId: "a" }, stops)).toBe(true);
  });
  it("holds for a leg with no stop endpoint at all", () => {
    expect(canSitBeforeFirstStop({}, stops)).toBe(true);
  });
  it("does not hold for a leg with a from-stop — even one arriving at the first stop", () => {
    expect(canSitBeforeFirstStop({ fromStopId: "a", toStopId: "b" }, stops)).toBe(false);
    expect(canSitBeforeFirstStop({ fromStopId: "c", toStopId: "a" }, stops)).toBe(false);
  });
  it("does not hold for a leg with no from-stop arriving at a later stop", () => {
    expect(canSitBeforeFirstStop({ toStopId: "c" }, stops)).toBe(false);
  });
  it("treats a from-stop missing from the list as no from-stop", () => {
    expect(canSitBeforeFirstStop({ fromStopId: "gone", toStopId: "a" }, stops)).toBe(true);
  });
});

describe("creationAnchor", () => {
  it("is the from-stop for a leg leaving a stop", () => {
    expect(creationAnchor({ fromStopId: "b", toStopId: "c" }, stops)).toBe("b");
  });
  it("is the stop before the to-stop for an arrival with no from-stop", () => {
    expect(creationAnchor({ toStopId: "c" }, stops)).toBe("b");
  });
  it("is null (the head) for an arrival at the first stop", () => {
    expect(creationAnchor({ toStopId: "a" }, stops)).toBeNull();
  });
  it("keeps an explicit anchor that still names a stop", () => {
    expect(creationAnchor({ anchorStopId: "c", fromStopId: "a" }, stops)).toBe("c");
  });
  it("ignores an anchor that is not in the list", () => {
    expect(creationAnchor({ anchorStopId: "zzz", fromStopId: "a" }, stops)).toBe("a");
  });
});
```

In `components/trip/transport-form-dialog.test.tsx`, replace the second test of the Task 13 describe (the "selecting 'Before London' (head)" test at :870-892). Its a→b fixture no longer gets the head option. Use this instead:

```tsx
  it("edit mode: selecting 'Before London' (head) submits updateTransport with anchorStopId=''", async () => {
    const user = userEvent.setup();
    render(
      <TransportFormDialog
        {...baseProps}
        // Head only holds for a leg with no from-Stop arriving at the first Stop.
        transport={{ ...transportWithAnchor, fromStopId: null, depPlace: "Brisbane", toStopId: "stop-a", anchorStopId: "stop-b" }}
      />,
    );

    const positionSelect = screen.getByRole("combobox", { name: /position in plan/i });
    await user.click(positionSelect);

    const beforeLondonOption = await screen.findByRole("option", { name: /before london/i });
    await user.click(beforeLondonOption);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({ anchorStopId: "" }),
    );
  });
```

Then append a new describe at the end of the file:

```tsx
// ---------------------------------------------------------------------------
// Spec 2026-10-04 §D: the picker shows where the leg really sits
// ---------------------------------------------------------------------------

describe("TransportFormDialog: position picker shows the resolved slot (spec 2026-10-04 §D)", () => {
  beforeEach(() => vi.clearAllMocks());

  const threeStops = [
    { id: "stop-a", name: "London" },
    { id: "stop-b", name: "Paris" },
    { id: "stop-c", name: "Rome" },
  ];
  const leg = (o: Partial<TransportCardTransport>): TransportCardTransport => ({
    id: "transport-99",
    mode: "TRAIN",
    fromStopId: null,
    toStopId: null,
    anchorStopId: null,
    sortOrder: 0,
    ...o,
  });
  const positionPicker = () => screen.getByRole("combobox", { name: /position in plan/i });

  it("a null-anchor leg with a from-Stop opens on 'After {from}', not 'Before {first Stop}'", () => {
    render(<TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ fromStopId: "stop-b", toStopId: "stop-c" })} />);
    expect(positionPicker()).toHaveTextContent("After Paris");
  });

  it("a null-anchor arrival with no from-Stop opens on the Stop before its to-Stop", () => {
    render(<TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ depPlace: "Malpensa", toStopId: "stop-c" })} />);
    expect(positionPicker()).toHaveTextContent("After Paris");
  });

  it("an explicit anchor opens on that anchor", () => {
    render(
      <TransportFormDialog
        {...baseProps}
        stops={threeStops}
        transport={leg({ fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-c" })}
      />,
    );
    expect(positionPicker()).toHaveTextContent("After Rome");
  });

  it("saving without touching the picker sends the stored anchor back unchanged", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ fromStopId: "stop-b", toStopId: "stop-c" })} />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    // null stays null ("" → null on the server): the leg keeps resolving after Paris.
    expect(updateTransport).toHaveBeenLastCalledWith("transport-99", expect.objectContaining({ anchorStopId: "" }));
    unmount();

    render(
      <TransportFormDialog
        {...baseProps}
        stops={threeStops}
        transport={leg({ fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-c" })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateTransport).toHaveBeenLastCalledWith("transport-99", expect.objectContaining({ anchorStopId: "stop-c" }));
  });

  it("while untouched, the picker follows a changed From — and saving still stores no anchor", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ fromStopId: "stop-a", toStopId: "stop-c" })} />);
    expect(positionPicker()).toHaveTextContent("After London");

    await openComboboxAndSelectStop(user, "^From:", "Paris");
    expect(positionPicker()).toHaveTextContent("After Paris");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({ fromStopId: "stop-b", anchorStopId: "" }),
    );
  });

  it("a picked head that stops holding falls back to the resolved slot and saves the stored anchor", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ depPlace: "Brisbane", toStopId: "stop-a" })} />);

    await user.click(positionPicker());
    await user.click(await screen.findByRole("option", { name: /before london/i }));
    expect(positionPicker()).toHaveTextContent("Before London");

    await openComboboxAndSelectStop(user, "^From:", "Paris");
    expect(positionPicker()).toHaveTextContent("After Paris");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateTransport).toHaveBeenCalledWith("transport-99", expect.objectContaining({ anchorStopId: "" }));
  });

  describe("'Before {first Stop}' is offered only where it can hold", () => {
    async function openPicker(transport: TransportCardTransport) {
      const user = userEvent.setup();
      render(<TransportFormDialog {...baseProps} stops={threeStops} transport={transport} />);
      await user.click(positionPicker());
      await screen.findByRole("option", { name: /after london/i });
    }

    it("is offered for a leg arriving at the first Stop with no from-Stop", async () => {
      await openPicker(leg({ depPlace: "Brisbane", toStopId: "stop-a" }));
      expect(screen.getByRole("option", { name: /before london/i })).toBeInTheDocument();
    });

    it("is offered for a leg with no Stop endpoint at all", async () => {
      await openPicker(leg({ depPlace: "Gatwick", arrPlace: "Heathrow" }));
      expect(screen.getByRole("option", { name: /before london/i })).toBeInTheDocument();
    });

    it("is not offered for a leg with a from-Stop", async () => {
      await openPicker(leg({ fromStopId: "stop-a", toStopId: "stop-b" }));
      expect(screen.queryByRole("option", { name: /before london/i })).toBeNull();
    });

    it("is not offered for a leg arriving at the first Stop from another Stop", async () => {
      await openPicker(leg({ fromStopId: "stop-c", toStopId: "stop-a" }));
      expect(screen.queryByRole("option", { name: /before london/i })).toBeNull();
    });

    it("is not offered for a leg with no from-Stop arriving at a later Stop", async () => {
      await openPicker(leg({ depPlace: "Malpensa", toStopId: "stop-c" }));
      expect(screen.queryByRole("option", { name: /before london/i })).toBeNull();
    });
  });

  it("is hidden for a Home base bookend leg", () => {
    render(
      <TransportFormDialog {...baseProps} stops={threeStops} transport={leg({ depIsHome: true, toStopId: "stop-a" })} bookend />,
    );
    expect(screen.queryByRole("combobox", { name: /position in plan/i })).not.toBeInTheDocument();
  });
});
```

In `components/trip/itinerary-manager.test.tsx`, add after the closing `});` of `describe("home base bookends", …)`:

```tsx
// ---------------------------------------------------------------------------
// Spec 2026-10-04 §D: Position in plan from the plan editor
// ---------------------------------------------------------------------------

describe("Position in plan from the plan editor (spec 2026-10-04 §D)", () => {
  const PARIS = () => makeStop({ id: "s1", name: "Paris", arriveDate: "2026-12-10", departDate: "2026-12-15", sortOrder: 0 });
  const ROME = () => makeStop({ id: "s2", name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-20", sortOrder: 1 });
  const legs = () => [
    makeTransport({ id: "out", depIsHome: true, toStopId: "s1" }),
    makeTransport({ id: "mid", fromStopId: "s1", toStopId: "s2", sortOrder: 1 }),
  ];

  it("an ordinary leg with no anchor opens on 'After {from}'", async () => {
    const user = userEvent.setup();
    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[PARIS(), ROME()]} initialTransports={legs()} homeBaseName="Sydney" roundTrip={false} />,
    );
    await user.click(desktop().getByRole("button", { name: /^Flight from Paris to Rome/ }));
    expect(await screen.findByRole("combobox", { name: /position in plan/i })).toHaveTextContent("After Paris");
  });

  it("the outbound Home base leg has no Position in plan picker — it sits with the Home base", async () => {
    const user = userEvent.setup();
    renderPlan(
      <ItineraryManager {...baseProps} initialStops={[PARIS(), ROME()]} initialTransports={legs()} homeBaseName="Sydney" roundTrip={false} />,
    );
    await user.click(desktop().getByRole("button", { name: /^Flight from Sydney to Paris/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /position in plan/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`TZ=UTC npx vitest run lib/transport-anchor.test.ts components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx`

Expected:
- `transport-anchor.test.ts` fails to import `canSitBeforeFirstStop` / `creationAnchor` (not exported).
- In the form tests, "opens on 'After Paris'" fails because the trigger reads "Before London"; the "not offered" tests find a "Before London" option; the bookend test finds the combobox. A TS-only failure on the unknown `bookend` prop is fine.
- In `itinerary-manager`, both new tests fail ("Before Paris" text / picker present).

- [ ] **Step 3: Implement**

`lib/transport-anchor.ts`, insert after `resolveTransportSlot` (after :28):

```ts
/**
 * Whether "Before {first Stop}" can hold for a leg with these endpoints. The
 * head is stored as no anchor (null), and a null-anchor leg is placed by the
 * endpoint fallback above — so the head only holds where that fallback lands
 * on it: no from-Stop, arriving at the first Stop or at no Stop at all.
 */
export function canSitBeforeFirstStop(
  t: { fromStopId?: string | null; toStopId?: string | null },
  orderedStops: readonly AnchorStopLike[],
): boolean {
  return (
    resolveTransportSlot({ id: "", sortOrder: 0, fromStopId: t.fromStopId, toStopId: t.toStopId }, orderedStops) ===
    HEAD_SLOT
  );
}

/**
 * The anchor a leg is created with (spec 2026-10-04 §D): the slot it would
 * resolve to — its own anchor while that still names one of `orderedStops`,
 * else the endpoint fallback — with the head stored as null.
 */
export function creationAnchor(
  t: { anchorStopId?: string | null; fromStopId?: string | null; toStopId?: string | null },
  orderedStops: readonly AnchorStopLike[],
): string | null {
  const slot = resolveTransportSlot(
    { id: "", sortOrder: 0, anchorStopId: t.anchorStopId, fromStopId: t.fromStopId, toStopId: t.toStopId },
    orderedStops,
  );
  return slot === HEAD_SLOT ? null : slot;
}
```

`components/trip/transport-form-dialog.tsx`:

1. Imports: add after the `formatDayLabel` import (:40):

```ts
import { resolveTransportSlot, canSitBeforeFirstStop, HEAD_SLOT } from "@/lib/transport-anchor";
```

2. `TransportFormDialogProps`: add after the `onDelete` prop (:103):

```ts
  /**
   * Edit mode: this leg is a Home base bookend (ADR 0032). It renders with
   * the Home base card whatever its anchor, so the Position in plan picker —
   * whose every option would do nothing visible — is hidden.
   */
  bookend?: boolean;
```

3. `TransportFormDialog`: add `bookend,` to the destructure (after `onDelete,` at :155) and `bookend={bookend}` to the `<TransportForm …>` props (after `onDelete={onDelete}` at :193).

4. `TransportFormProps`: add `bookend?: boolean;` after `onDelete?: () => void;` (:277).

5. Delete the `HEAD_SENTINEL` block (:301-307):

```ts
/**
 * Sentinel value for the "Before {firstStop}" head option in the Position in
 * plan picker. Radix Select disallows empty-string item values, so we use this
 * non-empty string and map it to "" (no explicit anchor) on submit.
 */
const HEAD_SENTINEL = "__head__";
```

6. `TransportForm` destructure: add `bookend,` after `onDelete,` (:322).

7. Replace the anchor state (:384-388):

```ts
  // anchorStopId: in edit mode this is controlled by the Position in plan
  // picker; in add mode it is seeded from defaultAnchorStopId and never shown.
  const [anchorStopId, setAnchorStopId] = React.useState<string>(
    transport?.anchorStopId ?? defaultAnchorStopId ?? "",
  );
```

with:

```ts
  // Position in plan (edit mode). null = untouched: the picker shows the slot
  // the timeline actually renders the leg in (resolveTransportSlot, for the
  // endpoints as they stand) and saving sends the stored anchor back
  // unchanged — an untouched picker never moves the leg (spec 2026-10-04 §D).
  // HEAD_SLOT is the head option's value (Radix Select disallows "" items);
  // it is sent as "" (no anchor).
  const [pickedSlot, setPickedSlot] = React.useState<string | null>(null);
  const liveFromStopId = fromValue.kind === "stop" ? fromValue.stopId : null;
  const liveToStopId = toValue.kind === "stop" ? toValue.stopId : null;
  const storedAnchor = transport?.anchorStopId ?? null;
  const headHolds = canSitBeforeFirstStop({ fromStopId: liveFromStopId, toStopId: liveToStopId }, stops);
  const resolvedSlot = resolveTransportSlot(
    { id: transport?.id ?? "", sortOrder: 0, anchorStopId: storedAnchor, fromStopId: liveFromStopId, toStopId: liveToStopId },
    stops,
  );
  // A picked head that stops holding (the From changed under it) falls back.
  const pickValid = pickedSlot !== null && (pickedSlot !== HEAD_SLOT || headHolds);
  const positionSlot = pickValid && pickedSlot !== null ? pickedSlot : resolvedSlot;

  function anchorForSubmit(): string | undefined {
    if (isEdit) {
      if (!pickValid || pickedSlot === null) return storedAnchor ?? "";
      return pickedSlot === HEAD_SLOT ? "" : pickedSlot;
    }
    return defaultAnchorStopId || undefined;
  }
```

8. In the submit `input` (:496), replace

```ts
        anchorStopId: anchorStopId === HEAD_SENTINEL ? "" : (anchorStopId || undefined),
```

with

```ts
        anchorStopId: anchorForSubmit(),
```

9. Replace the picker block (:835-861) with:

```tsx
        {/* Position in plan — edit mode only, and not for a Home base bookend
            (it sits with the Home base card whatever its anchor). Opens on the
            slot the timeline renders the leg in; the head is only offered
            where a null anchor really lands there. */}
        {isEdit && !bookend && stops.length > 0 && (
          <Field label="Position in plan">
            <Select value={positionSlot} onValueChange={setPickedSlot} disabled={isPending}>
              <SelectTrigger aria-label="Position in plan">
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {headHolds && (
                  <SelectItem value={HEAD_SLOT}>
                    Before {stops[0].name}
                  </SelectItem>
                )}
                {stops.map((stop) => (
                  <SelectItem key={stop.id} value={stop.id}>
                    After {stop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
```

`components/trip/itinerary-manager.tsx`, in the edit `<TransportFormDialog …>` (:2273-2295), add after `transport={editingTransport}`:

```tsx
          bookend={bookendLegIds.has(editingTransport.id)}
```

- [ ] **Step 4: Run, expect PASS**

`TZ=UTC npx vitest run lib/transport-anchor.test.ts components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx components/trip/day-entry-link.test.tsx`

Then `npx tsc --noEmit` and `npx eslint lib/transport-anchor.ts components/trip/transport-form-dialog.tsx components/trip/itinerary-manager.tsx`.

The only existing test that needs updating is the Task 13 "Before London" test, replaced in Step 1. The "After Paris" and "add mode: picker NOT shown" tests stay as they are. Other `updateTransport` assertions use `objectContaining`, so the change from `anchorStopId: undefined` to `""` on an untouched null-anchor save doesn't affect them.

- [ ] **Step 5: Commit**

```bash
git add lib/transport-anchor.ts lib/transport-anchor.test.ts components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "$(cat <<'EOF'
fix(transport): position picker opens on the slot the leg renders in

The picker read a null anchor as "Before {first Stop}". It now opens on
resolveTransportSlot for the endpoints as they stand, saves the stored
anchor back when untouched, offers the head only where a null anchor
lands there, and is hidden for Home base bookend legs.

Resolves-Feedback: cmut6hx92000204lfpn25yavf

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16 — D2: Add transport stores the slot the new leg resolves to

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (import line added in D1; `anchorForSubmit` add-mode branch added in D1)
- Test: `components/trip/transport-form-dialog.test.tsx` (Task 12 describe ~:807-826, append tests)

**Interfaces:**
- Consumes: `creationAnchor` (D1).
- Produces: in add mode, `createTransport(…, { anchorStopId })` is always the slot the leg resolves to (`defaultAnchorStopId` wins when given). It is `undefined` when that slot is the head.

- [ ] **Step 1: Write the failing test**

Extend the test file's import to `import { TransportFormDialog, HOME_ENDPOINT } from "./transport-form-dialog";`, then add inside `describe("TransportFormDialog: add-mode anchor (Task 12)", …)` after the existing test:

```tsx
  // Spec 2026-10-04 §D: a plain Add transport stores the slot it resolves to.
  const threeStops = [
    { id: "stop-a", name: "London" },
    { id: "stop-b", name: "Paris" },
    { id: "stop-c", name: "Rome" },
  ];
  const sentAnchor = () => vi.mocked(createTransport).mock.calls[0][1].anchorStopId;

  it("a leg from a Stop is created anchored after that Stop", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} defaultFromStopId="stop-b" defaultToStopId="stop-c" />);
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(sentAnchor()).toBe("stop-b");
  });

  it("a leg with no from-Stop is created anchored after the Stop before its to-Stop", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} defaultFromStopId={HOME_ENDPOINT} defaultToStopId="stop-c" />);
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(sentAnchor()).toBe("stop-b");
  });

  it("a leg arriving at the first Stop with no from-Stop is created at the head (no anchor)", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} defaultFromStopId={HOME_ENDPOINT} defaultToStopId="stop-a" />);
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(sentAnchor()).toBeUndefined();
  });

  it("endpoints picked in the dialog decide the anchor", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} stops={threeStops} />);
    await openComboboxAndSelectStop(user, "^From:", "Paris");
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(sentAnchor()).toBe("stop-b");
  });

  it("defaultAnchorStopId (the slot the leg was added in) wins over the resolved slot", async () => {
    const user = userEvent.setup();
    render(
      <TransportFormDialog {...baseProps} stops={threeStops} defaultFromStopId="stop-a" defaultToStopId="stop-c" defaultAnchorStopId="stop-b" />,
    );
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(sentAnchor()).toBe("stop-b");
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx -t "add-mode anchor"`

Expected: the first, second and fourth new tests fail with `expected undefined to be 'stop-b'`. The head test and the `defaultAnchorStopId` test already pass.

- [ ] **Step 3: Implement**

In `components/trip/transport-form-dialog.tsx`, extend the D1 import:

```ts
import { resolveTransportSlot, canSitBeforeFirstStop, creationAnchor, HEAD_SLOT } from "@/lib/transport-anchor";
```

and replace the add-mode line of `anchorForSubmit`:

```ts
    return defaultAnchorStopId || undefined;
```

with:

```ts
    // Add mode: the slot the leg was added in, else the slot it would
    // resolve to — every new leg gets a real anchor (spec 2026-10-04 §D).
    return defaultAnchorStopId || (creationAnchor({ fromStopId: liveFromStopId, toStopId: liveToStopId }, stops) ?? undefined);
```

- [ ] **Step 4: Run, expect PASS**

`TZ=UTC npx vitest run components/trip/transport-form-dialog.test.tsx components/trip/itinerary-manager.test.tsx`

Then `npx tsc --noEmit` and `npx eslint components/trip/transport-form-dialog.tsx`.

The existing `createTransport` assertions all use `objectContaining`. The new `anchorStopId` key on, e.g., "Case 2" (From London) is ignored by them. The `itinerary-manager` "dashed pill … anchorStopId: s-a" test still passes because `defaultAnchorStopId` wins.

- [ ] **Step 5: Commit**

```bash
git add components/trip/transport-form-dialog.tsx components/trip/transport-form-dialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(transport): a new leg is created with the slot it resolves to

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17 — D3: Fork creation and Duplicate copy each leg's slot onto the new Stop ids

**Files:**
- Modify: `lib/fork-plan.ts` (header :6-12; imports :15; `ForkSourceTransport` :55-71; `ForkPlan.transports` :172-174; `buildForkPlan` :241-269)
- Modify: `server/actions/forks.ts` (:232-244)
- Modify: `lib/duplicate-trip.ts` (`DuplicateSourceTransport` :57-71; `DuplicatePlan.transports` :110-112; `buildDuplicatePlan` :130-196)
- Modify: `server/actions/trips.ts` (:536-545)
- Test: `lib/fork-plan.test.ts`, `lib/duplicate-trip.test.ts`, `server/actions/forks.test.ts` (inside "success path: real plan copy"), `server/actions/trips.test.ts` (:1079)

**Interfaces:**
- Consumes: `creationAnchor` (D1), `orderPlanStops` (`lib/plan-order.ts`).
- Produces:
  - `ForkSourceTransport.anchorStopId?: string | null`
  - `ForkPlan["transports"][number].sourceAnchorStopId: string | null`
  - `DuplicateSourceTransport.anchorStopId?: string | null`
  - `DuplicatePlan["transports"][number].sourceAnchorStopId: string | null`

- [ ] **Step 1: Write the failing tests**

Append to `lib/fork-plan.test.ts`:

```tsx
// Spec 2026-10-04 §D: each copied leg carries the slot it renders in.
it("gives each leg the slot it resolves to in the source's plan order (dates first)", () => {
  const venice = { ...source.stops[0], id: "s2", name: "Venice", arriveDate: "2026-06-25", departDate: "2026-06-28", sortOrder: 1 };
  const t = source.transports[0];
  const plan = buildForkPlan({
    ...source,
    stops: [source.stops[0], venice], // Rome sortOrder 0 but dated after Venice → Venice, Rome
    transports: [
      t,                                                            // leaves Rome → s1
      { ...t, id: "t2", fromStopId: null, toStopId: "s1" },         // arrives at Rome → after Venice
      { ...t, id: "t3", fromStopId: null, toStopId: "s2" },         // arrives at the first Stop → head
      { ...t, id: "t4", fromStopId: "s1", anchorStopId: "s2" },     // explicit anchor kept
    ],
  });
  expect(plan.transports.map((x) => x.sourceAnchorStopId)).toEqual(["s1", "s2", null, "s2"]);
});
```

Append inside `describe("buildDuplicatePlan", …)` in `lib/duplicate-trip.test.ts`:

```tsx
  // Spec 2026-10-04 §D. Every copied Stop is rough, so the copy's plan order is
  // plain sortOrder — the slot is resolved against that, not the source's dates.
  it("gives each leg the slot it resolves to on the copy (sortOrder order)", () => {
    const venice = { ...SOURCE.stops[1], id: "s3", name: "Venice", arriveDate: "2026-07-20", departDate: "2026-07-25", sortOrder: 2 };
    const t = SOURCE.transports[0];
    const plan = buildDuplicatePlan(
      {
        ...SOURCE,
        stops: [SOURCE.stops[0], SOURCE.stops[1], venice],
        transports: [
          t,                                                          // Rome → Florence: after Rome
          { ...t, fromStopId: null, toStopId: "s1" },                 // arrives at Rome, first by sortOrder: head
          { ...t, fromStopId: null, toStopId: "s3" },                 // arrives at Venice: after Florence
          { ...t, anchorStopId: "s3" },                               // explicit anchor kept
        ],
      },
      "x",
    );
    expect(plan.transports.map((x) => x.sourceAnchorStopId)).toEqual(["s1", null, "s2", "s3"]);
  });
```

In `server/actions/forks.test.ts`, inside `describe("success path: real plan copy", …)` (after the DayTitle test, ~:706):

```tsx
    it("anchors each copied leg on the variant's NEW Stop ids for the slot it renders in (spec 2026-10-04 §D)", async () => {
      const stop = { chapterId: null, country: "PT", lat: null, lng: null, timezone: null, nights: null, pinned: false, chapterSortOrder: 0, notes: null };
      stopFindManyMock.mockResolvedValue([
        { ...stop, id: "stop-a", name: "Lisbon", arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder: 0 },
        { ...stop, id: "stop-b", name: "Porto", arriveDate: "2026-12-13", departDate: "2026-12-16", sortOrder: 1 },
      ]);
      stopCreateMock.mockResolvedValueOnce({ id: "stop-a-new" }).mockResolvedValueOnce({ id: "stop-b-new" });
      const leg = {
        mode: "TRAIN", depPlace: null, arrPlace: null, depAt: null, arrAt: null,
        depLat: null, depLng: null, arrLat: null, arrLng: null, reference: null, notes: null,
      };
      transportFindManyMock.mockResolvedValue([
        // No anchor, no from-Stop, arriving at Porto → after Lisbon.
        { ...leg, id: "tr-1", fromStopId: null, toStopId: "stop-b", anchorStopId: null, sortOrder: 0 },
        // An explicit anchor is carried over — onto the new Stop id.
        { ...leg, id: "tr-2", fromStopId: "stop-a", toStopId: "stop-b", anchorStopId: "stop-b", sortOrder: 1 },
        // Arriving at the first Stop with no from-Stop → the head.
        { ...leg, id: "tr-3", fromStopId: null, toStopId: "stop-a", anchorStopId: null, sortOrder: 2 },
      ]);
      transportCreateMock.mockResolvedValue({ id: "transport-new" });

      await createFork("trip-1", "Plan B");

      const anchors = transportCreateMock.mock.calls.map(
        (c) => (c[0] as { data: { anchorStopId: string | null } }).data.anchorStopId,
      );
      expect(anchors).toEqual(["stop-a-new", "stop-b-new", null]);
    });
```

In `server/actions/trips.test.ts`, change the transport assertion at :1079 to:

```tsx
    // transport remapped to new stop ids, dates cleared, anchored after its
    // from-Stop on the copy (spec 2026-10-04 §D)
    expect(transportCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", fromStopId: "new-s1", toStopId: "new-s2", anchorStopId: "new-s1", depAt: null, arrAt: null, reference: null }) });
```

- [ ] **Step 2: Run it, expect FAIL**

`TZ=UTC npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts server/actions/forks.test.ts server/actions/trips.test.ts`

Expected:
- The builder tests fail because `sourceAnchorStopId` is `undefined` (TS also flags the unknown `anchorStopId` source field on Duplicate).
- The forks test fails: `[undefined, undefined, undefined]`.
- The trips test fails with a missing `anchorStopId: "new-s1"`.

- [ ] **Step 3: Implement**

`lib/fork-plan.ts`:

Header rules (:6-9): add a line after `NULL — …`:

```ts
 *   ANCHOR — each leg's slot (sourceAnchorStopId, a SOURCE stop id; the tx
 *            remaps it onto the variant's own Stop) — spec 2026-10-04 §D
```

Imports (:15):

```ts
import { isOnTrip } from "@/lib/enums";
import { orderPlanStops } from "@/lib/plan-order";
import { creationAnchor } from "@/lib/transport-anchor";
```

`ForkSourceTransport`: after `toStopId: string | null;` (:58) add:

```ts
  /** The leg's explicit slot, when it has one (lib/transport-anchor). */
  anchorStopId?: string | null;
```

`ForkPlan.transports` (:172-174): after `sourceToStopId: string | null;` add:

```ts
    /** The slot the leg renders in, as a SOURCE stop id; null = head of the plan. */
    sourceAnchorStopId: string | null;
```

`buildForkPlan`:

```ts
export function buildForkPlan(source: ForkSource): ForkPlan {
  // The variant keeps every date and sortOrder, so its plan order is the source's.
  const orderedStops = orderPlanStops([...source.stops].sort((a, b) => a.sortOrder - b.sortOrder));
  return {
```

and in the transports mapping (:263-264):

```ts
    transports: source.transports.map((t) => ({
      sourceFromStopId: t.fromStopId, sourceToStopId: t.toStopId,
      sourceAnchorStopId: creationAnchor(t, orderedStops),
      data: {
```

`server/actions/forks.ts` (:236-243), in `tx.transport.create({ data: { … } })` after the `toStopId` line:

```ts
          // The leg's slot, on the variant's own Stop (spec 2026-10-04 §D).
          anchorStopId: t.sourceAnchorStopId ? (stopIdMap.get(t.sourceAnchorStopId) ?? null) : null,
```

`lib/duplicate-trip.ts`:

Imports: add at the top, after the header comment:

```ts
import { creationAnchor } from "@/lib/transport-anchor";
```

`DuplicateSourceTransport`: after `toStopId: string | null;` (:59) add:

```ts
  /** The leg's explicit slot, when it has one (lib/transport-anchor). */
  anchorStopId?: string | null;
```

`DuplicatePlan.transports` (:110-112): after `sourceToStopId: string | null;` add:

```ts
    /** The slot the leg renders in on the copy, as a SOURCE stop id; null = head. */
    sourceAnchorStopId: string | null;
```

`buildDuplicatePlan`: open the function with

```ts
export function buildDuplicatePlan(source: DuplicateSource, newName: string): DuplicatePlan {
  // Every copied Stop is rough, so the copy's plan order (ADR 0038) is plain
  // sortOrder — each leg's slot is resolved against that, not the source's dates.
  const copyOrder = [...source.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
```

and in the transports mapping (:178-180):

```ts
    transports: source.transports.map((t, idx) => ({
      sourceFromStopId: t.fromStopId,
      sourceToStopId: t.toStopId,
      sourceAnchorStopId: creationAnchor(t, copyOrder),
      data: {
```

`server/actions/trips.ts` (:539-545), in `tx.transport.create({ data: { … } })` after the `toStopId` line:

```ts
          // The leg's slot on the copy, on the copy's own Stop (spec 2026-10-04 §D).
          anchorStopId: t.sourceAnchorStopId ? stopIdMap.get(t.sourceAnchorStopId) ?? null : null,
```

- [ ] **Step 4: Run, expect PASS**

`TZ=UTC npx vitest run lib/fork-plan.test.ts lib/duplicate-trip.test.ts server/actions/forks.test.ts server/actions/trips.test.ts lib/transport-anchor.test.ts`

Then `npx tsc --noEmit` and `npx eslint lib/fork-plan.ts lib/duplicate-trip.ts server/actions/forks.ts server/actions/trips.ts`.

The existing Duplicate test "keeps transport connections…" asserts `t.data` with `toEqual`. It still passes because `sourceAnchorStopId` sits outside `data`. The forks "ID-map: transport-owned cost remap" test has no Stops, so its leg anchors to `null`, which it doesn't assert.

- [ ] **Step 5: Commit**

```bash
git add lib/fork-plan.ts lib/fork-plan.test.ts lib/duplicate-trip.ts lib/duplicate-trip.test.ts server/actions/forks.ts server/actions/forks.test.ts server/actions/trips.ts server/actions/trips.test.ts
git commit -m "$(cat <<'EOF'
feat(transport): forks and duplicates copy each leg's slot

Fork resolves against the source's plan order, Duplicate against the
copy's sortOrder order (every copied Stop is rough); both remap the
anchor onto the new Stop ids.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18 — D4: The real-trip importer and the demo seed create legs with their slot

**Files:**
- Modify: `lib/demo/types.ts` (imports :1-3; append after `planFlagInput`)
- Test: `lib/demo/types.test.ts` (append)
- Modify: `prisma/real/persist.ts` (import :26; transports loop :226-238)
- Test: `prisma/real/persist.test.ts` (inside `describe("persistRealTrip", …)`, after "wires all 13 legs…" ~:376)
- Modify: `prisma/demo/persist.ts` (import :24; transports loop :439-461)

**Interfaces:**
- Consumes: `creationAnchor` (D1), `orderPlanStops`.
- Produces: `demoLegAnchorKeys(plan: Pick<DemoPlan, "stops" | "transports">): Map<Key, Key | null>`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/demo/types.test.ts` (extend the import with `demoLegAnchorKeys` and `type DemoTransport`):

```tsx
describe("demoLegAnchorKeys (spec 2026-10-04 §D)", () => {
  it("gives each leg the stop key of the slot it resolves to in plan order; the head is null", () => {
    // sortOrder: Paris, Lucerne (rough), Rome — but Rome's dates come first,
    // so plan order is Rome, Lucerne, Paris (ADR 0038).
    const rome: DemoStop = { key: "s3", name: "Rome", arriveDate: "2026-12-20", departDate: "2026-12-24", sortOrder: 2 };
    const leg = (key: string, o: Partial<DemoTransport>): DemoTransport => ({ key, mode: "TRAIN", sortOrder: 0, ...o });
    const keys = demoLegAnchorKeys({
      stops: [scheduled, rough, rome],
      transports: [
        leg("t1", { fromStopKey: "s1" }),                        // leaves Paris
        leg("t2", { depPlace: "Zürich", toStopKey: "s1" }),      // arrives at Paris → after Lucerne
        leg("t3", { depIsHome: true, toStopKey: "s3" }),         // arrives at the first Stop → head
        leg("t4", { depPlace: "A", arrPlace: "B" }),             // no Stop at all → head
      ],
    });
    expect([...keys]).toEqual([["t1", "s1"], ["t2", "s2"], ["t3", null], ["t4", null]]);
  });
});
```

In `prisma/real/persist.test.ts`, add after the "wires all 13 legs to the right endpoint stops and home flags" test:

```tsx
  it("anchors every leg to the slot the timeline renders it in (spec 2026-10-04 §D)", () => {
    const EXPECTED: [number, string | null][] = [
      [0, null], // Gold Coast → Denpasar: arrives at the first Stop, the head
      [1, "Denpasar"], [2, "Munich"], [3, "Strasbourg"], [4, "Frankfurt"], [5, "Paris"],
      [6, "London"], [7, "Aghalee"], [8, "Dublin"],
      [9, "Dublin"], // Malpensa → Como: no from-Stop, so it sits before Como
      [10, "Como"], [11, "Milan"], [12, "Rome"],
    ];
    const bySort = new Map(trRows.map((d) => [d.sortOrder as number, d]));
    for (const [sort, stop] of EXPECTED) {
      expect(bySort.get(sort)!.anchorStopId, `leg #${sort}`).toBe(stop === null ? null : stopIdByName.get(stop));
    }
  });
```

- [ ] **Step 2: Run it, expect FAIL**

`TZ=UTC npx vitest run lib/demo/types.test.ts prisma/real/persist.test.ts`

Expected: `demoLegAnchorKeys` is not exported (types test); `leg #0`: expected `null` but got `undefined`, and `leg #1` gets `undefined` instead of `stop_0` (persist test).

- [ ] **Step 3: Implement**

`lib/demo/types.ts`, add after the three `import type` lines:

```ts
import { orderPlanStops } from "@/lib/plan-order";
import { creationAnchor } from "@/lib/transport-anchor";
```

and append at the end of the file:

```ts
/**
 * Each leg's creation anchor as a Stop key (spec 2026-10-04 §D): the slot the
 * timeline would resolve it to in this plan's canonical order (ADR 0038), the
 * head as null. The persisters map the key to the new Stop id.
 */
export function demoLegAnchorKeys(plan: Pick<DemoPlan, "stops" | "transports">): Map<Key, Key | null> {
  const ordered = orderPlanStops(
    [...plan.stops]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.key, sortOrder: s.sortOrder, arriveDate: s.arriveDate ?? null, departDate: s.departDate ?? null })),
  );
  return new Map(
    plan.transports.map((t) => [t.key, creationAnchor({ fromStopId: t.fromStopKey, toStopId: t.toStopKey }, ordered)]),
  );
}
```

`prisma/real/persist.ts`. Import (:26), replacing `import type { DemoTrip } from "@/lib/demo/types";`:

```ts
import { demoLegAnchorKeys, type DemoTrip } from "@/lib/demo/types";
```

`lib/demo/types` stays db-free (pure helpers only), so the lazy-`db` rule in this file's header still holds. Transports loop (:226-233):

```ts
  // --- Transports (+ costs) ---
  // Each leg is created with the slot the timeline would resolve it to
  // (spec 2026-10-04 §D) — the head stays null.
  const anchorKeys = demoLegAnchorKeys(trip);
  for (const t of trip.transports) {
    const anchorKey = anchorKeys.get(t.key) ?? null;
    const dbT = await db.transport.create({
      data: {
        tripId,
        fromStopId: t.fromStopKey ? (id.get(t.fromStopKey) ?? null) : null,
        toStopId: t.toStopKey ? (id.get(t.toStopKey) ?? null) : null,
        anchorStopId: anchorKey ? (id.get(anchorKey) ?? null) : null,
        depIsHome: t.depIsHome ?? false, arrIsHome: t.arrIsHome ?? false,
```

(the rest of the `data` object is unchanged).

`prisma/demo/persist.ts`. Import (:24), replacing `import type { DemoGlobe, DemoTrip, DemoPlan, Who } from "@/lib/demo/types";`:

```ts
import { demoLegAnchorKeys, type DemoGlobe, type DemoTrip, type DemoPlan, type Who } from "@/lib/demo/types";
```

Transports loop in `persistPlan` (:439-447):

```ts
    // --- Transports ---
    // Created with the slot the timeline would resolve them to (spec 2026-10-04 §D).
    const anchorKeys = demoLegAnchorKeys(plan);
    for (const t of plan.transports) {
      const anchorKey = anchorKeys.get(t.key) ?? null;
      const dbT = await db.transport.create({
        data: {
          tripId,
          forkId: forkId ?? null,
          fromStopId: t.fromStopKey ? (id.get(t.fromStopKey) ?? null) : null,
          toStopId: t.toStopKey ? (id.get(t.toStopKey) ?? null) : null,
          anchorStopId: anchorKey ? (id.get(anchorKey) ?? null) : null,
          depIsHome: t.depIsHome ?? false,
```

(the rest of the `data` object is unchanged).

- [ ] **Step 4: Run, expect PASS**

`TZ=UTC npx vitest run lib/demo/types.test.ts prisma/real/persist.test.ts prisma/demo/persist.test.ts lib/demo/index.test.ts lib/demo/eu-trip.test.ts lib/demo/alpine-trip.test.ts`

Then `npx tsc --noEmit` and `npx eslint lib/demo/types.ts prisma/real/persist.ts prisma/demo/persist.ts`.

No existing assertions change. The demo `persistTrip` has no unit harness; its wiring is the two lines above, covered by `demoLegAnchorKeys`'s test and by `tsc`. Do **not** run either seed script: both point at production in this sandbox.

- [ ] **Step 5: Commit**

```bash
git add lib/demo/types.ts lib/demo/types.test.ts prisma/real/persist.ts prisma/real/persist.test.ts prisma/demo/persist.ts
git commit -m "$(cat <<'EOF'
feat(transport): importer and demo seed create legs with their slot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Part A

## Part A notes

- **Key files.** `components/plan/stop-open-body.tsx` (the days area only: the `rough ? … : …` branch), `components/plan/selected-day.tsx` → renamed `components/plan/day-section.tsx` (`SelectedDay` → `DaySection`), `components/plan/day-strip.tsx` + `lib/plan/strip-scroll.ts` (deleted: nothing else imports them; `components/trip/day/day-strip.tsx` is the unrelated Day-view strip and stays), `components/plan/plan-body.tsx` (per-stop `days`/`selectedDay`/`selectDay` go; `claimHashDay` comes in), new `lib/plan/day-collapse.ts`, `components/trip/itinerary-manager.tsx` (import path, `revealDay`, `onScheduleIdea`, `stopNames`), `components/plan/mobile/stop-sheet.tsx` (marker only), `lib/stop-days.ts` (`ownerMarker`), `lib/scroll-to.ts` (`whenScrollSettles`), `app/globals.css` (`tp-slot-flash` → `tp-day-flash`).
- **Part B boundary.** These tasks never touch the top row of `StopOpenBody` (`<div className="flex items-stretch gap-2.5">` holding `StayChip` + `IdeasBox`) or the stay props (`stay`, `onOpenStay`, `onAddStay`). They do edit the same file's imports, the props interface (adding `onScheduleIdea` and `stopNames` straight after `flashDate`) and `stop-open-body.test.tsx`, so whichever part lands second rebases. Run Part A first: A2 rewrites most of that test file.
- **Spec conflict, flagged and NOT changed:** §A says "`resolveItemDrop` / `planCollisionDetection` keep their contract … dragging onto another Stop's day still works". The contract (spec D5, `plan-dnd.ts`) is *same-Stop only*, and an existing test says "a drop on another stop's slot does nothing". This plan keeps D5 as it is. Every Stop's day sections are still registered drop targets, but a drop on another Stop's day is a no-op, exactly as on the strip. If Cam meant real cross-Stop moves, that is a new `resolveItemDrop` rule plus an ADR 0049 rule 4 check, and needs its own task.
- **dnd-kit gotcha.** Droppable rects are measured at drag start. When a folded day opens mid-drag (hover-open), every section below it moves but keeps its stale rect. `DaySection` passes `resizeObserverConfig: { updateMeasurementsFor: [] }`: in dnd-kit 6.3.1, `useDroppableMeasuring` with an empty queue re-measures *every* droppable, not just the one that resized (`node_modules/@dnd-kit/core/dist/core.esm.js` ~:1999–2010).
- **Test-harness gotchas.** `setMatchMedia` from `@/test/setup` is NOT reset between tests, so every test that sets it restores the default `(q) => q === "(min-width: 640px)"`. localStorage persists across tests in one file, so test files that fold days clear it and call `resetDayCollapse()` in `beforeEach`. jsdom's `window.scrollTo` must be stubbed wherever a scroll fires.
- **Judgement calls inside the spec (call out in review):**
  - A plan hovering a folded day opens it, and that open is remembered like a click.
  - Scheduling an idea onto a folded day opens that day as well as scrolling to and flashing it.
  - The once-per-session drag hint shows under the first day that has plans, not under every day.
  - "or pick an idea" opens a menu of the Stop's ideas under the link, and one pick schedules it onto that day.
  - The ADR 0049 marker shows whenever an Item's `stopId` is another Stop's. Cards are handed Items by date coverage (`groupScheduledItemsByStop`), so in practice that only happens on a Changeover day.
- **Not changed:** the phone list and stop sheet layout (only the marker is added), `CONTEXT.md` (its Changeover day entry already says the owner is "marked plainly on the card that does not own it"), and the help guide (it never mentions the strip). Stale folded keys (for a date a Stop no longer covers) stay in storage. If the stay grows back over that date, the day comes back folded. This is harmless and noted only.
- **Feedback trailer.** `Resolves-Feedback: cmut6gke4000104lfe5qiwt4w` goes on A2, the commit that replaces the strip. A1 and A3–A6 carry only Co-Authored-By. Part I has no note.

## Review-focus candidates

1. **Storage that refuses or holds junk** (private mode, quota, a hand-edited value): a folded day still folds for this visit (kept in memory), junk reads as "every day open", and nothing throws. Tests: A1 (`setItem` throws, junk JSON) and A2 (folding through the UI with `setItem` throwing).
2. **`#open=a,b&day=<Changeover day>` with both Stops open:** only the first Stop's section opens and scrolls; the second stays as it was, and the window scrolls once. Test: A3.
3. **An Item whose owner is unknown or missing** (`stopId: null` after a gap-day re-file, ADR 0049's known gap; or an owner id with no name): it gets no marker, and only an Item owned by another named Stop gets "· {Stop}". Tests: A6 (`ownerMarker` unit, DaySection, StopSheet, ItineraryManager desktop and phone).

---

### Task 19 — A1: Folded-day store (localStorage per Trip, try/catch, in-memory fallback)

**Files:**
- Create: `lib/plan/day-collapse.ts`
- Test: `lib/plan/day-collapse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by A2–A4):
  - `dayCollapseKey(stopId: string, dateISO: string): string` → `"<stopId>:<date>"`
  - `readCollapsedRaw(tripId: string): string` (a stable snapshot string, `""` when nothing is stored)
  - `parseCollapsed(raw: string): ReadonlySet<string>`
  - `setDayCollapsed(tripId: string, stopId: string, dateISO: string, collapsed: boolean): void`
  - `subscribeCollapsed(listener: () => void): () => void`
  - `resetDayCollapse(): void` (tests only)
  - Storage key: `teepee.plan.collapsedDays.<tripId>` holding a JSON array of keys

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  dayCollapseKey,
  parseCollapsed,
  readCollapsedRaw,
  resetDayCollapse,
  setDayCollapsed,
  subscribeCollapsed,
} from "./day-collapse";

const KEY = "teepee.plan.collapsedDays.t1";

beforeEach(() => {
  resetDayCollapse();
  window.localStorage.clear();
});

describe("day collapse store (spec 2026-10-04 §A)", () => {
  it("every day starts open: nothing stored reads as an empty set", () => {
    expect(readCollapsedRaw("t1")).toBe("");
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
  });

  it("folding keeps only the folded days, per Trip, keyed by Stop and date", () => {
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-12", true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["par:2026-12-11", "par:2026-12-12"]);
    expect(parseCollapsed(readCollapsedRaw("t1")).has(dayCollapseKey("par", "2026-12-11"))).toBe(true);
    expect(readCollapsedRaw("t2")).toBe("");
  });

  it("a Changeover day folds separately under each of its Stops", () => {
    setDayCollapsed("t1", "par", "2026-12-15", true);
    const folded = parseCollapsed(readCollapsedRaw("t1"));
    expect(folded.has("par:2026-12-15")).toBe(true);
    expect(folded.has("rom:2026-12-15")).toBe(false);
  });

  it("opening the last folded day removes the key", () => {
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-11", false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("notifies subscribers on a change, not on a no-op", () => {
    const listener = vi.fn();
    const off = subscribeCollapsed(listener);
    setDayCollapsed("t1", "par", "2026-12-11", true);
    setDayCollapsed("t1", "par", "2026-12-11", true);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    setDayCollapsed("t1", "par", "2026-12-11", false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("junk in storage reads as every day open", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify({ par: true }));
    expect(parseCollapsed(readCollapsedRaw("t1")).size).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify(["par:2026-12-11", 7, null]));
    expect([...parseCollapsed(readCollapsedRaw("t1"))]).toEqual(["par:2026-12-11"]);
  });

  it("storage that refuses writes still folds the day for this visit", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      setDayCollapsed("t1", "par", "2026-12-11", true);
      expect(parseCollapsed(readCollapsedRaw("t1")).has("par:2026-12-11")).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });

  it("storage that refuses reads reads as every day open", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    try {
      expect(readCollapsedRaw("t1")).toBe("");
    } finally {
      getItem.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `TZ=UTC npx vitest run lib/plan/day-collapse.test.ts` should fail with `Failed to resolve import "./day-collapse"`.

- [ ] **Step 3: Implement** by creating `lib/plan/day-collapse.ts`:

```ts
/**
 * Which day sections of the desktop open Stop card a Traveller has folded
 * (spec 2026-10-04 §A). A per-viewer convenience: every day starts open, and
 * only the folded ones are kept — per Trip, in localStorage, as a JSON list
 * of `<stopId>:<date>` keys, so a Changeover day folds separately under each
 * of its two Stops. Storage that throws or holds junk reads as "every day
 * open"; a write that throws still folds the day until the next reload.
 *
 * Pure module, no React: StopOpenBody subscribes through useSyncExternalStore
 * (the same shape as lib/offline-status.ts).
 */

const STORAGE_PREFIX = "teepee.plan.collapsedDays.";
const EMPTY: ReadonlySet<string> = new Set();

/** Filled only when localStorage refused a write; wins over storage until a write gets through. */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function dayCollapseKey(stopId: string, dateISO: string): string {
  return `${stopId}:${dateISO}`;
}

/** The stored list as its raw string — a stable snapshot for useSyncExternalStore. "" when nothing is stored or storage can't be read. */
export function readCollapsedRaw(tripId: string): string {
  const remembered = memory.get(tripId);
  if (remembered !== undefined) return remembered;
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + tripId) ?? "";
  } catch {
    return "";
  }
}

export function parseCollapsed(raw: string): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? new Set(value.filter((v): v is string => typeof v === "string")) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function setDayCollapsed(tripId: string, stopId: string, dateISO: string, collapsed: boolean): void {
  const next = new Set(parseCollapsed(readCollapsedRaw(tripId)));
  const key = dayCollapseKey(stopId, dateISO);
  if (next.has(key) === collapsed) return;
  if (collapsed) next.add(key);
  else next.delete(key);
  const raw = next.size > 0 ? JSON.stringify([...next]) : "";
  try {
    if (raw) window.localStorage.setItem(STORAGE_PREFIX + tripId, raw);
    else window.localStorage.removeItem(STORAGE_PREFIX + tripId);
    memory.delete(tripId);
  } catch {
    // Full or blocked (private mode): fold it for this visit anyway.
    memory.set(tripId, raw);
  }
  for (const listener of listeners) listener();
}

export function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: forget the in-memory fallback. */
export function resetDayCollapse(): void {
  memory.clear();
}
```

- [ ] **Step 4: Run, expect PASS.** Run `TZ=UTC npx vitest run lib/plan/day-collapse.test.ts components/plan/banned-classes.test.ts`, then `npx eslint lib/plan/day-collapse.ts lib/plan/day-collapse.test.ts` and `npx tsc --noEmit`. No existing test changes.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/day-collapse.ts lib/plan/day-collapse.test.ts
git commit -m "feat(plan): remember folded plan days per Trip on this device

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20 — A2: Every day of an open Stop as a full, foldable day section (the strip goes)

**Files:**
- Rename + modify: `components/plan/selected-day.tsx` → `components/plan/day-section.tsx` (whole file; `SelectedDay` → `DaySection`)
- Rename + modify: `components/plan/selected-day.test.tsx` → `components/plan/day-section.test.tsx`
- Modify: `components/plan/stop-open-body.tsx` (whole file below the props: imports, the `selected`/`dir`/`onSelect` state, the dated branch :140–190)
- Modify: `components/plan/stop-open-body.test.tsx` (whole file)
- Modify: `components/plan/motion.test.tsx` (imports :19–22; `renderStrip` :118–121; describes P3 :123–148, P4 :150–156, P5 :158–186, P6 :188–218, P7's second test :234–247)
- Modify: `components/plan/motion-reduced.test.tsx` (imports :21–26, fixtures :30–34, test "P3" :46–58)
- Modify: `components/trip/itinerary-manager.tsx:25` (import path)
- Modify: `components/trip/itinerary-manager.test.tsx` (:2136–2171, :2326–2330, :2630, :2644)
- Modify: `lib/plan/day-density.ts:68–76` (delete `defaultSelectedDay`), `lib/plan/day-density.test.ts:2, :50–60`
- Modify: `app/globals.css:694–695` (`tp-slot-flash` → `tp-day-flash`)
- Delete: `components/plan/day-strip.tsx`, `components/plan/day-strip.test.tsx`, `lib/plan/strip-scroll.ts`, `lib/plan/strip-scroll.test.ts`

**Interfaces:**
- Consumes: A1's `dayCollapseKey`, `parseCollapsed`, `readCollapsedRaw`, `setDayCollapsed`, `subscribeCollapsed`.
- Produces (from `components/plan/day-section.tsx`):
  - `ITEM_DRAG_PREFIX` and `claimDragHint()` (moved unchanged)
  - `SLOT_DROP_PREFIX = "slot:"`, `slotDropId(stopId, dateISO)` (moved from day-strip)
  - `daySectionId(stopId: string, dateISO: string): string` → `plan-day-<stopId>-<date>` (A3, A4)
  - `HOVER_OPEN_MS = 600`
  - `useHoverOpen(armed: boolean, onOpen: () => void, delayMs?: number): void`
  - `DaySection` with props `{ tripId; stopId; dateISO; dayTitle?; items; costsById?; homeCurrency?; ideasCount; collapsed: boolean; onCollapsedChange(collapsed: boolean): void; flash?: boolean; showDragHint; onAdd(dateISO); onEditItem(item); onPickIdea() }`. A5 swaps `ideasCount`/`onPickIdea` for `ideas`/`onScheduleIdea`; A6 adds `stopNames?`.
  - Section DOM: `<section id={daySectionId} aria-labelledby={toggleId} data-day data-over data-flash>`, so its role is `region` and its name is the date toggle's text, e.g. "FRI 11 DEC". The toggle is `<button aria-expanded>`.
- `StopOpenBodyProps` is unchanged in A2.

- [ ] **Step 1: Write the failing tests**

First do the renames so the tests point at the new module:

```bash
git mv components/plan/selected-day.tsx components/plan/day-section.tsx
git mv components/plan/selected-day.test.tsx components/plan/day-section.test.tsx
```

Replace `components/plan/day-section.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, useDndContext } from "@dnd-kit/core";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { DaySection, HOVER_OPEN_MS, claimDragHint, daySectionId, useHoverOpen } from "./day-section";
import { setDayTitle } from "@/server/actions/day-titles";
import { formatMoney } from "@/lib/money";

// testing-library's getByText only normalises the DOM node's own text before
// comparing, not the matcher string (@testing-library/dom's matches()) — so
// an exact-string query built from formatMoney() must be pre-normalised too,
// since Intl's small-icu currency fallback ("EUR<NBSP>22.00") uses a
// non-breaking space the node-side normaliser collapses to a plain space.
const money = (minor: number, currency: string) => formatMoney(minor, currency).replace(/\s+/g, " ");

const ITEMS = [
  { id: "a", title: "Café Kitsuné", category: "FOOD", date: "2026-12-11", startTime: "09:00", address: "Palais Royal" },
  { id: "b", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00", booking: "LVR-123", notes: "Richelieu entrance" },
  { id: "c", title: "Picnic", category: "FOOD", date: "2026-12-11", hiddenFromShares: true },
];
const COSTS = new Map([["b", [{ id: "k", costMinor: 2200, paidMinor: null, currency: "EUR", rateToHome: 1.65, paidAt: null, dueDate: null, ownerType: "ITEM", ownerId: "b", label: null, category: null, settlement: "BEFORE" }]]]);

function dayProps(p = {}) {
  return {
    tripId: "t1", stopId: "par", dateISO: "2026-12-11", dayTitle: "Museums & Septime", items: ITEMS, costsById: COSTS, homeCurrency: "EUR",
    ideasCount: 3, collapsed: false, onCollapsedChange: vi.fn(), showDragHint: true, onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(),
    ...p,
  };
}
function renderDay(p = {}) {
  const props = dayProps(p);
  return { props, ...render(<DaySection {...props} />) };
}

describe("DaySection (PLAN.md §4.3; spec 2026-10-04 §A)", () => {
  it("a region named by its date toggle, open, with a sun head", () => {
    renderDay();
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section).toHaveAttribute("id", daySectionId("par", "2026-12-11"));
    expect(section).toHaveAttribute("data-day", "2026-12-11");
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`3 plans · 1 booked · ${money(2200, "EUR")} so far`)).toBeInTheDocument();
  });

  it("Open day links to the Day view; + Add presets the date", async () => {
    const { props } = renderDay();
    const openDay = screen.getByRole("link", { name: /Open day/ });
    expect(openDay).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(openDay.className).toContain("tap-target");
    const addButton = screen.getByRole("button", { name: "+ Add" });
    expect(addButton.className).toContain("tap-target");
    await userEvent.click(addButton);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("rows: time or dash, title, sub line, Booked, cost, EyeOff; click edits", async () => {
    const { props } = renderDay();
    expect(screen.getByText("09:00").className).toContain("tabular-nums");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Palais Royal")).toBeInTheDocument();
    expect(screen.getByText("Richelieu entrance")).toBeInTheDocument();
    expect(screen.getByText(/Booked/)).toBeInTheDocument();
    expect(screen.getByText(money(2200, "EUR"))).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hidden from shares" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit Louvre" });
    expect(editButton.className).toContain("tap-target");
    await userEvent.click(editButton);
    expect(props.onEditItem).toHaveBeenCalledWith(ITEMS[1]);
    const grip = screen.getByRole("button", { name: "Drag Louvre to another day" });
    expect(grip.className).toContain("tap-target");
  });

  it("edits the day title inline: Enter saves via setDayTitle", async () => {
    renderDay();
    const editTitle = screen.getByRole("button", { name: /Edit the day title/ });
    expect(editTitle.className).toContain("tap-target");
    await userEvent.click(editTitle);
    const input = screen.getByRole("textbox", { name: /Day title/ });
    await userEvent.clear(input);
    await userEvent.type(input, "Paris museums{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Paris museums" });
  });

  it("untitled: Add a title", () => {
    renderDay({ dayTitle: undefined });
    expect(screen.getByRole("button", { name: /Add a title/ })).toBeInTheDocument();
  });

  it("empty day: Nothing planned yet, + Add to Fri 11, or pick an idea", async () => {
    const { props } = renderDay({ items: [] });
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    const addToDay = screen.getByRole("button", { name: "+ Add to Fri 11" });
    expect(addToDay.className).toContain("tap-target");
    await userEvent.click(addToDay);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
    await userEvent.click(screen.getByRole("button", { name: "or pick an idea" }));
    expect(props.onPickIdea).toHaveBeenCalled();
  });

  it("footer: + Add to the day and the reworded drag hint only when asked", () => {
    const { rerender, props } = renderDay();
    expect(screen.getByText("Drag a plan onto another day to move it")).toBeInTheDocument();
    rerender(<DaySection {...props} showDragHint={false} />);
    expect(screen.queryByText("Drag a plan onto another day to move it")).toBeNull();
  });

  it("folded: the header line only — date, Day title, summary; no rows, Open day or + Add", () => {
    renderDay({ collapsed: true });
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Edit the day title/ })).toBeInTheDocument();
    expect(screen.getByText(/^3 plans/)).toBeInTheDocument();
    expect(screen.queryByText("Louvre")).toBeNull();
    expect(screen.queryByRole("link", { name: /Open day/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  });

  it("the date toggle and the bare header fold it; the header's own controls don't", async () => {
    const { props } = renderDay();
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(props.onCollapsedChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByText(/^3 plans/));
    expect(props.onCollapsedChange).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
    expect(props.onCollapsedChange).toHaveBeenCalledTimes(2);
  });

  it("a folded day's toggle opens it", async () => {
    const { props } = renderDay({ collapsed: true });
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("the day a plan landed on flashes", () => {
    renderDay({ flash: true });
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section).toHaveAttribute("data-flash");
    expect(section.className).toContain("data-[flash]:tp-day-flash");
  });

  it("folded or open, the section is the day's drop target slot:<stopId>:<date>", async () => {
    function Probe() {
      const { droppableContainers } = useDndContext();
      return <output data-testid="probe">{JSON.stringify(droppableContainers.get("slot:par:2026-12-11")?.data.current ?? null)}</output>;
    }
    render(
      <DndContext>
        <DaySection {...dayProps({ collapsed: true })} />
        <Probe />
      </DndContext>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent('{"type":"slot","stopId":"par","date":"2026-12-11"}'));
  });

  it("claimDragHint is true once per session", () => {
    sessionStorage.clear();
    expect(claimDragHint()).toBe(true);
    expect(claimDragHint()).toBe(false);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderDay();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("useHoverOpen (a plan held over a folded day opens it)", () => {
  it("opens once the plan has hovered for HOVER_OPEN_MS, and only once", () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn();
      renderHook(({ armed }) => useHoverOpen(armed, onOpen), { initialProps: { armed: true } });
      vi.advanceTimersByTime(HOVER_OPEN_MS - 1);
      expect(onOpen).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onOpen).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(HOVER_OPEN_MS * 3);
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a plan that moves on before the delay opens nothing", () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn();
      const { rerender } = renderHook(({ armed }) => useHoverOpen(armed, onOpen), { initialProps: { armed: true } });
      vi.advanceTimersByTime(HOVER_OPEN_MS / 2);
      rerender({ armed: false });
      vi.advanceTimersByTime(HOVER_OPEN_MS * 2);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

Replace `components/plan/stop-open-body.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));

import { PlanBody } from "./plan-body";
import { StopOpenBody } from "./stop-open-body";
import { daySlots } from "@/lib/plan/day-density";
import { resetDayCollapse } from "@/lib/plan/day-collapse";

const PARIS = { id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14", nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null };
const MUNICH = { ...PARIS, id: "mun", name: "Munich", arriveDate: null, departDate: null, nights: 5, timezone: null };
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const baseProps = (over = {}) => ({
  tripId: "t1", stop: PARIS, slots: daySlots(PARIS, ITEMS), dayItems: ITEMS, ideas: [], stay: null,
  counts: { files: 2, notes: 3, reminders: 1 }, showDragHint: false,
  onOpenStay: vi.fn(), onAddStay: vi.fn(), onAddIdea: vi.fn(), onOpenIdea: vi.fn(), onAddPlan: vi.fn(),
  onEditItem: vi.fn(), onGiveDates: vi.fn(), onOpenExtras: vi.fn(), ...over,
});
const wrap = (ui: React.ReactNode, today = "2026-12-30") => render(<PlanBody initialOpen={["par"]} today={today}>{ui}</PlanBody>);
const day = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  window.localStorage.clear();
  resetDayCollapse();
  window.history.replaceState(null, "", "/trips/t1/plan");
});

describe("StopOpenBody (PLAN.md §4, §5; spec D2; spec 2026-10-04 §A)", () => {
  it("dated: every day of the stay is a full day section, in date order, every one open", () => {
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("data-day"))).toEqual([
      "2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14",
    ]);
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(5);
    expect(day("FRI 11 DEC")).toHaveTextContent("Louvre");
    expect(within(day("SAT 12 DEC")).getByText("Nothing planned yet")).toBeInTheDocument();
  });

  it("a day's header folds it to its header line, remembered on this device per Trip", async () => {
    const { unmount } = wrap(<StopOpenBody {...baseProps()} />);
    await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(day("FRI 11 DEC")).not.toHaveTextContent("Louvre"));
    expect(day("FRI 11 DEC")).toHaveTextContent("1 plan");
    expect(within(day("FRI 11 DEC")).queryByRole("link", { name: /Open day/ })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("teepee.plan.collapsedDays.t1")!)).toEqual(["par:2026-12-11"]);
    unmount();
    wrap(<StopOpenBody {...baseProps()} />);
    expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "SAT 12 DEC" })).toHaveAttribute("aria-expanded", "true");
  });

  it("storage that refuses writes (private mode): the day still folds for this visit", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      wrap(<StopOpenBody {...baseProps({ tripId: "t-private" })} />);
      await userEvent.click(screen.getByRole("button", { name: "FRI 11 DEC" }));
      expect(screen.getByRole("button", { name: "FRI 11 DEC" })).toHaveAttribute("aria-expanded", "false");
    } finally {
      setItem.mockRestore();
    }
  });

  it("the drag hint shows once, under the first day with plans", () => {
    const items = [...ITEMS, { id: "b", title: "Orsay", category: "SIGHTSEEING", date: "2026-12-13" }];
    wrap(<StopOpenBody {...baseProps({ dayItems: items, slots: daySlots(PARIS, items), showDragHint: true })} />);
    expect(screen.getAllByText("Drag a plan onto another day to move it")).toHaveLength(1);
    expect(within(day("FRI 11 DEC")).getByText("Drag a plan onto another day to move it")).toBeInTheDocument();
  });

  it("the day a plan landed on flashes", () => {
    wrap(<StopOpenBody {...baseProps({ flashDate: "2026-12-12" })} />);
    expect(day("SAT 12 DEC")).toHaveAttribute("data-flash");
    expect(day("FRI 11 DEC")).not.toHaveAttribute("data-flash");
  });

  it("the quiet link row: 2 files · 3 notes · 1 reminder, each opening its dialog", async () => {
    const props = baseProps();
    wrap(<StopOpenBody {...props} />);
    const row = screen.getByTestId("stop-extras-links");
    expect(row.className).toContain("text-[13px]");
    await userEvent.click(within(row).getByRole("button", { name: "3 notes" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("notes");
    await userEvent.click(within(row).getByRole("button", { name: "2 files" }));
    expect(props.onOpenExtras).toHaveBeenCalledWith("files");
    expect(within(row).getByRole("button", { name: "1 reminder" })).toBeInTheDocument();
  });

  it("no extras: no link row", () => {
    wrap(<StopOpenBody {...baseProps({ counts: { files: 0, notes: 0, reminders: 0 } })} />);
    expect(screen.queryByTestId("stop-extras-links")).toBeNull();
  });

  it("rough: Needs dates first, ideas, Give it dates; no day sections", async () => {
    const props = baseProps({ stop: MUNICH, slots: [], dayItems: [] });
    wrap(<StopOpenBody {...props} />);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Give it dates" }));
    expect(props.onGiveDates).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    const { container } = wrap(<StopOpenBody {...baseProps()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

Make these edits in `components/plan/motion.test.tsx`:
- Imports: delete `import { DayStrip } from "./day-strip";`, `import { PlanBody } from "./plan-body";` and `import { StopOpenBody } from "./stop-open-body";`, and replace `import { SelectedDay } from "./selected-day";` with:

```tsx
import { DaySection } from "./day-section";
import type { StopDayItem } from "@/lib/stop-days";
```
- Delete `renderStrip` (:118–121), the whole `describe("P4 strip overflow")`, and the P5 test "the strip band scales in from the left when a day is titled".
- Replace `describe("P3 select a day", …)` with:

```tsx
const dayProps = {
  tripId: "t1", stopId: "par", dateISO: "2026-12-11", items: [] as StopDayItem[], ideasCount: 0, collapsed: false,
  onCollapsedChange: vi.fn(), showDragHint: false, onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(),
};

describe("P3 fold a day", () => {
  it("the day's rows sit in a height-animated motion.div; the chevron turns", () => {
    const { container } = render(<DaySection {...dayProps} items={ITEMS} />);
    expect(container.querySelector("[data-motion='day-fold']")!.className).toContain("overflow-hidden");
    const chevron = screen.getByRole("button", { name: "FRI 11 DEC" }).querySelector("svg")!;
    expect(chevron.getAttribute("class")).toContain("transition-transform");
    expect(chevron.getAttribute("class")).not.toContain("-rotate-90");
  });

  it("folding keeps the rows, inert, until their exit finishes", async () => {
    const { container, rerender } = render(<DaySection {...dayProps} items={ITEMS} />);
    rerender(<DaySection {...dayProps} items={ITEMS} collapsed />);
    const leaving = container.querySelector("[data-motion='day-fold']");
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    await waitFor(() => expect(container.querySelector("[data-motion='day-fold']")).toBeNull());
    expect(screen.getByRole("button", { name: "FRI 11 DEC" }).querySelector("svg")!.getAttribute("class")).toContain("-rotate-90");
  });
});
```
- In `describe("P5 day title edit")`, delete its local `const dayProps = {…}` and keep "the saved title pops" exactly as is. It now uses the file-level `dayProps`, and its `<SelectedDay …>` becomes `<DaySection …>` in both places.
- Replace the body of `describe("P6 drag a plan", …)` with:

```tsx
  it("a day under a dragged plan is outlined; the day it lands on flashes", () => {
    render(<DaySection {...dayProps} flash />);
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section.className).toContain("data-[over]:outline-coral");
    expect(section).toHaveAttribute("data-flash");
    expect(section.className).toContain("data-[flash]:tp-day-flash");
  });
```
- Replace P7's second test, "a row new to the selected day rises in…", with:

```tsx
  it("a row new to the day rises in; the ones already there don't", () => {
    const { container, rerender } = render(<DaySection {...dayProps} items={ITEMS} />);
    expect(container.querySelector("[data-row]")!.className).not.toContain("tp-rise-in");
    rerender(<DaySection {...dayProps} items={[...ITEMS, { id: "n", title: "Orsay", category: "SIGHTSEEING", date: "2026-12-11" }]} />);
    const rows = container.querySelectorAll("[data-row]");
    expect(rows[0].className).not.toContain("tp-rise-in");
    expect(rows[1].className).toContain("tp-rise-in");
    endAnimation(rows[1] as HTMLElement);
    expect(container.querySelectorAll("[data-row]")[1].className).not.toContain("tp-rise-in");
  });
```

Make these edits in `components/plan/motion-reduced.test.tsx`:
- Imports: delete `PlanBody`, `StopOpenBody` and `daySlots`, and add `import { DaySection } from "./day-section";`. Delete the now-unused `PARIS` fixture and keep `ITEMS`.
- Replace the test "P3: a new day's plans show within the fade, not after a 180ms exit" with:

```tsx
  it("P3: folding a day removes its rows at once", async () => {
    const day = (collapsed: boolean) => (
      <DaySection
        tripId="t1" stopId="par" dateISO="2026-12-11" items={ITEMS} ideasCount={0} collapsed={collapsed}
        onCollapsedChange={vi.fn()} showDragHint={false} onAdd={vi.fn()} onEditItem={vi.fn()} onPickIdea={vi.fn()}
      />
    );
    const { container, rerender } = render(day(false));
    rerender(day(true));
    await waitFor(() => expect(container.querySelector("[data-motion='day-fold']")).toBeNull(), FAST);
  });
```

Make these edits in `components/trip/itinerary-manager.test.tsx`:
- :2136 rename the test to `"an open stop's day section shows its day items"`. Its last line (:2170) becomes:

```tsx
    expect(desktop().getByRole("region", { name: /11 JUL/ })).toHaveTextContent("Colosseum");
```
- :2326–2330 becomes:

```tsx
  it("the fold toggle opens the body with every day of the stay as a section", async () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={new Map([["par", [ITEM]]])} />);
    await userEvent.click(desktop().getByRole("button", { name: "Open Paris" }));
    expect(desktop().queryByRole("tablist")).toBeNull();
    const days = [...screen.getByTestId("plan-desktop-list").querySelectorAll("section[data-day]")].map((s) => s.getAttribute("data-day"));
    expect(days).toEqual(["2026-12-10", "2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"]);
    expect(desktop().getByRole("region", { name: "FRI 11 DEC" })).toHaveTextContent("Louvre");
  });
```
- :2630 becomes `await waitFor(() => expect(desktop().getByRole("region", { name: "SAT 12 DEC" })).toHaveAttribute("data-flash"));`
- :2644 becomes `expect(desktop().getByRole("region", { name: "SAT 12 DEC" })).not.toHaveAttribute("data-flash");`

In `lib/plan/day-density.test.ts`, drop `defaultSelectedDay` from the import on line 2 and delete `describe("defaultSelectedDay", …)` (:50–60).

- [ ] **Step 2: Run it, expect FAIL.** Run `TZ=UTC npx vitest run components/plan/day-section.test.tsx components/plan/stop-open-body.test.tsx`. Expected: import errors (`DaySection`, `HOVER_OPEN_MS`, `daySectionId` and `useHoverOpen` are not exported yet), and StopOpenBody tests failing on `getAllByRole("region")` (a tablist still renders).

- [ ] **Step 3: Implement**

Replace `components/plan/day-section.tsx` (the renamed `selected-day.tsx`) with the code below. Keep lines 21–58 of the old file verbatim: `DRAG_HINT_KEY`, `claimDragHint`, `plural`, `shortDayLabel` and `daySummary`. Keep `SelectedDayTitle` (:60–146) verbatim except for its name, which becomes `DayTitle`. Keep `DayRow` (:140–232) verbatim except for its doc comment. Everything else is new:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, EyeOff, GripVertical, Pencil } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useDayTitleEditor, DAY_TITLE_MAX_LENGTH } from "@/components/trip/day-title-editor";
import { useTripHref } from "@/components/trip/use-trip-href";
import { categoryDotClass } from "@/components/trip/category-dot";
import { ItemPhotoThumb } from "@/components/trip/item-photo-thumb";
import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
import { formatMoney, sumMinorToHome } from "@/lib/money";
import { formatDayLabel } from "@/lib/dates";
import type { CostRow } from "@/server/actions/costs";
import { PresenceDiv } from "./presence";
import { useMotionTiming } from "./use-motion-timing";

/** dnd-kit draggable id prefix for a scheduled Item row (consumed by the plan page's drag handler). */
export const ITEM_DRAG_PREFIX = "item:";

/** Prefix for a day section's dnd-kit droppable id — the strip slot's id before it (spec D5: same-stop-only drops). */
export const SLOT_DROP_PREFIX = "slot:";

export function slotDropId(stopId: string, dateISO: string): string {
  return `${SLOT_DROP_PREFIX}${stopId}:${dateISO}`;
}

/** A day section's DOM id: what a `day=` hash link and a scheduled idea scroll to (spec 2026-10-04 §A). */
export function daySectionId(stopId: string, dateISO: string): string {
  return `plan-day-${stopId}-${dateISO}`;
}

/** How long a dragged plan hovers a folded day before it opens (spec 2026-10-04 §A). */
export const HOVER_OPEN_MS = 600;

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

// ── kept verbatim from selected-day.tsx :21–58 ──
// DRAG_HINT_KEY, claimDragHint(), plural(), shortDayLabel(), daySummary()

// ── kept verbatim from selected-day.tsx :60–146, renamed SelectedDayTitle → DayTitle ──
// interface DayTitleProps, function DayTitle(...)

// ── kept verbatim from selected-day.tsx :140–232, doc comment now reads: ──
/** One scheduled Item row: draggable onto another day section (deviation 1 — no within-day reorder). */
// interface DayRowProps, function DayRow(...)

/**
 * Calls `onOpen` once `armed` has held for `delayMs`: a plan held over a
 * folded day's header opens it, so it can be dropped among that day's rows.
 * Moving on first (armed → false) cancels.
 */
export function useHoverOpen(armed: boolean, onOpen: () => void, delayMs: number = HOVER_OPEN_MS): void {
  const latest = React.useRef(onOpen);
  React.useEffect(() => {
    latest.current = onOpen;
  });
  React.useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => latest.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [armed, delayMs]);
}

export interface DaySectionProps {
  tripId: string;
  stopId: string;
  dateISO: string;
  dayTitle?: string;
  items: StopDayItem[];
  costsById?: Map<string, CostRow[]>;
  homeCurrency?: string;
  ideasCount: number;
  collapsed: boolean;
  /** Folds or opens the day — its header, or a plan held over it. */
  onCollapsedChange(collapsed: boolean): void;
  flash?: boolean;
  showDragHint: boolean;
  onAdd(dateISO: string): void;
  onEditItem(item: StopDayItem): void;
  onPickIdea(): void;
}

/**
 * One day of an open Stop (PLAN.md §4.3; spec 2026-10-04 §A): the sun head
 * with the inline Day title, a live summary, Open day and + Add, then one
 * row per scheduled Item, an empty state, and a footer that repeats + Add
 * and, once per session, the drag hint. The head folds the day to just its
 * header line. The whole section — folded or not — is the day's drop target.
 */
export function DaySection({
  tripId,
  stopId,
  dateISO,
  dayTitle,
  items,
  costsById,
  homeCurrency,
  ideasCount,
  collapsed,
  onCollapsedChange,
  flash = false,
  showDragHint,
  onAdd,
  onEditItem,
  onPickIdea,
}: DaySectionProps) {
  const tripHref = useTripHref(tripId);
  const { t } = useMotionTiming();
  const { setNodeRef, isOver, active } = useDroppable({
    id: slotDropId(stopId, dateISO),
    data: { type: "slot", stopId, date: dateISO },
    // An empty list re-measures every droppable, not only this one (dnd-kit
    // 6.3's useDroppableMeasuring): a day opening mid-drag moves every
    // section below it, and their stale rects would catch the drop.
    resizeObserverConfig: { updateMeasurementsFor: [] },
  });
  const planOver = isOver && active?.data.current?.type === "item";
  useHoverOpen(collapsed && planOver, () => onCollapsedChange(false));

  const day = buildStopDays(dateISO, dateISO, items)[0];
  const rows = [...day.timed, ...day.untimed];
  const summary = daySummary(items, costsById, homeCurrency);
  // Rows that weren't here last render (a scheduled idea, a moved or new plan)
  // rise in (MOTION.md P7). Held here, above the fold, so re-opening a day doesn't replay it.
  const ids = rows.map((r) => r.id).join("|");
  const [seen, setSeen] = React.useState({ ids, fresh: new Set<string>() });
  if (seen.ids !== ids) {
    const before = new Set(seen.ids.split("|"));
    setSeen({ ids, fresh: new Set(rows.map((r) => r.id).filter((id) => !before.has(id))) });
  }

  const sectionId = daySectionId(stopId, dateISO);
  const toggleId = `${sectionId}-toggle`;
  const bodyId = `${sectionId}-body`;

  return (
    <section
      ref={setNodeRef}
      id={sectionId}
      aria-labelledby={toggleId}
      data-day={dateISO}
      data-over={planOver || undefined}
      data-flash={flash || undefined}
      className={cn(
        "overflow-hidden rounded-2xl border-2 border-border bg-card shadow-hard-3 outline-offset-2",
        // P6: a plan held over the day outlines it (folded or open); the day it lands on flashes.
        "data-[over]:outline-3 data-[over]:outline-coral data-[flash]:tp-day-flash",
      )}
    >
      {/* The bare head folds the day too; its title, link and buttons keep their own jobs. */}
      <div
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("button, a, input")) onCollapsedChange(!collapsed);
        }}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-2.5 bg-sun px-3.5 py-2.5 text-on-accent",
          !collapsed && "border-b-2 border-border",
        )}
      >
        <button
          id={toggleId}
          type="button"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : bodyId}
          onClick={() => onCollapsedChange(!collapsed)}
          className="tap-target inline-flex items-center gap-1 text-[11px] font-extrabold tracking-[0.08em]"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-[var(--dur-base)]", collapsed && "-rotate-90")}
          />
          {formatDayLabel(dateISO).toUpperCase()}
        </button>
        <DayTitle stopId={stopId} dateISO={dateISO} dayTitle={dayTitle} />
        <span className="text-xs font-semibold text-on-accent-muted">{summary}</span>
        {!collapsed && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={tripHref(`/day/${dateISO}`)}
              className="tap-target pressable inline-flex h-9 items-center gap-1 rounded-full border-2 border-border bg-card px-3 text-[13px] font-extrabold"
            >
              Open day <ChevronRight className="size-4" aria-hidden />
            </Link>
            <Button variant="primary" size="sm" className="tap-target" onClick={() => onAdd(dateISO)}>
              + Add
            </Button>
          </div>
        )}
      </div>

      {/* MOTION.md P2's fold, per day: height 0 ↔ auto, the rows fading in after. */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <PresenceDiv
            key="body"
            id={bodyId}
            data-motion="day-fold"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: t({ height: { duration: 0.32, ease: EASE_POP }, opacity: { delay: 0.06, duration: 0.18 } }),
            }}
            exit={{ height: 0, opacity: 0, transition: t({ duration: 0.2, ease: EASE_EXIT }, "exit") }}
            className="overflow-hidden"
          >
            {rows.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-3 text-sm">
                <span>Nothing planned yet</span>
                <button type="button" className="tap-target font-bold text-coral-text" onClick={() => onAdd(dateISO)}>
                  + Add to {shortDayLabel(dateISO)}
                </button>
                {ideasCount > 0 && (
                  <button type="button" className="tap-target font-bold text-coral-text" onClick={onPickIdea}>
                    or pick an idea
                  </button>
                )}
              </div>
            ) : (
              <>
                {rows.map((item) => (
                  <DayRow
                    key={item.id}
                    stopId={stopId}
                    dateISO={dateISO}
                    item={item}
                    costs={costsById?.get(item.id) ?? []}
                    isNew={seen.fresh.has(item.id)}
                    // Off once played, so a resize showing the hidden desktop list doesn't replay it.
                    onRiseInEnd={() =>
                      setSeen((cur) => ({ ids: cur.ids, fresh: new Set([...cur.fresh].filter((id) => id !== item.id)) }))
                    }
                    onEditItem={onEditItem}
                  />
                ))}
                <div className="flex items-center justify-between px-3.5 py-2">
                  <button type="button" className="tap-target text-[13px] font-bold text-coral-text" onClick={() => onAdd(dateISO)}>
                    + Add to {shortDayLabel(dateISO)}
                  </button>
                  {showDragHint && <span className="text-[13px] text-on-accent-muted">Drag a plan onto another day to move it</span>}
                </div>
              </>
            )}
          </PresenceDiv>
        )}
      </AnimatePresence>
    </section>
  );
}
```

Replace `components/plan/stop-open-body.tsx` from the imports down. The `ExtrasKind` export, `StopOpenBodyProps`, `ExtrasLink`, `plural` and the extras-links JSX stay byte-for-byte. So does the top row (`StayChip` + `IdeasBox`), which is Part B's area.

```tsx
"use client";

import * as React from "react";
import { Bell, MessageCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StayChip } from "./stay-chip";
import { IdeasBox } from "./ideas-box";
import { DaySection } from "./day-section";
import {
  dayCollapseKey,
  parseCollapsed,
  readCollapsedRaw,
  setDayCollapsed,
  subscribeCollapsed,
} from "@/lib/plan/day-collapse";
import type { DaySlot } from "@/lib/plan/day-density";
import type { StopCardStop, ThingToDo } from "./types";
import type { StopDayItem } from "@/lib/stop-days";
import type { CostRow } from "@/server/actions/costs";
import type { StayStatus } from "@/lib/plan/plan-model";

// ExtrasKind, StopOpenBodyProps, ExtrasLink, plural — unchanged.

/** The days this Traveller folded on this Trip (lib/plan/day-collapse.ts). Every day is open on the server and while hydrating. */
function useCollapsedDays(tripId: string): ReadonlySet<string> {
  const raw = React.useSyncExternalStore(subscribeCollapsed, () => readCollapsedRaw(tripId), () => "");
  return React.useMemo(() => parseCollapsed(raw), [raw]);
}

/**
 * The open-stop container (PLAN.md §4, §5): the stay + ideas strip, then
 * either "Give it dates" (rough) or every day of the stay as a full,
 * foldable day section in date order (spec 2026-10-04 §A), then the quiet
 * extras link row (spec §D2) when any exist.
 */
export function StopOpenBody({
  tripId,
  stop,
  slots,
  dayItems,
  dayTitles,
  ideas,
  costsById,
  homeCurrency,
  stay,
  counts,
  showDragHint,
  flashDate,
  onOpenStay,
  onAddStay,
  onAddIdea,
  onOpenIdea,
  onAddPlan,
  onEditItem,
  onGiveDates,
  onOpenExtras,
}: StopOpenBodyProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const collapsed = useCollapsedDays(tripId);
  // The once-a-session drag hint sits under the first day with a plan to drag, not under every day.
  const hintDate = showDragHint ? slots.find((s) => dayItems.some((i) => i.date === s.dateISO))?.dateISO : undefined;

  const links: ExtrasLink[] = [];
  if (counts.files > 0) links.push({ kind: "files", icon: Paperclip, label: plural(counts.files, "file") });
  if (counts.notes > 0) links.push({ kind: "notes", icon: MessageCircle, label: plural(counts.notes, "note") });
  if (counts.reminders > 0) links.push({ kind: "reminders", icon: Bell, label: plural(counts.reminders, "reminder") });

  return (
    <div className="flex flex-col gap-2.5 border-t-2 border-border bg-background px-4 pb-3.5 pt-3">
      <div className="flex items-stretch gap-2.5">
        <StayChip stay={stay} rough={rough} onOpen={onOpenStay} onAdd={onAddStay} />
        <IdeasBox ideas={ideas} onOpen={onOpenIdea} onAdd={onAddIdea} />
      </div>

      {rough ? (
        <Button variant="primary" size="sm" className="self-start" onClick={onGiveDates}>
          Give it dates
        </Button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {slots.map((s) => (
            <DaySection
              key={s.dateISO}
              tripId={tripId}
              stopId={stop.id}
              dateISO={s.dateISO}
              dayTitle={dayTitles?.[s.dateISO]?.title}
              items={dayItems.filter((i) => i.date === s.dateISO)}
              costsById={costsById}
              homeCurrency={homeCurrency}
              ideasCount={ideas.length}
              collapsed={collapsed.has(dayCollapseKey(stop.id, s.dateISO))}
              onCollapsedChange={(c) => setDayCollapsed(tripId, stop.id, s.dateISO, c)}
              flash={flashDate === s.dateISO}
              showDragHint={s.dateISO === hintDate}
              onAdd={onAddPlan}
              onEditItem={onEditItem}
              onPickIdea={() =>
                document.querySelector<HTMLButtonElement>(`#stop-${stop.id} [aria-label^="Pick a day for"]`)?.click()
              }
            />
          ))}
        </div>
      )}

      {/* extras link row — unchanged */}
    </div>
  );
}
```

`components/trip/itinerary-manager.tsx:25`:

```diff
-import { claimDragHint } from "@/components/plan/selected-day";
+import { claimDragHint } from "@/components/plan/day-section";
```

`app/globals.css:694–695`:

```diff
-@keyframes tp-slot-flash { 0%, 100% { background-color: hsl(var(--card)); } 50% { background-color: hsl(var(--coral)); } }
-@utility tp-slot-flash { animation: tp-slot-flash 400ms var(--ease-pop); }
+/* Spec 2026-10-04 §A: the day section a plan lands on flashes its outline —
+   visible on a folded day's header as well as an open day. */
+@keyframes tp-day-flash { 0%, 100% { outline-color: transparent; } 40% { outline-color: hsl(var(--coral)); } }
+@utility tp-day-flash { outline: 3px solid transparent; outline-offset: 2px; animation: tp-day-flash 400ms var(--ease-pop); }
```

`lib/plan/day-density.ts`: delete `defaultSelectedDay` (:68–76). It has no other caller.

Delete the strip:

```bash
git rm components/plan/day-strip.tsx components/plan/day-strip.test.tsx lib/plan/strip-scroll.ts lib/plan/strip-scroll.test.ts
```

- [ ] **Step 4: Run, expect PASS.** Run:
  - `TZ=UTC npx vitest run components/plan lib/plan components/trip/itinerary-manager.test.tsx`
  - `npx eslint components/plan lib/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx`
  - `npx tsc --noEmit`
  - `grep -rn "selected-day\|SelectedDay\|day-strip\"\|DayStrip\b\|strip-scroll\"\|tp-slot-flash\|defaultSelectedDay" components lib app --include=*.ts --include=*.tsx --include=*.css`. The only hits allowed are `components/trip/day/*` and `app/(app)/trips/[tripId]/day/*`, which belong to the unrelated Day-view strip.

  The existing tests updated in Step 1 are: day-section (from selected-day), stop-open-body, motion, motion-reduced, itinerary-manager (:2136–2171, :2326–2330, :2630, :2644) and day-density. `plan-dnd.test.ts` is untouched: its `slot` data contract is unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A components/plan lib/plan app/globals.css components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): stack every day of an open Stop as a foldable section

The day strip and single selected-day panel go. A scheduled Stop's open
card shows every day of the stay as a full day section in date order,
each folding to its header line; the fold is remembered on this device
per Trip. Each section is the day's drop target (slot:<stop>:<date>), a
plan held over a folded day opens it, and the landing day flashes.

Resolves-Feedback: cmut6gke4000104lfe5qiwt4w

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21 — A3: `#open=…&day=…` scrolls to the day section; per-stop selected day leaves PlanBody

**Files:**
- Modify: `components/plan/plan-body.tsx` (interface :13–24, `INERT_VALUE` :32–43, the docstring :47–53, state :62–64, `selectDay`/`selectedDay` :87–95, `apply` :143–148, value memo :182–198)
- Modify: `components/plan/stop-open-body.tsx` (hooks at the top of `StopOpenBody`)
- Test: `components/plan/plan-body.test.tsx`, `components/plan/stop-open-body.test.tsx`

**Interfaces:**
- Consumes: A1's `setDayCollapsed`; A2's `daySectionId`; `scrollToId` from `lib/scroll-to.ts`.
- Produces: `PlanBodyValue.claimHashDay(dateISO: string): boolean`. `selectedDay` and `selectDay` are removed from `PlanBodyValue`.

- [ ] **Step 1: Write the failing tests**

In `components/plan/plan-body.test.tsx`:
- Add `import * as React from "react";` at the top.
- In `Probe`, change the day line to `<span data-testid={`day-${id}`}>{b.hashDay ?? "none"}</span>` and delete the `day {id}` button.
- Add this component after `Registrar`:

```tsx
function Claimer({ label, date }: { label: string; date: string }) {
  const b = usePlanBody();
  const [result, setResult] = React.useState("—");
  return <button onClick={() => setResult(String(b.claimHashDay(date)))}>{label}: {result}</button>;
}
```
- Replace the test "toggling and picking a day write #open=…&day=… with replaceState" with:

```tsx
  it("toggling writes #open=… with replaceState", async () => {
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Probe id="a" /></PlanBody>);
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#open=a");
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("");
  });

  it("a hash day= it was handed rides along through toggles", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=a&day=2026-12-11");
    render(<PlanBody initialOpen={[]} today="2026-12-12"><Probe id="a" /><Probe id="b" /></PlanBody>);
    await waitFor(() => expect(screen.getByTestId("open-a")).toHaveTextContent("true"));
    await userEvent.click(screen.getByText("toggle b"));
    expect(window.location.hash).toBe("#open=a,b&day=2026-12-11");
    await userEvent.click(screen.getByText("toggle a"));
    expect(window.location.hash).toBe("#open=b&day=2026-12-11");
  });

  it("claimHashDay: true once, for the hash day only — a Changeover day under two Stops scrolls once", async () => {
    window.history.replaceState(null, "", "/trips/t/plan#open=a&day=2026-12-20");
    render(
      <PlanBody initialOpen={[]} today="2026-12-12">
        <Probe id="a" />
        <Claimer label="other day" date="2026-12-21" />
        <Claimer label="first" date="2026-12-20" />
        <Claimer label="second" date="2026-12-20" />
      </PlanBody>,
    );
    await waitFor(() => expect(screen.getByTestId("day-a")).toHaveTextContent("2026-12-20"));
    await userEvent.click(screen.getByText(/^other day/));
    expect(screen.getByText(/^other day/)).toHaveTextContent("other day: false");
    await userEvent.click(screen.getByText(/^first/));
    expect(screen.getByText(/^first/)).toHaveTextContent("first: true");
    await userEvent.click(screen.getByText(/^second/));
    expect(screen.getByText(/^second/)).toHaveTextContent("second: false");
  });
```
The other tests in the file are unchanged. "on mount, #open= restores the open set and hands the day over" keeps reading `day-b`, which now shows `hashDay`.

In `components/plan/stop-open-body.test.tsx`:
- Add `afterEach` to the vitest import.
- Add `import { setMatchMedia } from "@/test/setup";` and `import { setDayCollapsed } from "@/lib/plan/day-collapse";`.
- Add after the existing `beforeEach`:

```tsx
afterEach(() => {
  setMatchMedia((q) => q === "(min-width: 640px)");
});
```

Then add these tests inside the describe:

```tsx
  it("a hash day= opens that day if it was folded, and scrolls to it (desktop)", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)" || q === "(min-width: 640px)");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setDayCollapsed("t1", "par", "2026-12-13", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par&day=2026-12-13");
    wrap(<StopOpenBody {...baseProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "SUN 13 DEC" })).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
  });

  it("a hash day= on a Changeover day opens and scrolls the first open Stop's section only", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)" || q === "(min-width: 640px)");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const LYON = { ...PARIS, id: "lyo", name: "Lyon", arriveDate: "2026-12-14", departDate: "2026-12-16", sortOrder: 2 };
    setDayCollapsed("t1", "par", "2026-12-14", true);
    setDayCollapsed("t1", "lyo", "2026-12-14", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par,lyo&day=2026-12-14");
    render(
      <PlanBody initialOpen={[]} today="2026-12-30">
        <div data-testid="paris"><StopOpenBody {...baseProps()} /></div>
        <div data-testid="lyon"><StopOpenBody {...baseProps({ stop: LYON, slots: daySlots(LYON, []), dayItems: [] })} /></div>
      </PlanBody>,
    );
    const toggle = (testId: string) => within(screen.getByTestId(testId)).getByRole("button", { name: "MON 14 DEC" });
    await waitFor(() => expect(toggle("paris")).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    expect(toggle("lyon")).toHaveAttribute("aria-expanded", "false");
  });

  it("below lg a hash day= opens the day but scrolls nothing (the desktop list is hidden)", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setDayCollapsed("t1", "par", "2026-12-13", true);
    window.history.replaceState(null, "", "/trips/t1/plan#open=par&day=2026-12-13");
    wrap(<StopOpenBody {...baseProps()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "SUN 13 DEC" })).toHaveAttribute("aria-expanded", "true"));
    expect(scrollTo).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run it, expect FAIL.** Run `TZ=UTC npx vitest run components/plan/plan-body.test.tsx components/plan/stop-open-body.test.tsx`. Expected: `b.claimHashDay is not a function` in the Claimer test, and the three hash tests time out with the day still `aria-expanded="false"`.

- [ ] **Step 3: Implement**

`components/plan/plan-body.tsx`:

```diff
 export interface PlanBodyValue {
   today: string;
+  /** The `day=` of the last `#open=…&day=…` hash applied — the day section a desktop open Stop scrolls to (spec 2026-10-04 §A). */
   hashDay: string | null;
+  /** True for the first caller asking for the current hash day after the hash was applied, so a Changeover day under two open Stops scrolls once. */
+  claimHashDay(dateISO: string): boolean;
   isOpen(stopId: string): boolean;
   toggle(stopId: string): void;
   open(stopId: string): void;
-  selectedDay(stopId: string): string | null;
-  selectDay(stopId: string, dateISO: string): void;
   jumpTo(stopId: string): void;
```

```diff
 const INERT_VALUE: PlanBodyValue = {
   today: "",
   hashDay: null,
+  claimHashDay: () => false,
   isOpen: () => false,
   toggle: () => {},
   open: () => {},
-  selectedDay: () => null,
-  selectDay: () => {},
   jumpTo: () => {},
```

```diff
 /**
- * Owns the Plan page's fold-open set and selected days, keeps them in sync
- * with the `#open=/&day=/#stop-` hash (lib/plan/plan-hash.ts), and hosts the
+ * Owns the Plan page's fold-open set, keeps it in sync with the
+ * `#open=/&day=/#stop-` hash (lib/plan/plan-hash.ts) — a `day=` is handed to
+ * the open Stops to scroll to (spec 2026-10-04 §A) — and hosts the
  * header-buttons-to-ItineraryManager actions registry (PLAN.md §3, §6.3).
```

```diff
   const [openIds, setOpenIds] = React.useState<string[]>(initialOpen);
-  const [days, setDays] = React.useState<Record<string, string>>({});
   const [hashDay, setHashDay] = React.useState<string | null>(null);
   const lastDayRef = React.useRef<string | null>(null);
+  const claimedDayRef = React.useRef<string | null>(null);
   const registry = React.useRef<Partial<PlanActions>>({});
```

```diff
-  function selectDay(stopId: string, date: string) {
-    setDays((d) => ({ ...d, [stopId]: date }));
-    lastDayRef.current = date;
-    writeHash(openIds, date);
-  }
-
-  function selectedDay(stopId: string): string | null {
-    return days[stopId] ?? null;
-  }
+  function claimHashDay(date: string): boolean {
+    if (date !== hashDay || claimedDayRef.current === date) return false;
+    claimedDayRef.current = date;
+    return true;
+  }
```

```diff
       } else if (p.open.length || p.day) {
         void Promise.resolve().then(() => {
+          claimedDayRef.current = null;
           setOpenIds(p.open);
           setHashDay(p.day);
           lastDayRef.current = p.day;
         });
       }
```

```diff
     () => ({
       today,
       hashDay,
+      claimHashDay,
       isOpen: (id: string) => openIds.includes(id),
       toggle,
       open,
-      selectedDay,
-      selectDay,
       jumpTo,
       actions,
       registerActions,
     }),
-    // eslint-disable-next-line react-hooks/exhaustive-deps -- functions close over openIds/days/hashDay directly; re-memoised whenever any of those change.
-    [today, hashDay, openIds, days, actions],
+    // eslint-disable-next-line react-hooks/exhaustive-deps -- functions close over openIds/hashDay directly; re-memoised whenever either changes.
+    [today, hashDay, openIds, actions],
   );
```

`components/plan/stop-open-body.tsx`. Add these imports:

```tsx
import { daySectionId } from "./day-section";
import { usePlanBody } from "./plan-body";
import { scrollToId } from "@/lib/scroll-to";
```

Add straight after `const collapsed = useCollapsedDays(tripId);`:

```tsx
  const b = usePlanBody();
  const hashDay = b.hashDay && slots.some((s) => s.dateISO === b.hashDay) ? b.hashDay : null;
  // Spec 2026-10-04 §A: a `day=` hash link opens that day (if folded) and
  // scrolls to it — once, on the first open Stop holding it (a Changeover day
  // sits under two). Only on desktop: below lg this list is display:none.
  React.useEffect(() => {
    if (!hashDay || !b.claimHashDay(hashDay)) return;
    setDayCollapsed(tripId, stop.id, hashDay, false);
    if (!window.matchMedia?.("(min-width: 1024px)").matches) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // After the commit that opened the day, so the window lands on its top.
    requestAnimationFrame(() => scrollToId(daySectionId(stop.id, hashDay), { reduced }));
  }, [hashDay, b, tripId, stop.id]);
```

- [ ] **Step 4: Run, expect PASS.** Run:
  - `TZ=UTC npx vitest run components/plan lib/plan components/trip/itinerary-manager.test.tsx lib/scroll-to.test.ts`
  - `npx eslint components/plan/plan-body.tsx components/plan/plan-body.test.tsx components/plan/stop-open-body.tsx components/plan/stop-open-body.test.tsx`
  - `npx tsc --noEmit`

  If tsc reports a remaining `selectedDay` or `selectDay` caller, delete it. After A2 there should be none.

- [ ] **Step 5: Commit**

```bash
git add components/plan/plan-body.tsx components/plan/plan-body.test.tsx components/plan/stop-open-body.tsx components/plan/stop-open-body.test.tsx
git commit -m "feat(plan): day= hash links scroll to the day section

#open=…&day=… still opens the Stops; the day now opens (if folded) and
scrolls into view instead of being selected, once, on the first open
Stop that holds it. PlanBody drops its per-stop selected day.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22 — A4: Scheduling an idea opens, scrolls to and then flashes its day section

**Files:**
- Modify: `lib/scroll-to.ts` (append `whenScrollSettles`)
- Test: `lib/scroll-to.test.ts`
- Modify: `components/trip/itinerary-manager.tsx` (imports :25, :33; new `revealDay` beside `flashSlot` :674–678; `handleScheduleThing` :1122–1123)
- Test: `components/trip/itinerary-manager.test.tsx` (the `describe("Plan motion")` block, after the P7 tests at ~:2645)

**Interfaces:**
- Consumes: A1's `setDayCollapsed`; A2's `daySectionId`; `scrollToId`.
- Produces: `whenScrollSettles(reduced: boolean, fn: () => void): void` in `lib/scroll-to.ts`.

- [ ] **Step 1: Write the failing tests**

In `lib/scroll-to.test.ts`, extend the import to `import { scrollToId, ringId, whenScrollSettles, HIGHLIGHT_MS } from "./scroll-to";` and append:

```ts
describe("whenScrollSettles", () => {
  it("runs at once under reduced motion (the scroll was instant)", () => {
    const fn = vi.fn();
    whenScrollSettles(true, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs once on scrollend, and not again at the fallback", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    whenScrollSettles(false, fn);
    expect(fn).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("scrollend"));
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new Event("scrollend"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back after 600ms when scrollend never fires", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    whenScrollSettles(false, fn);
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

In `components/trip/itinerary-manager.test.tsx`, add the imports `import { setMatchMedia } from "@/test/setup";` and `import { resetDayCollapse, setDayCollapsed } from "@/lib/plan/day-collapse";`. Then add this test inside `describe("Plan motion")`, after "P7: a thrown schedule is reported, and nothing flashes":

```tsx
  it("P7 (§A): on desktop, an idea scheduled onto a folded day opens it, scrolls to it, then flashes it", async () => {
    setMatchMedia((q) => q === "(min-width: 1024px)" || q === "(min-width: 640px)");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setDayCollapsed("trip-1", "par", "2026-12-12", true);
    try {
      const { scheduleItem } = await import("@/server/actions/items");
      const ideas = new Map([["par", [{ id: "i1", title: "Orsay", category: "SIGHTSEEING", stopId: "par" }]]]);
      render(plan([PARIS, ROME], { thingsToDoByStopId: ideas }));
      const sat = () => desktop().getByRole("region", { name: "SAT 12 DEC" });
      expect(within(sat()).getByRole("button", { name: "SAT 12 DEC" })).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(desktop().getByRole("button", { name: "Open Orsay" }));
      await userEvent.click(await screen.findByRole("button", { name: "Pick a day for Orsay" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Sat 12 Dec" }));
      expect(scheduleItem).toHaveBeenCalledWith("i1", { date: "2026-12-12" });
      await waitFor(() => expect(within(sat()).getByRole("button", { name: "SAT 12 DEC" })).toHaveAttribute("aria-expanded", "true"));
      await waitFor(() => expect(scrollTo).toHaveBeenCalled());
      expect(sat()).not.toHaveAttribute("data-flash");
      act(() => {
        window.dispatchEvent(new Event("scrollend"));
      });
      await waitFor(() => expect(sat()).toHaveAttribute("data-flash"));
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
      window.localStorage.clear();
      resetDayCollapse();
    }
  });
```

The existing "P7: scheduling an idea flashes the day it landed on" runs under the default (phone) matchMedia. It keeps passing through `revealDay`'s immediate-flash branch, unchanged.

- [ ] **Step 2: Run it, expect FAIL.** Run `TZ=UTC npx vitest run lib/scroll-to.test.ts components/trip/itinerary-manager.test.tsx -t "whenScrollSettles|P7"`. Expected: `whenScrollSettles is not a function`, and the new P7 test stays `aria-expanded="false"`.

- [ ] **Step 3: Implement**

Append to `lib/scroll-to.ts`:

```ts
/**
 * Runs `fn` once a smooth window scroll has settled: on `scrollend`, after
 * 600ms where the browser never fires it (no scroll was needed, or an older
 * Safari), or at once under reduced motion (the scroll was instant).
 */
export function whenScrollSettles(reduced: boolean, fn: () => void): void {
  if (reduced) {
    fn();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    window.clearTimeout(timer);
    fn();
  };
  window.addEventListener("scrollend", finish);
  const timer = window.setTimeout(finish, 600);
}
```

`components/trip/itinerary-manager.tsx` imports:

```diff
-import { claimDragHint } from "@/components/plan/day-section";
+import { claimDragHint, daySectionId } from "@/components/plan/day-section";
@@
-import { ringId } from "@/lib/scroll-to";
+import { ringId, scrollToId, whenScrollSettles } from "@/lib/scroll-to";
+import { setDayCollapsed } from "@/lib/plan/day-collapse";
```

After `flashSlot` (:674–678):

```tsx
  /**
   * MOTION.md P7 + spec 2026-10-04 §A: the day an idea landed on flashes. On
   * desktop it first opens (if folded) and scrolls into view, and flashes once
   * the scroll settles, so a day far down the card isn't flashed off-screen.
   * Below lg there are no day sections to reveal.
   */
  function revealDay(stopId: string, dateISO: string) {
    if (!window.matchMedia?.("(min-width: 1024px)").matches) {
      flashSlot(stopId, dateISO);
      return;
    }
    setDayCollapsed(tripId, stopId, dateISO, false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    requestAnimationFrame(() => {
      scrollToId(daySectionId(stopId, dateISO), { reduced });
      whenScrollSettles(reduced, () => flashSlot(stopId, dateISO));
    });
  }
```

In `handleScheduleThing` (:1122–1123):

```diff
-    // MOTION.md P7: the day it landed on flashes, as a dropped plan's does (P6).
-    if (thing.stopId) flashSlot(thing.stopId, dateISO);
+    // MOTION.md P7: the day it landed on opens, comes into view and flashes, as a dropped plan's does (P6).
+    if (thing.stopId) revealDay(thing.stopId, dateISO);
```

`handleMoveItem` keeps calling `flashSlot` directly: a dropped plan lands where the Traveller is already looking.

- [ ] **Step 4: Run, expect PASS.** Run:
  - `TZ=UTC npx vitest run lib/scroll-to.test.ts components/trip/itinerary-manager.test.tsx components/plan`
  - `npx eslint lib/scroll-to.ts lib/scroll-to.test.ts components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx`
  - `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add lib/scroll-to.ts lib/scroll-to.test.ts components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): a scheduled idea opens, scrolls to and flashes its day

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23 — A5 (Part I): "or pick an idea" lists the Stop's ideas and schedules the pick onto that day

**Files:**
- Create: `components/plan/idea-picker-menu.tsx`
- Modify: `components/plan/day-section.tsx` (`DaySectionProps`, the destructure, the empty state)
- Modify: `components/plan/stop-open-body.tsx` (`StopOpenBodyProps`, the destructure, the `DaySection` props)
- Modify: `components/trip/itinerary-manager.tsx` (the `<StopOpenBody>` in `renderDesktopStop`, ~:1751–1776)
- Test: `components/plan/day-section.test.tsx`, `components/plan/stop-open-body.test.tsx`, `components/plan/motion.test.tsx`, `components/plan/motion-reduced.test.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `handleScheduleThing(thing: ThingToDo, dateISO: string)` in ItineraryManager (already there).
- Produces:
  - `IdeaPickerMenu({ ideas, dayLabel, onPick })`
  - `DaySectionProps`: `ideasCount` and `onPickIdea` are removed; `ideas: ThingToDo[]` and `onScheduleIdea(idea: ThingToDo, dateISO: string): void` are added.
  - `StopOpenBodyProps.onScheduleIdea(idea: ThingToDo, dateISO: string): void` (new, required; declared straight after `flashDate`).

- [ ] **Step 1: Write the failing tests**

`components/plan/day-section.test.tsx`:
- Add `const IDEAS = [{ id: "i1", title: "Orsay", category: "SIGHTSEEING" }, { id: "i2", title: "Sainte-Chapelle", category: "SIGHTSEEING" }];` next to `ITEMS`.
- In `dayProps`, replace `ideasCount: 3, …, onPickIdea: vi.fn()` with `ideas: IDEAS, …, onScheduleIdea: vi.fn()`.
- Replace the test "empty day: Nothing planned yet, + Add to Fri 11, or pick an idea" with:

```tsx
  it("empty day: Nothing planned yet and + Add to Fri 11", async () => {
    const { props } = renderDay({ items: [] });
    expect(screen.getByText("Nothing planned yet")).toBeInTheDocument();
    const addToDay = screen.getByRole("button", { name: "+ Add to Fri 11" });
    expect(addToDay.className).toContain("tap-target");
    await userEvent.click(addToDay);
    expect(props.onAdd).toHaveBeenCalledWith("2026-12-11");
  });

  it("or pick an idea lists this Stop's ideas; picking one schedules it onto this day", async () => {
    const { props } = renderDay({ items: [] });
    const trigger = screen.getByRole("button", { name: "or pick an idea" });
    expect(trigger.className).toContain("tap-target");
    await userEvent.click(trigger);
    expect(await screen.findByText("Add to Fri 11")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Orsay", "Sainte-Chapelle"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Sainte-Chapelle" }));
    expect(props.onScheduleIdea).toHaveBeenCalledWith(IDEAS[1], "2026-12-11");
  });

  it("no ideas: no or pick an idea", () => {
    renderDay({ items: [], ideas: [] });
    expect(screen.queryByRole("button", { name: "or pick an idea" })).toBeNull();
  });
```

The prop swap `ideasCount: 0, … onPickIdea: vi.fn()` → `ideas: [], … onScheduleIdea: vi.fn()` must also be made in:
- `components/plan/motion.test.tsx`: the file-level `dayProps`.
- `components/plan/motion-reduced.test.tsx`: the P3 `DaySection` (`ideas={[]}`, `onScheduleIdea={vi.fn()}`).
- `components/plan/stop-open-body.test.tsx`: add `onScheduleIdea: vi.fn()` to `baseProps`, and add this test:

```tsx
  it("an empty day's or pick an idea schedules the Stop's idea onto that day", async () => {
    const props = baseProps({ ideas: [{ id: "i1", title: "Orsay", category: "SIGHTSEEING" }] });
    wrap(<StopOpenBody {...props} />);
    await userEvent.click(within(day("SAT 12 DEC")).getByRole("button", { name: "or pick an idea" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Orsay" }));
    expect(props.onScheduleIdea).toHaveBeenCalledWith(props.ideas[0], "2026-12-12");
  });
```

`components/trip/itinerary-manager.test.tsx`: add this regression test, the end-to-end proof that the link used to do nothing, at the end of `describe("desktop list (PLAN.md §1.3–§4)")`:

```tsx
  it("§I: an empty day's or pick an idea schedules the chosen idea onto that day", async () => {
    const { scheduleItem } = await import("@/server/actions/items");
    const ideas = new Map([["par", [{ id: "i1", title: "Orsay", category: "SIGHTSEEING", stopId: "par" }]]]);
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} thingsToDoByStopId={ideas} />, ["par"]);
    await userEvent.click(within(desktop().getByRole("region", { name: "SAT 12 DEC" })).getByRole("button", { name: "or pick an idea" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Orsay" }));
    expect(scheduleItem).toHaveBeenCalledWith("i1", { date: "2026-12-12" });
  });
```

- [ ] **Step 2: Run it, expect FAIL.** Run `TZ=UTC npx vitest run components/plan/day-section.test.tsx components/plan/stop-open-body.test.tsx components/trip/itinerary-manager.test.tsx -t "pick an idea"`. Expected: no `menuitem` appears (the link still calls `onPickIdea`), and tsc and vitest report the unknown props `ideas`/`onScheduleIdea`.

- [ ] **Step 3: Implement**

Create `components/plan/idea-picker-menu.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryDotClass } from "@/components/trip/category-dot";
import { cn } from "@/lib/cn";
import type { ThingToDo } from "./types";

/**
 * "or pick an idea" in an empty day section (spec 2026-10-04 §I): the Stop's
 * ideas as a menu; picking one schedules it onto that day — the same path as
 * an opened idea's Pick a day, so the day then opens and flashes (P7).
 */
export function IdeaPickerMenu({
  ideas,
  dayLabel,
  onPick,
}: {
  ideas: ThingToDo[];
  dayLabel: string;
  onPick(idea: ThingToDo): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="tap-target font-bold text-coral-text">
          or pick an idea
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        <DropdownMenuLabel>Add to {dayLabel}</DropdownMenuLabel>
        {ideas.map((idea) => (
          <DropdownMenuItem key={idea.id} onSelect={() => onPick(idea)}>
            <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(idea.category))} aria-hidden="true" />
            <span className="truncate">{idea.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`components/plan/day-section.tsx`:

```diff
+import { IdeaPickerMenu } from "./idea-picker-menu";
+import type { ThingToDo } from "./types";
@@ export interface DaySectionProps {
-  ideasCount: number;
+  /** The Stop's unscheduled ideas, offered by an empty day's "or pick an idea". */
+  ideas: ThingToDo[];
@@
-  onPickIdea(): void;
+  onScheduleIdea(idea: ThingToDo, dateISO: string): void;
 }
@@ export function DaySection({
-  ideasCount,
+  ideas,
@@
-  onPickIdea,
+  onScheduleIdea,
 }: DaySectionProps) {
@@ (empty state)
-                {ideasCount > 0 && (
-                  <button type="button" className="tap-target font-bold text-coral-text" onClick={onPickIdea}>
-                    or pick an idea
-                  </button>
-                )}
+                {ideas.length > 0 && (
+                  <IdeaPickerMenu ideas={ideas} dayLabel={shortDayLabel(dateISO)} onPick={(idea) => onScheduleIdea(idea, dateISO)} />
+                )}
```

`components/plan/stop-open-body.tsx`:

```diff
   flashDate?: string | null;
+  /** An empty day's "or pick an idea": schedule one of this Stop's ideas onto that day (spec 2026-10-04 §I). */
+  onScheduleIdea(idea: ThingToDo, dateISO: string): void;
   onOpenStay(): void;
@@ (destructure)
   flashDate,
+  onScheduleIdea,
   onOpenStay,
@@ (DaySection props)
-              ideasCount={ideas.length}
+              ideas={ideas}
@@
-              onPickIdea={() =>
-                document.querySelector<HTMLButtonElement>(`#stop-${stop.id} [aria-label^="Pick a day for"]`)?.click()
-              }
+              onScheduleIdea={onScheduleIdea}
```

`components/trip/itinerary-manager.tsx`, in `renderDesktopStop`'s `<StopOpenBody>` straight after `flashDate={…}`:

```diff
                     flashDate={flash?.stopId === stop.id ? flash.date : null}
+                    onScheduleIdea={(idea, d) => void handleScheduleThing(idea, d)}
```

- [ ] **Step 4: Run, expect PASS.** Run:
  - `TZ=UTC npx vitest run components/plan components/trip/itinerary-manager.test.tsx`
  - `npx eslint components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx`
  - `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add components/plan/idea-picker-menu.tsx components/plan/day-section.tsx components/plan/day-section.test.tsx components/plan/stop-open-body.tsx components/plan/stop-open-body.test.tsx components/plan/motion.test.tsx components/plan/motion-reduced.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "fix(plan): \"or pick an idea\" schedules a Stop idea onto the day

It clicked a control that only exists inside an open idea, so it did
nothing. It now opens a menu of the Stop's ideas; a pick schedules it
onto that day through the same path as Pick a day.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24 — A6 (Part I): ADR 0049 rule 3 — the owning-Stop marker on desktop day sections and the phone stop sheet

**Files:**
- Modify: `lib/stop-days.ts` (append `ownerMarker`)
- Test: `lib/stop-days.test.ts`
- Modify: `components/plan/day-section.tsx` (`DayRowProps`, `DayRow`'s edit button, `DaySectionProps`, the row map)
- Modify: `components/plan/stop-open-body.tsx` (`StopOpenBodyProps`, the destructure, the `DaySection` props)
- Modify: `components/plan/mobile/stop-sheet.tsx` (`StopSheetProps` :19–35, the destructure, the item rows :222–234)
- Modify: `components/trip/itinerary-manager.tsx` (after `const stops = localStops;` :1190; `<StopOpenBody>` ~:1751; `<StopSheet>` ~:2400)
- Test: `components/plan/day-section.test.tsx`, `components/plan/mobile/stop-sheet.test.tsx`, `components/trip/itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `StopDayItem.stopId` (the owning Stop, ADR 0049 rule 2).
- Produces:
  - `ownerMarker(item: Pick<StopDayItem, "stopId">, cardStopId: string, stopNames: ReadonlyMap<string, string> | undefined): string | null`
  - `stopNames?: ReadonlyMap<string, string>` on `DaySectionProps`, `StopOpenBodyProps` (declared after `onScheduleIdea`) and `StopSheetProps`
  - The marker DOM is `<span data-owner class="… text-muted-foreground">· {Stop}</span>`. A marked row's accessible name gains ` (Stop)`.

- [ ] **Step 1: Write the failing tests**

`lib/stop-days.test.ts`: extend the import with `ownerMarker` and append:

```ts
describe("ownerMarker (ADR 0049 rule 3)", () => {
  const names = new Map([["mun", "Munich"], ["str", "Strasbourg"]]);

  it("names the owning Stop on the card that does not own the Item", () => {
    expect(ownerMarker(item({ stopId: "str" }), "mun", names)).toBe("Strasbourg");
  });

  it("nothing on the owner's own card, for an Item with no owner, or for an owner it can't name", () => {
    expect(ownerMarker(item({ stopId: "mun" }), "mun", names)).toBeNull();
    expect(ownerMarker(item({ stopId: null }), "mun", names)).toBeNull();
    expect(ownerMarker(item({ stopId: undefined }), "mun", names)).toBeNull();
    expect(ownerMarker(item({ stopId: "gone" }), "mun", names)).toBeNull();
    expect(ownerMarker(item({ stopId: "str" }), "mun", undefined)).toBeNull();
  });
});
```

`components/plan/day-section.test.tsx`: add inside the DaySection describe:

```tsx
  it("ADR 0049 rule 3: a plan another Stop owns carries a muted · {owning Stop}; unowned and own plans don't", () => {
    const items = [ITEMS[0], { ...ITEMS[1], stopId: "rom" }, { ...ITEMS[2], stopId: "par" }];
    renderDay({ items, stopNames: new Map([["par", "Paris"], ["rom", "Rome"]]) });
    const marker = screen.getByText("· Rome");
    expect(marker.className).toContain("text-muted-foreground");
    expect(screen.getByRole("button", { name: "Edit Louvre (Rome)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Café Kitsuné" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Picnic" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-owner]")).toHaveLength(1);
  });
```

`components/plan/mobile/stop-sheet.test.tsx`: add inside the describe:

```tsx
  it("ADR 0049 rule 3: a Changeover-day plan another Stop owns says which", () => {
    const items = [ITEMS[0], { ...ITEMS[1], date: "2026-12-12", stopId: "lyo" }];
    renderSheet({ dayItems: items, stopNames: new Map([["par", "Paris"], ["lyo", "Lyon"]]) });
    const row = screen.getByRole("button", { name: "10:00 Louvre (Lyon)" });
    expect(within(row).getByText("· Lyon").className).toContain("text-muted-foreground");
    expect(screen.getByRole("button", { name: "15:00 Check in" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-owner]")).toHaveLength(1);
  });
```

`components/trip/itinerary-manager.test.tsx`: add a describe at the end of the file:

```tsx
describe("ADR 0049 rule 3: the owning-Stop marker (spec 2026-10-04 §I)", () => {
  const DINNER = { id: "d1", title: "Dinner", category: "FOOD", date: "2026-12-15", startTime: "19:00", endTime: null, stopId: "rom" };
  // The plan page groups by date coverage, so the Changeover day's plan is handed to both cards.
  const items = new Map([["par", [DINNER]], ["rom", [DINNER]]]);

  it("desktop: the Changeover day's plan carries · Rome on Paris's card only", () => {
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={items} />, ["par", "rom"]);
    const [onParis, onRome] = desktop().getAllByRole("region", { name: "TUE 15 DEC" });
    expect(within(onParis).getByText("· Rome")).toBeInTheDocument();
    expect(onRome.querySelector("[data-owner]")).toBeNull();
  });

  it("phone: the stop sheet marks it the same way", async () => {
    navState.search = "stop=par";
    renderPlan(<ItineraryManager {...baseProps} initialStops={[PARIS, ROME]} dayItemsByStopId={items} />);
    const sheet = await screen.findByRole("dialog", { name: "Paris" });
    expect(within(sheet).getByText("· Rome")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** Run `TZ=UTC npx vitest run lib/stop-days.test.ts components/plan/day-section.test.tsx components/plan/mobile/stop-sheet.test.tsx components/trip/itinerary-manager.test.tsx -t "ownerMarker|ADR 0049"`. Expected: `ownerMarker is not a function`, and `Unable to find an element with the text: · Rome`.

- [ ] **Step 3: Implement**

Append to `lib/stop-days.ts`:

```ts
/**
 * ADR 0049 rule 3: the muted owning-Stop name an Item carries on the card of
 * a Stop that does NOT own it. Cards are handed Items by date coverage
 * (`groupScheduledItemsByStop`), so in practice that is a Changeover day's
 * Item filed to the neighbouring Stop. Null on the owner's own card, for an
 * Item with no owning Stop, or when the owner's name isn't known.
 */
export function ownerMarker(
  item: Pick<StopDayItem, "stopId">,
  cardStopId: string,
  stopNames: ReadonlyMap<string, string> | undefined,
): string | null {
  if (!item.stopId || item.stopId === cardStopId) return null;
  return stopNames?.get(item.stopId) ?? null;
}
```

`components/plan/day-section.tsx`:

```diff
-import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
+import { buildStopDays, ownerMarker, type StopDayItem } from "@/lib/stop-days";
@@ interface DayRowProps {
   costs: CostRow[];
+  /** ADR 0049 rule 3: the owning Stop's name when it isn't this card's Stop. */
+  owner: string | null;
   isNew: boolean;
@@
-function DayRow({ stopId, dateISO, item, costs, isNew, onRiseInEnd, onEditItem }: DayRowProps) {
+function DayRow({ stopId, dateISO, item, costs, owner, isNew, onRiseInEnd, onEditItem }: DayRowProps) {
@@
       <button
         type="button"
-        aria-label={`Edit ${item.title}`}
+        aria-label={owner ? `Edit ${item.title} (${owner})` : `Edit ${item.title}`}
         onClick={() => onEditItem(item)}
         className="tap-target flex min-w-0 items-baseline gap-2 text-left"
       >
         <span className="shrink-0 text-sm font-bold">{item.title}</span>
+        {owner && (
+          <span data-owner className="shrink-0 text-xs text-muted-foreground">
+            · {owner}
+          </span>
+        )}
         <span className="truncate text-xs text-muted-foreground">{item.address ?? item.notes?.split("\n")[0]}</span>
       </button>
@@ export interface DaySectionProps {
   items: StopDayItem[];
+  /** Every Stop's name by id, for the ADR 0049 owning-Stop marker. */
+  stopNames?: ReadonlyMap<string, string>;
@@ export function DaySection({
   items,
+  stopNames,
@@ (row map)
                     costs={costsById?.get(item.id) ?? []}
+                    owner={ownerMarker(item, stopId, stopNames)}
                     isNew={seen.fresh.has(item.id)}
```

`components/plan/stop-open-body.tsx`:

```diff
   onScheduleIdea(idea: ThingToDo, dateISO: string): void;
+  /** Every Stop's name by id, for the ADR 0049 owning-Stop marker on a Changeover day. */
+  stopNames?: ReadonlyMap<string, string>;
@@ (destructure)
   onScheduleIdea,
+  stopNames,
@@ (DaySection props)
               items={dayItems.filter((i) => i.date === s.dateISO)}
+              stopNames={stopNames}
```

`components/plan/mobile/stop-sheet.tsx`:

```diff
-import { buildStopDays, type StopDayItem } from "@/lib/stop-days";
+import { buildStopDays, ownerMarker, type StopDayItem } from "@/lib/stop-days";
@@ export interface StopSheetProps {
   dayItems: StopDayItem[];
+  /** Every Stop's name by id, for the ADR 0049 owning-Stop marker on a Changeover day. */
+  stopNames?: ReadonlyMap<string, string>;
@@ export function StopSheet({
   dayItems,
+  stopNames,
@@ (the day's rows)
-                        items.map((it) => (
-                          <button
-                            key={it.id}
-                            type="button"
-                            aria-label={`${it.startTime ?? ""} ${it.title}`.trim()}
-                            onClick={() => onEditItem(it)}
-                            className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
-                          >
-                            <span className="w-12 shrink-0 text-xs font-bold tabular-nums">{it.startTime ?? ""}</span>
-                            <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(it.category))} aria-hidden />
-                            <span className="min-w-0 flex-1 truncate font-semibold">{it.title}</span>
-                          </button>
-                        ))
+                        items.map((it) => {
+                          const owner = ownerMarker(it, stop.id, stopNames);
+                          return (
+                            <button
+                              key={it.id}
+                              type="button"
+                              aria-label={`${`${it.startTime ?? ""} ${it.title}`.trim()}${owner ? ` (${owner})` : ""}`}
+                              onClick={() => onEditItem(it)}
+                              className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
+                            >
+                              <span className="w-12 shrink-0 text-xs font-bold tabular-nums">{it.startTime ?? ""}</span>
+                              <span className={cn("size-[9px] shrink-0 rounded-full", categoryDotClass(it.category))} aria-hidden />
+                              <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
+                                <span className="min-w-0 truncate font-semibold">{it.title}</span>
+                                {/* ADR 0049 rule 3: on a Changeover day, the Stop whose Budget line this plan counts toward. */}
+                                {owner && (
+                                  <span data-owner className="shrink-0 text-xs text-muted-foreground">
+                                    · {owner}
+                                  </span>
+                                )}
+                              </span>
+                            </button>
+                          );
+                        })
```

`components/trip/itinerary-manager.tsx`:

```diff
   const stops = localStops;
+  // ADR 0049 rule 3: a Changeover day's plan names its owning Stop on the other card.
+  const stopNames = new Map(stops.map((s) => [s.id, s.name] as const));
```

```diff
                     onScheduleIdea={(idea, d) => void handleScheduleThing(idea, d)}
+                    stopNames={stopNames}
```

```diff
           dayItems={dayItemsByStopId?.get(sheetStop.id) ?? []}
+          stopNames={stopNames}
           ideas={thingsToDoByStopId?.get(sheetStop.id) ?? []}
```

- [ ] **Step 4: Run, expect PASS.** Run:
  - `TZ=UTC npx vitest run lib/stop-days.test.ts components/plan components/trip/itinerary-manager.test.tsx`
  - `npx eslint lib/stop-days.ts lib/stop-days.test.ts components/plan components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx`
  - `npx tsc --noEmit`

  The existing stop-sheet tests (`/Louvre/` regex, "Add a plan to Thu 10") and the day-section tests ("Edit Louvre" on an unowned row) pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/stop-days.ts lib/stop-days.test.ts components/plan/day-section.tsx components/plan/day-section.test.tsx components/plan/stop-open-body.tsx components/plan/mobile/stop-sheet.tsx components/plan/mobile/stop-sheet.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): mark a Changeover day's plan with its owning Stop

ADR 0049 rule 3: on the card of the Stop that does not own it, a plan
carries a muted \"· {owning Stop}\" — desktop day sections and the phone
stop sheet — so its Budget line is visible from the plan.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

# Part B

## Part B notes

- **Data is already loaded; no page or query change.** `app/(app)/trips/[tripId]/plan/page.tsx` already selects `checkInTime`/`checkOutTime` (:135-151), attaches each Accommodation's Costs as `accommodations[].costs` (:567-570, from the `allCosts` query that includes `ownerType: "ACCOMMODATION"`), and hands `attachmentsByAccommodationId` to `ItineraryManager` (:181 prop). The stay panel's attachment count comes from that map, mapped in `renderDesktopStop`.
- **Builds on Part A.** Part A rewrites everything in `StopOpenBody` below the top row (DayStrip/SelectedDay → stacked day sections) and rewrites `stop-open-body.test.tsx`. Task B4 changes only the **props interface lines for the stay** (`stay`, `onOpenStay`) and the **top row** (`<div className="flex items-stretch gap-2.5">…StayChip…IdeasBox…</div>`, pre-A :133-136). Apply B4's diffs to the file as Part A left it. In whatever `baseProps` Part A leaves in the test, rename `stay: null` → `accommodations: []` and `onOpenStay` → `onOpenAccommodation`.
- **Container query convention:** Tailwind v4 (`tailwindcss: ^4`). The repo uses `@container` on a wrapper with `@min-[Npx]:` variants one level down (`components/trip/checklist.tsx:211-217`; a container can't query itself). B4 follows that: a wrapper `div.@container` around a `grid grid-cols-1 @min-[640px]:grid-cols-2` row. Grid cells stretch, which gives the equal heights. The 640px is measured on the open body's content box (card width minus 32px of padding). That is close enough to the spec's "~640px".
- **"Clicking a block opens the existing Accommodation view/edit" — how I read it (flag for review):** the block opens the existing **stay dialog** (`StayDialog` hosting `AccommodationRow`s) with **the clicked Accommodation's row already expanded** to its `AccommodationCard`. That card is the view, with Edit, Delete, Notes, Files and the CostEditor. `AccommodationFormDialog` (the edit form) has no Delete and no Notes, so opening it directly would leave both unreachable from the desktop plan. Edit stays one click away (the card's pencil). The alternative reading, opening the edit form directly, is a one-line change in B4's `onOpenAccommodation`.
- **`StayChip` is deleted. `StayDialog` stays**, moved to `components/plan/stay-dialog.tsx` (`git mv` of `stay-chip.tsx` / `stay-chip.test.tsx`, chip code removed). `StayChip` was rendered only by `StopOpenBody`. The folded `StopRow` chip is separate inline markup in `stop-row.tsx:95-118` and is untouched. `StayStatus.checkInTime`/`extra` become unused by any UI but are left alone, because `stop-row`, `mobile-stop-row` and `stop-sheet` still use `stayStatus`.
- **Gap the spec doesn't cover:** a **same-day Stop** (arrive = depart, 0 nights). `stayStatus` returns `null` for it, and today's `StayChip` then wrongly says "Needs dates first". The panel instead says **"Day visit — no nights to cover · + Add a stay"** and still lists any Accommodation blocks.
- **Paid/Unpaid rule:** `AccommodationRow`'s existing rule is reused, not reinvented: "Paid" once **any** Cost on the Accommodation is paid, "Unpaid" while Costs exist and none is paid, nothing when there's no Cost. It moves into `costPaidState` in `lib/plan/plan-model.ts` and both the row and the panel use it. A part-paid stay therefore reads "Paid", as the row already does.
- `components/plan/**` is covered by `banned-classes.test.ts` (no `shadow-soft`, `border-border/70`, `bg-card/40`, raw hex), so the new `stay-panel.tsx` avoids all of them. `accommodation-card.tsx` legitimately uses `shadow-soft` and is **not** added to that test's `FILES` list.

## Review-focus candidates

- **Same-day Stop (0 nights):** the panel shows "Day visit — no nights to cover" with "+ Add a stay". It must not show "Needs dates first", which is what the current chip does. Tested in B1 (`stayCoverage`) and B3 (`StayPanel`).
- **Clicking the map pin inside a block:** the pin opens Maps and does **not** open the stay dialog. The block is a stretched-button card, not a `<button>` wrapping an `<a>`, so the interactive elements are never nested. Tested in B3.
- **Uncovered nights with gaps:** consecutive nights fold into runs and runs are comma-joined, e.g. "2 of 5 nights — no bed Fri 11 Dec, Sun 13 – Mon 14 Dec". No ISO dates leak. Tested in B1 and B3.

---

### Task 25 — B1: Stay coverage, window, cost and paid-state helpers

**Files:**
- Modify: `lib/accommodation-coverage.ts` (whole file, ~20 lines)
- Modify: `lib/plan/plan-model.ts` (imports :6-10; append new exports after `stayStatus`, ~:39)
- Test: `lib/accommodation-coverage.test.ts`, `lib/plan/plan-model.test.ts`

**Interfaces:**
- Consumes: `nightsBetween`, `addDays`, `formatDayLabel` (`lib/dates`); `formatMoney`, `sumMinorToHome` (`lib/money`); existing `formatStayRange`, `plural` in plan-model.
- Produces:
  - `uncoveredNightDates(stop: { arriveDate: string; departDate: string }, accommodations: Array<{ checkIn: string; checkOut: string }>): string[]` (`uncoveredNights` now returns its `.length`)
  - `type StayCoverage = { kind: "rough" } | { kind: "day-visit" } | { kind: "none"; totalNights: number } | { kind: "covered"; totalNights: number } | { kind: "partial"; totalNights: number; coveredNights: number; openNights: string[] }`
  - `stayCoverage(stop: { arriveDate: string | null; departDate: string | null }, accs: readonly { checkIn: string; checkOut: string }[]): StayCoverage`
  - `stayCoverageLine(c: Exclude<StayCoverage, { kind: "rough" }>): string`
  - `formatNightRuns(nights: readonly string[]): string`
  - `stayWindowLabel(a: { checkIn: string; checkOut: string; checkInTime?: string | null; checkOutTime?: string | null }): string`
  - `costPaidState(costs: readonly { paidAt: Date | null }[] | undefined): "paid" | "unpaid" | null`
  - `stayCostLabel(costs: readonly { costMinor: number; currency: string; rateToHome: number | null }[] | undefined, homeCurrency?: string): string | null`

- [ ] **Step 1: Write the failing test**

Append to `lib/accommodation-coverage.test.ts` (and change its import line to `import { uncoveredNightDates, uncoveredNights } from "./accommodation-coverage";`):

```tsx
describe("uncoveredNightDates (spec 2026-10-04 §B — the stay panel's no-bed days)", () => {
  it("lists each open night in date order", () =>
    expect(uncoveredNightDates(stay, [{ checkIn: "2026-07-02", checkOut: "2026-07-03" }])).toEqual(["2026-07-01", "2026-07-03", "2026-07-04"]));
  it("empty when covered, and for a zero-night stay", () => {
    expect(uncoveredNightDates(stay, [{ checkIn: "2026-07-01", checkOut: "2026-07-05" }])).toEqual([]);
    expect(uncoveredNightDates({ arriveDate: "2026-07-01", departDate: "2026-07-01" }, [])).toEqual([]);
  });
  it("uncoveredNights is its length", () =>
    expect(uncoveredNights(stay, [{ checkIn: "2026-07-02", checkOut: "2026-07-03" }])).toBe(3));
});
```

In `lib/plan/plan-model.test.ts`, extend the import:

```tsx
import {
  addStopConsequence, costPaidState, fitTileModel, formatNightRuns, formatStayRange, planHeaderMeta, routeCentroid,
  stayCostLabel, stayCoverage, stayCoverageLine, stayStatus, stayWindowLabel, tripEyebrow,
} from "./plan-model";
import { formatMoney } from "@/lib/money";
```

and add after the `formatStayRange` describe:

```tsx
describe("stayCoverage / stayCoverageLine (spec 2026-10-04 §B coverage line)", () => {
  const PARIS = { arriveDate: "2026-12-10", departDate: "2026-12-15" }; // 5 nights: 10–14 Dec

  it("rough: no dates", () => {
    expect(stayCoverage({ arriveDate: null, departDate: null }, [])).toEqual({ kind: "rough" });
  });
  it("a same-day Stop is a day visit, not 'needs dates'", () => {
    const c = stayCoverage({ arriveDate: "2026-12-10", departDate: "2026-12-10" }, []);
    expect(c).toEqual({ kind: "day-visit" });
    expect(stayCoverageLine(c as Exclude<typeof c, { kind: "rough" }>)).toBe("Day visit — no nights to cover");
  });
  it("none: No bed yet", () => {
    const c = stayCoverage(PARIS, []);
    expect(c).toEqual({ kind: "none", totalNights: 5 });
    expect(stayCoverageLine(c as Exclude<typeof c, { kind: "rough" }>)).toBe("No bed yet");
  });
  it("covered: All N nights covered (one night says night)", () => {
    const c = stayCoverage(PARIS, [{ checkIn: "2026-12-10", checkOut: "2026-12-15" }]);
    expect(stayCoverageLine(c as Exclude<typeof c, { kind: "rough" }>)).toBe("All 5 nights covered");
    const one = stayCoverage({ arriveDate: "2026-12-10", departDate: "2026-12-11" }, [{ checkIn: "2026-12-10", checkOut: "2026-12-11" }]);
    expect(stayCoverageLine(one as Exclude<typeof one, { kind: "rough" }>)).toBe("All 1 night covered");
  });
  it("partial: X of N nights — no bed {runs}", () => {
    const c = stayCoverage(PARIS, [
      { checkIn: "2026-12-10", checkOut: "2026-12-11" },
      { checkIn: "2026-12-12", checkOut: "2026-12-13" },
    ]);
    expect(c).toEqual({ kind: "partial", totalNights: 5, coveredNights: 2, openNights: ["2026-12-11", "2026-12-13", "2026-12-14"] });
    expect(stayCoverageLine(c as Exclude<typeof c, { kind: "rough" }>)).toBe("2 of 5 nights — no bed Fri 11 Dec, Sun 13 – Mon 14 Dec");
  });
  it("Accommodations entirely outside the stay are partial with 0 covered", () => {
    expect(stayCoverage(PARIS, [{ checkIn: "2026-11-01", checkOut: "2026-11-03" }])).toMatchObject({ kind: "partial", coveredNights: 0 });
  });
});

describe("formatNightRuns", () => {
  it("single nights, runs, and runs across a month end", () => {
    expect(formatNightRuns(["2026-12-11"])).toBe("Fri 11 Dec");
    expect(formatNightRuns(["2026-12-11", "2026-12-12", "2026-12-14"])).toBe("Fri 11 – Sat 12 Dec, Mon 14 Dec");
    expect(formatNightRuns(["2026-12-31", "2027-01-01"])).toBe("Thu 31 Dec – Fri 1 Jan");
  });
});

describe("stayWindowLabel", () => {
  it("check-in date + time → check-out date + time, times only where set", () => {
    expect(stayWindowLabel({ checkIn: "2026-12-11", checkOut: "2026-12-14", checkInTime: "15:00", checkOutTime: "11:00" })).toBe(
      "Fri 11 Dec 15:00 → Mon 14 Dec 11:00",
    );
    expect(stayWindowLabel({ checkIn: "2026-12-11", checkOut: "2026-12-14", checkInTime: null })).toBe("Fri 11 Dec → Mon 14 Dec");
  });
});

describe("costPaidState / stayCostLabel", () => {
  const cost = (over: Partial<{ costMinor: number; currency: string; rateToHome: number | null; paidAt: Date | null }> = {}) => ({
    costMinor: 54000, currency: "EUR", rateToHome: null, paidAt: null, ...over,
  });
  it("paid once any cost is paid; unpaid with none paid; null without costs", () => {
    expect(costPaidState(undefined)).toBeNull();
    expect(costPaidState([])).toBeNull();
    expect(costPaidState([cost()])).toBe("unpaid");
    expect(costPaidState([cost(), cost({ paidAt: new Date("2026-10-01") })])).toBe("paid");
  });
  it("one currency sums in it; mixed converts to home; mixed without home lists each", () => {
    expect(stayCostLabel(undefined)).toBeNull();
    expect(stayCostLabel([cost(), cost({ costMinor: 6000 })])).toBe(formatMoney(60000, "EUR"));
    expect(stayCostLabel([cost(), cost({ costMinor: 10000, currency: "AUD" })], "AUD")).toBe(formatMoney(10000, "AUD"));
    expect(stayCostLabel([cost({ rateToHome: 1.6 }), cost({ costMinor: 10000, currency: "AUD" })], "AUD")).toBe(formatMoney(96400, "AUD"));
    expect(stayCostLabel([cost(), cost({ costMinor: 10000, currency: "AUD" })])).toBe(`${formatMoney(54000, "EUR")} + ${formatMoney(10000, "AUD")}`);
  });
});
```

and inside the existing `describe("no ISO dates leak into any produced label")`, add:

```tsx
  it("stay panel labels (spec 2026-10-04 §B)", () => {
    const c = stayCoverage({ arriveDate: "2026-12-10", departDate: "2026-12-15" }, [{ checkIn: "2026-12-12", checkOut: "2026-12-13" }]);
    expect(stayCoverageLine(c as Exclude<typeof c, { kind: "rough" }>)).not.toMatch(ISO);
    expect(stayWindowLabel({ checkIn: "2026-12-27", checkOut: "2027-01-03", checkInTime: "15:00" })).not.toMatch(ISO);
  });
```

(The third `stayCostLabel` line is mixed currency with a home currency and a missing rate. `sumMinorToHome` drops EUR because it has no `rateToHome`, the same as `daySummary` in `selected-day.tsx`, so `[EUR 540, AUD 100] → A$100`. The fourth line: 54000 × 1.6 = 86400, + 10000 = 96400.)

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/accommodation-coverage.test.ts lib/plan/plan-model.test.ts`. Expect failures/TypeScript import errors: `uncoveredNightDates`, `stayCoverage`, `stayCoverageLine`, `formatNightRuns`, `stayWindowLabel`, `costPaidState`, `stayCostLabel` are not exported.

- [ ] **Step 3: Implement**

`lib/accommodation-coverage.ts`: replace the body with:

```ts
import { addDays, nightsBetween } from "@/lib/dates";

/**
 * The nights (each the evening's YYYY-MM-DD) of a scheduled Stop's stay
 * (arrive → depart) that no Accommodation covers, in date order. A night is
 * covered when some booking has checkIn <= night < checkOut. The stay panel
 * names them ("no bed Fri 11 Dec", spec 2026-10-04 §B).
 */
export function uncoveredNightDates(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): string[] {
  const nights = nightsBetween(stop.arriveDate, stop.departDate);
  const open: string[] = [];
  for (let d = 0; d < nights; d++) {
    const night = addDays(stop.arriveDate, d);
    if (!accommodations.some((a) => a.checkIn <= night && night < a.checkOut)) open.push(night);
  }
  return open;
}

/**
 * How many nights of a scheduled Stop's stay no Accommodation covers. Shared
 * by Flag rule 14 (lib/flags.ts) and the Stop card's add affordance (spec
 * 2026-09-28 D6): "Add accommodation" while any night is uncovered, "Add
 * another place" once every night is.
 */
export function uncoveredNights(
  stop: { arriveDate: string; departDate: string },
  accommodations: Array<{ checkIn: string; checkOut: string }>,
): number {
  return uncoveredNightDates(stop, accommodations).length;
}
```

`lib/plan/plan-model.ts`: imports become

```ts
import { uncoveredNightDates, uncoveredNights } from "@/lib/accommodation-coverage";
import { addDays, daysBetween, formatDayLabel, nightsBetween, parseISODate } from "@/lib/dates";
import { formatMoney, sumMinorToHome } from "@/lib/money";
```

and add right after `stayStatus` (before `formatStayRange`):

```ts
/** Spec 2026-10-04 §B: the stay panel's coverage line, under its Accommodation blocks. */
export type StayCoverage =
  | { kind: "rough" }
  | { kind: "day-visit" }
  | { kind: "none"; totalNights: number }
  | { kind: "covered"; totalNights: number }
  | { kind: "partial"; totalNights: number; coveredNights: number; openNights: string[] };

/** Unlike stayStatus, a same-day Stop is its own case ("day-visit"), not null. */
export function stayCoverage(
  stop: { arriveDate: string | null; departDate: string | null },
  accs: readonly { checkIn: string; checkOut: string }[],
): StayCoverage {
  if (!stop.arriveDate || !stop.departDate) return { kind: "rough" };
  const totalNights = nightsBetween(stop.arriveDate, stop.departDate);
  if (totalNights === 0) return { kind: "day-visit" };
  if (accs.length === 0) return { kind: "none", totalNights };
  const openNights = uncoveredNightDates({ arriveDate: stop.arriveDate, departDate: stop.departDate }, [...accs]);
  if (openNights.length === 0) return { kind: "covered", totalNights };
  return { kind: "partial", totalNights, coveredNights: totalNights - openNights.length, openNights };
}

/** "All 5 nights covered" / "3 of 5 nights — no bed Fri 11 Dec" / "No bed yet" / "Day visit — no nights to cover". */
export function stayCoverageLine(c: Exclude<StayCoverage, { kind: "rough" }>): string {
  switch (c.kind) {
    case "day-visit":
      return "Day visit — no nights to cover";
    case "none":
      return "No bed yet";
    case "covered":
      return `All ${plural(c.totalNights, "night")} covered`;
    case "partial":
      return `${c.coveredNights} of ${plural(c.totalNights, "night")} — no bed ${formatNightRuns(c.openNights)}`;
  }
}

/** "Fri 11 Dec, Sun 13 – Mon 14 Dec": sorted night dates folded into consecutive runs. */
export function formatNightRuns(nights: readonly string[]): string {
  const runs: [string, string][] = [];
  for (const night of nights) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[1], 1) === night) last[1] = night;
    else runs.push([night, night]);
  }
  return runs.map(([a, b]) => (a === b ? formatDayLabel(a) : formatStayRange(a, b))).join(", ");
}

/** "Fri 11 Dec 15:00 → Mon 14 Dec 11:00" — each time only where set (spec 2026-10-04 §B). */
export function stayWindowLabel(a: {
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}): string {
  const end = (date: string, time?: string | null) => (time ? `${formatDayLabel(date)} ${time}` : formatDayLabel(date));
  return `${end(a.checkIn, a.checkInTime)} → ${end(a.checkOut, a.checkOutTime)}`;
}

/**
 * Paid state at a glance (AccommodationRow and the stay panel): "paid" once
 * any cost is marked paid, "unpaid" while costs exist but none is, null when
 * no cost is recorded.
 */
export function costPaidState(costs: readonly { paidAt: Date | null }[] | undefined): "paid" | "unpaid" | null {
  if (!costs || costs.length === 0) return null;
  return costs.some((c) => c.paidAt != null) ? "paid" : "unpaid";
}

/**
 * An Accommodation's total cost: summed in its currency when there's one;
 * converted to the home currency when mixed (a currency with no rate drops
 * out, as daySummary does); each currency listed when mixed with no home.
 */
export function stayCostLabel(
  costs: readonly { costMinor: number; currency: string; rateToHome: number | null }[] | undefined,
  homeCurrency?: string,
): string | null {
  if (!costs || costs.length === 0) return null;
  const currencies = [...new Set(costs.map((c) => c.currency.toUpperCase()))];
  const sumIn = (cur: string) => costs.filter((c) => c.currency.toUpperCase() === cur).reduce((s, c) => s + c.costMinor, 0);
  if (currencies.length === 1) return formatMoney(sumIn(currencies[0]), currencies[0]);
  if (homeCurrency) {
    const { totalMinor } = sumMinorToHome(
      costs.map((c) => ({ amountMinor: c.costMinor, currency: c.currency })),
      homeCurrency,
      (cur) => costs.find((c) => c.currency.toUpperCase() === cur)?.rateToHome ?? undefined,
    );
    return formatMoney(totalMinor, homeCurrency);
  }
  return currencies.map((cur) => formatMoney(sumIn(cur), cur)).join(" + ");
}
```

(`plural` is a module-level `const` declared further down the file. These functions only call it at run time, so the order is fine. `stayStatus` keeps using `uncoveredNights`.)

- [ ] **Step 4: Run, expect PASS**

`npx vitest run lib/accommodation-coverage.test.ts lib/plan/plan-model.test.ts lib/flags.test.ts`. All green: `lib/flags.ts` rule 14 still calls `uncoveredNights` and must be unchanged. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```
git add lib/accommodation-coverage.ts lib/accommodation-coverage.test.ts lib/plan/plan-model.ts lib/plan/plan-model.test.ts
git commit -m "feat(plan): stay coverage, window, cost and paid-state helpers

Pure helpers for the inline stay panel (spec 2026-10-04 §B): which nights
have no bed, the coverage line, the check-in → check-out window, an
Accommodation's cost and Paid/Unpaid.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26 — B2: Check-in/out times in AccommodationRow and AccommodationCard; a row that can start expanded

**Files:**
- Modify: `lib/dates.ts` (append after `formatDateRangeCompact`, ~:99)
- Modify: `components/trip/accommodation-row.tsx` (props :18-31, paid state :40-48, `useState` :49, line-2 :85)
- Modify: `components/trip/accommodation-card.tsx` (imports :2,5; dates row :147-155)
- Test: `lib/dates.test.ts`, `components/trip/accommodation-row.test.tsx`, `components/trip/accommodation-card.test.tsx`

**Interfaces:**
- Consumes: `costPaidState` (B1).
- Produces:
  - `formatCheckTimes(checkInTime?: string | null, checkOutTime?: string | null, style?: "short" | "long"): string | null`. Short: `"in 15:00 · out 11:00"`. Long: `"Check-in 15:00 · Check-out 11:00"`.
  - `AccommodationRowProps.defaultOpen?: boolean` (the row starts expanded). B4 uses it.

- [ ] **Step 1: Write the failing test**

`lib/dates.test.ts`: add `formatCheckTimes,` to the import list and append:

```tsx
describe("formatCheckTimes (spec 2026-10-04 §B)", () => {
  it("short: in / out, only the ones set", () => {
    expect(formatCheckTimes("15:00", "11:00")).toBe("in 15:00 · out 11:00");
    expect(formatCheckTimes("15:00", null)).toBe("in 15:00");
    expect(formatCheckTimes(null, "11:00")).toBe("out 11:00");
    expect(formatCheckTimes(null, undefined)).toBeNull();
    expect(formatCheckTimes("", "")).toBeNull();
  });
  it("long: Check-in / Check-out", () => {
    expect(formatCheckTimes("15:00", "11:00", "long")).toBe("Check-in 15:00 · Check-out 11:00");
  });
});
```

`components/trip/accommodation-row.test.tsx`: append:

```tsx
it("shows check-in/out times on the collapsed line where set (spec 2026-10-04 §B)", () => {
  render(<AccommodationRow accommodation={{ ...accommodation, checkInTime: "15:00", checkOutTime: "11:00" }} stop={stop} />);
  expect(screen.getByRole("button", { name: /Hotel du Louvre/ })).toHaveTextContent("in 15:00 · out 11:00");
});

it("shows no times when none is set", () => {
  render(<AccommodationRow accommodation={accommodation} stop={stop} />);
  expect(screen.getByRole("button", { name: /Hotel du Louvre/ })).not.toHaveTextContent(/\bin \d|out \d/);
});

it("defaultOpen starts expanded (the stay panel opens a block this way)", () => {
  render(<AccommodationRow accommodation={accommodation} stop={stop} defaultOpen />);
  expect(screen.getByRole("button", { name: /Hotel du Louvre/, expanded: true })).toBeInTheDocument();
  expect(screen.getByTestId("accommodation-card")).toBeInTheDocument();
});
```

`components/trip/accommodation-card.test.tsx`: append:

```tsx
describe("AccommodationCard check-in/out times (spec 2026-10-04 §B)", () => {
  it("shows both times beside the dates", () => {
    render(<AccommodationCard accommodation={{ ...baseAcc, checkInTime: "15:00", checkOutTime: "10:00" }} stop={baseStop} />);
    expect(screen.getByText("Check-in 15:00 · Check-out 10:00")).toBeInTheDocument();
  });
  it("shows only the time that is set", () => {
    render(<AccommodationCard accommodation={{ ...baseAcc, checkInTime: "14:00" }} stop={baseStop} />);
    expect(screen.getByText("Check-in 14:00")).toBeInTheDocument();
  });
  it("shows no time line when neither is set", () => {
    render(<AccommodationCard accommodation={baseAcc} stop={baseStop} />);
    expect(screen.queryByText(/Check-in|Check-out/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run lib/dates.test.ts components/trip/accommodation-row.test.tsx components/trip/accommodation-card.test.tsx`. Expect: `formatCheckTimes` is not exported, the row shows no times, `defaultOpen` is ignored (aria-expanded false), and the card has no "Check-in" text.

- [ ] **Step 3: Implement**

`lib/dates.ts`, after `formatDateRangeCompact`:

```ts
/**
 * An Accommodation's set check-in/out times (spec 2026-10-04 §B): short
 * "in 15:00 · out 11:00" for a one-line row, long "Check-in 15:00 ·
 * Check-out 11:00" for the card. Null when neither is set.
 */
export function formatCheckTimes(
  checkInTime?: string | null,
  checkOutTime?: string | null,
  style: "short" | "long" = "short",
): string | null {
  const [inWord, outWord] = style === "long" ? ["Check-in", "Check-out"] : ["in", "out"];
  const parts: string[] = [];
  if (checkInTime) parts.push(`${inWord} ${checkInTime}`);
  if (checkOutTime) parts.push(`${outWord} ${checkOutTime}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
```

`components/trip/accommodation-row.tsx`:

```diff
-import { formatDateRange } from "@/lib/dates";
+import { formatCheckTimes, formatDateRange } from "@/lib/dates";
+import { costPaidState } from "@/lib/plan/plan-model";
 import { accommodationDateWarnings } from "@/lib/validations/accommodation";
@@ export interface AccommodationRowProps {
   attachments?: AttachmentView[];
   forkId?: string | null;
+  /** Start expanded — the stay panel opens the stay dialog on the block clicked (spec 2026-10-04 §B). */
+  defaultOpen?: boolean;
 }
@@ export function AccommodationRow(props: AccommodationRowProps) {
-  const { accommodation: a, stop, isPending = false, costs } = props;
-  // Paid state at a glance: "paid ✓" once any cost is marked paid, "unpaid"
-  // while costs exist but none is, nothing when no cost is recorded.
-  const paidState =
-    costs && costs.length > 0
-      ? costs.some((c) => c.paidAt != null)
-        ? "paid"
-        : "unpaid"
-      : null;
-  const [open, setOpen] = React.useState(false);
+  const { accommodation: a, stop, isPending = false, costs, defaultOpen = false } = props;
+  // Paid state at a glance (shared with the stay panel): "paid ✓" once any
+  // cost is marked paid, "unpaid" while costs exist but none is.
+  const paidState = costPaidState(costs);
+  const times = formatCheckTimes(a.checkInTime, a.checkOutTime);
+  const [open, setOpen] = React.useState(defaultOpen);
@@ line 2
           <span className="shrink-0 text-xs text-foreground/80">{formatDateRange(a.checkIn, a.checkOut)}</span>
+          {times && <span className="shrink-0 text-xs text-foreground/80">{times}</span>}
           {a.confirmation && (
```

`AccommodationCard` receives `{...props}` and so gets `defaultOpen` too. That's harmless: the card destructures only its named props, so the extra one never reaches the DOM, and TSX doesn't excess-check spread attributes. Leave `<AccommodationCard {...props} embedded />` as is. (The repo's ESLint has no `_`-prefix ignore, so don't destructure it away.)

`components/trip/accommodation-card.tsx`:

```diff
-import { Calendar, Hash, StickyNote, AlertTriangle, Home } from "lucide-react";
+import { Calendar, Clock, Hash, StickyNote, AlertTriangle, Home } from "lucide-react";
@@
-import { formatDateRange, nightsBetween } from "@/lib/dates";
+import { formatCheckTimes, formatDateRange, nightsBetween } from "@/lib/dates";
@@ in the component, beside dateRange
   const dateRange = formatDateRange(a.checkIn, a.checkOut);
+  const times = formatCheckTimes(a.checkInTime, a.checkOutTime, "long");
@@ the "Dates + nights" row
         <span>
           {nights === 0 ? "Same-day" : `${nights} ${nights === 1 ? "night" : "nights"}`}
         </span>
+        {times && (
+          <div className="flex items-center gap-1.5">
+            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
+            <span>{times}</span>
+          </div>
+        )}
       </div>
```

- [ ] **Step 4: Run, expect PASS**

`npx vitest run lib/dates.test.ts components/trip/accommodation-row.test.tsx components/trip/accommodation-card.test.tsx components/plan/mobile/stop-sheet.test.tsx`. The stop sheet's Stay tab hosts these rows, so it must stay green; no edit is needed. Existing row tests that assert "paid ✓" / "unpaid" must stay green unchanged. Then `npx tsc --noEmit` and `npx eslint components/trip/accommodation-row.tsx components/trip/accommodation-card.tsx lib/dates.ts`.

- [ ] **Step 5: Commit**

```
git add lib/dates.ts lib/dates.test.ts components/trip/accommodation-row.tsx components/trip/accommodation-row.test.tsx components/trip/accommodation-card.tsx components/trip/accommodation-card.test.tsx
git commit -m "feat(stay): show check-in/out times on Accommodation rows and cards

The stay dialog and the phone sheet's Stay tab now show times where set
(spec 2026-10-04 §B). AccommodationRow can start expanded and shares the
Paid/Unpaid rule via costPaidState.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27 — B3: StayPanel component

**Files:**
- Create: `components/plan/stay-panel.tsx`
- Test (create): `components/plan/stay-panel.test.tsx`

**Interfaces:**
- Consumes: `stayCoverage`, `stayCoverageLine`, `stayWindowLabel`, `stayCostLabel`, `costPaidState` (B1); `MapLink` (`components/trip/map-link.tsx`); `Badge` (`components/ui/badge`, variants `teal`/`muted`); `AccommodationCardAccommodation` (type); `CostRow` (type).
- Produces:
  - `export interface StayPanelAccommodation extends AccommodationCardAccommodation { costs?: CostRow[]; attachmentCount?: number }`
  - `export interface StayPanelProps { stop: { arriveDate: string | null; departDate: string | null }; accommodations: StayPanelAccommodation[]; homeCurrency?: string; onOpen(accommodationId: string): void; onAdd(): void }`
  - `export function StayPanel(props: StayPanelProps)`. Root has `data-testid="stay-panel"`, each block has `data-testid="stay-block"`, the coverage line has `data-testid="stay-coverage"`.

- [ ] **Step 1: Write the failing test**

`components/plan/stay-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StayPanel, type StayPanelAccommodation } from "./stay-panel";
import { formatMoney } from "@/lib/money";

const PARIS = { arriveDate: "2026-12-10", departDate: "2026-12-14" }; // 4 nights: 10–13 Dec

const cost = (over = {}) => ({
  id: "c1", costMinor: 54000, paidMinor: null, currency: "EUR", rateToHome: null, paidAt: null,
  dueDate: null, ownerType: "ACCOMMODATION", ownerId: "acc1", label: null, category: null, settlement: "BEFORE", ...over,
});

const HOTEL: StayPanelAccommodation = {
  id: "acc1",
  stopId: "par",
  name: "Hôtel Grands Boulevards",
  address: "17 Bd Poissonnière, Paris",
  checkIn: "2026-12-11",
  checkOut: "2026-12-14",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  confirmation: "HGB-4471",
  notes: "Ring the night bell\nCode is 1234",
  lat: 48.87,
  lng: 2.35,
  costs: [cost({ paidAt: new Date("2026-10-01") })],
  attachmentCount: 2,
};

const props = (over: Partial<React.ComponentProps<typeof StayPanel>> = {}) => ({
  stop: PARIS, accommodations: [HOTEL], homeCurrency: "AUD", onOpen: vi.fn(), onAdd: vi.fn(), ...over,
});

describe("StayPanel (spec 2026-10-04 §B)", () => {
  it("a display heading: Where you're staying", () => {
    render(<StayPanel {...props()} />);
    const heading = screen.getByRole("heading", { name: "Where you’re staying" });
    expect(heading.className).toContain("font-display");
  });

  it("one block per Accommodation with every set detail", () => {
    render(<StayPanel {...props()} />);
    const block = screen.getByTestId("stay-block");
    expect(block).toHaveTextContent("Hôtel Grands Boulevards");
    expect(block).toHaveTextContent("Fri 11 Dec 15:00 → Mon 14 Dec 11:00 · 3 nights");
    expect(block).toHaveTextContent("17 Bd Poissonnière, Paris");
    expect(within(block).getByRole("link", { name: "Open Hôtel Grands Boulevards in Maps" })).toBeInTheDocument();
    expect(block).toHaveTextContent("HGB-4471");
    expect(block).toHaveTextContent(formatMoney(54000, "EUR"));
    expect(within(block).getByText("Paid")).toBeInTheDocument();
    expect(block).toHaveTextContent("Ring the night bell");
    expect(block).not.toHaveTextContent("Code is 1234");
    expect(block).toHaveTextContent("2 files");
  });

  it("leaves out what isn't set; an unpaid cost says Unpaid", () => {
    const bare: StayPanelAccommodation = {
      id: "acc2", stopId: "par", name: "Ibis Gare de l'Est", checkIn: "2026-12-10", checkOut: "2026-12-11",
      costs: [cost({ id: "c2", ownerId: "acc2" })],
    };
    render(<StayPanel {...props({ accommodations: [bare] })} />);
    const block = screen.getByTestId("stay-block");
    expect(block).toHaveTextContent("Thu 10 Dec → Fri 11 Dec · 1 night");
    expect(within(block).queryByRole("link")).toBeNull();
    expect(within(block).getByText("Unpaid")).toBeInTheDocument();
    expect(block).not.toHaveTextContent(/file/);
  });

  it("clicking a block opens that Accommodation", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Hôtel Grands Boulevards" }));
    expect(p.onOpen).toHaveBeenCalledWith("acc1");
  });

  it("the map pin opens Maps, not the block — and is not nested in the block's button", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    const button = screen.getByRole("button", { name: "Hôtel Grands Boulevards" });
    const link = screen.getByRole("link", { name: "Open Hôtel Grands Boulevards in Maps" });
    expect(button).not.toContainElement(link);
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom can't navigate
    await userEvent.click(link);
    expect(p.onOpen).not.toHaveBeenCalled();
  });

  it("partial: X of N nights — no bed {days} · + Add another place", async () => {
    const p = props();
    render(<StayPanel {...p} />);
    const line = screen.getByTestId("stay-coverage");
    expect(line).toHaveTextContent("3 of 4 nights — no bed Thu 10 Dec");
    await userEvent.click(within(line).getByRole("button", { name: "+ Add another place" }));
    expect(p.onAdd).toHaveBeenCalled();
  });

  it("partial with gaps folds consecutive nights into runs", () => {
    const a = (id: string, checkIn: string, checkOut: string): StayPanelAccommodation => ({ id, stopId: "par", name: id, checkIn, checkOut });
    render(
      <StayPanel
        {...props({
          stop: { arriveDate: "2026-12-10", departDate: "2026-12-15" },
          accommodations: [a("A", "2026-12-10", "2026-12-11"), a("B", "2026-12-12", "2026-12-13")],
        })}
      />,
    );
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("2 of 5 nights — no bed Fri 11 Dec, Sun 13 – Mon 14 Dec");
  });

  it("covered: All N nights covered · + Add another place", () => {
    render(<StayPanel {...props({ accommodations: [{ ...HOTEL, checkIn: "2026-12-10" }] })} />);
    const line = screen.getByTestId("stay-coverage");
    expect(line).toHaveTextContent("All 4 nights covered");
    expect(within(line).getByRole("button", { name: "+ Add another place" })).toBeInTheDocument();
  });

  it("no Accommodation: No bed yet · + Add a stay", async () => {
    const p = props({ accommodations: [] });
    render(<StayPanel {...p} />);
    expect(screen.queryByTestId("stay-block")).toBeNull();
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("No bed yet");
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(p.onAdd).toHaveBeenCalled();
  });

  it("a same-day Stop is a day visit, not 'Needs dates first'", () => {
    render(<StayPanel {...props({ stop: { arriveDate: "2026-12-10", departDate: "2026-12-10" }, accommodations: [] })} />);
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("Day visit — no nights to cover");
    expect(screen.getByRole("button", { name: "+ Add a stay" })).toBeInTheDocument();
    expect(screen.queryByText("Needs dates first")).toBeNull();
  });

  it("rough: Needs dates first, nothing interactive", () => {
    render(<StayPanel {...props({ stop: { arriveDate: null, departDate: null }, accommodations: [] })} />);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("long names and addresses truncate inside the block instead of widening it", () => {
    render(<StayPanel {...props()} />);
    const block = screen.getByTestId("stay-block");
    expect(block.className).toContain("min-w-0");
    expect(screen.getByRole("button", { name: "Hôtel Grands Boulevards" }).className).toContain("truncate");
    expect(screen.getByText("17 Bd Poissonnière, Paris").className).toContain("truncate");
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/plan/stay-panel.test.tsx`. Expect: "Failed to resolve import ./stay-panel".

- [ ] **Step 3: Implement**

`components/plan/stay-panel.tsx`:

```tsx
"use client";

import * as React from "react";
import { BedDouble, Check, Hash, Paperclip, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { MapLink } from "@/components/trip/map-link";
import { nightsBetween } from "@/lib/dates";
import {
  costPaidState,
  stayCostLabel,
  stayCoverage,
  stayCoverageLine,
  stayWindowLabel,
  type StayCoverage,
} from "@/lib/plan/plan-model";
import type { AccommodationCardAccommodation } from "@/components/trip/accommodation-card";
import type { CostRow } from "@/server/actions/costs";

/** One Accommodation as the stay panel lists it: the card's fields plus its Costs and file count. */
export interface StayPanelAccommodation extends AccommodationCardAccommodation {
  costs?: CostRow[];
  attachmentCount?: number;
}

export interface StayPanelProps {
  stop: { arriveDate: string | null; departDate: string | null };
  accommodations: StayPanelAccommodation[];
  homeCurrency?: string;
  /** Opens the existing Accommodation view — the stay dialog with this one expanded. */
  onOpen(accommodationId: string): void;
  onAdd(): void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const ADD_CLASS = "tap-target shrink-0 whitespace-nowrap text-xs font-bold text-coral-text";

/** The first non-blank line of an Accommodation's notes. */
function firstLine(notes: string | null | undefined): string | null {
  return notes?.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? null;
}

function StayBlock({
  a,
  homeCurrency,
  onOpen,
}: {
  a: StayPanelAccommodation;
  homeCurrency?: string;
  onOpen(id: string): void;
}) {
  const nights = nightsBetween(a.checkIn, a.checkOut);
  const cost = stayCostLabel(a.costs, homeCurrency);
  const paid = costPaidState(a.costs);
  const note = firstLine(a.notes);
  const files = a.attachmentCount ?? 0;

  // A stretched button (its ::after covers the block), not a <button> around
  // the whole block: the map pin is a real link and can't nest inside one, so
  // it sits above the overlay (relative z-10) and opens Maps on its own.
  return (
    <li
      data-testid="stay-block"
      className="relative flex min-w-0 flex-col gap-0.5 rounded-xl border-2 border-border bg-background px-2.5 py-2 text-xs text-foreground/80 hover:bg-teal/10 has-[button:focus-visible]:outline-[3px] has-[button:focus-visible]:outline-ring"
    >
      <button
        type="button"
        onClick={() => onOpen(a.id)}
        className="truncate text-left text-[13px] font-bold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none"
      >
        {a.name}
      </button>
      <p>
        {stayWindowLabel(a)} · {nights === 0 ? "Same-day" : plural(nights, "night")}
      </p>
      {a.address && (
        <p className="flex min-w-0 items-center gap-1">
          <span className="truncate">{a.address}</span>
          <MapLink lat={a.lat} lng={a.lng} address={a.address} label={a.name} className="relative z-10 text-foreground/80" />
        </p>
      )}
      {a.confirmation && (
        <p className="flex items-center gap-1 font-mono">
          <Hash className="size-3 shrink-0" aria-hidden="true" />
          {a.confirmation}
        </p>
      )}
      {cost && (
        <p className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">{cost}</span>
          {paid === "paid" ? <Badge variant="teal">Paid</Badge> : <Badge variant="muted">Unpaid</Badge>}
        </p>
      )}
      {note && (
        <p className="flex min-w-0 items-center gap-1">
          <StickyNote className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{note}</span>
        </p>
      )}
      {files > 0 && (
        <p className="flex items-center gap-1">
          <Paperclip className="size-3 shrink-0" aria-hidden="true" />
          {plural(files, "file")}
        </p>
      )}
    </li>
  );
}

function CoverageLine({ coverage, onAdd }: { coverage: Exclude<StayCoverage, { kind: "rough" }>; onAdd(): void }) {
  const add = coverage.kind === "covered" || coverage.kind === "partial" ? "+ Add another place" : "+ Add a stay";
  return (
    <p data-testid="stay-coverage" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold">
      <span
        className={cn(
          coverage.kind === "covered" && "text-teal-text",
          (coverage.kind === "partial" || coverage.kind === "none") && "text-coral-text",
          coverage.kind === "day-visit" && "text-muted-foreground",
        )}
      >
        {coverage.kind === "covered" && <Check className="mr-0.5 inline size-3" aria-hidden="true" />}
        {stayCoverageLine(coverage)}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" className={ADD_CLASS} onClick={onAdd}>
        {add}
      </button>
    </p>
  );
}

/**
 * Spec 2026-10-04 §B: the open Stop card's stay panel, beside the ideas box —
 * one block per Accommodation, then the coverage line. Replaces the stay chip.
 */
export function StayPanel({ stop, accommodations, homeCurrency, onOpen, onAdd }: StayPanelProps) {
  const headingId = React.useId();
  const coverage = stayCoverage(stop, accommodations);
  const rough = coverage.kind === "rough";

  return (
    <section
      aria-labelledby={headingId}
      data-testid="stay-panel"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[14px] border-2 border-border bg-card px-3 py-2.5",
        (rough || coverage.kind === "none") && "border-dashed",
        coverage.kind === "none" && "bg-coral/20",
      )}
    >
      <h3 id={headingId} className="flex items-center gap-1.5 font-display text-base font-extrabold leading-tight">
        <BedDouble className="size-4 shrink-0" aria-hidden="true" />
        Where you&rsquo;re staying
      </h3>
      {!rough && accommodations.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {accommodations.map((a) => (
            <StayBlock key={a.id} a={a} homeCurrency={homeCurrency} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {rough ? (
        <p className="text-[13px] font-bold text-muted-foreground">Needs dates first</p>
      ) : (
        <CoverageLine coverage={coverage} onAdd={onAdd} />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

`npx vitest run components/plan/stay-panel.test.tsx components/plan/banned-classes.test.ts`. The ban scan walks `components/plan` and must pass for the new file. Then `npx tsc --noEmit` and `npx eslint components/plan/stay-panel.tsx components/plan/stay-panel.test.tsx`.

- [ ] **Step 5: Commit**

```
git add components/plan/stay-panel.tsx components/plan/stay-panel.test.tsx
git commit -m "feat(plan): StayPanel — Accommodation blocks and a coverage line

Where you're staying: one block per Accommodation (window with times,
nights, address + map link, confirmation, cost with Paid/Unpaid, first
note line, file count) and the coverage line with + Add (spec 2026-10-04 §B).
Not mounted yet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 28 — B4: Mount the stay panel beside the ideas box; retire the stay chip

**Runs after Part A.** The diffs below touch only the stay props and the top row of `StopOpenBody`.

**Files:**
- Modify: `components/plan/stop-open-body.tsx`: the import of `StayChip`, the `StayStatus` import, the props `stay`/`onOpenStay` (pre-A :36, :38), the destructured params, the top row (pre-A :133-136)
- Modify: `components/plan/ideas-box.tsx` (`IdeasBoxProps` :43-48, signature :54, root div :87)
- Rename + modify: `components/plan/stay-chip.tsx` → `components/plan/stay-dialog.tsx`; `components/plan/stay-chip.test.tsx` → `components/plan/stay-dialog.test.tsx`
- Modify: `components/trip/itinerary-manager.tsx`: import :17, state :663, `renderAccommodationRows` :1697-1719, `StopOpenBody` call :1751-1776, `stayStop` :1830, `StayDialog` mount :2385-2396
- Test: `components/plan/stop-open-body.test.tsx`, `components/trip/itinerary-manager.test.tsx` (:2173-2200)

**Interfaces:**
- Consumes: `StayPanel`, `StayPanelAccommodation` (B3); `AccommodationRowProps.defaultOpen` (B2).
- Produces:
  - `StopOpenBodyProps`: **removes** `stay: StayStatus | null` and `onOpenStay(): void`. **Adds** `accommodations: StayPanelAccommodation[]` and `onOpenAccommodation(accommodationId: string): void`. `onAddStay` is unchanged.
  - `IdeasBoxProps.className?: string`.
  - `components/plan/stay-dialog.tsx` exports `StayDialog`, `StayDialogProps` (unchanged API). `StayChip` no longer exists.
  - In `ItineraryManager`: `renderAccommodationRows(stop, expandedId?: string | null)`.

- [ ] **Step 1: Write the failing test**

In `components/plan/stop-open-body.test.tsx` (as Part A left it), rename in `baseProps` `stay: null` → `accommodations: []` and `onOpenStay: vi.fn()` → `onOpenAccommodation: vi.fn()`, then add:

```tsx
describe("StopOpenBody top row (spec 2026-10-04 §B)", () => {
  const HOTEL = { id: "acc1", stopId: "par", name: "Hôtel Grands Boulevards", checkIn: "2026-12-10", checkOut: "2026-12-14", checkInTime: "15:00" };

  it("stay panel then ideas box: equal columns from a 640px-wide card, stacked (stay first) below — by container query", () => {
    wrap(<StopOpenBody {...baseProps()} />);
    const row = screen.getByTestId("stop-top-row");
    expect(row.parentElement?.className).toContain("@container");
    expect(row.className).toContain("grid-cols-1");
    expect(row.className).toContain("@min-[640px]:grid-cols-2");
    expect(row.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols/);
    expect(row.children[0]).toBe(screen.getByTestId("stay-panel"));
    expect(row.children[1]).toHaveTextContent("+ Add an idea");
  });

  it("a block opens that Accommodation; the coverage line adds a stay", async () => {
    const props = baseProps({ accommodations: [HOTEL] });
    wrap(<StopOpenBody {...props} />);
    expect(screen.getByTestId("stay-block")).toHaveTextContent("Thu 10 Dec 15:00 → Mon 14 Dec · 4 nights");
    await userEvent.click(screen.getByRole("button", { name: "Hôtel Grands Boulevards" }));
    expect(props.onOpenAccommodation).toHaveBeenCalledWith("acc1");
    await userEvent.click(screen.getByRole("button", { name: "+ Add another place" }));
    expect(props.onAddStay).toHaveBeenCalled();
  });

  it("no stay: No bed yet · + Add a stay", async () => {
    const props = baseProps();
    wrap(<StopOpenBody {...props} />);
    expect(screen.getByTestId("stay-coverage")).toHaveTextContent("No bed yet");
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(props.onAddStay).toHaveBeenCalled();
  });
});
```

The existing rough test ("Needs dates first") keeps passing: the panel renders that text for a rough Stop.

In `components/trip/itinerary-manager.test.tsx`, replace the test at :2173 (`"the stay chip opens the stay dialog with the accommodation row"`) with:

```tsx
  it("a stay panel block opens the stay dialog with that Accommodation already expanded", async () => {
    const user = userEvent.setup();
    const scheduledStop = makeStop({
      id: "s1",
      name: "Rome",
      arriveDate: "2026-07-10",
      departDate: "2026-07-13",
      accommodations: [
        {
          id: "acc-1",
          stopId: "s1",
          name: "Hotel Roma",
          checkIn: "2026-07-10",
          checkOut: "2026-07-13",
          checkInTime: "14:00",
          costs: [],
        },
      ],
    });

    renderPlan(
      <ItineraryManager
        {...baseProps}
        initialStops={[scheduledStop]}
        attachmentsByAccommodationId={
          new Map([
            [
              "acc-1",
              [{ id: "f1", filename: "booking.pdf", mime: "application/pdf", size: 10, url: "/api/attachments/f1", uploadedById: "u1", createdAt: new Date("2026-06-01") }],
            ],
          ])
        }
      />,
      ["s1"],
    );

    const block = desktop().getByTestId("stay-block");
    expect(block).toHaveTextContent("Fri 10 Jul 14:00 → Mon 13 Jul · 3 nights");
    expect(block).toHaveTextContent("1 file");
    expect(desktop().getByTestId("stay-coverage")).toHaveTextContent("All 3 nights covered");

    await user.click(desktop().getByRole("button", { name: "Hotel Roma" }));
    const dialog = await screen.findByRole("dialog", { name: "Staying in Rome" });
    expect(within(dialog).getByRole("button", { expanded: true })).toHaveTextContent("Hotel Roma");
    expect(within(dialog).getByTestId("accommodation-card")).toBeInTheDocument();
    expect(within(dialog).getByText("Check-in 14:00")).toBeInTheDocument();
  });
```

(2026-07-10 is a Friday and 2026-07-13 a Monday.) The comments at :1109 ("The open body's stay chip: …") and :1129-1131 ("A rough stop's stay chip is inert") should say "stay panel". Their assertions are unchanged and keep passing.

Rename `components/plan/stay-chip.test.tsx` → `components/plan/stay-dialog.test.tsx`. Delete the whole `describe("StayChip (PLAN.md §4.1)")` block, the `COVERED` const and `StayChip` from the import, so it reads `import { StayDialog } from "./stay-dialog";`. Keep the `describe("StayDialog")` test as is.

- [ ] **Step 2: Run it, expect FAIL**

`npx vitest run components/plan/stop-open-body.test.tsx components/plan/stay-dialog.test.tsx components/trip/itinerary-manager.test.tsx -t "top row|stay panel|StayDialog"`. Expect: no `stop-top-row` testid, `./stay-dialog` doesn't resolve, and no `stay-block` in the manager.

- [ ] **Step 3: Implement**

Move the file: `git mv components/plan/stay-chip.tsx components/plan/stay-dialog.tsx` and `git mv components/plan/stay-chip.test.tsx components/plan/stay-dialog.test.tsx`. In `stay-dialog.tsx`, delete `BASE`, `StayChipProps` and `StayChip`, and trim the imports to:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

Update the `StayDialog` doc comment to `/** The stay dialog (spec 2026-10-04 §B): hosts the existing accommodation rows — opened from a stay panel block with that row expanded — and, optionally, "+ Add a stay". */`.

`components/plan/ideas-box.tsx`:

```diff
 export interface IdeasBoxProps {
   ideas: ThingToDo[];
   onOpen(idea: ThingToDo): void;
   onAdd(): void;
   disabled?: boolean;
+  className?: string;
 }
@@
-export function IdeasBox({ ideas, onOpen, onAdd, disabled = false }: IdeasBoxProps) {
+export function IdeasBox({ ideas, onOpen, onAdd, disabled = false, className }: IdeasBoxProps) {
@@
-    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5">
+    <div
+      className={cn(
+        "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[14px] border-2 border-dashed border-border px-2.5 py-1.5",
+        className,
+      )}
+    >
```

`components/plan/stop-open-body.tsx` (against Part A's version):

```diff
-import { StayChip } from "./stay-chip";
+import { StayPanel, type StayPanelAccommodation } from "./stay-panel";
 import { IdeasBox } from "./ideas-box";
@@
-import type { StayStatus } from "@/lib/plan/plan-model";
@@ export interface StopOpenBodyProps {
-  stay: StayStatus | null;
+  /** This Stop's Accommodations, each with its Costs and file count, for the stay panel (spec 2026-10-04 §B). */
+  accommodations: StayPanelAccommodation[];
@@
-  onOpenStay(): void;
+  /** A stay panel block: opens the existing Accommodation view. */
+  onOpenAccommodation(accommodationId: string): void;
   onAddStay(): void;
@@ the destructured params
-  stay,
+  accommodations,
@@
-  onOpenStay,
+  onOpenAccommodation,
   onAddStay,
@@ the top row (first child of the root div)
-      <div className="flex items-stretch gap-2.5">
-        <StayChip stay={stay} rough={rough} onOpen={onOpenStay} onAdd={onAddStay} />
-        <IdeasBox ideas={ideas} onOpen={onOpenIdea} onAdd={onAddIdea} />
-      </div>
+      {/* Spec 2026-10-04 §B: stay panel + ideas box, equal width, stretched
+          to equal height (grid cells). Below a 640px-wide card they stack,
+          stay first. A container query on the card's own width, not the
+          viewport — dock + rail squeeze the card at 1024–1279 whatever the
+          window. The wrapper is the container (one can't query itself). */}
+      <div className="@container">
+        <div data-testid="stop-top-row" className="grid grid-cols-1 gap-2.5 @min-[640px]:grid-cols-2">
+          <StayPanel
+            stop={stop}
+            accommodations={accommodations}
+            homeCurrency={homeCurrency}
+            onOpen={onOpenAccommodation}
+            onAdd={onAddStay}
+          />
+          <IdeasBox ideas={ideas} onOpen={onOpenIdea} onAdd={onAddIdea} className="items-start" />
+        </div>
+      </div>
```

The component's doc comment should start "The open-stop container (PLAN.md §4, §5): the stay panel + ideas box (spec 2026-10-04 §B), then …", with the rest left as Part A wrote it. If Part A no longer uses `rough` anywhere else in the file, remove that const too (lint will flag it).

`components/trip/itinerary-manager.tsx`:

```diff
-import { StayDialog } from "@/components/plan/stay-chip";
+import { StayDialog } from "@/components/plan/stay-dialog";
@@ :663
-  const [stayStopId, setStayStopId] = React.useState<string | null>(null);
+  // The stay dialog, opened from a stay panel block with that Accommodation expanded (spec 2026-10-04 §B).
+  const [stayView, setStayView] = React.useState<{ stopId: string; accommodationId: string } | null>(null);
@@ :1695
-  // The existing accommodation rows, hosted by the stay dialog. Dated stops
-  // only: a rough stop has no check-in window to hold one.
-  function renderAccommodationRows(stop: ItineraryStop) {
+  // The existing accommodation rows, hosted by the stay dialog and the phone
+  // sheet's Stay tab. Dated stops only: a rough stop has no check-in window
+  // to hold one. `expandedId` starts that row open.
+  function renderAccommodationRows(stop: ItineraryStop, expandedId?: string | null) {
     if (!stop.arriveDate || !stop.departDate) return null;
     return stop.accommodations.map((acc) => (
       <AccommodationRow
         key={acc.id}
         accommodation={acc}
         stop={{ arriveDate: stop.arriveDate!, departDate: stop.departDate! }}
+        defaultOpen={acc.id === expandedId}
         isPending={pendingId === acc.id}
@@ the StopOpenBody call in renderDesktopStop
                     homeCurrency={homeCurrency}
-                    stay={stay}
+                    accommodations={stop.accommodations.map((a) => ({
+                      ...a,
+                      attachmentCount: attachmentsByAccommodationId?.get(a.id)?.length ?? 0,
+                    }))}
                     counts={{
@@
-                    onOpenStay={() => setStayStopId(stop.id)}
+                    onOpenAccommodation={(accommodationId) => setStayView({ stopId: stop.id, accommodationId })}
                     onAddStay={() => handleAddAccommodationClick(stop)}
@@ :1830
-  const stayStop = stayStopId ? (stops.find((s) => s.id === stayStopId) ?? null) : null;
+  const stayStop = stayView ? (stops.find((s) => s.id === stayView.stopId) ?? null) : null;
@@ :2385
-      {/* Where you're staying — the stay chip's dialog */}
+      {/* Where you're staying — opened from a stay panel block */}
       {stayStop && (
         <StayDialog
           open
           onOpenChange={(open) => {
-            if (!open) setStayStopId(null);
+            if (!open) setStayView(null);
           }}
           stopName={stayStop.name}
-          rows={renderAccommodationRows(stayStop)}
+          rows={renderAccommodationRows(stayStop, stayView?.accommodationId)}
           onAdd={() => handleAddAccommodationClick(stayStop)}
         />
       )}
```

`stay` in `renderDesktopStop` is still computed for `StopRow`'s folded chip. Leave it. The mobile `StopSheet` call (:2409-2411) keeps `renderAccommodationRows(sheetStop)` without an expanded id.

- [ ] **Step 4: Run, expect PASS**

```
npx vitest run components/plan/stop-open-body.test.tsx components/plan/stay-dialog.test.tsx components/plan/stay-panel.test.tsx components/plan/ideas-box.test.tsx components/plan/stop-row.test.tsx components/plan/plan-body.test.tsx components/plan/motion.test.tsx components/plan/motion-reduced.test.tsx components/plan/banned-classes.test.ts components/plan/mobile components/trip/itinerary-manager.test.tsx
```

All green. The IM tests at :1109 ("fork-aware createAccommodation", which clicks `/add a stay/i`) and :1135 (rough: "Needs dates first", no add-a-stay button) pass unchanged against the panel. If any Part A test in `stop-open-body.test.tsx` or `plan-body.test.tsx` queries a button with a loose regex such as `/Add/`, it can now also match "+ Add a stay" or "+ Add another place". Tighten that query to the exact name, e.g. `{ name: "+ Add" }`. Then `grep -rn "stay-chip\|StayChip" components app lib` must print nothing. Run `npx tsc --noEmit`, `npx eslint components/plan components/trip/itinerary-manager.tsx`, and the full suite `npx vitest run`.

- [ ] **Step 5: Commit**

```
git add components/plan/stop-open-body.tsx components/plan/stop-open-body.test.tsx components/plan/ideas-box.tsx components/plan/stay-dialog.tsx components/plan/stay-dialog.test.tsx components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git add -u components/plan/stay-chip.tsx components/plan/stay-chip.test.tsx
git commit -m "feat(plan): inline stay panel beside the ideas box

The open Stop card's top row is now two equal panels — Where you're
staying and the ideas box — stacking stay-first when the card itself is
under 640px (container query). A block opens the stay dialog with that
Accommodation expanded. The stay chip is gone; the folded StopRow keeps
its chip.

Resolves-Feedback: cmut6islx000304lfagmt04nt

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

# Part C — route map

## Part C notes

- **Key files:** `components/trip/route-map.tsx` (build effect :273–455), `test/leaflet-mock.ts` (its `FakeMap` has no `invalidateSize`, so C1 adds one), `components/ui/dialog.tsx` (size variants :101–130; the scroll body :115), `components/plan/plan-mini-map.tsx` (`PlanMiniMap` and `PlanMapDialog`), `app/(app)/trips/[tripId]/plan/page.tsx` (:500–514 builds the map's Stops, home and `farHome`; :621–625 is the rail slot).
- **Why `size="full"` needs a body change, not just a className.** The dialog's scroll body (`dialog.tsx:115`) is a flex column with no `flex-1`, so it only grows to its content's height. A `flex-1` map inside it can't fill a 92vh dialog. With `size="full"`, the body gets `min-h-0 flex-1`, and the map (via `RouteMap`'s existing `frameClassName`, which also drops the inline height) takes `flex-1 min-h-[240px]`. I chose this over `bare`, because `bare` would mean copying the dialog's padding and phone handle into the consumer.
- **Phone stays as it is today.** The `max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none` classes that `PlanMapDialog` passes today move into the `full` variant unchanged. I checked tailwind-merge v3: `sm:max-h-[92vh]`/`sm:w-[92vw]` correctly override the base `sm:max-h-[85vh]`/`sm:w-[calc(100%-2rem)]`. The 640–1023px band (the phone Fit strip's **Map** button at that width) now also gets 92vw × 92vh instead of 44rem × 480px. That band was never "phone" in the dialog's terms (`sm` = 640).
- **`farHome` goes away.** It only existed so the 210px tile could leave a far home off its own map and show a "+ Sydney" pill (LA-042). The button card draws no map. The dialog already passes `home`, and `routeFitPoints` already leaves home out of the fit whenever there are two or more located Stops. So C3 removes the `farHome` prop, `FAR_HOME_KM`, and the page's `routeCentroid`/`farHome` lines. `routeCentroid` stays, because `add-stop-sheet.tsx:94` still uses it; only its comment changes.
- **Naming:** the rail component is renamed `PlanMiniMap` → `PlanMapButton`. The file keeps its path, `components/plan/plan-mini-map.tsx`, because two other test files mock that path (`plan-header-actions.test.tsx:13`, `page.test.tsx:63`). Renaming the file is a free follow-up if wanted. The card reads "Route map", with a `Maximize2` icon standing in for the ⤢ (the same way "Open map ⤢" was built), so its accessible name is exactly "Route map".
- **Conflicts with other parts:** Part **G** also edits `dialog.tsx` (sticky header and footer, scroll-aware edge, probably the same scroll-body `<div>` at :115). C2's change there is one `cn(…, size === "full" && "min-h-0 flex-1")`, so whichever lands second rebases a one-line conflict. Also, the Route map dialog has no footer and its body almost never scrolls, so G's edge treatment should stay invisible there. Part **A** reworks `PlanBody`. The tests here only use `<PlanBody initialOpen={[]} today=…>` and `jumpTo`, so if A changes `PlanBody`'s props, the three `render` helpers in `plan-mini-map.test.tsx` need the same change.
- **Docs that must not drift** (historical specs and plans are left alone): `docs/maps-overview.md` (the route-map row in the §4 table, and a new §10 gotcha about `invalidateSize`), handled in C1; `COMPONENTS.md` "Page widths" (documents the dialog sizes, including `full`), handled in C2. `CONTEXT.md` already uses **Route map** for the whole-Trip Leaflet map, so the card's label matches. `design_handoff/…/PLAN.md` §6.1 is a design handoff, so I did not edit it.
- **Not in scope here:** `lib/release-notes.ts` (no entry since 2026-09-27; whether this batch gets one is the main session's call).

## Part H notes

- One string in `components/account/traveller-details-card.tsx:86` and its assertion at `traveller-details-card.test.tsx:25`. The new hint uses an em dash (U+2014).
- The emergency-contact hints ("Only the people on your Trips ever see this.") are asserted by **exact** text at `:24`, `getAllByText(...)).toHaveLength(2)`. The new bank hint starts with the same words but is a different full string, so that count stays 2. No other code or doc quotes the old hint. `docs/specs/2026-10-02-…md:262` quotes it, but that spec is historical. `CONTEXT.md:282` already says bank details never leave the app.

## Review-focus candidates

- **The window or dialog is resized while the Route map is open** (or the dialog's open animation settles after Leaflet's first measurement). Expected: Leaflet re-measures (`invalidateSize`) and redraws with no grey band and no off-centre route. Tested in C1 (a ResizeObserver callback calls `invalidateSize`).
- **A Stop's coordinates change while a map is mounted, so the map rebuilds.** Expected: the old observer is disconnected before the old map is removed, and only the new map gets `invalidateSize`. No call on a removed map, and no leaked observer. Tested in C1 (rerender test).
- **A keyboard user on the rail.** Expected: Tab reaches the "Route map" card, Enter opens the dialog, Escape closes it, and focus returns to the card. Tested in C3. A related case: two Stops but only one located. Expected: no card at all (and the `empty:hidden` slot takes no gap). Also tested in C3.

---

### Task 29 — C1: RouteMap redraws when its container resizes

**Files:**
- Modify: `components/trip/route-map.tsx` (:62 comment; :282–283 effect locals; after :438 at the end of the `import("leaflet").then` callback; cleanup :441–447)
- Modify: `test/leaflet-mock.ts` (`FakeMap` interface :57–70; the `instance` object :91–105)
- Modify: `docs/maps-overview.md` (§4 table row :115; §10 gotchas, after item 8 at :516–518)
- Test: `components/trip/route-map.test.tsx` (new `describe` at the end of the file, plus `afterEach` in the import line 1)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RouteMap` observes its own frame element (the `aria-label="Trip route map"` div) with a `ResizeObserver` and calls `map.invalidateSize()` on every callback. It disconnects in the build effect's cleanup and is skipped when `ResizeObserver` is undefined. `createLeafletMock()` maps gain `invalidateSize: vi.fn()` (`FakeMap.invalidateSize`). C2 relies on this so the near-full-screen dialog's map fills correctly.

- [ ] **Step 1: Write the failing test.** Append to `components/trip/route-map.test.tsx`, and change line 1's import to include `afterEach`:

```tsx
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
```

```tsx
describe("RouteMap resize (spec 2026-10-04 §C)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A controllable ResizeObserver: records what each instance observes so a test can fire its callback. */
  function stubResizeObserver() {
    const instances: FakeResizeObserver[] = [];
    class FakeResizeObserver {
      observed: Element[] = [];
      disconnect = vi.fn();
      constructor(public cb: ResizeObserverCallback) {
        instances.push(this);
      }
      observe(el: Element) {
        this.observed.push(el);
      }
      unobserve() {}
      fire() {
        this.cb([], this as unknown as ResizeObserver);
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    return instances;
  }

  it("tells Leaflet to re-measure when its frame resizes, and stops observing on unmount", async () => {
    const observers = stubResizeObserver();
    const { unmount } = render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const map = hoisted.leaflet!.maps[0];

    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([screen.getByLabelText("Trip route map")]);
    expect(map.invalidateSize).not.toHaveBeenCalled();

    observers[0].fire();
    expect(map.invalidateSize).toHaveBeenCalledTimes(1);

    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("a rebuild disconnects the old observer and binds a new one to the new map", async () => {
    const observers = stubResizeObserver();
    const { rerender } = render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));

    rerender(<RouteMap stops={[STOPS[0], { ...STOPS[1], lat: 35.5 }]} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));

    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalled();
    observers[1].fire();
    expect(hoisted.leaflet!.maps[1].invalidateSize).toHaveBeenCalledTimes(1);
    expect(hoisted.leaflet!.maps[0].invalidateSize).not.toHaveBeenCalled();
  });

  it("still builds the map where ResizeObserver doesn't exist", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].fitBounds).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `TZ=UTC npx vitest run components/trip/route-map.test.tsx`. Expected: the first two new tests fail with `expected [] to have a length of 1` (and `of 2`), because no `ResizeObserver` is ever constructed. The third passes already (jsdom has no `ResizeObserver`). It is a guard for Step 3's `typeof` check.

- [ ] **Step 3: Implement.**

`test/leaflet-mock.ts`, in the `FakeMap` interface after `setZoom`:

```ts
  setZoom: ReturnType<typeof vi.fn>;
  invalidateSize: ReturnType<typeof vi.fn>;
```

and in the `instance` object inside `const map = vi.fn(...)`, after `setZoom: vi.fn(),`:

```ts
      setZoom: vi.fn(),
      invalidateSize: vi.fn(),
```

`components/trip/route-map.tsx`. Line 62 comment:

```ts
  /** Fires with the Stop's id when its pin is clicked (Jump list / Route map dialog jumps — PLAN.md §6.1, §6.3). */
```

Effect locals (:282–283):

```ts
    let L: typeof import("leaflet") | null = null;
    let map: import("leaflet").Map | null = null;
    // Set once the map is built; disconnected in the cleanup below.
    let resizeObserver: ResizeObserver | null = null;
```

At the end of the `import("leaflet").then((leaflet) => { … })` callback, directly after the zoom clamp:

```ts
      if (mapInstance.getZoom() < 1) mapInstance.setZoom(1);

      // Leaflet measures its container once, at build. A resized window, or
      // the Plan's Route map dialog filling 92vw × 92vh (spec 2026-10-04 §C),
      // would otherwise leave grey tiles and an off-centre route until the
      // next pan — invalidateSize re-measures and redraws (a no-op when the
      // size hasn't changed, as on the observer's first callback).
      if (typeof ResizeObserver !== "undefined" && mapRef.current) {
        resizeObserver = new ResizeObserver(() => mapInstance.invalidateSize());
        resizeObserver.observe(mapRef.current);
      }
    });

    return () => {
      // Before remove(): a late resize callback must never reach a destroyed map.
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
      overlaysRef.current = null;
    };
```

(The dependency array at :455 is unchanged.)

`docs/maps-overview.md`. In the §4 "The four maps" table, the `route-map.tsx` row's Surface cell becomes:

```md
| `route-map.tsx` | Trip summary, share page, home phases, the Plan's Route map dialog | Numbered stop pins coloured by chapter, per-segment dashed polylines, 🏠 home-base bookend pins with outbound/return legs, fallback list when <2 stops have coords |
```

In §10, after item 8:

```md
9. **Leaflet caches its container's size.** A map whose box can change after
   build (a resized window, a dialog that grows) draws grey tiles until told.
   `route-map.tsx` observes its frame with a `ResizeObserver` and calls
   `invalidateSize()` (spec 2026-10-04 §C); copy that into any other map that
   can live in a resizable box.
```

- [ ] **Step 4: Run, expect PASS.** `TZ=UTC npx vitest run components/trip/route-map.test.tsx components/trip/day-map.test.tsx components/trip/wishlist-map.test.tsx components/globe/globe-map.test.tsx components/trips/travel-map.test.tsx components/trip/home/desktop/route-map-tile.test.tsx` (every file that uses `createLeafletMock`; adding a mock method must not break them). Then `npx tsc --noEmit` and `npx eslint components/trip/route-map.tsx components/trip/route-map.test.tsx test/leaflet-mock.ts`. No existing tests need changing.

- [ ] **Step 5: Commit.**

```bash
git add components/trip/route-map.tsx components/trip/route-map.test.tsx test/leaflet-mock.ts docs/maps-overview.md
git commit -m "$(cat <<'EOF'
feat(route-map): redraw when the map's container resizes

Leaflet measures its container once; a ResizeObserver now calls
invalidateSize so a resized window or the bigger Route map dialog
redraws instead of leaving grey tiles (spec 2026-10-04 §C).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 30 — C2: Near-full-screen Route map dialog (`DialogContent size="full"`)

**Files:**
- Modify: `components/ui/dialog.tsx` (:96–104 props/JSDoc; :110–117 scroll body; :130 size class)
- Modify: `components/plan/plan-mini-map.tsx` (:65–86 `PlanMapDialog`)
- Modify: `COMPONENTS.md` ("Page widths", after the paragraph ending "(ADR 0062)" at :291)
- Test: `components/ui/dialog.test.tsx` (`describe("DialogContent size")` :239–267)
- Test: `components/plan/plan-mini-map.test.tsx` (route-map-loader mock :10–16; imports :1–8; new `describe` at the end)

**Interfaces:**
- Consumes: C1's `invalidateSize` on resize (the map's box is now sized by flex layout, not a fixed height). `RouteMapProps.frameClassName` (existing; it replaces the frame classes and drops the inline height).
- Produces: `DialogContent` prop `size?: "md" | "lg" | "full"`. `"full"` means `max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none sm:h-[92vh] sm:max-h-[92vh] sm:w-[92vw]`, emits no `sm:max-w-dialog*` class, and gives the scroll body `min-h-0 flex-1`. `PlanMapDialog` keeps its existing signature `({ open, onOpenChange, stops, home }: PlanMapDialogProps)` (C3 and `PlanFitStrip` use it as is).

- [ ] **Step 1: Write the failing test.**

`components/ui/dialog.test.tsx`. Widen the helper's type and add three tests inside `describe("DialogContent size")`:

```tsx
  function renderSize(size?: "md" | "lg" | "full") {
```

```tsx
  it('size="full" is near-full-screen from sm and edge-to-edge on a phone (spec 2026-10-04 §C)', () => {
    const content = renderSize("full");
    const classes = content.className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["sm:w-[92vw]", "sm:h-[92vh]", "sm:max-h-[92vh]", "max-sm:h-[100dvh]", "max-sm:max-h-[100dvh]", "max-sm:rounded-none"]),
    );
    expect(classes).not.toContain("sm:max-h-[85vh]");
    expect(classes).not.toContain("sm:w-[calc(100%-2rem)]");
    expect(classes.some((c) => c.startsWith("sm:max-w-dialog"))).toBe(false);
  });

  it('size="full" stretches the scroll body so a flex-1 child fills the dialog', () => {
    const body = renderSize("full").querySelector(".overflow-y-auto")!;
    expect(body.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex-1", "min-h-0"]));
  });

  it("other sizes leave the scroll body at its content height", () => {
    const body = renderSize("lg").querySelector(".overflow-y-auto")!;
    expect(body.className.split(/\s+/)).not.toContain("flex-1");
  });
```

`components/plan/plan-mini-map.test.tsx`. Imports and mock become:

```tsx
import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import type { RouteMapStop } from "@/components/trip/route-map";
import { PlanMiniMap, PlanMapDialog } from "./plan-mini-map";
import { PlanBody } from "./plan-body";

vi.mock("@/components/trip/route-map-loader", () => ({
  RouteMapLoader: (p: { onStopClick?: (id: string) => void; home: unknown; frameClassName?: string }) => (
    <button data-testid="map" data-home={String(!!p.home)} data-frame={p.frameClassName ?? ""} onClick={() => p.onStopClick?.("s1")}>
      map
    </button>
  ),
}));
```

and append:

```tsx
describe("PlanMapDialog (spec 2026-10-04 §C)", () => {
  function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
    return render(
      <PlanBody initialOpen={[]} today="2030-01-01">
        <PlanMapDialog open onOpenChange={onOpenChange} stops={STOPS} home={HOME} />
      </PlanBody>,
    );
  }

  it("is near-full-screen from sm up and full-screen on a phone", () => {
    renderDialog();
    const classes = screen.getByRole("dialog", { name: "Route map" }).className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["sm:w-[92vw]", "sm:h-[92vh]", "max-sm:h-[100dvh]", "max-sm:rounded-none"]));
    expect(classes).not.toContain("sm:max-w-dialog-lg");
  });

  it("the map fills the dialog rather than a fixed 480px", () => {
    renderDialog();
    const frame = within(screen.getByRole("dialog")).getByTestId("map").dataset.frame!.split(/\s+/);
    expect(frame).toEqual(expect.arrayContaining(["flex-1", "min-h-[240px]"]));
  });

  it("a pin click closes the dialog and jumps to and rings that Stop", async () => {
    setMatchMedia(() => true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    const target = document.createElement("div");
    target.id = "stop-s1";
    document.body.appendChild(target);
    const onOpenChange = vi.fn();

    const user = userEvent.setup();
    renderDialog(onOpenChange);
    await user.click(within(screen.getByRole("dialog")).getByTestId("map"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(target.getAttribute("data-highlight")).toBe("true");
    document.body.removeChild(target);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL.** `TZ=UTC npx vitest run components/ui/dialog.test.tsx components/plan/plan-mini-map.test.tsx`. Expected failures:
  - `size="full" is near-full-screen…`: the classes lack `sm:w-[92vw]`, because `"full"` falls through to `sm:max-w-dialog`.
  - `size="full" stretches the scroll body…`: there is no `flex-1` on the body.
  - `PlanMapDialog` `is near-full-screen…`: it is still `sm:max-w-dialog-lg`, with no `sm:w-[92vw]`.
  - `the map fills the dialog…`: `data-frame` is `""`.
  - Already passing: "other sizes leave the scroll body…" and the pin-click test. They guard behaviour that must not change.

- [ ] **Step 3: Implement.**

`components/ui/dialog.tsx`. Above `DialogContent` (after `FOCUS_GAP`/`revealFocusedField`), add:

```ts
/** The centred (sm+) width per `size`. `full` also owns its phone geometry: edge-to-edge, not a 90dvh sheet. */
const SIZE_CLASS = {
  md: "sm:max-w-dialog",
  lg: "sm:max-w-dialog-lg",
  full: "max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none sm:h-[92vh] sm:max-h-[92vh] sm:w-[92vw]",
} as const;
```

Props:

```ts
    /**
     * `lg` widens the centred (sm+) dialog for two-column entity forms; the phone bottom sheet is unaffected.
     * `full` is near-full-screen — 92vw × 92vh from sm, edge-to-edge below it — and stretches the scroll
     * body to the dialog's height, so one `flex-1` child (the Plan's Route map) fills it.
     */
    size?: "md" | "lg" | "full";
```

Scroll body (:115):

```tsx
      <div
        onFocus={revealFocusedField}
        className={cn(
          "flex flex-col gap-3.5 overflow-y-auto scroll-pb-24 px-[18px] pb-[calc(1.375rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pt-6",
          size === "full" && "min-h-0 flex-1",
        )}
      >
        {children}
      </div>
```

Size class (:130). Replace `size === "lg" ? "sm:max-w-dialog-lg" : "sm:max-w-dialog",` with:

```ts
          // After the base geometry so cn()/tailwind-merge lets `full`'s
          // sm:w / sm:max-h win over sm:w-[calc(100%-2rem)] / sm:max-h-[85vh].
          SIZE_CLASS[size],
```

`components/plan/plan-mini-map.tsx`. `PlanMapDialog` becomes:

```tsx
/**
 * The Route map (PLAN.md §6.1; spec 2026-10-04 §C): near-full-screen from sm
 * (92vw × 92vh), full-screen on a phone, the map filling it. The rail's Route
 * map button and the phone Fit strip's Map open it.
 */
export function PlanMapDialog({ open, onOpenChange, stops, home }: PlanMapDialogProps) {
  const { jumpTo } = usePlanBody();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle>Route map</DialogTitle>
        </DialogHeader>
        {/* frameClassName drops RouteMap's fixed height: the map takes what the
            stretched body has left (DialogContent size="full"), never under
            240px — a short window scrolls the body instead. */}
        <RouteMapLoader
          stops={stops}
          home={home}
          frameClassName="min-h-[240px] flex-1 rounded-lg shadow-hard-2"
          onStopClick={(id) => {
            onOpenChange(false);
            jumpTo(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

`COMPONENTS.md`. After the "Page widths" paragraph (the line ending `(ADR 0062)`), add:

```md

Dialogs pick their centred width with `DialogContent size`: `md` (default, `max-w-dialog`), `lg`
(`max-w-dialog-lg`, 44rem — the two-column entity forms) or `full` (92vw × 92vh from `sm`,
edge-to-edge on a phone, its body stretched so one `flex-1` child fills it — the Plan's Route map).
The phone bottom sheet is the same for `md` and `lg`.
```

- [ ] **Step 4: Run, expect PASS.** `TZ=UTC npx vitest run components/ui/dialog.test.tsx components/plan/plan-mini-map.test.tsx components/plan/plan-header-actions.test.tsx`. The existing `md`/`lg` size tests still pass unchanged (they keep `sm:max-h-[85vh]` and their `sm:max-w-dialog*`), and the existing `PlanMiniMap` tests still pass (the tile is untouched until C3). Then `npx tsc --noEmit` and `npx eslint components/ui/dialog.tsx components/ui/dialog.test.tsx components/plan/plan-mini-map.tsx components/plan/plan-mini-map.test.tsx`.

- [ ] **Step 5: Commit.**

```bash
git add components/ui/dialog.tsx components/ui/dialog.test.tsx components/plan/plan-mini-map.tsx components/plan/plan-mini-map.test.tsx COMPONENTS.md
git commit -m "$(cat <<'EOF'
feat(plan): near-full-screen Route map dialog

DialogContent gains size="full" (92vw x 92vh from sm, edge-to-edge on
a phone, body stretched); PlanMapDialog uses it and its map fills the
dialog instead of a fixed 480px (spec 2026-10-04 §C).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 31 — C3: The rail's mini map becomes a "Route map" button card

**Files:**
- Modify: `components/plan/plan-mini-map.tsx` (:1–56 imports, `PlanMiniMapProps`, `PlanMiniMap`)
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx` (:25 import; :32 import; :55–56 `FAR_HOME_KM`; :512–513 `centroid`/`farHome`; :621–625 rail slot)
- Modify: `lib/plan/plan-model.ts` (:161 comment only)
- Test: `components/plan/plan-mini-map.test.tsx` (replace `describe("PlanMiniMap")` :25–83 and its helper; keep C2's `PlanMapDialog` block)
- Test: `app/(app)/trips/[tripId]/plan/page.test.tsx` (:49–52 `railCapture`; :63–66 mock; :163–174 rail test)

**Interfaces:**
- Consumes: C2's `PlanMapDialog` (unchanged signature).
- Produces: `export interface PlanMapButtonProps { stops: RouteMapStop[]; home: HomeMapPoint | null }` and `export function PlanMapButton(props: PlanMapButtonProps)`. It renders `null` with fewer than two located Stops; otherwise a `<button>` with the accessible name "Route map" that opens `PlanMapDialog`. `PlanMiniMap`, `PlanMiniMapProps`, `FAR_HOME_KM` and the `farHome` prop are removed.

- [ ] **Step 1: Write the failing test.**

`components/plan/plan-mini-map.test.tsx`. Imports become:

```tsx
import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import type { RouteMapStop } from "@/components/trip/route-map";
import { PlanMapButton, PlanMapDialog } from "./plan-mini-map";
import { PlanBody } from "./plan-body";
```

Keep the mock, `STOPS` and `HOME`. Replace `renderMiniMap` and the whole `describe("PlanMiniMap", …)` block with:

```tsx
function renderButton(overrides: Partial<ComponentProps<typeof PlanMapButton>> = {}) {
  return render(
    <PlanBody initialOpen={[]} today="2030-01-01">
      <PlanMapButton stops={STOPS} home={HOME} {...overrides} />
    </PlanBody>,
  );
}

describe("PlanMapButton (spec 2026-10-04 §C)", () => {
  it("renders nothing with fewer than two located stops", () => {
    const { container } = renderButton({ stops: [STOPS[0]] });
    expect(container).toBeEmptyDOMElement();
  });

  it("counts only located stops — two Stops, one without coordinates, render nothing", () => {
    const { container } = renderButton({ stops: [STOPS[0], { ...STOPS[1], lat: null, lng: null }] });
    expect(container).toBeEmptyDOMElement();
  });

  it("is a compact Route map button card — the rail draws no map", () => {
    renderButton();
    const button = screen.getByRole("button", { name: "Route map" });
    expect(button.className).toMatch(/rounded-\[22px\]/);
    expect(button.className).toMatch(/shadow-hard-4/);
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the Route map dialog, home base included", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Route map" }));
    const dialog = screen.getByRole("dialog", { name: "Route map" });
    expect(within(dialog).getByTestId("map")).toHaveAttribute("data-home", "true");
  });

  it("Enter opens it from the keyboard; Escape closes it and focus returns to the card", async () => {
    const user = userEvent.setup();
    renderButton();
    const button = screen.getByRole("button", { name: "Route map" });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Route map" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("has no soft shadows, translucent cards or 70% borders", () => {
    const { container } = renderButton();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
```

These old tests are removed on purpose: "the tile is 210px tall…" (there is no tile), "shows a quiet + <home> pill…" (no `farHome`), "a pin click on the tile…" (now covered by C2's dialog pin-click test), and "isolates the tile's stacking context…" (no z-[500] overlays remain, so there is nothing to isolate).

`app/(app)/trips/[tripId]/plan/page.test.tsx`. `railCapture` gains `mapButton`:

```tsx
const railCapture = vi.hoisted(() => ({
  jumpList: undefined as Record<string, unknown> | undefined,
  planBody: undefined as Record<string, unknown> | undefined,
  mapButton: undefined as Record<string, unknown> | undefined,
}));
```

The mock becomes:

```tsx
vi.mock("@/components/plan/plan-mini-map", () => ({
  PlanMapButton: (props: Record<string, unknown>) => {
    railCapture.mapButton = props;
    return <div data-testid="map-button" />;
  },
  PlanMapDialog: () => null,
}));
```

The rail test at :163 becomes:

```tsx
  it("the rail holds the Route map button, Fit tile and Jump list, in that order, after the list", async () => {
    mockDb.stop.findMany.mockResolvedValue([STOP]);
    const div = await renderPlan();
    const aside = div.querySelector("aside")!;
    expect(aside.className).toBe(PLAN_ASIDE_CLASS);
    expect([...aside.children].map((c) => c.firstElementChild!.getAttribute("data-testid"))).toEqual(["map-button", "fit-tile", "jump-list"]);
    // Spec 2026-10-04 §C: a button card, not a map tile — it needs no far-home pill.
    expect(Object.keys(railCapture.mapButton!).sort()).toEqual(["home", "stops"]);
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(aside.parentElement!.className).toBe(PLAN_GRID_CLASS);
    expect(aside.previousElementSibling).not.toBeNull();
    expect(aside.nextElementSibling).toBeNull();
  });
```

(The `:319` grid test and the `:175` MOTION stagger test need no change: the rail still has three `PlanRiseIn` tiles at 60/120/180ms.)

- [ ] **Step 2: Run it, expect FAIL.** `TZ=UTC npx vitest run components/plan/plan-mini-map.test.tsx "app/(app)/trips/[tripId]/plan/page.test.tsx"`. Expected: the `PlanMapButton` tests fail with "Element type is invalid… got: undefined" (there is no such export yet). The page rail test fails because the page imports `PlanMiniMap`, which the mock no longer provides. Rendering throws on the undefined component, or the testids read `[null, "fit-tile", "jump-list"]`.

- [ ] **Step 3: Implement.**

`components/plan/plan-mini-map.tsx`. Replace lines 1–56 (imports through the end of `PlanMiniMap`) with the following. `PlanMapDialogProps`/`PlanMapDialog` below stay as C2 left them:

```tsx
"use client";

import * as React from "react";
import { MapIcon, Maximize2 } from "lucide-react";
import { RouteMapLoader } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { HomeMapPoint } from "@/lib/route-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlanBody } from "./plan-body";

function locatedCount(stops: RouteMapStop[]): number {
  return stops.filter(
    (s) => typeof s.lat === "number" && typeof s.lng === "number" && !Number.isNaN(s.lat) && !Number.isNaN(s.lng),
  ).length;
}

export interface PlanMapButtonProps {
  stops: RouteMapStop[];
  home: HomeMapPoint | null;
}

/**
 * The rail's Route map button card (spec 2026-10-04 §C — it replaced the
 * 210px mini map tile, giving its height to the Fit tile and Jump list).
 * Opens PlanMapDialog, where a pin click jumps the main column to that Stop.
 * Nothing under two located Stops: there's no route to show, and the rail
 * slot around it is `empty:hidden`.
 */
export function PlanMapButton({ stops, home }: PlanMapButtonProps) {
  const [open, setOpen] = React.useState(false);

  if (locatedCount(stops) < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex w-full items-center gap-2.5 rounded-[22px] border-2 border-border bg-card px-3.5 py-3 text-left shadow-hard-4"
      >
        <MapIcon className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 font-display text-base font-extrabold">Route map</span>
        <Maximize2 className="size-4 shrink-0" aria-hidden="true" />
      </button>
      <PlanMapDialog open={open} onOpenChange={setOpen} stops={stops} home={home} />
    </>
  );
}
```

`app/(app)/trips/[tripId]/plan/page.tsx`:

```tsx
import { planHeaderMeta, tripEyebrow } from "@/lib/plan/plan-model";
```

```tsx
import { PlanMapButton } from "@/components/plan/plan-mini-map";
```

Delete lines 55–56:

```tsx
/** Home further than this from the route's centre is left off the mini map (LA-042). */
export const FAR_HOME_KM = 1500;
```

Delete lines 512–513 (`const centroid = …` and `const farHome = …`), leaving `const home = trip ? homeMapPoint(trip) : null;` (still used by `PlanFitStrip` and the button). `haversineKm` stays imported, because the drive estimate at :597 uses it.

Rail slot (:621–625):

```tsx
            <aside aria-label="Plan overview" className={PLAN_ASIDE_CLASS}>
              {/* empty:hidden — the Route map button renders nothing under two located stops, and an empty slot would still take a gap. */}
              <PlanRiseIn delayMs={60} className="empty:hidden">
                <PlanMapButton stops={mapStops} home={home} />
              </PlanRiseIn>
```

`lib/plan/plan-model.ts:161`:

```ts
/** Unweighted average lat/lng of the stops that have coordinates; null with none (Add a stop ranks place results near it). */
```

- [ ] **Step 4: Run, expect PASS.** `TZ=UTC npx vitest run components/plan "app/(app)/trips/[tripId]/plan" lib/plan/plan-model.test.ts`. That covers `plan-mini-map`, `plan-header-actions` (it mocks only `PlanMapDialog`, so it is unaffected) and the page tests. Then `npx tsc --noEmit` (this catches any leftover `PlanMiniMap`/`FAR_HOME_KM`/`routeCentroid` reference) and `npx eslint components/plan/plan-mini-map.tsx components/plan/plan-mini-map.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx" lib/plan/plan-model.ts`. Finally `grep -rn "PlanMiniMap\|FAR_HOME_KM\|farHome" app components lib` should print nothing.

- [ ] **Step 5: Commit.**

```bash
git add components/plan/plan-mini-map.tsx components/plan/plan-mini-map.test.tsx "app/(app)/trips/[tripId]/plan/page.tsx" "app/(app)/trips/[tripId]/plan/page.test.tsx" lib/plan/plan-model.ts
git commit -m "$(cat <<'EOF'
feat(plan): rail mini map becomes a Route map button card

The 210px tile was too small to use; a compact "Route map" card now
opens the near-full-screen dialog, and its height goes to the Fit
tile and Jump list. farHome/FAR_HOME_KM existed only for the tile's
pill and go with it (spec 2026-10-04 §C).

Resolves-Feedback: cmut6la03000004lb0vs46uax

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---


---

# Part Z

### Task 32 — Z1: Release notes, Help, and follow-ups for this batch

**Files:**
- Modify: `lib/release-notes.ts` (top of `RELEASE_NOTES`)
- Modify: `components/trip/help-guide.tsx` (only where it describes the Plan editor's day strip, stay chip or mini map — see Step 3)
- Modify: `docs/open-follow-ups.md` (the `## 2026-10-04 · Feedback batch …` heading F4 created)
- Test: `lib/release-notes.test.ts`, `lib/help-guide.test.ts` (run only; they guard shape and on-screen strings)

**Interfaces:**
- Consumes: everything shipped in A–K.
- Produces: nothing code relies on.

- [ ] **Step 1: Release notes.** Read the module's doc comment (one line, a Traveller's language, only for a change a Traveller would notice). Add at the top of `RELEASE_NOTES`, newest first, timestamps one minute apart on the day of the commit (use the real UTC time you commit, `YYYY-MM-DDTHH:MM:00Z`, descending):

```ts
  {
    publishedAt: "<T+3>",
    text: "Plan: every day of a stay is now listed in full — fold away the ones you're done with.",
  },
  {
    publishedAt: "<T+2>",
    text: "Plan: where you're staying sits beside your ideas, with check-in and check-out times.",
  },
  {
    publishedAt: "<T+1>",
    text: "The route map opens almost full screen on a computer.",
  },
  {
    publishedAt: "<T>",
    text: "Teepee is light-only for now while dark mode gets a rethink.",
  },
```
Replace each `<T…>` with a literal ISO instant (no placeholders may remain in the file).

- [ ] **Step 2: Run** `TZ=UTC npx vitest run lib/release-notes.test.ts` → PASS (it checks ordering and one-line text).

- [ ] **Step 3: Help guide.** `grep -n -i -E "day strip|strip of days|stay chip|mini map|Open map|nights pill" components/trip/help-guide.tsx`. For each hit that describes the **Plan editor** (not the Day view's Day strip, which is unchanged), rewrite the sentence to match: days are stacked and foldable; the stay panel sits beside ideas; the rail has a Route map button that opens a near-full-screen map. If there are no Plan-editor hits, change nothing. Run `TZ=UTC npx vitest run lib/help-guide.test.ts components/trip/help-guide.test.tsx` → PASS (the drift guard fails if a quoted UI string no longer exists on screen — fix the guide or `GUIDE_UI_STRINGS` accordingly).

- [ ] **Step 4: Follow-ups.** Under the `## 2026-10-04 · Feedback batch …` heading (created by F4 with DM-01), append, matching the file's bullet style:

```markdown
- **FB-01 · Duplicate copies Fork Stops and legs into the copy's real plan.**
  `lib/duplicate-trip.ts` reads Stops and Transports with no `forkId` filter,
  so a Trip with Forks duplicates every variant's rows into one plan. Found
  while planning §D; not fixed.
- **FB-02 · Fork and Duplicate drop `depIsHome` / `arrIsHome` on legs.**
  `lib/fork-plan.ts` and `lib/duplicate-trip.ts` copy endpoints but not the
  Home-base flags, so an outbound/return bookend becomes an endpoint-less
  leg in the copy.
- **FB-03 · An outbound/return leg can vanish from the plan.** With no Home
  base (or the return leg on a one-way Trip), `itinerary-manager.tsx` leaves
  the leg out of the Stop grouping but no bookend renders it. Read from code,
  not yet reproduced.
- **FB-04 · The Day page's Transport picker orders Stops by sortOrder**, not
  the plan editor's order, so a leg anchored to a rough Stop can open on a
  different slot there. Saving untouched is safe (§D keeps the stored anchor).
- **FB-05 · Check `AttachmentList` inside popovers** (`attachment-popover.tsx`,
  `card-action-cluster.tsx`) for the scroll-on-focus jump §G fixed in dialogs.
- **FB-06 · Real-iPhone check of the dialog footer's overscroll cover** — §G
  swapped the `after:` box for a box-shadow strip; rubber-band overscroll was
  not reproducible in the harness.
```

- [ ] **Step 5: Commit** — `git add lib/release-notes.ts components/trip/help-guide.tsx docs/open-follow-ups.md` (and `lib/help-guide.ts` if touched); message `docs: release notes, Help and follow-ups for the 2026-10-04 batch` + blank line + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

---

