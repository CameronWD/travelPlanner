# TEEPEE UX Tightening Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the existing TEEPEE app's UX — safer destructive actions, consistent loading/empty/error states, mobile/touch parity, two verified bugs, and a sweep of polish — without adding net-new features.

**Architecture:** Build three shared foundations first (a `ConfirmDialog`, an undo-toast helper, a `FormError` component), then apply them across the app. Everything else is independent and can proceed in any order after the foundations land. The codebase is Next.js 16 (app router, RSC + server actions), React 19, Radix UI primitives, Tailwind v4, vitest + @testing-library/react.

**Tech Stack:** Next.js 16, React 19, TypeScript, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-toast`), Tailwind v4, `lucide-react`, `motion`, vitest, @testing-library/react + user-event.

## Global Constraints

- **Domain language is canonical** — use the exact terms from `CONTEXT.md` in all UI copy: Trip, Stop (rough/scheduled), Chapter, Transport, Accommodation, Item, Wishlist, Timeline, Firm up, Pinned, Traveller, Cost, Home currency. Avoid the listed forbidden synonyms (e.g. never "destination", "hotel", "vacation", "sync").
- **Schemas stay lenient** — date-order checks (transport depart/arrive, accommodation check-in/out) are **soft, non-blocking warnings only**. Never add a `.refine()` that blocks submit on date order.
- **No new runtime dependencies** — build on the Radix primitives already in `package.json`. No `@radix-ui/react-alert-dialog`.
- **TDD throughout** — every behavioral change gets a failing test first. Tests are colocated as `*.test.tsx` / `*.test.ts` and run with vitest.
- **Test command:** `npx vitest run <path>` for one file; `npm test` for the suite. **Typecheck/build:** `npm run build`. **Lint:** `npm run lint`.
- **Frequent commits** — one commit per task (Conventional Commits). Work stays on branch `feat/ux-tightening-pass`. Do **not** touch `main`, do not merge, do not deploy.
- **Accessibility is part of "done"** — icon-only buttons need `aria-label`; field errors wire through `Field`'s `error` prop (which sets `aria-invalid` + `aria-describedby`); reduced-motion is respected.

---

## File Structure

**New files:**
- `components/ui/confirm-dialog.tsx` — `ConfirmDialog` + `useConfirm()` hook (built on existing `Dialog`).
- `components/ui/confirm-dialog.test.tsx`
- `components/ui/undo-toast.tsx` — `toastWithUndo()` helper (built on existing toast store + `ToastAction`).
- `components/ui/undo-toast.test.tsx`
- `components/ui/form-error.tsx` — `FormError` for form-level (non-field) errors.
- `components/ui/form-error.test.tsx`
- `app/(app)/trips/[tripId]/loading.tsx` — shared trip-shell skeleton.
- `app/(app)/trips/[tripId]/plan/loading.tsx`, `.../calendar/loading.tsx`, `.../budget/loading.tsx`, `.../summary/loading.tsx` — bespoke skeletons.

**Key modified files** (per task below): `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/toast.tsx`, `components/trip/other-cost-editor.tsx`, `components/trip/itinerary-manager.tsx`, `components/trip/stops-manager.tsx`, `components/trip/chapters-manager.tsx`, `components/trip/wishlist-board.tsx`, `components/trip/cost-editor.tsx`, `components/trip/attachment-list.tsx`, `components/trip/checklist.tsx`, `components/trip/note-thread.tsx`, `components/trip/make-it-fit.tsx`, the settings panels, the form dialogs, and the money/long-tail surfaces.

---

## Task 1: `ConfirmDialog` + `useConfirm` foundation

**Files:**
- Create: `components/ui/confirm-dialog.tsx`
- Test: `components/ui/confirm-dialog.test.tsx`

**Interfaces:**
- Produces:
  - `function useConfirm(): { confirm: (opts: ConfirmOptions) => Promise<boolean>; dialog: React.ReactNode }`
  - `interface ConfirmOptions { title: string; description?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }`
  - A component form `<ConfirmDialog open onOpenChange title description confirmLabel destructive onConfirm />` for callers that prefer controlled usage.
- Consumes: `Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`.

**Design notes:** `useConfirm` returns a `confirm()` that opens the dialog and resolves `true`/`false` on the user's choice (resolves `false` on dismiss/escape/overlay). The destructive variant renders the confirm button with `variant="destructive"`. Confirm button gets `autoFocus`. The returned `dialog` node must be rendered by the caller (typically once near the component root).

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/confirm-dialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useConfirm } from "./confirm-dialog";

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await confirm({ title: "Delete Paris?", confirmLabel: "Delete", destructive: true }))}>
        open
      </button>
      {dialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("resolves true when the confirm button is clicked", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByText("open"));
    expect(await screen.findByText("Delete Paris?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves false when cancelled", async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByText("open"));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/confirm-dialog.test.tsx`
