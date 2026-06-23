# Adopt Motion for content & route animation; keep CSS + Radix for overlays

For a "subtle & tasteful" polish pass we add **Motion** (`motion`, imported from
`motion/react` — the React-19-compatible successor to Framer Motion) to drive the motion
the app was missing: list **enter/exit/reorder**, **route transitions**, and a few
JS-driven micro-interactions (Wishlist vote pop, checklist tick, budget grand-total
count-up). It is scoped deliberately — used only where it earns its keep — and wrapped in a
global `<MotionConfig reducedMotion="user">` so all of it honours the OS reduced-motion
setting.

This **reverses a previously deliberate, codebase-wide "no animation library" stance.** The
hand-rolled `tp-*` CSS keyframes/utilities in `globals.css` exist precisely to avoid such a
dependency, and they drive every Radix overlay (dialog, sheet, popover, dropdown, select,
toast) well. **Those stay** — we do **not** migrate the overlays onto Motion. The boundary
is: Radix `data-[state]` overlays → existing CSS; content/route/micro-interaction motion →
Motion. Press feedback is also kept off Motion (plain CSS `active:` scale) so the ubiquitous
base `Button` need not become a client island.

## Considered options

- **Library-free + native View Transitions API** (the obvious zero-dep path, consistent with
  the existing stance): the browser natively animates route changes and list
  add/remove/reorder, degrading to today's instant cut where unsupported. Rejected in favour
  of Motion for its ergonomics — `AnimatePresence` exit animations and `layout` reorder are
  the genuinely painful parts to hand-roll, and Motion makes them trivial and consistent.
- **Adopt Motion everywhere**, migrating the working overlay animations onto it too: rejected
  — needless churn on code that already works, for one-system tidiness we don't need.

## Consequences

- New client-side dependency (~tens of KB gzipped) on a **mobile-first PWA** — accepted as a
  worthwhile cost for the polish, but the reason we scope Motion tightly rather than reaching
  for it reflexively.
- Animated components become `"use client"` islands. Most of the affected components already
  are; the notable new client boundary is the trip layout's `template.tsx` route-transition
  wrapper.
- A future reader who finds both `tp-*` CSS animations and Motion in the tree should not
  "consolidate" them — the split is intentional and recorded here.
