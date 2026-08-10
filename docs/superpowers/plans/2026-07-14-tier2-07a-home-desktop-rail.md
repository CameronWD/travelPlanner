# Tier 2 ⑦a — Home Desktop Right-Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the planning/final-prep Home a Bold-Modular desktop layout (D2 mock): a full-width coral hero, then a two-column split on `lg+` — main column (route + next-steps) and a right rail (budget + quick-actions). Mobile is unchanged (single column, current order).

**Architecture:** A pure render-structure change inside the `PhasePlanning` server component. The five already-built elements (`hero`, `route`, `nextSteps`, `money`, `actions`) are re-placed: `hero` full-width; a `lg:grid-cols-[1fr_20rem]` grid below with main=`[route, nextSteps]`, rail=`[money, actions]`. On mobile the grid is one column, so elements stack in the current ② order (hero, route, nextSteps, money, actions).

**Tech Stack:** Next.js RSC, Tailwind v4 responsive grid.

## Global Constraints
- **Reference:** `design_handoff/README.md` ⑦; desktop mock `TEEPEE - Bold Modular Desktop.dc.html` D2 — "main column + right rail (Home budget+quick-actions)".
- **TripNav underline already exists** — do NOT touch nav.
- **Mobile unchanged:** on small screens the visual order must remain `hero, route, nextSteps, money, actions` (the ② order). Achieve the rail purely with `lg:` grid utilities so `<lg` is a single stacked column.
- **No data/logic change:** only the JSX wrapper structure in `PhasePlanning`'s `return`. Keep `hero`/`route`/`nextSteps`/`money`/`actions` exactly as built (route may be `null`).
- Token-driven; no `globals.css`/token/component-internals changes.
- **Environment (sandbox):** Node ≥22 for vitest (nvm use if it errors). `next build`/`next dev` FAIL — do NOT run; the desktop layout is a human `npm run dev` pass. Gates: `npx tsc --noEmit`, `npx eslint <file>`, `npx vitest run` (full).
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Blind build:** unverifiable visually in-sandbox → Cam's local pass. No unit test (async RSC).

---

## File Structure
- `components/trip/home/phase-planning.tsx` — **modify** (the `return` / render structure only).

---

### Task 1: Home two-column desktop layout

**Files:** Modify `components/trip/home/phase-planning.tsx`.

**Interfaces:** consumes the existing `hero`, `route`, `nextSteps`, `money`, `actions` React elements. No prop/data change.

- [ ] **Step 1: Replace the render.** The current end of `PhasePlanning` is:

```tsx
  // Bold Modular: route promoted directly under the hero, both phases.
  const order = [hero, route, nextSteps, money, actions];

  return <div className="flex flex-col gap-6">{order}</div>;
```

Replace with a hero + main/rail structure (delete the now-unused `order` const):

```tsx
  // Bold Modular desktop (D2): full-width hero, then a main column (route +
  // next-steps) beside a right rail (budget + quick-actions). On mobile the
  // grid collapses to one column, preserving the order hero → route →
  // next-steps → budget → quick-actions.
  return (
    <div className="flex flex-col gap-6">
      {hero}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
          {route}
          {nextSteps}
        </div>
        <div className="flex flex-col gap-6">
          {money}
          {actions}
        </div>
      </div>
    </div>
  );
```

(`minmax(0,1fr)` keeps the main column from overflowing when the route map is wide; `lg:items-start` stops the rail stretching to the main column's height. `route` may be `null` — that renders nothing, leaving `nextSteps` alone in the main column, which is fine.)

- [ ] **Step 2: Confirm no leftover `order` reference.**

Run: `grep -n "order" components/trip/home/phase-planning.tsx`
Expected: no references to the deleted `const order` (only unrelated words if any).

- [ ] **Step 3: Gates.**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/trip/home/phase-planning.tsx` → clean (no unused vars — every element is now placed).
Run: `npx vitest run` → full suite green (unchanged count; no test renders PhasePlanning).

- [ ] **Step 4: Commit**

```bash
git add components/trip/home/phase-planning.tsx
git commit -m "feat(home): desktop right-rail layout for Home (Tier 2 ⑦a)"
```

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean; `npx vitest run` green.
- Desktop `lg+`: full-width hero, main (route + next-steps) + right rail (budget + quick-actions). Mobile: single column, order preserved.
- No data/logic/token changes; only `PhasePlanning`'s render structure.
- Visual pass (Cam, local dev) — desktop 2-column + mobile stack. This is a layout change; **eyeballing at ≥1024px is the real check**. Tick ⑦a in the tracker.

## Self-Review Notes
- All five elements are still rendered exactly once — `tsc`/`eslint` will flag any dropped element as unused.
- The rail is purely `lg:` — `<lg` remains the single-column ② order, so mobile is untouched.
- Follow-up (⑦b): Plan / Summary desktop rails (separate plan, after reading those pages).
