# Modal & Mobile Styling Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three mobile styling problems — cramped modal titles, top/bottom-stacked modal buttons, and a congested plan stop card — by editing the shared `Dialog` primitive and the stop card, with zero desktop regressions.

**Architecture:** Tasks 1–2 edit the shared `components/ui/dialog.tsx` primitive so every modal in the app inherits the fixes (roomier header, safe-area padding, side-by-side footer). Task 3 declutters `components/trip/stop-card.tsx` on mobile only, using the existing `sm:hidden` / `hidden sm:*` responsive split — secondary actions fold into the existing `⋯` overflow menu, and Notes/Attachments (which are Popover components, not plain callbacks) open as bottom sheets from the menu, reusing `<NoteThread inline>` and `<AttachmentList>`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4 (class-based dark mode), Radix UI (`@radix-ui/react-dialog`), Vitest + Testing Library + `@testing-library/user-event`.

## Global Constraints

- **Presentational only.** No data model, server action, or API changes. No new dependencies.
- **Desktop (`sm:` ≥ 640px) must not change** for any of the three fixes. Mobile is `< sm` (the default, unprefixed classes).
- **Mobile-default → `sm:`-restore** is the repo convention (e.g. `flex-row [&>*]:flex-1 sm:[&>*]:flex-none`). Follow it.
- **jsdom cannot verify layout.** The Vitest tests here assert the presence/absence of Tailwind class strings and component behavior (menus, sheets) — the repo's existing `dialog.test.tsx` already does className assertions, so match that convention. **Real visual correctness is confirmed manually on a phone at 320/390px** — see the Verification section at the end. Do not claim "looks right" from a green test suite.
- Every task ends with a passing `npm test` and a commit.

---

### Task 1: Dialog primitive — roomier header + bottom-sheet safe-area

Two additive spacing tweaks to `components/ui/dialog.tsx`. No behavior change, no reversed decisions. Fix A (title breathing room) + the bundled safe-area companion.

**Files:**
- Modify: `components/ui/dialog.tsx` (DialogHeader line ~98, scroll body line ~70)
- Test: `components/ui/dialog.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change. `DialogHeader` gains bottom padding; the non-`bare` scroll body gains safe-area-aware bottom padding. Consumers are unaffected.

- [ ] **Step 1: Write the failing tests**

Add these two tests to the `describe("Dialog", …)` block in `components/ui/dialog.test.tsx`:

```tsx
it("gives the header breathing room below the title", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("button", { name: "Open dialog" }));
  await screen.findByRole("dialog");

  const header = screen.getByText("Invite traveller").closest("div");
  expect(header?.className).toContain("pb-4");
});

it("pads the scroll body for the mobile safe-area inset", async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole("button", { name: "Open dialog" }));
  const content = await screen.findByRole("dialog");

  const scrollBody = content.querySelector('[class*="overflow-y-auto"]');
  expect(scrollBody?.className).toContain("safe-area-inset-bottom");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dialog.test`
Expected: FAIL — header still has `pb-3` (not `pb-4`); scroll body has `pb-6` (no `safe-area-inset-bottom`).

- [ ] **Step 3: Increase the header's bottom padding**

In `components/ui/dialog.tsx`, in `DialogHeader`, change `pb-3` to `pb-4` in the class string. The full line becomes:

```tsx
        "sticky top-0 z-10 -mx-6 -mt-4 flex flex-col gap-1.5 border-b border-border/60 bg-card px-6 pr-10 pb-4 pt-4 text-left sm:-mt-6 sm:pt-6 before:content-[''] before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-card sm:before:h-6",
```

- [ ] **Step 4: Add safe-area padding to the scroll body**

In `components/ui/dialog.tsx`, in the non-`bare` scroll body `<div>` (currently `flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-4 sm:pt-6`), replace `pb-6` with `pb-[calc(1.5rem+env(safe-area-inset-bottom))]`. The line becomes:

```tsx
          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:pt-6">
