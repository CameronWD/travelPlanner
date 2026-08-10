# E+ Batch 4 — Settings · Compare · Activity · Share/Print Bold-Modular Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the **Settings**, **Compare**, **Activity**, and **Share/Print** surfaces to the Bold-Modular mocks — presentationally, preserving every server action, form, toggle, promote/duplicate/delete flow, clipboard, aria contract, and `data-testid`.

**Architecture:** Async RSC pages (no unit tests) + client components (behaviour-only tests stay green). Changes are layout/card-anatomy/colour, plus ONE new interactive element (the SharePanel public-link toggle, wired to the existing create/revoke actions, TDD-covered). Shared UI primitives (`Input`, `Field`, `Card`, `Button`, `Badge`, `tabs`) are NOT modified — Settings gets its look from card structure and local classes, not primitive edits (a primitive change would cascade app-wide and is unverifiable in-sandbox).

**Tech Stack:** Next.js RSC + client components, Tailwind v4 (token-driven), `cn`, lucide-react, Radix (Dialog), Vitest + Testing Library.

## Global Constraints
- **Mocks:** `design_handoff/TEEPEE - Bold Modular More.dc.html` (M6 Settings ~209–232) · `TEEPEE - Bold Modular Desktop 2.dc.html` (E6 Settings ~151–172) · `TEEPEE - Bold Modular Desktop.dc.html` (D8 Compare ~373–416). Anatomy in `DESIGN-BRIEF.md` C10. Activity/Share/Print have no dedicated mock frame — apply the established idiom (`rounded-2xl`/`rounded-3xl` cards, `font-display` headings, coral/teal tokens, avatar circles). Fidelity is Cam's local `npm run dev` pass.
- **Presentation-only** except the SharePanel toggle (new element, wired to EXISTING `createShareLink`/`revokeShareLink`; no new server action). NO changes to props/interfaces, server actions, callbacks, optimistic logic, aria roles/labels/live-regions, or test-queried text.
- **DO NOT modify shared primitives:** `components/ui/{input,field,card,button,badge,tabs,avatar}.tsx`. Achieve radii/label looks with local `className` on the consuming elements only.
- **DO NOT touch** the Share page's `RouteMap` (already restyled in ⑥) or the Print page's `<style>@media print{…}</style>` block or add shadows to print cards (would need paired `print:shadow-none`). Skip the share `not-found.tsx`.
- **Colours token-driven:** `text-destructive`/`bg-destructive/5`/`border-destructive/30`, `text-over`, `bg-primary`/`bg-accent`, `text-success`. Category/severity hues keep the named-palette convention.
- **Accessibility:** keep WCAG AA + focus rings + aria contracts. The SharePanel toggle must be `role="switch"` with `aria-checked` + an `aria-label`. Preserve `role="status"` success flashes. Preserve heading hierarchy when flattening cards.
- **Environment (sandbox):** Node ≥22 (`export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use` if vitest errors). `next build`/`next dev` FAIL — do NOT run. Gates: `npx tsc --noEmit`, `npx eslint <files>`, focused `npx vitest run` then full. Note: `driving-estimates-panel.test.tsx` is occasionally flaky under parallel load — it passes in isolation; if the full run shows only that failing, re-run to confirm.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
- `app/(app)/trips/[tripId]/settings/page.tsx` — **modify** (T1: card restructure, danger-zone merge).
- `components/trip/settings/danger-zone.tsx` — **modify** (T1: destructive-outline Delete).
- `components/trip/settings/share-panel.tsx` + new `.test.tsx` — **modify/create** (T2: toggle).
- `components/trip/settings/invite-panel.tsx` + new `.test.tsx` — **modify/create** (T3).
- `app/(app)/trips/[tripId]/compare/page.tsx` — **modify** (T4: visible h2).
- `components/trip/compare-table.tsx` + `.test.tsx` — **modify** (T4).
- `app/(app)/trips/[tripId]/activity/page.tsx` + `components/trip/activity-feed.tsx` — **modify** (T5).
- `app/share/[token]/page.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/trips/[tripId]/print/print-button.tsx` — **modify** (T6).

---

### Task 1: Settings page card restructure + Danger-zone merge

**Files:** Modify `app/(app)/trips/[tripId]/settings/page.tsx` (RSC) + `components/trip/settings/danger-zone.tsx`.