Expected: FAIL — `useConfirm` not exported / module not found.

- [ ] **Step 3: Implement `confirm-dialog.tsx`**

Implement `useConfirm` holding `{ open, options, resolver }` in state. `confirm(opts)` sets options, opens the dialog, and returns a `Promise<boolean>` whose resolver is stored. The rendered `dialog` is a `<Dialog open={open} onOpenChange>` where closing without confirming resolves `false`; the confirm button resolves `true` then closes. Use `DialogFooter` with a `DialogClose`-wrapped secondary "Cancel" button and a primary confirm button (`variant={destructive ? "destructive" : "primary"}`, `autoFocus`). Default labels: confirm "Confirm", cancel "Cancel".

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/confirm-dialog.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add components/ui/confirm-dialog.tsx components/ui/confirm-dialog.test.tsx
git commit -m "feat(ui): add ConfirmDialog + useConfirm foundation"
```

---

## Task 2: Undo-toast helper

**Files:**
- Create: `components/ui/undo-toast.tsx`
- Test: `components/ui/undo-toast.test.tsx`

**Interfaces:**
- Produces: `function toastWithUndo(opts: { title: React.ReactNode; description?: React.ReactNode; onUndo: () => void; duration?: number }): string` — shows a toast carrying a `<ToastAction altText="Undo">Undo</ToastAction>` that calls `onUndo` when clicked. Default `duration` 6000ms.
- Consumes: `toast` from `@/components/ui/use-toast`; `ToastAction` from `@/components/ui/toast`.

**Design notes:** Clicking a Radix `Toast.Action` auto-closes the toast (fires `onOpenChange(false)` → the Toaster dismisses it), so the helper only needs to wire `onClick={onUndo}`. No need to thread the toast id into the action.

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/undo-toast.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "./toaster";
import { toastWithUndo } from "./undo-toast";

describe("toastWithUndo", () => {
  it("renders an Undo action that calls onUndo when clicked", async () => {
    const onUndo = vi.fn();
    render(<Toaster />);
    toastWithUndo({ title: "Moved to Wishlist", onUndo });
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/undo-toast.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `undo-toast.tsx`**

```tsx
"use client";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

