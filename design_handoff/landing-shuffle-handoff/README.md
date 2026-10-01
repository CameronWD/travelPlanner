# Teepee design handoff: Landing card fan (phone + desktop)

Put this folder in the repo root as `landing-shuffle-handoff/`. It's reference only.

**Scope:** the signed-out Landing at `/` only, in `app/landing/`. There's one piece of work: replace the scattered sample cards on both breakpoints with a deliberate, centred fan that shuffles between four sample trips and has a slowly scrolling route ribbon. On phone the hero is also centred. See `LANDING.md`.

## Files
- `LANDING.md`: the spec (layout, every piece's classes, copy, motion, accessibility and tests). **The source of truth.**
- `app/landing/sample-trips.ts`: drop-in data for the four sample trips. Copy it to the same path.
- `images/`
  - `landing-phone.png`: phone, 393 × 700, showing Japan (the first trip)
  - `landing-phone-portugal.png`: phone, showing the second trip after a shuffle
  - `landing-desktop.png`: desktop, 1440 × 900
- `reference/Landing Mobile Fix.dc.html`: the live mock. Open it in a browser next to `reference/support.js`. The screen ids are:
  - 2a: phone
  - 2b: desktop
  - 1a / 1b / now: the earlier options and today's layout, kept for context only

## Fidelity
High fidelity. The layout, sizes, copy and motion timings are final. Rebuild them in the repo's stack: Tailwind v4 tokens, the existing `Card` / `Badge` / `Avatar`, lucide-react and `cn`.

The mock uses raw hex values and inline styles; the build must use tokens only. The mock's unicode glyphs map to lucide icons:
- ☀ / ☁ → `Sun` / `Cloud`
- → → `ArrowRight`
- ↻ → `RefreshCw`
- ✓ → `Check`
- ♡ → `Heart`

## Ground rules (unchanged from earlier handoffs)
- Tokens only, 2px ink borders, hard shadows (`shadow-hard-*`), and no `shadow-soft*`.
- Bricolage Grotesque 800 for display text, Plus Jakarta Sans for everything else.
- `tabular-nums` on times and amounts. Every chip is `whitespace-nowrap shrink-0`.
- The Landing stays forced-light (`data-theme="light"`).
- Respect `prefers-reduced-motion` (see `LANDING.md` §5).
