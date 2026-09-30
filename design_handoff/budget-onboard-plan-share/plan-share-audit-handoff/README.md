# Teepee design handoff: Plan page · Share link page · Page audit

Put this folder in the repo root as `plan-share-audit-handoff/`. It's reference only.

There are three pieces of work:

1. **Plan** (`/trips/[tripId]/plan`): the itinerary editor, redesigned for desktop and mobile, including the mobile editing sheets. See `PLAN.md`.
2. **Share link** (`/share/[token]`): the public, view-only page for people without an account, with its before / during / after stages. See `SHARE.md`.
3. **Page audit + `<PageHeader>`**: every other route, checked against the current standard, plus the shared header component that most of the fixes depend on. See `AUDIT.md`.

Motion for both screens is in `MOTION.md`.

This builds on the earlier handoffs, which share the same shell, tokens and rules. Read their READMEs first if you haven't:
- `home-day-design-279-handoff/`: the shell, Home, Day.
- `trips-page-carousel-handoff/`: Trips, and `TRIP_COVER.md` (the route sketch and passport stamp).
- `budget-onboard-2026-09-30/`: Money and New trip. Its `MONEY.md` §1 has the token mapping table used here too.

## Fidelity
High fidelity. The layout, sizes, type, colours and copy are final. Rebuild them in the repo's stack: Next.js 16 App Router, Server Components by default, Tailwind v4 tokens, shadcn/Radix, `cn`, lucide-react and `motion`.

The HTML in `reference/` is a design mock, not code to copy. It uses unicode glyphs where the build should use lucide icons:
- ✈ → `Plane`
- 🚆 → `TrainFront`
- 🚗 → `Car`
- 🚌 → `Bus`
- ⛴ → `Ship`
- ⌂ → `BedDouble` (stay) / `House` (home base)
- ⋯ → `Ellipsis`
- ⌄ / ⌃ → `ChevronDown` / `ChevronUp`
- ✎ → `Pencil`
- ⋮⋮ → `GripVertical`
- ☾ → `Moon`
- ✓ → `Check`
- ✕ → `X`
- ⤢ → `Maximize2`

The mock's map is a flat tile with CSS gridlines. In the build, use the existing `RouteMap` / `route-map-loader`, restyled per the map spec in the earlier handoffs.

The sample data (Christmas in Europe, Paris, Rome and so on) is illustrative only.

## Build order
1. **`<PageHeader>`** (`AUDIT.md` §1). Plan and most of the audit fixes use it.
2. **Plan, desktop:**
   1. stop row (folded)
   2. leg pill
   3. open body: stay/ideas strip, day strip, selected day
   4. right rail
3. **Plan, mobile:** the list, then the sheets (stop, pick a day, add a stop, fill a leg, stop actions).
4. **Share:** the stage logic, then the hero variants, then the rest of the sections.
5. **Audit fixes,** in the order given in `AUDIT.md`.
6. **Motion.**

## Images (`images/`)
The markdown is the source of truth; if an image and the text disagree, follow the text. The mocks were exported with a DOM renderer, so line breaks can differ slightly from the browser.

| File | Shows |
|---|---|
| `plan-desktop.png` | Plan at 1440×900. Paris is open with Fri 11 selected. The list is scrolled just past the home-base row. |
| `plan-desktop-long-stop.png` | Close-up of **one stop card** (not a screen): a 10-day Rome stop, same pattern |
| `plan-mobile.png` | Plan on mobile, list view @2x |
| `plan-mobile-editing.png` | Five mobile states side by side: stop sheet, pick a day, add a stop, fill a leg, stop actions |
| `share-desktop-during.png` | Share on desktop, during the trip, full page |
| `share-mobile-before.png` | Share on mobile, before the trip |
| `share-mobile-during.png` | Share on mobile, during the trip |
| `share-mobile-after.png` | Share on mobile, after the trip |
| `page-audit.png` | The audit board |

## Ground rules
These are the same as in previous handoffs:
- Tokens only; no raw hex in components.
- 2px ink borders (`border-2 border-border`) and hard offset shadows (`shadow-1`…`shadow-5`, `shadow-cta`). **`shadow-soft`, `shadow-soft-lg`, `border-border/70` and `bg-card/40` must not appear in any file this touches.** The existing tests already assert this in several places; extend them.
- Bricolage Grotesque 800 (`font-display font-extrabold`) for headings, stop names, day numbers and big numbers. Plus Jakarta Sans for everything else.
- Dates go through `formatDay()` / `formatRange()` / `formatDateRangeCompact()`, never ISO. Money goes through `formatMoney()`.
- Every chip, pill and label is `whitespace-nowrap shrink-0`. Truncate the text next to it rather than letting it wrap.
- Touch targets are at least 44px on mobile. Desktop icon buttons are 36px, with `tap-target` to extend the hit area.
- `tabular-nums` on all times and amounts.
- Respect `prefers-reduced-motion` (see `MOTION.md`).
- **Share page:** don't change what data leaves the database. Every existing "intentionally omitted" rule stays; `SHARE.md` §9 lists the only additions.

## Reference
`reference/Plan and Share.dc.html` is the live mock. Open it in a browser next to `support.js`. The screen ids are:
- 1a: Plan on desktop
- 1b: Plan on mobile
- 1c: the mobile editing sheets
- 1d: the long-stop close-up
- 2a: Share on desktop, during
- 2b / 2c / 2d: Share on mobile, before / during / after
- `#audit`: the audit board

The note cards next to each group explain the reasoning behind it.