export function toastWithUndo({
  title,
  description,
  onUndo,
  duration = 6000,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  onUndo: () => void;
  duration?: number;
}): string {
  return toast({
    title,
    description,
    duration,
    action: (
      <ToastAction altText="Undo" onClick={onUndo}>
        Undo
      </ToastAction>
    ),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/undo-toast.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/undo-toast.tsx components/ui/undo-toast.test.tsx
git commit -m "feat(ui): add toastWithUndo helper"
```

---

## Task 3: `FormError` component + field-error convention

**Files:**
- Create: `components/ui/form-error.tsx`
- Test: `components/ui/form-error.test.tsx`

**Interfaces:**
- Produces: `function FormError({ children, id }: { children?: React.ReactNode; id?: string }): React.ReactNode | null` — renders nothing when `children` is empty; otherwise a `role="alert"` block styled `text-sm font-medium text-destructive` for **form-level** errors (failures not tied to a single field). Field-level errors continue to use `Field`'s existing `error` prop.

**Design notes:** This is the shared form-level error surface that Task 14 wires into every dialog. It complements (does not replace) `Field`'s per-control `error`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/ui/form-error.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormError } from "./form-error";

describe("FormError", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<FormError>{null}</FormError>);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders an alert with the message", () => {
    render(<FormError>Could not save</FormError>);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
  });
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npx vitest run components/ui/form-error.test.tsx` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `FormError`: return `null` when no children; else `<p role="alert" id={id} className="text-sm font-medium text-destructive">{children}</p>`.
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run components/ui/form-error.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add components/ui/form-error.tsx components/ui/form-error.test.tsx
git commit -m "feat(ui): add FormError for form-level errors"
```

---

## Task 4: Bug — `Button` ignores `loading` when `asChild`

**Files:**
- Modify: `components/ui/button.tsx:60-72`
- Test: `components/ui/button.test.tsx` (add cases)

**Interfaces:**
- Produces: unchanged public API. New behavior: when `loading && asChild`, the slotted element becomes inert via `pointer-events-none` + reduced opacity and exposes `aria-disabled` / `aria-busy`, since native `disabled` is ignored by non-`<button>` elements (e.g. anchors).

- [ ] **Step 1: Add failing tests**

```tsx
// add to components/ui/button.test.tsx
it("marks an asChild button inert and busy while loading", () => {
  render(
    <Button asChild loading>
      <a href="/x">Go</a>
    </Button>,
  );
  const el = screen.getByRole("link", { name: "Go" });
  expect(el).toHaveAttribute("aria-disabled", "true");
  expect(el).toHaveAttribute("aria-busy", "true");
  expect(el.className).toMatch(/pointer-events-none/);
});
```

- [ ] **Step 2: Run to verify fail** — Run: `npx vitest run components/ui/button.test.tsx` — Expected: FAIL (no `aria-disabled`, no inert class).
- [ ] **Step 3: Implement** — in `button.tsx`, compute `const inertWhenAsChild = loading && asChild;` Add to `className` via `cn(...)`: `inertWhenAsChild && "pointer-events-none opacity-50"`. Set `aria-disabled={inertWhenAsChild || undefined}` and keep `aria-busy={loading || undefined}`. Leave the `disabled={asChild ? undefined : (disabled ?? loading)}` line for the native-button path.
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run components/ui/button.test.tsx` — Expected: PASS (existing tests still green).
- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx
git commit -m "fix(ui): make Button loading state inert+busy for asChild"
```

---

## Task 5: Bug — other-cost conversion uses raw multiply

**Files:**
- Modify: `components/trip/other-cost-editor.tsx:368` (and any sibling line doing the same for `actualMinor`)
- Test: `components/trip/other-cost-editor.test.ts` (or `.tsx` matching the existing test file)

**Interfaces:**
- Consumes: `convertMinor` from `@/lib/money` (signature `convertMinor(amountMinor, fromCurrency, toCurrency, rate)`).

**Design notes:** Current code is `Math.round(cost.estimatedMinor * cost.rateToHome)`, which is wrong whenever the cost currency and home currency have different decimal places (JPY/KRW = 0, BHD/KWD = 3). `convertMinor` handles the decimal scaling. The component must have the trip's home currency available; if it isn't already a prop, thread it in from the caller (it already passes `rateToHome` and the cost's `currency`).

- [ ] **Step 1: Write the failing test** — render the editor (or extract the conversion into a tested pure helper) with a JPY cost (`estimatedMinor` = 100000 → ¥100,000), `rateToHome` ≈ 0.011, home = "AUD". Assert the displayed converted value is ≈ `A$1,100.00` (i.e. `convertMinor(100000, "JPY", "AUD", 0.011)` = `110000` minor), NOT `A$11.00`.
- [ ] **Step 2: Run to verify fail** — Run: `npx vitest run components/trip/other-cost-editor.test.ts` — Expected: FAIL (shows the off-by-100 value).
- [ ] **Step 3: Implement** — replace the manual `Math.round(... * rateToHome)` with `convertMinor(cost.estimatedMinor, cost.currency, homeCurrency, cost.rateToHome)` (and likewise for any actual-amount conversion in the same component). Format with the existing `formatMoney`/`formatMinor` helper already used there.
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run components/trip/other-cost-editor.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add components/trip/other-cost-editor.tsx components/trip/other-cost-editor.test.ts
git commit -m "fix(money): use convertMinor for other-cost home-currency display"
```

---

## Task 6: Replace existing `confirm()` calls with `ConfirmDialog`

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` (delete stop ~341, delete transport/accommodation ~423), `components/trip/stops-manager.tsx`, `components/trip/chapters-manager.tsx`, `components/trip/cost-editor.tsx`, `components/trip/other-cost-editor.tsx`, `components/trip/wishlist-board.tsx`
- Test: the colocated `*.test.tsx` for each (extend), e.g. `itinerary-manager.test.tsx`

**Interfaces:**
- Consumes: `useConfirm` (Task 1).

**Design notes:** There are 9 `confirm()` calls across these 6 files. Each becomes `if (!(await confirm({ title, description, destructive: true, confirmLabel: "Delete" }))) return;` before the existing delete/mutation. **The title/description must name the entity** (e.g. `Delete "${stop.name}"?`, `Delete this transport leg (${mode})?`). Render the `dialog` node once per component. Do this file-by-file; commit per file or as one task commit at the end.

- [ ] **Step 1: For `itinerary-manager.tsx`, add a test** asserting that triggering "delete stop" opens a dialog containing the stop name, and the server delete is only called after clicking the confirm button (mock the action).
- [ ] **Step 2: Run to verify fail** — Run: `npx vitest run components/trip/itinerary-manager.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** — wire `useConfirm` into `itinerary-manager.tsx`; gate stop delete and transport/accommodation delete behind it with entity-named copy. Render `{dialog}`.
- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run components/trip/itinerary-manager.test.tsx` — Expected: PASS.
- [ ] **Step 5: Repeat Steps 1–4** for `stops-manager.tsx`, `chapters-manager.tsx` (name the chapter), `cost-editor.tsx`, `other-cost-editor.tsx`, `wishlist-board.tsx` (delete item) — one test each pinning "dialog names the entity, mutation only after confirm". Remove every `confirm(` call (verify with `grep -rn "confirm(" components --include=*.tsx | grep -v test` → 0 results).
- [ ] **Step 6: Commit**

```bash
git add components/trip/
git commit -m "feat(ui): replace native confirm() with named ConfirmDialog across destructive actions"
```

---

## Task 7: Add confirmation to currently-unguarded destructive actions

**Files:**
- Modify: `components/trip/attachment-list.tsx:~108` (delete file), `components/trip/checklist.tsx:~411` (delete item), `components/trip/note-thread.tsx:~140` (delete note), `components/trip/make-it-fit.tsx:~153` (drop stop), `components/trip/settings/calendar-feed-panel.tsx:~58` (regenerate feed)
- Test: colocated `*.test.tsx` for each that exists.

**Interfaces:** Consumes `useConfirm` (Task 1).

**Design notes:** Same pattern as Task 6 — gate the action behind `confirm()` with entity-named copy. For calendar-feed regenerate, the copy must warn: "Regenerating invalidates the current calendar URL — anyone subscribed will need the new link." (destructive variant).

- [ ] **Step 1–4 per file:** failing test (action fires only after confirm) → verify fail → implement gate with named copy → verify pass. For files without an existing test (e.g. `calendar-feed-panel.tsx`), create `calendar-feed-panel.test.tsx`.
- [ ] **Step 5: Commit**

```bash
git add components/trip/
git commit -m "feat(ui): confirm before deleting files, notes, checklist items, dropping stops, and resetting the calendar feed"
```

---

## Task 8: Firm-up confirm-with-summary

**Files:**
- Modify: `components/trip/itinerary-manager.tsx` ("Date all stops from start" ~405-420 and per-chapter "Set dates" ~385-402)
- Test: `components/trip/itinerary-manager.test.tsx`

**Interfaces:** Consumes `useConfirm` (Task 1). Needs the count of rough stops affected and the anchor date (already available where firm-up is invoked, or derivable from the stops/trip props in scope).

**Design notes:** Before firming up, show `confirm({ title: "Date all stops from start?", description: \`This will date \${roughCount} rough stop(s) from \${formatDate(anchor)}. You can make any stop rough again afterwards.\` })`. Per-chapter variant scopes the count/anchor to that chapter. Non-destructive variant (it's reversible) — primary button labelled "Date stops".

- [ ] **Step 1: Failing test** — clicking "Date all stops from start" opens a dialog whose text includes the rough-stop count; the firm-up action is called only after confirm.
- [ ] **Step 2: Verify fail** — `npx vitest run components/trip/itinerary-manager.test.tsx`.
- [ ] **Step 3: Implement** both the whole-trip and per-chapter confirm-with-summary.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit**

```bash
git add components/trip/itinerary-manager.tsx components/trip/itinerary-manager.test.tsx
git commit -m "feat(plan): confirm firm-up with a stop-count + anchor summary"
```

---

## Task 9: Undo-toast for unschedule

**Files:**
- Modify: `components/trip/wishlist-board.tsx:~82-89` (and anywhere else `unscheduleItem` is invoked from a card action)
- Test: `components/trip/wishlist-board.test.tsx`

**Interfaces:** Consumes `toastWithUndo` (Task 2) and the existing `rescheduleItem`/`scheduleItem` server action to restore the prior date/time.

**Design notes:** On successful unschedule, capture the item's prior `date` (and time fields) **before** the mutation, then `toastWithUndo({ title: "Moved to Wishlist", onUndo: () => reschedule(item.id, priorDate, priorTime) })`. Undo re-applies the previous schedule. No blocking confirm for this reversible action.

- [ ] **Step 1: Failing test** — after unschedule, an "Undo" toast appears; clicking it calls reschedule with the prior date.
- [ ] **Step 2: Verify fail** — `npx vitest run components/trip/wishlist-board.test.tsx`.
- [ ] **Step 3: Implement** the capture-then-undo flow.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit**

```bash
git add components/trip/wishlist-board.tsx components/trip/wishlist-board.test.tsx
git commit -m "feat(wishlist): undo-toast when unscheduling an item back to the Wishlist"
```

---

## Task 10: Soft date-order warnings (transport + accommodation)

**Files:**
- Modify: `components/trip/transport-form-dialog.tsx` (warn when both `depAt` and `arrAt` set and `depAt >= arrAt`), `components/trip/accommodation-form-dialog.tsx` (warn when `checkOut <= checkIn`)
- Test: `components/trip/transport-form-dialog.test.tsx`, `components/trip/accommodation-form-dialog.test.tsx`

**Design notes:** **Do not** change the zod schemas — they stay lenient. Compute the warning in the component from current field values and render a non-blocking inline notice near the date/time fields (muted/warning styling, `role="status"`), e.g. "Departure is after arrival — double-check these times." Submit remains enabled. Accommodation already has a warning surface; extend it to cover the check-out ≤ check-in case.

- [ ] **Step 1: Failing tests** — entering depart later than arrive shows the warning text but the submit button stays enabled; clearing one date hides the warning.
- [ ] **Step 2: Verify fail** — run both test files.
- [ ] **Step 3: Implement** the derived warnings.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit**

```bash
git add components/trip/transport-form-dialog.tsx components/trip/accommodation-form-dialog.tsx components/trip/*.test.tsx
git commit -m "feat(bookings): soft non-blocking warnings for inverted transport/accommodation dates"
```

---

## Task 11: Loading skeletons

**Files:**
- Create: `app/(app)/trips/[tripId]/loading.tsx` (shared shell), `app/(app)/trips/[tripId]/plan/loading.tsx`, `.../calendar/loading.tsx`, `.../budget/loading.tsx`, `.../summary/loading.tsx`
- Consumes: existing `Skeleton` from `@/components/ui/skeleton`.

**Design notes:** Each `loading.tsx` is a server component exporting a default function returning skeleton placeholders that roughly match the page's layout (header bar + content blocks). The shared `[tripId]/loading.tsx` covers the common trip-shell; the bespoke ones approximate their page's primary content (e.g. plan = list of stop-card-shaped rows; budget = total + breakdown bars; calendar = month grid). No tests required (pure presentational skeletons) — verify by build + visual.

- [ ] **Step 1:** Create the shared `[tripId]/loading.tsx` using `Skeleton` blocks matching the trip header + nav + a content placeholder.
- [ ] **Step 2:** Create the four bespoke `loading.tsx` files.
- [ ] **Step 3:** Verify build — Run: `npm run build` — Expected: compiles; routes show as having a loading boundary.
- [ ] **Step 4: Commit**

```bash
git add "app/(app)/trips/[tripId]/loading.tsx" "app/(app)/trips/[tripId]/plan/loading.tsx" "app/(app)/trips/[tripId]/calendar/loading.tsx" "app/(app)/trips/[tripId]/budget/loading.tsx" "app/(app)/trips/[tripId]/summary/loading.tsx"
git commit -m "feat(ux): add loading skeletons for trip shell and heavy pages"
```

---

## Task 12: Empty-state consistency

**Files:**
- Modify: `app/(app)/trips/[tripId]/plan/page.tsx:~227` (no-stops state), `components/trip/activity-feed.tsx` (route plain text through `EmptyState`), `app/(app)/trips/[tripId]/files/page.tsx`, `app/(app)/trips/[tripId]/checklists/page.tsx`, `app/(app)/trips/[tripId]/wishlist/page.tsx`, `app/(app)/trips/[tripId]/summary/page.tsx:~108` (show rough stops when date-less; unify date-less copy with budget + calendar)
- Consumes: existing `EmptyState` from `@/components/ui/empty-state`.

**Design notes:** Every empty state renders via `EmptyState`. Add a CTA where there's one obvious next action (plan → "Add your first Stop"; wishlist → "Add an Item"; files → "Upload"; checklists → "Add item"). Activity feed = informational, no CTA. Unify the date-less-trip empty copy across summary/budget/calendar (same message + same component). On summary, render rough Stops above the date-less notice rather than hiding them. Use canonical domain terms in all copy.

- [ ] **Step 1: Failing tests** where components are unit-testable (e.g. plan page renders an `EmptyState` with an add-stop CTA when `stops.length === 0`; activity-feed renders `EmptyState` when empty). For server-component pages without easy unit tests, verify via build + the extracted client component's test.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the conversions + CTAs + date-less unification + summary rough-stops.
- [ ] **Step 4: Verify pass** + `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/" components/trip/activity-feed.tsx components/trip/activity-feed.test.tsx
git commit -m "feat(ux): standardise empty states on EmptyState with CTAs; show rough stops on summary"
```

---

## Task 13: Mobile schedule parity

**Files:**
- Modify: `components/trip/wishlist-board.tsx`, `components/trip/calendar-views.tsx` (the wishlist rail items)
- Test: `components/trip/wishlist-board.test.tsx`

**Interfaces:** Consumes the existing `ScheduleItemDialog` (`components/trip/schedule-item-dialog.tsx`).

**Design notes:** Add a visible "Schedule" button (with calendar icon + `aria-label`) on each unscheduled wishlist item, in both the wishlist board cards and the calendar wishlist rail, opening the existing `ScheduleItemDialog`. This gives touch/keyboard users the path that the drag-only month-grid interaction currently blocks. Keep the existing drag behaviour for pointer users.

- [ ] **Step 1: Failing test** — a wishlist item renders a "Schedule" button; clicking it opens the schedule dialog.
- [ ] **Step 2: Verify fail** — `npx vitest run components/trip/wishlist-board.test.tsx`.
- [ ] **Step 3: Implement** the button + dialog wiring in both surfaces.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit**

```bash
git add components/trip/wishlist-board.tsx components/trip/calendar-views.tsx components/trip/wishlist-board.test.tsx
git commit -m "feat(wishlist): add Schedule button so touch/keyboard users can schedule without dragging"
```

---

## Task 14: Toast + dialog mobile fixes

**Files:**
- Modify: `components/ui/toast.tsx` (viewport bottom offset clears the mobile tab bar; close-button touch target ≥44px; reduced-motion), `components/ui/dialog.tsx:99-107` (`DialogFooter` button order on mobile)
- Test: `components/ui/dialog.test.tsx` (footer order assertion if feasible)

**Design notes:**
- ToastViewport: on mobile (default, below `sm`), add bottom padding/offset so toasts clear the fixed tab bar (`pb-[calc(4rem+env(safe-area-inset-bottom))]` or position above it). At `sm+` keep current `bottom-4 right-4`.
- ToastClose: bump hit area to ≥44px (e.g. wrap/`p-2.5` + min size) while keeping the 16px icon.
- Reduced motion: gate the `tp-slide-in-right` / `tp-fade-out` animation classes behind `motion-safe:` (or a `prefers-reduced-motion` media rule) so reduced-motion users get no slide.
- DialogFooter: keep `flex-col-reverse` semantics but ensure the **primary** action is reachable without a long reach — switch to `flex-col` with primary last visually but ensure ordering matches reading order, per existing motion/UX conventions; verify the primary button is the first focusable in DOM order for keyboard users.

- [ ] **Step 1: Failing/assertion test** for dialog footer DOM order (primary button precedes cancel in DOM) where testable; toast changes verified by class assertions + build.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the four fixes.
- [ ] **Step 4: Verify pass** + `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add components/ui/toast.tsx components/ui/dialog.tsx components/ui/dialog.test.tsx
git commit -m "fix(ui): toast clears mobile tab bar, bigger close target, reduced-motion, dialog footer order"
```

---

## Task 15: Form-error full sweep

**Files:**
- Modify (route all field errors through `Field`'s `error` prop and form-level errors through `FormError`): `components/trip/stop-form-dialog.tsx`, `item-form-dialog.tsx`, `transport-form-dialog.tsx`, `accommodation-form-dialog.tsx`, `chapter-form-dialog.tsx`, `cost-editor.tsx`, `other-cost-editor.tsx`, `schedule-item-dialog.tsx`, `journal-editor.tsx`, `checklist.tsx`
- Test: the colocated `*.test.tsx` for each that has one.

**Interfaces:** Consumes `Field` (existing, `error` prop) and `FormError` (Task 3).

**Design notes:** Replace ad-hoc inline error rendering (e.g. `item-form-dialog.tsx:~294` and `stop-form-dialog.tsx:~355` render category errors differently) with: field-specific errors passed to the wrapping `<Field error={...}>` (which wires `aria-invalid`/`aria-describedby` via `useFieldControl`), and any non-field/form-level error rendered once through `<FormError>`. Also: in `schedule-item-dialog.tsx`/`item-form-dialog.tsx`, give the end-time field a persistent helper ("Set a start time first") instead of a silent disabled state. Do this dialog-by-dialog; each gets a test asserting an invalid submit surfaces the error in the standard location.

- [ ] **Step 1: Per dialog — failing test** that an invalid field shows its message via the `Field` error slot (query by the error text + that the control has `aria-invalid`).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the conversion for that dialog.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Repeat** for all listed dialogs, then commit.

```bash
git add components/trip/ components/ui/
git commit -m "refactor(forms): standardise all form dialogs on Field error slot + FormError"
```

---

## Task 16: Optimistic-revert feedback

**Files:**
- Modify: `components/discreet/stop-spreadsheet.tsx:~154-195` (inline cell error on failed optimistic edit), `components/trip/calendar-views.tsx:~106-121` (surface specific reschedule error messages)
- Test: `components/discreet/stop-spreadsheet.test.tsx`

**Design notes:** When an optimistic edit is rejected by the server, in addition to the toast, briefly mark the affected cell invalid (red border + `aria-invalid`) for ~2–3s so the user sees *which* value reverted. For calendar reschedule failures, pass through the server action's specific message (e.g. out-of-range date) into the toast rather than a generic "Couldn't move that item."

- [ ] **Step 1: Failing test** — a rejected spreadsheet edit marks the cell `aria-invalid` and restores the prior value.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit**

```bash
git add components/discreet/stop-spreadsheet.tsx components/trip/calendar-views.tsx components/discreet/stop-spreadsheet.test.tsx
git commit -m "feat(ux): inline revert feedback for failed optimistic edits"
```

---

## Task 17: Money clarity polish

**Files:**
- Modify: `app/(app)/trips/[tripId]/budget/page.tsx` ("Spent so far" always renders with "No payments yet" at $0; heading-size parity ~277-280; "% of estimated" label on category breakdown ~307-323; per-row missing-rate badge ~246-258), `components/trip/cost-amounts.tsx:~29` ("—" placeholder for zero actual), `components/trip/rates-panel.tsx` (stale badge only when genuinely stale ~54; adaptive rate precision instead of fixed `.toFixed(4)` ~131)
- Test: `components/trip/cost-amounts.test.tsx`, `components/trip/rates-panel` test if present; budget page via extracted client pieces or build.

**Design notes:** Adaptive precision: show enough significant figures that small rates don't render as `0.0000` (e.g. 4 significant figures). Stale badge: only when the stored rate is actually older than the staleness threshold AND not just-refreshed this request. Missing-rate: badge inline on each affected cost row, not only the page banner.

- [ ] **Step 1: Failing tests** — `cost-amounts` renders "—" when actual is 0; rates-panel formats a small rate with visible precision; budget renders "Spent so far"/"No payments yet" at $0 actual.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify pass** + `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add "app/(app)/trips/[tripId]/budget/page.tsx" components/trip/cost-amounts.tsx components/trip/rates-panel.tsx components/trip/*.test.tsx
git commit -m "feat(budget): clearer spent/estimated, per-row missing-rate, adaptive rate precision"
```

---

## Task 18: Long-tail polish — plan/calendar surfaces

**Files & changes (one commit):**
- `components/trip/vote-control.tsx` — add `title`/tooltip + `aria` explaining "click the active level to clear your vote".
- `components/trip/itinerary-manager.tsx` — persist chapter collapse state to `localStorage` keyed by `\`${tripId}:${chapterId}\``; add `title="Drag to reorder"` to the rough-stop grip handle; subtitle/tooltip on the "Other transport" section explaining why those legs are separated.
- `components/trip/day-map-panel.tsx:~37` — replace the map emoji with the Lucide `Map` icon.
- `components/trip/agenda-view.tsx` — mark today's date (badge/tint) using `todayISO()`.
- `components/trip/month-grid.tsx:~151` — raise min cell height on mobile + add a "+N more" indicator when items are clipped.
- `components/trip/quick-add-stops.tsx:~26-44` — preserve the typed value on a failed submit (don't clear on error).

- [ ] **Step 1: Failing tests** where unit-testable (vote-control tooltip text present; quick-add keeps value on rejected submit; agenda marks today). Others (icon swap, localStorage persist, cell height) verify via targeted test or build.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** each change.
- [ ] **Step 4: Verify pass** + `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add components/trip/
git commit -m "feat(ux): plan/calendar polish — vote hint, persisted collapse, drag hints, day-map icon, today marker, taller month cells, preserve quick-add input"
```

---

## Task 19: Long-tail polish — cross-cutting surfaces

**Files & changes (one commit):**
- `components/trip/journal-editor.tsx:~193-198` — show a "Saving…/Saved" indicator on blur-save.
- `components/trip/settings/invite-panel.tsx` — clarify the invite model in copy: no email is sent; access activates when that person next signs in with the matching email.
- `components/trip/activity-feed.tsx:~125-130` — add an absolute timestamp via a `<time title={iso}>` alongside the relative time.
- `components/trip/mobile-tab-bar.tsx:~66-92` — give the "More" button an active indicator when a More-section route is active.
- `components/offline-banner.tsx:~16-23` — fix z-index so it sits below the header rather than over it.
- `app/(app)/trips/new/new-trip-form.tsx` — make the "create without dates" path obvious (clear secondary affordance / button copy).
- `app/share/[token]/not-found.tsx:~20-25` — link to `/trips` instead of `/`.
- `components/ui/button.tsx` — when `size="icon"`, require/encourage `aria-label` (dev warning in non-prod if missing); audit icon-only buttons flagged by the review to ensure labels.
- Form dialogs — ensure first field gets `autoFocus` consistently (spot-fix any dialog missing it).

- [ ] **Step 1: Failing tests** where unit-testable (journal shows "Saved" after blur-save; share not-found links to `/trips`; mobile "More" gets active class when a sub-route is active).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** each change.
- [ ] **Step 4: Verify pass** + `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add components/ app/
git commit -m "feat(ux): cross-cutting polish — journal save indicator, invite copy, absolute timestamps, mobile More active state, offline banner z-index, new-trip affordance, share 404 link, icon-button labels, dialog autofocus"
```

---

## Task 20: Full-suite verification

- [ ] **Step 1: Run the whole test suite** — Run: `npm test` — Expected: all green.
- [ ] **Step 2: Typecheck + build** — Run: `npm run build` — Expected: success, no type errors.
- [ ] **Step 3: Lint** — Run: `npm run lint` — Expected: clean.
- [ ] **Step 4: Confirm no `confirm()` remains** — Run: `grep -rn "confirm(" components app --include=*.tsx | grep -v test` — Expected: no results.
- [ ] **Step 5:** Report status; do **not** merge or deploy (await explicit instruction).

---

## Self-Review

**Spec coverage:** A (foundations) → Tasks 1–3; B (destructive safety) → Tasks 6–9; C (bugs) → Tasks 4–5; D (soft validation) → Task 10; E (loading) → Task 11; F (empty states) → Task 12; G (mobile/touch) → Tasks 13–14; H (form sweep) → Tasks 15–16; I (money) → Task 17; J (long-tail) → Tasks 18–19; verification → Task 20. No spec section is unmapped. "Dirty-state warning" was explicitly excluded by the spec.

**Type consistency:** `useConfirm().confirm(opts): Promise<boolean>` used consistently in Tasks 6–8. `toastWithUndo({title,onUndo,...})` used in Task 9. `FormError` used in Task 15. `convertMinor(amountMinor, from, to, rate)` matches `lib/money.ts`.

**Placeholder scan:** Foundation/bug tasks (1–5) carry full code. Application tasks specify exact files, the precise change, concrete test assertions, and verify/commit commands; implementers follow established patterns in each file (per Global Constraints), with a spec-compliance + code-quality review gate per task under subagent-driven-development.
