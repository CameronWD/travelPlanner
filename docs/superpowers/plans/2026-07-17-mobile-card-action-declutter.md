# Mobile Card Action Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the accommodation, transport, and wishlist item cards from truncating their titles on mobile by folding their secondary action icons into a `⋯` overflow menu, mirroring the existing stop-card pattern.

**Architecture:** Extract the stop-card's proven mobile-collapse behaviour into one shared client component, `CardActionCluster`. It keeps **Edit** always visible (a single instance across breakpoints), renders Attachments / Notes / Delete inline only on desktop (`hidden sm:*`), and on mobile (`sm:hidden`) folds them into a `⋯` `MoreActionsMenu` whose Notes and Attachments entries open as bottom-sheet `Dialog`s. Three cards adopt it; the stop card is left untouched (it already does this bespoke).

**Tech Stack:** Next.js (React Server + Client Components), Tailwind CSS, Radix (dropdown-menu, dialog), lucide-react icons, Vitest + @testing-library/react + @testing-library/user-event (jsdom).

## Global Constraints

- **Desktop is unchanged.** Only the mobile (`< sm`, i.e. `< 640px`) layout changes. The existing inline icon row must render identically at `sm` and up.
- **Preserve every existing `aria-label` string verbatim** (`Edit ${name}`, `Delete ${name}`, `Notes`, `Attachments`, etc.) — existing tests query by these names.
- **jsdom does not apply Tailwind stylesheets**, so both `sm:hidden` and `hidden sm:*` elements are present in the test DOM. Radix `DropdownMenuContent` and `DialogContent` are portaled and only mounted when open — rely on that (not on CSS hiding) to keep the folded menu items out of the default DOM. Keep **Edit** as a single always-visible instance so it is never duplicated.
- **Do not add features.** No new actions, no behaviour changes — this is a layout relocation only.
- **Run the full test file for every component touched** and confirm green before committing.
- Test runner: `npx vitest run <path>` for a single file.

---

### Task 1: `CardActionCluster` shared helper

**Files:**
- Create: `components/trip/card-action-cluster.tsx`
- Test: `components/trip/card-action-cluster.test.tsx`

**Interfaces:**
- Consumes: `MoreActionsMenu`, `CardActionItem` from `./card-actions`; `NoteThread`, `NoteView` from `./note-thread`; `AttachmentPopover` from `./attachment-popover`; `AttachmentList`, `AttachmentView` from `./attachment-list`; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `TargetType` from `@/lib/enums`; `cn` from `@/lib/cn`.
- Produces:
  ```ts
  export interface CardActionClusterProps {
    tripId?: string;
    targetType: TargetType;
    targetId: string;
    editLabel: string;
    deleteLabel: string;
    moreLabel: string;
    onEdit?: () => void;
    onDelete?: () => void;
    isPending?: boolean;
    notes?: NoteView[];
    currentUserId?: string;
    attachments?: AttachmentView[];
    className?: string;
  }
  export function CardActionCluster(props: CardActionClusterProps): JSX.Element;
  ```
  Rules: Notes render only when `notes !== undefined && tripId && currentUserId`. Attachments render only when `attachments !== undefined && tripId`. Edit renders only when `onEdit` is set; Delete only when `onDelete` is set. Edit is always visible; Attachments/Notes/Delete are desktop-inline (`hidden sm:*`); on mobile a `⋯` menu (`sm:hidden`) folds Notes/Attachments/Delete, with Notes & Attachments opening bottom-sheet dialogs.

- [ ] **Step 1: Write the failing test**

```tsx
// components/trip/card-action-cluster.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

import { CardActionCluster } from "./card-action-cluster";

const base = {
  tripId: "t1",
  targetType: "ACCOMMODATION" as const,
  targetId: "x1",
  editLabel: "Edit The Grand Hotel",
  deleteLabel: "Delete The Grand Hotel",
  moreLabel: "More actions for The Grand Hotel",
  currentUserId: "u1",
  notes: [],
  attachments: [],
};

describe("CardActionCluster", () => {
  it("renders a single Edit button when onEdit is provided", () => {
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit The Grand Hotel" })).toBeInTheDocument();
  });

  it("renders the mobile overflow trigger", () => {
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    expect(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    ).toBeInTheDocument();
  });

  it("folds Notes, Attachments, and Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    );
    expect(await screen.findByRole("menuitem", { name: /notes/i })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /attachments/i })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });

  it("opens the notes bottom sheet from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /notes/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a note/i)).toBeInTheDocument();
  });

  it("omits the overflow menu entirely when nothing foldable is provided", () => {
    render(
      <CardActionCluster
        tripId="t1"
        targetType="ACCOMMODATION"
        targetId="x1"
        editLabel="Edit X"
        deleteLabel="Delete X"
        moreLabel="More actions for X"
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "More actions for X" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/card-action-cluster.test.tsx`
Expected: FAIL — cannot resolve `./card-action-cluster` / `CardActionCluster is not defined`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/trip/card-action-cluster.tsx
"use client";

