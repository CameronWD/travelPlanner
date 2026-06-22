# Mobile/Daily-Use UI Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trip planner comfortable to use on a phone and tidy up several daily-use rough edges, without changing any features.

**Architecture:** Eight mostly-independent tasks against an existing Next.js 16 / React 19 / Tailwind v4 app. The dialog, tabs, money-input, field, and dark-token changes are presentational/CSS and verified by structural assertions + `npm run build` + a manual checklist (jsdom has no layout engine, so true responsive/visual behaviour can't be unit-tested). The timezone-badge and budget-component tasks contain real logic/rendering and get proper unit tests.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 (class-based dark mode, HSL design tokens in `app/globals.css`), Radix UI primitives, Vitest + Testing Library (jsdom), lucide-react icons.

**Branch:** `feat/mobile-ui-sweep` (already created off `main`). Do NOT touch `main`, switch branches, push, or deploy.

**Conventions every task must follow:**
- After each task: `npm run test` and `npm run build` must both exit 0. The suite is currently 885 tests green — do not regress it.
- These are presentational changes: do not alter server actions, data shapes, or behaviour unless the task says so.
- Match existing code style (the files quoted below show the house style: `cn()` for classes, `cva` variants, `forwardRef` primitives, lucide icons with `aria-hidden`, `aria-label`/`title` on icon-only buttons).
- Commit at the end of each task with the message given.

---

### Task 1: Responsive dialogs — bottom-sheet on mobile, centered modal on desktop, pinned header + close

**Files:**
- Modify: `components/ui/dialog.tsx`
- Modify (drop now-redundant classes): `components/trip/stop-form-dialog.tsx:77`, `components/trip/transport-form-dialog.tsx:82`, `components/trip/accommodation-form-dialog.tsx:71`, `components/trip/item-form-dialog.tsx:85`
- Modify (make width override desktop-only): `components/trip/cost-editor.tsx:120`, `components/trip/other-cost-editor.tsx:150`
- Test: `components/ui/dialog.test.tsx` (already exists — extend it)

> **Why:** Today `DialogContent` is the scroll container and the close (✕) is `absolute top-4 right-4` *inside* it, so on a tall form on a phone the ✕ scrolls out of reach. We restructure `DialogContent` into a flex-col frame that is a **bottom-sheet on mobile** and a **centered modal on desktop**, with a non-scrolling frame, a sticky header (title stays put), a pinned ✕, and an inner scrollable body. This fixes every dialog at once. The `Sheet` component (`components/ui/sheet.tsx`) already demonstrates the bottom-sheet styling + `tp-slide-up`/`tp-slide-down` animation utilities we reuse.

- [ ] **Step 1: Rewrite `DialogContent` and `DialogHeader` in `components/ui/dialog.tsx`**

Replace the existing `DialogContent` definition (currently lines 29–62) with:

```tsx
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Hide the built-in close button. */
    hideClose?: boolean;
  }
>(({ className, children, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Frame: column layout, height-capped, NOT itself the scroll container.
        "fixed z-50 flex flex-col overflow-hidden border-border bg-card text-card-foreground shadow-soft-lg",
        // Mobile (default): bottom sheet anchored to the bottom edge.
        "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t",
        "data-[state=open]:tp-slide-up data-[state=closed]:tp-slide-down",
        // Desktop (sm+): centered modal.
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
        "sm:data-[state=open]:tp-pop-in sm:data-[state=closed]:tp-pop-out",
        className,
      )}
      {...props}
    >
      {/* Mobile grab handle (decorative) */}
      <div
        aria-hidden="true"
        className="mx-auto mt-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
      />
      {/* Scrollable body — the frame above never scrolls, so the ✕ stays put. */}
      <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-4 sm:pt-6">
        {children}
      </div>
      {!hideClose ? (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 z-20 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
```

Then replace the existing `DialogHeader` (currently lines 64–72) with a sticky version. The negative margins cancel the scroll body's padding so the header bleeds edge-to-edge and pins to the top of the scroll viewport; `pr-10` keeps the title clear of the ✕:

```tsx
function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-6 -mt-4 flex flex-col gap-1.5 border-b border-border/60 bg-card px-6 pr-10 pb-3 pt-4 text-left sm:-mt-6 sm:pt-6",
        className,
      )}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";
```

Leave `DialogFooter`, `DialogTitle`, `DialogDescription`, and the exports unchanged.

- [ ] **Step 2: Drop now-redundant scroll classes from the four form dialogs**

`DialogContent` now owns height-capping and scrolling, so these overrides double-scroll and fight the new `max-h`. Edit each opening tag:

- `components/trip/stop-form-dialog.tsx:77` — `<DialogContent className="max-h-[90vh] overflow-y-auto">` → `<DialogContent>`
- `components/trip/transport-form-dialog.tsx:82` — `<DialogContent className="max-h-[90vh] overflow-y-auto">` → `<DialogContent>`
- `components/trip/accommodation-form-dialog.tsx:71` — `<DialogContent className="max-h-[90vh] overflow-y-auto">` → `<DialogContent>`
- `components/trip/item-form-dialog.tsx:85` — `<DialogContent className="max-h-[92vh] overflow-y-auto">` → `<DialogContent>`

- [ ] **Step 3: Make the two cost-editor width overrides desktop-only**

On mobile these should be full-width sheets; `max-w-sm` would wrongly constrain the sheet width. Prefix with `sm:`:

- `components/trip/cost-editor.tsx:120` — `<DialogContent className="max-w-sm">` → `<DialogContent className="sm:max-w-sm">`
- `components/trip/other-cost-editor.tsx:150` — `<DialogContent className="max-w-sm">` → `<DialogContent className="sm:max-w-sm">`

- [ ] **Step 4: Sweep for any other stray scroll/width overrides on DialogContent**

```bash
grep -rn "DialogContent className" components app | grep -E "max-h-|overflow-y|max-w-(xs|sm|md|lg|xl)\b"
```
For any remaining hit: drop `max-h-*`/`overflow-y-*` (now central) and prefix a bare `max-w-*` width with `sm:`. Expected after edits: no `max-h-`/`overflow-y` hits, and any `max-w-*` is `sm:`-prefixed.

- [ ] **Step 5: Extend `components/ui/dialog.test.tsx` with structural assertions**

Add tests asserting the new structure (jsdom can't test viewport, but it can assert classes/markup). Render an open dialog with a `DialogHeader`/`DialogTitle` and assert:
1. The close button (`name: /close/i`) is present and is **not** inside the element that has `overflow-y-auto` (query the close button, walk `closest('[class*="overflow-y-auto"]')`, expect `null`).
2. The `DialogContent` root carries both the mobile sheet class `rounded-t-2xl` and the desktop class `sm:rounded-2xl`.
3. The header element carries `sticky` and `top-0`.

Run: `npx vitest run components/ui/dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full verify**

```bash
npm run test && npm run build
```
Expected: both exit 0; 885+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/ui/dialog.tsx components/ui/dialog.test.tsx components/trip/stop-form-dialog.tsx components/trip/transport-form-dialog.tsx components/trip/accommodation-form-dialog.tsx components/trip/item-form-dialog.tsx components/trip/cost-editor.tsx components/trip/other-cost-editor.tsx
git commit -m "feat(ui): dialogs are bottom-sheets on mobile, centered modals on desktop

Restructure DialogContent into a non-scrolling flex frame with a sticky
header, pinned close button, and an inner scroll body so the close control
is always reachable on small screens. Drop per-dialog max-h/overflow.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Card action buttons collapse into an overflow menu on mobile

**Files:**
- Create: `components/trip/card-actions.tsx`
- Modify: `components/trip/stop-card.tsx` (action cluster, lines 92–154)
- Modify: `components/trip/accommodation-card.tsx` (action cluster, lines 91–114)
- Test: `components/trip/card-actions.test.tsx`

> **Why:** On a phone, the stop card crams up to 4–5 32px icon buttons next to the title, squeezing the name and giving tiny touch targets. We add a small responsive helper: on desktop the actions render inline as today; on mobile they collapse behind a single `⋯` overflow button (a `DropdownMenu`). Primary actions (Edit, Delete) and the inline Notes thread stay directly reachable; the secondary reorder actions (Move up / Move down) move into the menu. We use the existing `DropdownMenu` primitive (`components/ui/dropdown-menu.tsx`).

- [ ] **Step 1: Write the test first — `components/trip/card-actions.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoreActionsMenu } from "./card-actions";

describe("MoreActionsMenu", () => {
  it("renders a trigger labelled for the subject and reveals its items on open", async () => {
    const onMoveUp = vi.fn();
    const user = userEvent.setup();
    render(
      <MoreActionsMenu
        label="More actions for Paris"
        items={[
          { key: "up", label: "Move up", onSelect: onMoveUp },
          { key: "down", label: "Move down", onSelect: vi.fn(), disabled: true },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions for Paris" });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    expect(onMoveUp).toHaveBeenCalledOnce();
  });

  it("disables items flagged disabled", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MoreActionsMenu
        label="More"
        items={[{ key: "down", label: "Move down", onSelect, disabled: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const item = await screen.findByRole("menuitem", { name: "Move down" });
    expect(item).toHaveAttribute("data-disabled");
  });
});
```

Run: `npx vitest run components/trip/card-actions.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/trip/card-actions.tsx`**

```tsx
"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CardActionItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Render the label/icon in the destructive color. */
  destructive?: boolean;
}

/**
 * A `⋯` overflow button that reveals secondary card actions in a dropdown.
 * Used on small screens where inline icon buttons would crowd the card.
 */
export function MoreActionsMenu({
  label,
  items,
}: {
  label: string;
  items: CardActionItem[];
}) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={label}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Run: `npx vitest run components/trip/card-actions.test.tsx`
Expected: PASS.

- [ ] **Step 3: Wire `stop-card.tsx` — inline on desktop, overflow on mobile**

In `components/trip/stop-card.tsx`, import the helper and icons already used:
```tsx
import { MoreActionsMenu } from "./card-actions";
```
Replace the action cluster (`<div className="flex shrink-0 items-center gap-1">…</div>`, lines 92–154) so that:
- Move up / Move down render as inline icon buttons **only on `sm+`** — wrap them in `<div className="hidden items-center gap-1 sm:flex">…</div>` (keep the existing two `Button`s verbatim inside).
- Edit, the Notes thread, and Delete stay always-visible (move them outside the `sm:flex` wrapper, keep verbatim).
- Add a mobile-only overflow menu carrying Move up / Move down:
```tsx
<div className="sm:hidden">
  <MoreActionsMenu
    label={`More actions for ${stop.name}`}
    items={[
      { key: "up", label: "Move up", icon: <ChevronUp className="size-4" aria-hidden="true" />, onSelect: () => onMoveUp?.(stop.id), disabled: isFirst || isPending },
      { key: "down", label: "Move down", icon: <ChevronDown className="size-4" aria-hidden="true" />, onSelect: () => onMoveDown?.(stop.id), disabled: isLast || isPending },
    ]}
  />
</div>
```
The outer wrapper stays `<div className="flex shrink-0 items-center gap-1">`. Net effect: desktop shows up/down/edit/notes/delete inline (unchanged); mobile shows edit/notes/delete + a `⋯` holding up/down. Do not change any handler logic.

- [ ] **Step 4: Wire `accommodation-card.tsx` consistently**

`accommodation-card.tsx` only has Edit + Delete (no reorder), which already fit on mobile. To keep touch targets comfortable, bump the two icon buttons from `size-7`/`size-3.5` to `size-9`/`size-4` (matching the stop card's always-visible buttons) and leave them inline (no menu needed — two buttons fit). Edit `components/trip/accommodation-card.tsx:92-113`: change `className="size-7"` → `className="size-9"`, `className="size-7 text-destructive…"` → `className="size-9 text-destructive…"`, and both `<Pencil className="size-3.5"…>` / `<Trash2 className="size-3.5"…>` → `size-4`.

- [ ] **Step 5: Verify**

```bash
npm run test && npm run build
```
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/trip/card-actions.tsx components/trip/card-actions.test.tsx components/trip/stop-card.tsx components/trip/accommodation-card.tsx
git commit -m "feat(ui): collapse secondary card actions into an overflow menu on mobile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tabs scroll horizontally on overflow instead of cramming

**Files:**
- Modify: `components/ui/tabs.tsx` (`TabsList`, lines 9–22)
- Modify: `app/(app)/trips/[tripId]/checklists/page.tsx` (lines 77–96)
- Test: extend nearest tabs test if one exists, else add structural assertion inline (see step 3)

> **Why:** The checklists page forces `flex-1` equal-width triggers and `w-full` on the list, so on a narrow phone the three triggers (one with a count badge) cram together. Make the list scroll horizontally when it overflows and stop forcing equal widths; triggers are already `whitespace-nowrap`.

- [ ] **Step 1: Make `TabsList` overflow-scrollable**

In `components/ui/tabs.tsx`, change the `TabsList` className (line 15–18) from:
```tsx
"inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
```
to:
```tsx
"inline-flex h-11 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
```
(Drops `justify-center` — irrelevant when scrolling — and adds `max-w-full overflow-x-auto` plus hidden-scrollbar utilities so it scrolls cleanly without a visible bar.)

- [ ] **Step 2: Stop forcing equal-width triggers on the checklists page**

In `app/(app)/trips/[tripId]/checklists/page.tsx`:
- `TabsList` (line 77): change `className="w-full sm:w-auto"` → `className="w-full sm:w-auto"` stays, but it's now scrollable; leave as-is.
- Each `TabsTrigger` (lines 78, 86, 94): remove `className="flex-1 sm:flex-initial"` entirely (the triggers size to their content and the list scrolls if needed). The booking trigger has no badge — just drop its className too.

- [ ] **Step 3: Structural assertion**

Add/extend a test (e.g. `components/ui/tabs.test.tsx`, create if absent) rendering a `Tabs`/`TabsList`/`TabsTrigger` and asserting the rendered `tablist` element's class list includes `overflow-x-auto`.

Run: `npx vitest run components/ui/tabs.test.tsx`
Expected: PASS.

- [ ] **Step 4: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add components/ui/tabs.tsx app/\(app\)/trips/\[tripId\]/checklists/page.tsx components/ui/tabs.test.tsx
git commit -m "feat(ui): tab strips scroll horizontally on overflow instead of cramming

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Money input stays comfortable on narrow screens

**Files:**
- Modify: `components/ui/money-input.tsx` (the layout wrapper, lines 91–125)
- Test: `components/ui/money-input.test.tsx` (exists — extend)

> **Why:** `flex items-stretch gap-2` with a fixed `w-28` currency picker leaves the amount field tight on a ~360px phone inside a padded dialog. Give the amount field a sensible minimum and shrink the currency picker slightly so both stay usable; keep them on one row (stacking would make every cost form taller).

- [ ] **Step 1: Adjust the layout**

In `components/ui/money-input.tsx`:
- Wrapper (line 92): keep `flex items-stretch gap-2`.
- Amount `Input` (line 104): change `className="flex-1"` → `className="min-w-0 flex-1"` so it can shrink without overflowing its flex parent.
- Currency `SelectTrigger` (line 112): change `className="w-28 shrink-0"` → `className="w-24 shrink-0"` (narrower; the codes are ≤3 chars).

- [ ] **Step 2: Extend the test**

In `components/ui/money-input.test.tsx`, add an assertion that the amount input has the `min-w-0` class and the currency trigger has `w-24` (query by `aria-label` "Amount" and "Currency").

Run: `npx vitest run components/ui/money-input.test.tsx`
Expected: PASS.

- [ ] **Step 3: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add components/ui/money-input.tsx components/ui/money-input.test.tsx
git commit -m "fix(ui): keep money input usable on narrow screens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Legible field error text

**Files:**
- Modify: `components/ui/field.tsx` (error `<p>`, line 88)

> **Why:** Field error messages render at `text-xs`, easy to miss on a phone. Bump to `text-sm`.

- [ ] **Step 1: Change the error text size**

In `components/ui/field.tsx`, the error paragraph (line 88): change
```tsx
<p id={errorId} className="text-xs font-medium text-destructive">
```
to
```tsx
<p id={errorId} className="text-sm font-medium text-destructive">
```
Leave the description `<p>` (line 83) at `text-xs`.

- [ ] **Step 2: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0. (If any existing test asserts the error is `text-xs`, update that assertion to `text-sm`.)
```bash
git add components/ui/field.tsx
git commit -m "fix(ui): bump field error text to text-sm for legibility

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Timezone badge on stop date ranges

**Files:**
- Modify: `lib/dates.ts` (add `tzAbbrev` helper)
- Test: `lib/dates.test.ts` (exists — extend; if absent, create)
- Modify: `components/trip/stop-card.tsx` (dates row, lines 157–177)

> **Why:** A stop's dates are shown without timezone context; on a multi-country trip that's ambiguous. Add a small tz tag (e.g. "AEST", "GMT+1") next to the stop's date range, derived from the stop's IANA `timezone`. Transport already formats tz-aware times via `Intl.DateTimeFormat` with `timeZone` — we add a reusable abbreviation helper.

- [ ] **Step 1: Write the test first**

In `lib/dates.test.ts` add:
```ts
import { tzAbbrev } from "./dates";

describe("tzAbbrev", () => {
  it("returns a short zone name for a valid IANA zone on a given date", () => {
    // Brisbane has no DST → AEST year-round.
    expect(tzAbbrev("Australia/Brisbane", "2026-07-01")).toBe("AEST");
  });
  it("returns null for a missing or invalid zone", () => {
    expect(tzAbbrev(null, "2026-07-01")).toBeNull();
    expect(tzAbbrev("Not/AZone", "2026-07-01")).toBeNull();
  });
});
```

Run: `npx vitest run lib/dates.test.ts`
Expected: FAIL (`tzAbbrev` not exported).

- [ ] **Step 2: Implement `tzAbbrev` in `lib/dates.ts`**

Add (uses `Intl` `timeZoneName: "short"`, computed on the given date so DST is reflected; returns `null` on invalid zone). Place near `formatDateRange`:
```ts
/**
 * Short timezone abbreviation (e.g. "AEST", "GMT+1") for an IANA zone on a
 * given calendar date. Returns null when the zone is missing or invalid.
 */
export function tzAbbrev(
  timezone: string | null | undefined,
  onDateISO: string,
): string | null {
  if (!timezone) return null;
  try {
    const d = parseISODate(onDateISO);
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(d);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    return name ?? null;
  } catch {
    return null;
  }
}
```
> Note: `parseISODate` is the existing helper used by `formatDateRange` (same file). Confirm its name by reading the top of `lib/dates.ts`; if it differs, use the existing parser.

Run: `npx vitest run lib/dates.test.ts`
Expected: PASS.

- [ ] **Step 3: Render the badge in `stop-card.tsx`**

Import the helper:
```tsx
import { formatDateRange, nightsBetween, tzAbbrev } from "@/lib/dates";
```
Compute near line 63:
```tsx
const tz = tzAbbrev(stop.timezone, stop.arriveDate);
```
In the dates row (lines 158–162), after the `{dateRange}` span, add a tz tag when present:
```tsx
<span>{dateRange}</span>
{tz && (
  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
    {tz}
  </span>
)}
```
(`stop.timezone` is already on `StopCardStop`.)

- [ ] **Step 4: Day/Today views — follow the pattern where a stop date range is shown**

```bash
grep -rn "formatDateRange\|arriveDate" "app/(app)/trips/[tripId]" components/trip/calendar-views.tsx
```
For any spot **outside** stop-card that renders a stop's date *range* with the stop's timezone in scope, add the same tz tag. If the day/today views show per-day times (not stop ranges) or don't have the timezone in scope, leave them — note this in the task summary. Do not plumb new props through server components just for this.

- [ ] **Step 5: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add lib/dates.ts lib/dates.test.ts components/trip/stop-card.tsx
git commit -m "feat(ui): show timezone abbreviation next to stop date ranges

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Dark-mode secondary button surface delineation

**Files:**
- Modify: `app/globals.css` (`.dark` `--secondary`, line 73)
- Test: none (token value — verified by the manual contrast checklist)

> **Why:** In dark mode the secondary button surface (`--secondary: 24 10% 20%`) barely separates from the card (`24 12% 13%`) and page background (`24 14% 9%`) — roughly 1.3–1.5:1, so secondary buttons read as flat/invisible. The *text* contrast (`--secondary-foreground: 36 30% 92%` on the surface) is already ~10:1 and must NOT be touched. A strict 3:1 surface ratio isn't reachable without making "secondary" read like a different button tier, so the goal is **clearly distinguishable**, achieved with a minimal lightness bump.

- [ ] **Step 1: Bump the dark secondary surface lightness**

In `app/globals.css`, in the `.dark` block, change line 73 from:
```css
  --secondary: 24 10% 20%;
```
to:
```css
  --secondary: 24 10% 26%;
```
Do not change `--secondary-foreground`. Note the before/after surface-vs-card contrast in the commit body (compute with the standard WCAG relative-luminance formula on the HSL→sRGB values; e.g. ~1.3:1 → ~1.9:1, a visible improvement while staying a "quiet" button).

- [ ] **Step 2: Confirm text contrast still passes AA**

Verify `--secondary-foreground` (`36 30% 92%`) on the new `--secondary` (`24 10% 26%`) is ≥ 4.5:1 (it is, comfortably). State the computed ratio in the commit body.

- [ ] **Step 3: Verify + commit**

```bash
npm run test && npm run build
```
Expected: both exit 0.
```bash
git add app/globals.css
git commit -m "fix(ui): lift dark-mode secondary button surface for visible delineation

Bumps .dark --secondary lightness 20%->26% so secondary buttons separate
from card/background; text contrast unchanged (~10:1, still AA).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Unify the budget page's estimated-vs-actual rows

**Files:**
- Create: `components/trip/cost-amounts.tsx`
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` (the three sections, lines 279–381)
- Test: `components/trip/cost-amounts.test.tsx`

> **Why:** The budget page renders estimated-vs-actual three times (by-category, by-destination, day-by-day) with slightly different spacing/alignment, and there's no label telling the reader which number is "estimated" vs "spent". Extract one presentational component with locked alignment, color, and an accessible label, and use it in all three sections.

- [ ] **Step 1: Write the test first — `components/trip/cost-amounts.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostAmounts } from "./cost-amounts";

describe("CostAmounts", () => {
  it("shows the estimated amount with an accessible label", () => {
    render(<CostAmounts estimatedMinor={12300} actualMinor={0} currency="AUD" />);
    expect(screen.getByText("$123.00")).toBeInTheDocument();
    expect(screen.getByLabelText(/estimated/i)).toBeInTheDocument();
  });
  it("shows the actual amount in the spent style only when > 0", () => {
    const { rerender } = render(
      <CostAmounts estimatedMinor={12300} actualMinor={0} currency="AUD" />,
    );
    expect(screen.queryByLabelText(/spent/i)).toBeNull();
    rerender(<CostAmounts estimatedMinor={12300} actualMinor={9900} currency="AUD" />);
    const spent = screen.getByLabelText(/spent/i);
    expect(spent).toHaveTextContent("$99.00");
    expect(spent.className).toContain("text-emerald-600");
  });
});
```
> Confirm `formatMoney(12300, "AUD")` renders as `"$123.00"` by checking `lib/money.ts`; adjust the expected strings to match the real formatter output if it differs (e.g. `"A$123.00"`).

Run: `npx vitest run components/trip/cost-amounts.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `components/trip/cost-amounts.tsx`**

```tsx
import { formatMoney } from "@/lib/money";

/**
 * Estimated (and, when spent, actual) amounts rendered with locked alignment,
 * color, and accessible labels. Shared across the budget page sections so the
 * "estimated vs spent" reading is identical everywhere.
 */
export function CostAmounts({
  estimatedMinor,
  actualMinor,
  currency,
  className,
}: {
  estimatedMinor: number;
  actualMinor: number;
  currency: string;
  className?: string;
}) {
  return (
    <div
      className={
        "flex items-center gap-4 tabular-nums text-sm text-right" +
        (className ? ` ${className}` : "")
      }
    >
      <span aria-label="Estimated" className="min-w-[5rem] text-right">
        {formatMoney(estimatedMinor, currency)}
      </span>
      {actualMinor > 0 && (
        <span
          aria-label="Spent"
          className="min-w-[5rem] text-right text-emerald-600 dark:text-emerald-400"
        >
          {formatMoney(actualMinor, currency)}
        </span>
      )}
    </div>
  );
}
```

Run: `npx vitest run components/trip/cost-amounts.test.tsx`
Expected: PASS.

- [ ] **Step 3: Use it in all three budget sections**

In `app/(app)/trips/[tripId]/budget/page.tsx`, import:
```tsx
import { CostAmounts } from "@/components/trip/cost-amounts";
```

**By category (lines ~290–305):** replace the inner amount markup — the `<div className="flex items-center gap-3 tabular-nums text-right">` containing the `{pct}%` span plus the estimated/actual spans — keeping the percentage but delegating the numbers:
```tsx
<div className="flex items-center gap-3 tabular-nums text-right">
  <span className="text-muted-foreground text-xs">{pct}%</span>
  <CostAmounts
    estimatedMinor={cat.estimatedMinor}
    actualMinor={cat.actualMinor}
    currency={homeCurrency}
  />
</div>
```
(Leave the progress bar below it untouched.)

**By destination (lines ~334–344):** replace the `<div className="flex items-center gap-4 tabular-nums text-sm text-right">…</div>` with:
```tsx
<CostAmounts
  estimatedMinor={stop.estimatedMinor}
  actualMinor={stop.actualMinor}
  currency={homeCurrency}
/>
```

**Day by day (lines ~366–375):** replace the analogous `<div className="flex items-center gap-4 tabular-nums text-sm text-right">…</div>` with:
```tsx
<CostAmounts
  estimatedMinor={day.estimatedMinor}
  actualMinor={day.actualMinor}
  currency={homeCurrency}
/>
```

- [ ] **Step 4: Add a one-line legend so the two columns are self-explanatory**

At the top of the budget page's results area (read the file to find where the section cards start, after any summary header), add a small right-aligned legend so users know the color coding. Use a muted "Estimated" and an emerald "Spent" sample, e.g.:
```tsx
<div className="flex items-center justify-end gap-4 px-1 text-xs text-muted-foreground">
  <span>Estimated</span>
  <span className="text-emerald-600 dark:text-emerald-400">Spent</span>
</div>
```
Place it once, above the first section card. Keep it unobtrusive.

- [ ] **Step 5: Verify the budget page still renders the same numbers**

```bash
npm run test && npm run build
```
Expected: both exit 0. Spot-check the diff: the three sections should now call `CostAmounts`; no number/formatting logic changed (same `formatMoney`, same emerald color, same `min-w-[5rem]`).

- [ ] **Step 6: Commit**

```bash
git add components/trip/cost-amounts.tsx components/trip/cost-amounts.test.tsx app/\(app\)/trips/\[tripId\]/budget/page.tsx
git commit -m "refactor(budget): shared estimated-vs-spent component across sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** Dialog bottom-sheet + sticky header + pinned close (T1); card overflow menus on mobile (T2); tabs scroll on overflow (T3); money input on narrow screens (T4); field error legibility (T5); timezone badges (T6); dark-mode secondary contrast, reframed to surface delineation since text already passes AA (T7); budget cost-display consistency via shared component (T8). All eight agreed items covered.
- **Verification:** T2, T6, T8 carry real unit tests (menu behaviour, tz abbreviation, amount rendering). T1, T3, T4 carry structural class assertions. T5, T7 are single-value changes guarded by the full suite + build. Every task ends with `npm run test && npm run build` green and the manual mobile/contrast checklist (delivered at the end of the build) is the final proof for layout/visual behaviour.
- **Type/name consistency:** `MoreActionsMenu`/`CardActionItem` (T2), `tzAbbrev` (T6), `CostAmounts` (T8) are each defined once and referenced consistently. `formatMoney`, `parseISODate`, `formatDateRange`, `stop.timezone` are existing symbols confirmed against the current source.
- **Risk notes:** T1 is the highest-risk (restructures a shared primitive used by 12 dialogs); the negative-margin sticky header and the responsive sheet/modal switch must be eyeballed on a phone — the manual checklist covers it, and the review loop should scrutinise it. T6 Step 4 and T7 are deliberately bounded (a grep-guided follow-the-pattern, and a single token tweak) rather than open-ended. No task changes server actions, data, or behaviour.