**Preserve:** all data fetching, `requireTripAccess`, `getShareLink`/`getCalendarFeed`, the `isOwner` guard on the danger card, and all eight child components with their props. `DangerZone` props `{ tripId, tripName }` + `deleteTrip` type-to-confirm dialog unchanged; `DuplicateTripDialog` server action/dialog unchanged. Do NOT edit `card.tsx` — override via `className`.

- [ ] **Step 1: Restyle `settings/page.tsx`.**
  - Add a page heading above the stack: `<h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h2>`; wrap so the container is `mx-auto max-w-2xl flex flex-col gap-3.5` (was `space-y-6`).
  - For each `<Card>` (except the Share card — see below), keep the `Card`/`CardHeader`/`CardTitle`/`CardContent` structure but override: `<CardHeader className="p-5 pb-0">`, `<CardTitle className="font-display text-base font-bold tracking-tight">`, `<CardContent className="p-5 pt-3">`. Drop `<CardDescription>` blocks (informational only) — or, where the copy is genuinely useful (Calendar feed / Driving estimates), move it into the content as `<p className="text-xs text-muted-foreground">`. Keep every child component + props.
  - **Share card exception:** render it as `<Card><CardContent className="p-5">{<SharePanel …/>}</CardContent></Card>` with NO `CardHeader` — `SharePanel` will own its "Public share link" title + toggle header row (Task 2). (Between T1 and T2 the Share card briefly has no visible title; that's fine — T2 lands before the section gate.)
  - **Danger zone card:** change its wrapper to `className="bg-destructive/5 border-destructive/30"`, `CardTitle` stays `text-destructive` but `font-display text-base font-bold`. **Merge Duplicate into it:** render `<DuplicateTripDialog …/>` and `<DangerZone …/>` inside this one card's content in a `flex flex-wrap gap-2.5` row; delete the separate Duplicate `<Card>` slot. Keep `isOwner` gating the danger card.
- [ ] **Step 2: `danger-zone.tsx` — destructive-outline Delete.** Change the trigger `<Button variant="destructive" size="md">` → `<Button variant="outline" size="md" className="border-destructive text-destructive hover:bg-destructive/5">` (keep the `Trash2` icon, the type-to-confirm `Dialog`, `deleteTrip`, error display — all unchanged).
- [ ] **Step 3: Gates.** `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/settings/page.tsx" components/trip/settings/danger-zone.tsx`; full `npx vitest run` (green — the settings child tests are behaviour-only and unaffected).
- [ ] **Step 4: Commit** — `feat(settings): Bold-Modular section cards + merged danger zone (E+ B4)` (+ trailer).

---

### Task 2: SharePanel public-link toggle

**Files:** Modify `components/trip/settings/share-panel.tsx`; create `components/trip/settings/share-panel.test.tsx`.

**Preserve:** props `{ tripId, initialToken }`; server actions `createShareLink`/`rotateShareLink`/`revokeShareLink`; `navigator.clipboard.writeText` + `copied` flash; `isPending` disabling; both active/inactive states; the Regenerate + Revoke buttons (keep them for the active state).

Target (E6 164–167 / M6 223–227): a title row "Public share link" + a `role="switch"` pill toggle on the right (ON = token exists); a URL bar (`rounded-[10px]` border-only, no bg tint) + Copy; a one-line caption "Read-only · hides costs, notes, confirmations."

- [ ] **Step 1: Write the failing test** `share-panel.test.tsx` (mock the server actions + `navigator.clipboard`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const createShareLink = vi.fn(async () => ({ success: true, token: "new-tok" }));
const revokeShareLink = vi.fn(async () => ({ success: true }));
const rotateShareLink = vi.fn(async () => ({ success: true, token: "rot" }));
vi.mock("@/server/actions/share", () => ({ createShareLink: (...a: unknown[]) => createShareLink(...a), revokeShareLink: (...a: unknown[]) => revokeShareLink(...a), rotateShareLink: (...a: unknown[]) => rotateShareLink(...a) }));
// NOTE: confirm the real import path/action names in share-panel.tsx and match them exactly.

import { SharePanel } from "./share-panel";

describe("SharePanel toggle", () => {
  beforeEach(() => { createShareLink.mockClear(); revokeShareLink.mockClear(); });
  it("switch is off with no token and creates a link when turned on", async () => {
    render(<SharePanel tripId="t" initialToken={null} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(createShareLink).toHaveBeenCalled();
  });
  it("switch is on with a token and revokes when turned off", async () => {
    render(<SharePanel tripId="t" initialToken={"tok"} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    await userEvent.click(sw);
    expect(revokeShareLink).toHaveBeenCalled();
  });
});
```

(**Before implementing**, open `share-panel.tsx` and match the exact action import path/names in the `vi.mock` — the block above is a template.)

- [ ] **Step 2: Run → RED** (no `role="switch"` yet).

- [ ] **Step 3: Implement.**
  - Render a header row as the first element: `<div className="mb-3 flex items-center justify-between"><h3 className="font-display text-base font-bold tracking-tight text-foreground">Public share link</h3> {toggle} </div>`.
  - Toggle: `<button role="switch" aria-checked={!!token} aria-label="Public share link" disabled={isPending} onClick={token ? handleRevoke : handleCreate} className={cn("relative h-6 w-11 rounded-full transition-colors", token ? "bg-success" : "bg-muted", isPending && "opacity-50")}><span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", token ? "right-0.5" : "left-0.5")} /></button>`. Wire `handleCreate`→`createShareLink`, `handleRevoke`→`revokeShareLink` (these handlers already exist — reuse them; do not add new actions).
  - When `token` (active): URL bar `<div className="flex items-center gap-2">` with the URL box `className="min-w-0 flex-1 truncate rounded-[10px] border border-border px-3 py-2 font-mono text-xs text-muted-foreground"` + the Copy `<Button variant="outline" size="sm">`; below it the caption `<p className="mt-2 text-xs text-muted-foreground">Read-only · hides costs, notes, confirmations.</p>`; keep the Regenerate + Revoke buttons in a `flex flex-wrap gap-2` row beneath.
  - Remove the old top description `<p>` and the "Create share link" button (the toggle replaces it).
- [ ] **Step 4: Run test → GREEN.** Then `npx tsc --noEmit`; `npx eslint components/trip/settings/share-panel.tsx components/trip/settings/share-panel.test.tsx`; full `npx vitest run`.
- [ ] **Step 5: Commit** — `feat(settings): public-share-link toggle switch (E+ B4)` (+ trailer).

---

### Task 3: InvitePanel member rows + invite bar

**Files:** Modify `components/trip/settings/invite-panel.tsx`; create `components/trip/settings/invite-panel.test.tsx`.

**Preserve:** props `{ tripId, members, pendingInvites }`; `inviteToTrip(tripId, email)` + `cancelInvite(inviteId)`; `inviteSuccess` `role="status"` flash; `inviteError` field error; the cancel-X per pending invite (keep its `aria-label`); `initials()`; the pending-invites section (keep it even though the mock crops it).

- [ ] **Step 1: Write a light behavioural test** `invite-panel.test.tsx` (mock the actions): submitting the invite form calls `inviteToTrip` with the typed email; a pending invite's cancel button calls `cancelInvite`. (Match the real action import path/names from the component. Use `getByRole`/`getByLabelText`.) Run → it should pass for behaviour that already exists (this is a regression guard for the untested component before restyling) — if the form/labels don't match, adjust selectors to the real DOM, not the behaviour.
- [ ] **Step 2: Restyle** (presentation-only):
  - Drop the `<h4>Current members (N)</h4>` sub-label.
  - Member rows: keep `Avatar size-9`; move the role from a `<Badge>` to a sub-line `<span className="text-xs text-muted-foreground">` beneath the name; row `flex items-center gap-3 py-1.5`.
  - Invite form: `flex items-end gap-2.5`; keep the `<Input type="email">` (its label may be `sr-only`); the Invite `<Button variant="primary">` stays.
  - Keep the pending-invites list; you may restyle its row to `rounded-xl border border-border bg-muted/40 px-3 py-2` but keep the `Mail` icon, email, Pending badge, and cancel-X with aria-label.
- [ ] **Step 3: Run test → GREEN** (`npx vitest run components/trip/settings/invite-panel.test.tsx`). Then `npx tsc --noEmit`; `npx eslint components/trip/settings/invite-panel.tsx components/trip/settings/invite-panel.test.tsx`; full `npx vitest run`.
- [ ] **Step 4: Commit** — `feat(settings): Bold-Modular traveller rows + invite bar (E+ B4)` (+ trailer).

---

### Task 4: Compare screen (page h2 + table reskin)

**Files:** Modify `app/(app)/trips/[tripId]/compare/page.tsx` + `components/trip/compare-table.tsx` + `.test.tsx`.

**Preserve:** page server actions `getComparison`/`getDiscreetState` + the `EmptyState` branch; `CompareTable` props `{ trip, plans, discreet }`; `moveFork` + `router.refresh()`; the per-fork `PromoteForkDialog` + `promoteOpenFor` state; the discreet placeholder (verbatim); `METRIC_ROWS` (all 9); `diffMetrics`/`diffRoute`/all delta formatters/`renderCell`/`renderDelta`; the mobile-cards + desktop-`<table>` dual layout; `ReorderArrows`. **Keep the semantic `<table>` and the per-stop `DiffStopRow` route rows** (they carry nights info and are test-covered — do NOT flatten to an inline string).

- [ ] **Step 1: Update the count-test assertion** in `compare-table.test.tsx`. Find the responsive-layout test asserting mobile cards via `.rounded-2xl` (expects one per plan) and change the selector to `.rounded-3xl` (the mobile cards become `rounded-3xl` in Step 3). Do NOT weaken the count logic — only the class token. Run it → RED (cards are still `rounded-2xl`).
- [ ] **Step 2: Page heading.** In `compare/page.tsx`, replace `<h2 className="sr-only">Compare plans</h2>` with a visible `<h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Compare plans</h2>` (matches the other page titles; do NOT add an `<h1>`).
- [ ] **Step 3: `compare-table.tsx` reskin** (presentation-only; keep all logic):
  - Desktop container: `overflow-x-auto rounded-2xl border border-border bg-card shadow-soft` → `…rounded-3xl…`.
  - Remove row striping: drop the `rowIndex % 2` background ternary on each `<tr>`; instead put `divide-y divide-border/60` on the `<tbody>`.
  - Column headers: before each plan name add an 8px dot whose colour is assigned by column index — real plan → `bg-primary`, first fork → `bg-accent`, subsequent forks → `bg-violet-500` (use a small literal array `["bg-accent","bg-violet-500","bg-sky-500"]` indexed, falling back to the last). Name stays `font-display … font-bold`.
  - Row label `<td>`: `font-medium` → `font-bold` (keep `text-xs uppercase tracking-wide text-muted-foreground`).
  - Promote buttons (desktop + mobile): `<Button size="sm" variant="outline">` + `GitMerge` icon → `<Button size="sm" variant="outline" shape="pill" className="border-[1.5px] text-[11px] font-bold">Promote</Button>` (remove the `GitMerge` icon).
  - `DeltaBadge`: `rounded-full` → `rounded-[5px]` (keep the `bg-emerald-100 text-emerald-700` positive / `bg-over/10 text-over` negative colours).
  - `DiffStopRow` dropped state: keep `line-through` but change the colour to `text-over` (rose, matches the mock's dropped colour); added state stays emerald; keep the nights display.
  - Mobile cards: their inline `rounded-2xl border border-border bg-card shadow-soft` → `rounded-3xl …` (this is what Step 1's test now asserts).
- [ ] **Step 4: Run tests → GREEN** (`npx vitest run components/trip/compare-table.test.tsx` — the updated count test + all existing behaviour tests). Then `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/compare/page.tsx" components/trip/compare-table.tsx components/trip/compare-table.test.tsx`; full `npx vitest run`.
- [ ] **Step 5: Commit** — `feat(compare): Bold-Modular comparison table + heading (E+ B4)` (+ trailer).

---

### Task 5: Activity feed

**Files:** Modify `app/(app)/trips/[tripId]/activity/page.tsx` + `components/trip/activity-feed.tsx`. Behaviour tests in `activity-feed.test.tsx` stay green (no edits).

**Preserve:** page `requireTripAccess` + query + `<MarkReadOnView>`; `ActivityFeed` prop `activities: ActivityRow[]`; `headline()`/`relativeTime()`; `<time dateTime>` + row `aria-label`s + `aria-hidden` arrows; the `EmptyState` (already Bold-Modular — leave it).

- [ ] **Step 1: Restyle (presentation-only):**
  - `activity/page.tsx`: feed container `rounded-xl border border-border bg-card px-5 py-2` → `rounded-2xl border border-border bg-card p-4 shadow-soft`. Heading already `font-display text-2xl font-semibold` — bump to `font-bold tracking-tight`.
  - `activity-feed.tsx`: Avatar `size-8` → `size-9`; `AvatarFallback` add `bg-primary/10 text-primary`; each row `<li>` add `transition-colors hover:bg-muted/30 rounded-xl -mx-1 px-1` (negative margin so the hover rounding doesn't clip the `divide-y`); actor name `font-medium` → `font-semibold`.
- [ ] **Step 2: Gates.** `npx tsc --noEmit`; `npx eslint "app/(app)/trips/[tripId]/activity/page.tsx" components/trip/activity-feed.tsx`; `npx vitest run components/trip/activity-feed.test.tsx` (green, unchanged); full `npx vitest run`.
- [ ] **Step 3: Commit** — `feat(activity): Bold-Modular feed card + rows (E+ B4)` (+ trailer).

---

### Task 6: Share (public) + Print polish

**Files:** Modify `app/share/[token]/page.tsx`, `app/(app)/trips/[tripId]/print/page.tsx`, `app/(app)/trips/[tripId]/print/print-button.tsx`. No tests (RSC/print). Skip `share/[token]/not-found.tsx`.

**Preserve:** the Share page's token lookup + `notFound()` + public data-omission (no costs/notes/confirmations) + `noindex` metadata + its self-contained composition (do NOT import `(app)` components); the `RouteMap` (already restyled — untouched). The Print page's `<style>@media print{…}</style>` block, all `print:` utilities, `requireTripAccess`, and full data (costs/confirmations included) — untouched. Do NOT add shadows to print cards.

- [ ] **Step 1: Share page** (`app/share/[token]/page.tsx`): stop cards `shadow-sm` → `shadow-soft`; day cards `rounded-xl border border-border bg-card` → `rounded-2xl border border-border bg-card`. Nothing else (header/pill/emerald-rose rows/transport pills already match the idiom).
- [ ] **Step 2: Print page** (`app/(app)/trips/[tripId]/print/page.tsx`): stop cards and budget card `rounded-xl` → `rounded-2xl` (the existing `print:rounded-none` overrides keep print output flat — safe). `print-button.tsx`: `rounded-lg` → `rounded-xl`. Do NOT touch the `@media print` style block or add shadows.
- [ ] **Step 3: Gates.** `npx tsc --noEmit`; `npx eslint "app/share/[token]/page.tsx" "app/(app)/trips/[tripId]/print/page.tsx" "app/(app)/trips/[tripId]/print/print-button.tsx"`; full `npx vitest run` (green, unchanged).
- [ ] **Step 4: Commit** — `feat(share,print): Bold-Modular card radius/shadow polish (E+ B4)` (+ trailer).

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean on all touched files; full `npx vitest run` green (count grows by the SharePanel + InvitePanel tests; the Compare count test is updated, not weakened).
- Settings: page `<h2>`, tighter section cards with bold inline titles, merged danger zone (Duplicate + outline Delete), public-link toggle switch, Bold-Modular traveller rows.
- Compare: visible heading, `rounded-3xl` table + `divide-y` rows + index-coloured header dots + pill Promote + square DeltaBadges; per-stop route rows kept (dropped = rose).
- Activity: chunkier feed card + avatar/hover/row polish.
- Share/Print: card radius/shadow aligned; print `@media` block + RouteMap untouched.
- No shared-primitive edits (`Input`/`Field`/`Card`/`Button`/`Badge`/`tabs`/`avatar` unchanged); no behaviour/prop/action/aria/`data-testid` regressions.
- Visual pass (Cam, local dev) owed. Tick Settings · Compare · Activity · Share/Print in the tracker.

## Self-Review Notes
- **Spec coverage:** Settings (page+danger T1, share toggle T2, invite T3), Compare (T4), Activity (T5), Share+Print (T6). C10 anatomy preserved.
- **Deliberate skips (documented):** shared `Input`/`Field`/`Card` primitive radii/label edits (would cascade app-wide, unverifiable blind — Settings uses local classes instead); share `not-found.tsx`; print shadows and `@media` block.
- **Ordering/deps:** T1 first (Share card becomes CardHeader-less so T2's SharePanel owns its title+toggle). T2 is the only new interactive element → TDD + reviewer subagent. T4 substantive → reviewer subagent. T3/T5/T6 controller first-hand.
- **Test contracts:** SharePanel + InvitePanel gain guarding tests; Compare's `.rounded-2xl`→`.rounded-3xl` count assertion is updated in lockstep with the class change; Activity behaviour tests unchanged.
- **Blind build:** class-string/behaviour regression tests are the guard; Cam's local pass is the fidelity check. The SharePanel toggle revoke-on-click matches the current explicit-Revoke behaviour (no new confirm removed).