```

(1.5rem = the old `pb-6`; `env(safe-area-inset-bottom)` resolves to 0 on non-notch devices, so desktop and Android are unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- dialog.test`
Expected: PASS (all Dialog tests, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add components/ui/dialog.tsx components/ui/dialog.test.tsx
git commit -m "fix(dialog): roomier header + bottom-sheet safe-area padding"
```

---

### Task 2: Dialog primitive — side-by-side footer buttons

Fix B. The footer currently stacks buttons on mobile (`flex-col`), deliberately, with a comment defending it. Change to side-by-side equal halves on mobile; keep desktop right-aligned. Rewrite the now-false comment and the existing test that asserts the old behavior.

**Files:**
- Modify: `components/ui/dialog.tsx` (`DialogFooter` line ~107, and its comment lines ~114-118)
- Test: `components/ui/dialog.test.tsx` (rewrite the `describe("DialogFooter", …)` block, lines ~107-131)

**Interfaces:**
- Consumes: nothing new.
- Produces: `DialogFooter` renders its children in a row at all widths. Mobile: children are `flex-1` (equal halves). Desktop (`sm:`): children are natural width, right-aligned. DOM order is unchanged (Cancel first, primary last), so all 20 `DialogFooter` consumers keep the primary button on the right.

- [ ] **Step 1: Rewrite the failing test**

In `components/ui/dialog.test.tsx`, replace the entire `describe("DialogFooter", () => { … })` block (currently asserts `flex-col`) with:

```tsx
describe("DialogFooter", () => {
  it("lays buttons side-by-side: equal halves on mobile, right-aligned on desktop, primary last in DOM", () => {
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
    // Row at all widths (not stacked).
    expect(footer.className).toContain("flex-row");
    expect(footer.className).not.toContain("flex-col");
    // Mobile: equal halves. Desktop: natural width, right-aligned.
    expect(footer.className).toContain("[&>*]:flex-1");
    expect(footer.className).toContain("sm:justify-end");
    expect(footer.className).toContain("sm:[&>*]:flex-none");

    // DOM order preserved: Cancel precedes the primary action.
    const buttons = footer.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Cancel");
    expect(buttons[1]).toHaveTextContent("Save");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dialog.test`
Expected: FAIL — footer still has `flex-col`, no `[&>*]:flex-1`.

- [ ] **Step 3: Change the footer layout and rewrite the comment**

In `components/ui/dialog.tsx`, replace the `DialogFooter` body (comment + `cn(...)`) with:

```tsx
function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Buttons sit side-by-side (DOM order Cancel → primary, so the primary
        // is on the right and focus order is natural).
        // Mobile (bottom sheet): split the width equally (flex-1) for large,
        // balanced tap targets. Desktop (sm+): natural width, right-aligned.
        "flex flex-row gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dialog.test`
Expected: PASS.

- [ ] **Step 5: Run the full suite to catch footer-dependent tests**

Run: `npm test`
Expected: PASS. (Watch `fork-switcher.test.tsx` — it renders footers. It asserts button presence/behavior, not layout classes, so it should stay green. If any test asserted `flex-col` on a footer, update it to match the new row layout.)

- [ ] **Step 6: Commit**

```bash
git add components/ui/dialog.tsx components/ui/dialog.test.tsx
git commit -m "fix(dialog): side-by-side footer buttons on mobile"
```

---

### Task 3: Declutter the plan stop card on mobile

Fix C. On mobile, a stop card renders up to seven inline controls. Collapse to **drag handle (left) · Edit · ⋯** on mobile; fold every other action into the existing `⋯` menu. Notes and Attachments are Popover components, so their menu items open bottom-sheet `Dialog`s reusing `<NoteThread inline>` and `<AttachmentList>`. Desktop is unchanged.

**Files:**
- Modify: `components/trip/stop-card.tsx`
- Test: `components/trip/stop-card.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `MoreActionsMenu` / `CardActionItem` from `./card-actions` — `CardActionItem = { key, label, icon?, onSelect: () => void, disabled?, destructive? }` (already imported).
  - `NoteThread` from `./note-thread` — `<NoteThread inline tripId targetType targetId notes currentUserId />` renders the expanded thread with its own "Notes" heading (already imported).
  - `AttachmentList` from `./attachment-list` — `<AttachmentList tripId? globeId? targetType targetId attachments compact />` (currently only the `AttachmentView` type is imported from here; add the value import).
  - `Dialog, DialogContent, DialogHeader, DialogTitle` from `@/components/ui/dialog` (new import).
  - Icons `MessageCircle, Paperclip` from `lucide-react` (new; the rest are already imported).
- Produces: no prop/signature change to `StopCard`. Same props, same behavior on desktop. Mobile behavior: secondary actions live in the `⋯` menu; Notes/Attachments open as sheets.

- [ ] **Step 1: Write the failing test**

Create `components/trip/stop-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopCard, type StopCardStop } from "./stop-card";

const roughStop: StopCardStop = {
  id: "stop-1",
  name: "Germany",
  country: "Germany",
  timezone: null,
  arriveDate: null,
  departDate: null,
  nights: 4,
  pinned: false,
  chapterId: null,
  notes: null,
  lat: null,
  lng: null,
  sortOrder: 0,
};

function renderCard(overrides = {}) {
  return render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStartChapter={vi.fn()}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      tripId="trip-1"
      currentUserId="user-1"
      notes={[
        {
          id: "note-1",
          body: "Remember the castle tour",
          createdAt: new Date("2026-07-01T00:00:00Z"),
          author: { id: "user-1", name: "Cam", image: null },
        },
      ]}
      attachments={[]}
      {...overrides}
    />,
  );
}

describe("StopCard mobile actions", () => {
  it("folds Notes, Attachments and Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    renderCard();

    // A rough stop renders a single overflow menu (desktop menu is scheduled-only).
    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));

    expect(await screen.findByRole("menuitem", { name: /Notes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Attachments/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Start a chapter here/ })).toBeInTheDocument();
  });

  it("opens the note thread as a sheet from the overflow menu", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Notes \(1\)/ }));

    // The notes sheet (a Dialog) is now open with the thread content.
    expect(await screen.findByText("Remember the castle tour")).toBeInTheDocument();
  });

  it("routes Delete through onDelete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderCard({ onDelete });

    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    expect(onDelete).toHaveBeenCalledWith("stop-1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- stop-card.test`
Expected: FAIL — the overflow menu currently has no Notes/Attachments/Delete items; Delete and Notes are inline-only.

- [ ] **Step 3: Add imports and sheet state**

In `components/trip/stop-card.tsx`:

Add `MessageCircle` and `Paperclip` to the `lucide-react` import.

Change the attachment-list import from a type-only import to include the value:

```tsx
import { AttachmentList, type AttachmentView } from "./attachment-list";
```

Add the dialog import near the other UI imports:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

Inside the `StopCard` component body, next to the existing `addThingOpen` state, add:

```tsx
  const [notesSheetOpen, setNotesSheetOpen] = React.useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);
```

- [ ] **Step 4: Build the mobile overflow item list**

In `components/trip/stop-card.tsx`, after the existing `overflowItems` array is populated (keep it — the desktop `⋯` still uses it), add a `mobileOverflowItems` array that contains every secondary action:

```tsx
  // Mobile overflow menu: every secondary action folds in here so the card
  // face shows only the drag handle, Edit, and this ⋯ menu. Desktop keeps the
  // inline buttons (below, behind `hidden sm:*`) and the scheduled-only menu.
  const mobileOverflowItems: CardActionItem[] = [];
  if (notes !== undefined && tripId && currentUserId) {
    mobileOverflowItems.push({
      key: "notes",
      label: notes.length > 0 ? `Notes (${notes.length})` : "Notes",
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      onSelect: () => setNotesSheetOpen(true),
    });
  }
  if (attachments !== undefined && tripId) {
    mobileOverflowItems.push({
      key: "attachments",
      label: attachments.length > 0 ? `Attachments (${attachments.length})` : "Attachments",
      icon: <Paperclip className="size-4" aria-hidden="true" />,
      onSelect: () => setAttachSheetOpen(true),
    });
  }
  // Chapter / reorder / date actions reuse the same shapes as overflowItems.
  mobileOverflowItems.push(...overflowItems);
  if (!isRough && onTogglePin) {
    mobileOverflowItems.push({
      key: "pin",
      label: stop.pinned ? "Unpin dates" : "Pin dates",
      icon: <Pin className={cn("size-4", stop.pinned && "fill-current")} aria-hidden="true" />,
      onSelect: () => onTogglePin(stop.id),
      disabled: isPending,
    });
  }
  if (onDelete) {
    mobileOverflowItems.push({
      key: "delete",
      label: "Delete",
      icon: <Trash2 className="size-4" aria-hidden="true" />,
      onSelect: () => onDelete(stop.id),
      disabled: isPending,
      destructive: true,
    });
  }
```

(Note: `overflowItems` already contains reorder (rough), start-chapter, adjust-dates, and make-rough where applicable — appending it avoids duplicating those definitions. `mobileOverflowItems` is a superset that adds notes, attachments, pin, and delete.)

- [ ] **Step 5: Hide secondary inline buttons on mobile**

In the action-buttons `<div className="flex shrink-0 items-center gap-1">`, add `hidden sm:inline-flex` to the className of each secondary inline button so it shows only on desktop. **Leave the Edit button (the `Pencil` one) untouched** — it stays visible at all widths.

- Chapter button (`BookOpen`): className `"size-8"` → `"size-8 hidden sm:inline-flex"`.
- Pin toggle button: change the `cn("size-8", …)` first argument to `"size-8 hidden sm:inline-flex"`.
- Clear-dates button (`X`): className `"size-8 text-muted-foreground"` → `"size-8 text-muted-foreground hidden sm:inline-flex"`.
- Delete button (`Trash2`): className `"size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"` → prepend `"hidden sm:inline-flex "`.

Wrap the two Popover components so they hide on mobile (they don't take a className prop):

```tsx
          {notes !== undefined && tripId && currentUserId && (
            <div className="hidden sm:block">
              <NoteThread
                tripId={tripId}
                targetType="STOP"
                targetId={stop.id}
                notes={notes}
                currentUserId={currentUserId}
              />
            </div>
          )}

          {attachments !== undefined && tripId && (
            <div className="hidden sm:block">
              <AttachmentPopover
                tripId={tripId}
                targetType="STOP"
                targetId={stop.id}
                attachments={attachments}
              />
            </div>
          )}
```

- [ ] **Step 6: Point the mobile overflow menu at the full item list**

The card renders two `MoreActionsMenu` instances. The mobile one is wrapped in `<div className="sm:hidden">`; the desktop one in `<div className="hidden sm:block">`. Change **only the mobile one** to use `mobileOverflowItems`:

```tsx
          {/* Overflow menu — mobile: all secondary actions. */}
          <div className="sm:hidden">
            <MoreActionsMenu
              label={`More actions for ${stop.name}`}
              items={mobileOverflowItems}
            />
          </div>
          {!isRough && (onAdjustDates || onMakeRough) && (
            <div className="hidden sm:block">
              <MoreActionsMenu
                label={`More actions for ${stop.name}`}
                items={overflowItems.filter(
                  (i) => i.key === "adjust-dates" || i.key === "make-rough",
                )}
              />
            </div>
          )}
```

- [ ] **Step 7: Add the Notes and Attachments bottom sheets**

Near the bottom of the returned JSX (alongside the existing `ItemFormDialog` dialogs, inside the component's root `<div>`), add the two sheets. They only open via the mobile menu, so they are effectively mobile-only:

```tsx
      {/* Notes sheet — opened from the mobile overflow menu (Notes is a
          Popover on desktop; on mobile it opens here as a bottom sheet). */}
      {notes !== undefined && tripId && currentUserId && (
        <Dialog open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
          <DialogContent>
            <DialogTitle className="sr-only">Notes</DialogTitle>
            <NoteThread
              inline
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              notes={notes}
              currentUserId={currentUserId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Attachments sheet — mobile counterpart to the desktop AttachmentPopover. */}
      {attachments !== undefined && tripId && (
        <Dialog open={attachSheetOpen} onOpenChange={setAttachSheetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Attachments</DialogTitle>
            </DialogHeader>
            <AttachmentList
              tripId={tripId}
              targetType="STOP"
              targetId={stop.id}
              attachments={attachments}
              compact
            />
          </DialogContent>
        </Dialog>
      )}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- stop-card.test`
Expected: PASS. If the "opens the note thread as a sheet" test is flaky (Radix closing a menu and opening a dialog in the same tick), defer the open in the two `onSelect` handlers with `requestAnimationFrame(() => setNotesSheetOpen(true))` and re-run.

- [ ] **Step 9: Run lint + typecheck + full suite**

Run: `npm run lint && npm test`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add components/trip/stop-card.tsx components/trip/stop-card.test.tsx
git commit -m "feat(stop-card): declutter mobile action row into overflow menu"
```

---

## Verification (manual, after all tasks)

jsdom cannot see layout. After the suite is green, confirm on a real viewport at **320px and 390px**, light + dark, ideally an installed iOS PWA:

1. **Header (A):** open any modal (e.g. Add Marker) — the title has clear space above the divider/first field; not cramped.
2. **Footer (B):** modal buttons sit side by side, each ~half width; primary on the right; both tappable. Desktop footer unchanged (right-aligned, auto width).
3. **Safe-area:** on a notched iPhone, the footer buttons clear the home indicator.
4. **Stop card (C):** a rough and a scheduled stop each show only drag handle + Edit + ⋯ on mobile. The ⋯ menu lists Notes (n), Attachments (n), chapter/date actions, and Delete. Notes and Attachments each open as a bottom sheet. Resize to `sm+` — every icon is inline again exactly as before.

## Docs

- No new domain terms → no `CONTEXT.md` change. No ADR (reversible CSS).
- If `COMPONENTS.md` documents the footer's stacked-on-mobile behavior, update that line to reflect side-by-side. (Check the Dialog/DialogFooter entry.)