import * as React from "react";
import { Pencil, Trash2, MessageCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreActionsMenu, type CardActionItem } from "./card-actions";
import { NoteThread, type NoteView } from "./note-thread";
import { AttachmentPopover } from "./attachment-popover";
import { AttachmentList, type AttachmentView } from "./attachment-list";
import type { TargetType } from "@/lib/enums";

export interface CardActionClusterProps {
  tripId?: string;
  targetType: TargetType;
  targetId: string;
  /** aria-labels passed verbatim so existing labels/tests are preserved. */
  editLabel: string;
  deleteLabel: string;
  moreLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
  isPending?: boolean;
  notes?: NoteView[];
  currentUserId?: string;
  attachments?: AttachmentView[];
  className?: string;
}

/**
 * The right-hand action cluster shared by the accommodation, transport, and
 * wishlist item cards. Edit stays visible at every width; on mobile the
 * secondary actions (Notes, Attachments, Delete) fold into a `⋯` menu, with
 * Notes/Attachments opening as bottom sheets — mirroring the stop card.
 */
export function CardActionCluster({
  tripId,
  targetType,
  targetId,
  editLabel,
  deleteLabel,
  moreLabel,
  onEdit,
  onDelete,
  isPending = false,
  notes,
  currentUserId,
  attachments,
  className,
}: CardActionClusterProps) {
  const [notesSheetOpen, setNotesSheetOpen] = React.useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = React.useState(false);

  const hasNotes =
    notes !== undefined && tripId !== undefined && currentUserId !== undefined;
  const hasAttachments = attachments !== undefined && tripId !== undefined;

  const menuItems: CardActionItem[] = [];
  if (hasNotes) {
    menuItems.push({
      key: "notes",
      label: notes!.length > 0 ? `Notes (${notes!.length})` : "Notes",
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      onSelect: () => setNotesSheetOpen(true),
    });
  }
  if (hasAttachments) {
    menuItems.push({
      key: "attachments",
      label:
        attachments!.length > 0
          ? `Attachments (${attachments!.length})`
          : "Attachments",
      icon: <Paperclip className="size-4" aria-hidden="true" />,
      onSelect: () => setAttachSheetOpen(true),
    });
  }
  if (onDelete) {
    menuItems.push({
      key: "delete",
      label: "Delete",
      icon: <Trash2 className="size-4" aria-hidden="true" />,
      onSelect: onDelete,
      disabled: isPending,
      destructive: true,
    });
  }

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {/* Edit — single always-visible instance across breakpoints. */}
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={isPending}
          onClick={onEdit}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}

      {/* Desktop-only inline secondary actions. */}
      {hasAttachments && (
        <div className="hidden sm:block">
          <AttachmentPopover
            tripId={tripId}
            targetType={targetType}
            targetId={targetId}
            attachments={attachments!}
          />
        </div>
      )}
      {hasNotes && (
        <div className="hidden sm:block">
          <NoteThread
            tripId={tripId!}
            targetType={targetType}
            targetId={targetId}
            notes={notes!}
            currentUserId={currentUserId!}
          />
        </div>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isPending}
          onClick={onDelete}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}

      {/* Mobile-only overflow menu. */}
      {menuItems.length > 0 && (
        <div className="sm:hidden">
          <MoreActionsMenu label={moreLabel} items={menuItems} />
        </div>
      )}

      {/* Notes bottom sheet (mobile). */}
      {hasNotes && (
        <Dialog open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
          <DialogContent>
            <DialogTitle className="sr-only">Notes</DialogTitle>
            <NoteThread
              inline
              tripId={tripId!}
              targetType={targetType}
              targetId={targetId}
              notes={notes!}
              currentUserId={currentUserId!}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Attachments bottom sheet (mobile). */}
      {hasAttachments && (
        <Dialog open={attachSheetOpen} onOpenChange={setAttachSheetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Attachments</DialogTitle>
            </DialogHeader>
            <AttachmentList
              tripId={tripId}
              targetType={targetType}
              targetId={targetId}
              attachments={attachments!}
              compact
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/trip/card-action-cluster.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `card-action-cluster.tsx`.

- [ ] **Step 6: Commit**

```bash
git add components/trip/card-action-cluster.tsx components/trip/card-action-cluster.test.tsx
git commit -m "feat(cards): add CardActionCluster mobile-collapse helper"
```

---

### Task 2: Adopt `CardActionCluster` in the accommodation card

**Files:**
- Modify: `components/trip/accommodation-card.tsx` (imports + the action cluster at lines ~108–133)
- Test: `components/trip/accommodation-card.test.tsx` (existing — must stay green; add one test)

**Interfaces:**
- Consumes: `CardActionCluster` from `./card-action-cluster` (see Task 1).

- [ ] **Step 1: Add a failing test for the mobile overflow menu**

Append to `components/trip/accommodation-card.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";

describe("AccommodationCard mobile overflow", () => {
  it("folds Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <AccommodationCard
        accommodation={baseAcc}
        stop={baseStop}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
        attachments={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: `More actions for ${baseAcc.name}`,
    });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/accommodation-card.test.tsx`
Expected: FAIL — no button named `More actions for The Grand Hotel` (cluster not adopted yet).

- [ ] **Step 3: Swap imports**

In `components/trip/accommodation-card.tsx`:
- Remove: `import { RowActions } from "@/components/ui/row-actions";`
- Remove: `import { AttachmentPopover } from "./attachment-popover";`
- Change: `import { NoteThread, type NoteView } from "./note-thread";` → `import type { NoteView } from "./note-thread";`
- Add: `import { CardActionCluster } from "./card-action-cluster";`
- Keep: `import type { AttachmentView } from "./attachment-list";`

- [ ] **Step 4: Replace the action cluster**

Replace the controls block (the `<div className="flex shrink-0 items-center gap-1">…</div>` at lines ~108–133, containing `AttachmentPopover`, `NoteThread`, `RowActions`) with:

```tsx
          <CardActionCluster
            tripId={tripId}
            targetType="ACCOMMODATION"
            targetId={a.id}
            editLabel={`Edit ${a.name}`}
            deleteLabel={`Delete ${a.name}`}
            moreLabel={`More actions for ${a.name}`}
            onEdit={onEdit ? () => onEdit(a) : undefined}
            onDelete={onDelete ? () => onDelete(a.id) : undefined}
            isPending={isPending}
            notes={notes}
            currentUserId={currentUserId}
            attachments={attachments}
          />
```

- [ ] **Step 5: Run the full accommodation-card test file**

Run: `npx vitest run components/trip/accommodation-card.test.tsx`
Expected: PASS — the new test plus all pre-existing tests (name, nights, note-thread trigger present/absent, emerald styling, Confirmed label).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no unused-import errors from the removed imports.

- [ ] **Step 7: Commit**

```bash
git add components/trip/accommodation-card.tsx components/trip/accommodation-card.test.tsx
git commit -m "feat(accommodation-card): fold mobile actions into overflow menu"
```

---

### Task 3: Adopt `CardActionCluster` in the transport card

**Files:**
- Modify: `components/trip/transport-card.tsx` (imports + the controls block at lines ~156–181)
- Test: `components/trip/transport-card.test.tsx` (existing — must stay green; add one test)

**Interfaces:**
- Consumes: `CardActionCluster` from `./card-action-cluster` (see Task 1).

- [ ] **Step 1: Add a failing test for the mobile overflow menu**

Append to `components/trip/transport-card.test.tsx` (match the file's existing import style; add `userEvent` import if absent):

```tsx
describe("TransportCard mobile overflow", () => {
  it("folds Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <TransportCard
        transport={baseTransport}
        tripId="t1"
        currentUserId="u1"
        notes={[]}
        attachments={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "More actions for this transport",
    });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});
```

> Note: use whatever the file's existing base transport fixture is named (e.g. `baseTransport`). If none exists, reuse the fixture already used by the other tests in that file. Ensure the fixture has an `id` and a `mode`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/transport-card.test.tsx`
Expected: FAIL — no button named `More actions for this transport`.

- [ ] **Step 3: Swap imports**

In `components/trip/transport-card.tsx`:
- Remove: `import { RowActions } from "@/components/ui/row-actions";`
- Remove: `import { AttachmentPopover } from "./attachment-popover";`
- Change: `import { NoteThread, type NoteView } from "./note-thread";` → `import type { NoteView } from "./note-thread";`
- Add: `import { CardActionCluster } from "./card-action-cluster";`
- Keep: `import type { AttachmentView } from "./attachment-list";`

- [ ] **Step 4: Replace the controls block**

Replace the `{/* Controls */}` block (the `<div className="flex shrink-0 items-center gap-1">…</div>` at lines ~156–181, containing `AttachmentPopover`, `NoteThread`, `RowActions`) with:

```tsx
        <CardActionCluster
          tripId={tripId}
          targetType="TRANSPORT"
          targetId={t.id}
          editLabel="Edit Transport"
          deleteLabel="Delete Transport"
          moreLabel="More actions for this transport"
          onEdit={onEdit ? () => onEdit(t) : undefined}
          onDelete={onDelete ? () => onDelete(t.id) : undefined}
          isPending={isPending}
          notes={notes}
          currentUserId={currentUserId}
          attachments={attachments}
        />
```

- [ ] **Step 5: Run the full transport-card test file**

Run: `npx vitest run components/trip/transport-card.test.tsx`
Expected: PASS — the new test plus all pre-existing tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no unused-import errors.

- [ ] **Step 7: Commit**

```bash
git add components/trip/transport-card.tsx components/trip/transport-card.test.tsx
git commit -m "feat(transport-card): fold mobile actions into overflow menu"
```

---

### Task 4: Adopt `CardActionCluster` in the wishlist item card

**Files:**
- Modify: `components/trip/item-card.tsx` (imports + the action cluster at lines ~123–195)
- Test: `components/trip/item-card.test.tsx` (existing — must stay green; add one test)

**Interfaces:**
- Consumes: `CardActionCluster` from `./card-action-cluster` (see Task 1).

**Scope:** Only `mode === "wishlist"` adopts the cluster. `mode === "scheduled"` keeps its current inline Unschedule + Edit + Delete unchanged (it has no Notes/Attachments and does not crowd).

- [ ] **Step 1: Add a failing test for the wishlist overflow menu**

Append to `components/trip/item-card.test.tsx` (add the `userEvent` import if the file doesn't already have it; reuse the file's existing wishlist item fixture and required props):

```tsx
describe("ItemCard wishlist mobile overflow", () => {
  it("folds Delete into the overflow menu in wishlist mode", async () => {
    const user = userEvent.setup();
    render(
      <ItemCard
        item={wishlistItem}
        mode="wishlist"
        tripId="t1"
        currentUserId="u1"
        notes={[]}
        attachments={[]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: `More actions for ${wishlistItem.title}`,
    });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });
});
```

> Note: `wishlistItem` and the exact required props (`onSchedule`, `stops`, etc.) must match the fixtures/props already used by the wishlist-mode tests in this file. Read the file's existing tests first and copy their setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/trip/item-card.test.tsx`
Expected: FAIL — no button named `More actions for ${wishlistItem.title}`.

- [ ] **Step 3: Swap imports**

In `components/trip/item-card.tsx`:
- Remove: `import { AttachmentPopover } from "./attachment-popover";`
- Change the `NoteThread` import to a type-only import of `NoteView` **only if** `NoteThread` is no longer referenced elsewhere in the file (it isn't, once the cluster is replaced): `import { NoteThread, type NoteView } from "./note-thread";` → `import type { NoteView } from "./note-thread";`
- Add: `import { CardActionCluster } from "./card-action-cluster";`
- Keep: `Pencil`, `Trash2`, `CalendarX` (still used by scheduled mode), `CategoryPill`, and the `AttachmentView` type import.

- [ ] **Step 4: Rewrite the action cluster (mode-split)**

Replace the entire `{/* Action buttons (top-right cluster) */}` block (the outer `<div className="flex shrink-0 items-center gap-1">…</div>` spanning ~lines 123–195) with:

```tsx
        {/* Action buttons (top-right cluster) */}
        <div className="flex shrink-0 items-center gap-1">
          {mode === "wishlist" ? (
            <>
              <CategoryPill category={item.category as Category} size="sm" />
              <CardActionCluster
                tripId={tripId}
                targetType="ITEM"
                targetId={item.id}
                editLabel={`Edit ${item.title}`}
                deleteLabel={`Delete ${item.title}`}
                moreLabel={`More actions for ${item.title}`}
                onEdit={onEdit ? () => onEdit(item) : undefined}
                onDelete={onDelete ? () => onDelete(item.id) : undefined}
                isPending={isPending}
                notes={notes}
                currentUserId={currentUserId}
                attachments={attachments}
              />
            </>
          ) : (
            <>
              {onUnschedule && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  disabled={isPending}
                  onClick={() => onUnschedule(item.id)}
                  title="Move back to wishlist"
                >
                  <CalendarX className="size-3.5" aria-hidden="true" />
                  Unschedule
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={isPending}
                  onClick={() => onEdit(item)}
                  aria-label={`Edit ${item.title}`}
                  title="Edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  onClick={() => onDelete(item.id)}
                  aria-label={`Delete ${item.title}`}
                  title="Delete"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </>
          )}
        </div>
```

> This preserves scheduled-mode behaviour exactly (Unschedule + Edit + Delete inline) and moves only the wishlist-mode actions into the cluster. The `CategoryPill` stays visible in wishlist mode.

- [ ] **Step 5: Run the full item-card test file**

Run: `npx vitest run components/trip/item-card.test.tsx`
Expected: PASS — the new test plus all pre-existing tests. If a pre-existing wishlist test queried the delete/notes/attachment buttons by role and now finds the desktop instance only (the mobile ones are folded), it should still pass because the desktop instances remain in the jsdom DOM (`hidden sm:*` is not applied by jsdom). Fix any genuine breakage without weakening assertions.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no unused-import errors.

- [ ] **Step 7: Commit**

```bash
git add components/trip/item-card.tsx components/trip/item-card.test.tsx
git commit -m "feat(item-card): fold wishlist-mode mobile actions into overflow menu"
```

---

### Task 5: Visual verification at phone width + conditional title wrap

**Files:**
- Possibly modify (only if measurement demands it): the title element in `components/trip/accommodation-card.tsx`, `components/trip/transport-card.tsx`, `components/trip/item-card.tsx`.

**Goal:** Confirm the real fix — titles render without truncation at ~390px — and decide truncate-vs-wrap by looking, not guessing.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (whole suite green).

- [ ] **Step 2: Launch the app and open a trip plan editor at mobile width**

Use the `run` skill (or `claude-in-chrome`) to start the dev server and open a trip's plan editor. Set the viewport to a phone width (~390px, e.g. iPhone 12/13/14). Navigate to a Stop that has an accommodation with a long name, a transport leg, and (on the wishlist) an item with a long title.

- [ ] **Step 3: Capture and inspect**

Screenshot the accommodation card, transport card, and a wishlist item card at ~390px. Confirm:
- The title now shows only Edit + `⋯` beside it (no inline attachment/note/delete icons).
- The accommodation/item title is no longer clipped to ~10 chars; a normal-length name ("Arctic Glass Igloo", "The Bloomsbury Hotel") renders in full.
- Tapping `⋯` opens the menu; Notes and Attachments open as bottom sheets; Delete works.

- [ ] **Step 4: Add a 2-line wrap ONLY if a realistic name still truncates**

If, and only if, a realistic name is still clipped after the buttons moved, change the title element to wrap to two lines. Apply to whichever card(s) need it:

- Accommodation (`accommodation-card.tsx`, the `<h4 … truncate>`): replace `truncate` with `line-clamp-2`.
- Item (`item-card.tsx`, the `<h4 … truncate>`): replace `truncate` with `line-clamp-2`.
- Transport title already wraps (`flex-wrap`) — no change expected.

If no realistic name truncates, make **no** change — do not add wrapping speculatively.

- [ ] **Step 5: Re-run the suite if any code changed**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit (only if Step 4 changed code)**

```bash
git add -A
git commit -m "fix(cards): allow two-line titles on mobile where names overflow"
```

---

## Self-Review

**Spec coverage:**
- Accommodation card mobile declutter → Task 2. ✓
- Transport card mobile declutter → Task 3. ✓
- Wishlist item card mobile declutter → Task 4. ✓
- Stop-card mobile pattern mirrored (Edit + `⋯` + bottom sheets) → Task 1 (helper). ✓
- Desktop unchanged → Global Constraints + `hidden sm:*` in Task 1. ✓
- DRY (one shared helper) → Task 1. ✓
- Truncate vs wrap decided by measurement → Task 5. ✓
- Visual verification at phone width before done → Task 5. ✓
- Out of scope (home-screen route render, chapter date mismatch) → not in any task, by design. ✓

**Placeholder scan:** No TBD/TODO. All code steps show full code. Fixture-name notes in Tasks 3 & 4 instruct the engineer to read the existing test file's fixtures (which are the source of truth for those files) rather than invent names — this is deliberate, not a placeholder, because the exact fixture shape lives in those files.

**Type consistency:** `CardActionCluster` prop names (`editLabel`, `deleteLabel`, `moreLabel`, `onEdit`, `onDelete`, `notes`, `currentUserId`, `attachments`, `targetType`, `targetId`, `tripId`, `isPending`) are used identically in Tasks 2–4. `NoteView` / `AttachmentView` type imports retained where props reference them. `MoreActionsMenu` / `CardActionItem` consumed as defined in `card-actions.tsx`.
