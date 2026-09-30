# Teepee design handoff: Money page + New trip flow

Put this folder in the repo root as `budget-onboard-2026-09-30/`. It's reference only. It covers two things:

1. **Money** (`/trips/[tripId]/budget`): a redesign of the current budget page for desktop and mobile. See `MONEY.md`.
2. **New trip** (`/trips/new`, `/trips/new?past=1`): the first-run creation flow, rebuilt as a four-step focus flow. See `NEW_TRIP.md`.

Motion for both is in `MOTION.md`. Build the motion last, but read it before you structure the components, because a few animations need stable keys or `layout` props.

This builds on `home-day-design-279-handoff/` and `trips-page-carousel-handoff/`. They share the app shell, the visual language, and the trip cover system (`TRIP_COVER.md`). Read those READMEs first if you haven't.

## Fidelity
High fidelity. The sizes, colours, type, copy and layout are final. Rebuild them in the repo's stack: Next.js 16 App Router, Tailwind v4 tokens, shadcn/Radix, `cn`, lucide-react and `motion`.

The HTML in `reference/` is a design mock, not code to copy. It uses unicode glyphs where the build should use lucide icons:
- ✈ → `Plane`
- ⌂ → `BedDouble` (stays) / `House` (tab)
- ★ → `Ticket`
- ◍ → `UtensilsCrossed`
- … → `Ellipsis`
- ✓ → `Check`
- ✕ → `X`
- ← → `ArrowLeft`
- ⌕ → `Search`
- ☾ → `Moon`
- $ → `Wallet`

The sample data (Christmas in Europe, Japan at Christmas, all the amounts) is illustrative only.

## What to build, in order
1. **Money:** pure helpers first (`MONEY.md` §9), then the cost tile, To pay, Where it goes, and Rates. After that, the page grid and the mobile order.
2. **New trip:** the flow shell (top bar and step state), then steps 1–4, then the live preview card (it reuses the Trips carousel card and `trip-cover.tsx`), then past-trip mode.
3. **Motion,** from `MOTION.md`.

## Images (`images/`)
The markdown is the source of truth: if an image and the text disagree, follow the text. The mocks were exported with a DOM renderer, so line breaks can differ slightly from the browser.

| File | Resolution | Shows |
|---|---|---|
| `money-desktop.png` | 1440×900 @1x | Money page, populated trip, no page scroll |
| `money-mobile.png` | 390×844 @2x | Money page, mobile |
| `new-trip-1-name-desktop.png` | 1440×900 @1x | Step 1, Name |
| `new-trip-2-when-desktop.png` | 1440×900 @1x | Step 2, When (exact dates); countdown now showing on the preview |
| `new-trip-4-cover-desktop.png` | 1440×900 @1x | Step 4, Cover and review, with Create trip |
| `new-trip-mobile-steps-1-3.png` | 1233×846 @1x | Mobile steps 1, 2 and 3 side by side |

Step 3 (From) on desktop isn't drawn. It uses the same shell with the mobile step-3 content in the left column: see `NEW_TRIP.md` §5.

## Ground rules (same as previous handoffs)
- Tokens only, no raw hex in components. The mapping is in `MONEY.md` §1.
- 2px ink borders (`border-2 border-border`) and hard offset shadows (`shadow-1`…`shadow-5`, `shadow-cta`), never blurred.
- Bricolage Grotesque 800 (`font-display font-extrabold`) for headings and every big number. Plus Jakarta Sans for everything else.
- Money goes through `formatMoney()`. Dates go through `formatDay()` / `formatRange()` and never show as ISO. That includes the Day breakdown, which shows ISO today.
- Every label, chip and pill is `whitespace-nowrap shrink-0`.
- Touch targets are at least 44px.
- Respect `prefers-reduced-motion`. globals.css already collapses the durations; see `MOTION.md` for the JS-driven parts.
- Tabular numbers (`tabular-nums`) on every amount column.

## Reference
`reference/Money and New Trip.dc.html` is the live mock. Open it in a browser next to `support.js`. The screens are:
- 1a / 1b: Money on desktop and mobile
- 2a–2c: New trip on desktop, steps 1, 2 and 4
- 2d: New trip on mobile, steps 1–3

The note cards next to each group explain the reasoning behind it.
