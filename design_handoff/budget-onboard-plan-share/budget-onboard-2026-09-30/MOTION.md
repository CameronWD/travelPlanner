# Motion

Use the tokens and utilities that already exist in `app/globals.css`:

| Token | Value |
|---|---|
| `--dur-fast` | 120ms |
| `--dur-base` | 180ms |
| `--dur-slow` | 320ms |
| `--dur-exit` | 200ms |
| `--ease-pop` | cubic-bezier(.2,.8,.2,1) |
| `--ease-bounce` | cubic-bezier(.34,1.56,.64,1) |
| `--ease-exit` | cubic-bezier(.4,0,1,1) |

Utilities: `pressable`, `tp-pop`, `tp-pop-in`, `tp-rise-in`, `tp-wiggle`, `tp-slide-in-left/right`, `tp-slide-out-left/right` and `tp-toast-in`.

JS-driven motion uses the `motion` package (`motion/react`). Nothing loops, and nothing plays again on re-render.

**Reduced motion:**
- CSS already collapses the durations to 1ms.
- For `motion` components, wrap the app in `<MotionConfig reducedMotion="user">`, or check `useReducedMotion()`.
- Count-ups render the final value straight away.
- Slides become an 80ms cross-fade.

**Press physics:** every bordered button, pill and card link in both features uses `pressable`: hover moves it -1px/-1px, and pressed drops the shadow to `shadow-pressed` and moves it +2px/+2px. That's already defined.

---

## Money page

| # | What | Trigger | Spec |
|---|---|---|---|
| M1 | Tiles enter | First paint of the page (not on `?by=` changes) | `tp-rise-in`, staggered: Cost tile 0ms, To pay 60ms, Where it goes 120ms, Rates 180ms. Use `animation-delay` inline. |
| M2 | Total counts up | Mount of the Cost tile | 0 → total over 700ms with `--ease-pop`. The whole part and cents update together. Use `tabular-nums` so the width doesn't jitter. Run it once per session per trip, tracked in `sessionStorage` by `money-count:{tripId}`. After that, render static. |
| M3 | Paid bar fills | Same moment as M2 | The ink fill goes from `scaleX(0)` to `scaleX(paidPct)`, with `transform-origin: left`, over 700ms with `--ease-pop` and a 120ms delay. Put the fill in a full-width inner element and use a transform, not width, so it doesn't cause layout. The "63%" label counts up with it. |
| M4 | Paid bar update | A row gets ticked in To pay | The fill springs to its new value (`motion` spring, stiffness 300, damping 30). The "paid" and "to go" numbers tween over 320ms. No confetti. |
| M5 | Stacked bar segments | Mount, and whenever the `?by=` grouping changes | Each segment grows from `scaleX(0)` in order, left to right, 40ms apart, each over 320ms with `--ease-pop`. On a grouping change, cross-fade the old bar out (120ms) before the new one grows. |
| M6 | Breakdown switch pill | Clicking a segment | The ink active background slides between segments using a shared `motion` `layoutId="by-pill"`, over 180ms. The label colour swaps at the midpoint. The rows below cross-fade over 120ms (fade out, then fade in), with no height animation. |
| M7 | Tick a To pay row | Checkbox click | 1. The checkbox fills teal, and the check icon does `tp-pop` (scale .6 → 1.1 → 1, 180ms, bounce). 2. The label gets a strike-through that draws left to right (a `background-size` 0 → 100% line, 180ms). 3. After 400ms, the row moves to the paid section using `motion` `layout` on the list (320ms, pop). The other rows slide up to close the gap. 4. The "6 left" pill number does `tp-pop`. Un-ticking reverses it. It's optimistic: if the server action fails, roll back and show a toast. |
| M8 | Overdue due line | Mount | None. Colour alone carries the urgency. Don't pulse. |
| M9 | Add a cost | CTA click | Desktop: the Dialog uses `tp-pop-in` / `tp-pop-out`. Mobile: the sheet uses `tp-slide-up` / `tp-slide-down`. When it saves, the new row enters To pay with `tp-rise-in`, and the total re-tweens (M4 style, 320ms). |
| M10 | Rate cell | Setting a missing rate | The dashed border becomes solid, the cell does `tp-pop`, and the "left out of totals" line collapses (height to 0, 180ms). The totals re-tween. |

---

## New trip flow

| # | What | Trigger | Spec |
|---|---|---|---|
| N1 | Flow enters | Arriving at `/trips/new` | The top bar slides down from -84px over 320ms with pop. The question column content does `tp-rise-in`. The preview card drops in from `translateY(24px) rotate(-4deg) scale(.96)` to its rest position, over 420ms with `--ease-bounce` and a 120ms delay. |
| N2 | Step change, forward | Continue / Enter | The question column content slides out to the left (`tp-slide-out-left`, 200ms, exit), then the next step slides in from the right (`tp-slide-in-right`, 320ms, pop). Use `AnimatePresence mode="wait"` keyed by step. The preview column does **not** move. It stays put and only its contents change (N5–N8). |
| N3 | Step change, back | Back / a done pill / Edit | The mirror of N2: out to the right, in from the left. |
| N4 | Step pills | Step change | The previous pill goes from coral to card, and its dot turns ink while the check does `tp-pop`. The new current pill fills coral and gets a `shadow-1` (180ms). On mobile, the progress segment fills left to right (`scaleX`, 320ms). |
| N5 | Name typing | Each keystroke | The preview title updates instantly, with no animation per character. When the first character goes in, the placeholder "Your trip" cross-fades to real text (120ms). The stamp word re-evaluates, debounced by 250ms. When it changes, the stamp does a small `tp-pop`. |
| N6 | Stamp "thunk" | The first time a start date is set (exact or rough) | The date line on the stamp updates, and the whole stamp plays a rubber-stamp press: `scale 1.35 → .92 → 1`, `rotate -22° → -12° → -14°`, and opacity .4 → 1. That's 360ms on `--ease-bounce`. At the same time the polaroid rotates +2° and back (`tp-wiggle`). Play it once per draft. |
| N7 | Countdown appears | The first valid exact range | The skeleton bars fade out (120ms). The number counts up from 0 to the sleeps value over 600ms with pop, and the "sleeps to go" label fades in 100ms after that. Changing the dates later tweens from the old value to the new one over 320ms. On mobile, the countdown strip under the calendar grows in (height 0 → auto, 320ms, pop). |
| N8 | Range selection | Calendar clicks | The start day fills ink with `tp-pop`. As you hover to choose the end (on desktop), the range band previews at `bg-range/60`. When you click, the band fills day by day from start to end: a 12ms stagger per day, capped at 240ms total. The end day gets `tp-pop`. |
| N9 | Mode switch (Exact / Roughly / Not sure) | Segment click | The same shared-pill slide as M6 (`layoutId="date-mode"`). The panel below cross-fades (120ms out, 180ms in), with a height animation via `motion` `layout` (320ms). |
| N10 | Place results | Typing in From | The results list expands (height, 180ms). The highlighted row's background follows the keyboard with `layoutId="place-hl"`. When you pick one, the currency row does `tp-pop`, and its code text cross-fades if it changed (for example USD → AUD). |
| N11 | Photo drop | A file is dropped or chosen | While dragging over, the dashed frame scales to 1.03, the border goes solid ink, and the polaroid straightens to 0° (180ms). On drop, the image fades in inside the frame (180ms), and the polaroid settles back to -3° with bounce (320ms). The preview polaroid on the right swaps from stamp to photo at the same time, with a 180ms cross-fade. |
| N12 | Validation error | Continue with a missing required field | `tp-wiggle` on the input (180ms), the border turns coral-text, and the helper text cross-fades to the error. Focus goes back to the input. |
| N13 | Create trip | Submit | 1. The button shows its loading state and the step pills are disabled. 2. When the promise resolves (before the redirect), the preview card does a "pop and lift": `scale 1 → 1.04`, `shadow-4 → shadow-5`, `translateY -6px`, over 240ms with bounce. 3. The route transitions to trip home. On trip home, the countdown tile uses N1's drop-in, and the "Add your first stop" chip does `tp-pop` after 300ms. 4. After that, the toast appears (`tp-toast-in`). If the View Transitions API is available (`next/navigation` with `experimental.viewTransition`), give the preview card and the trip-home countdown tile the same `view-transition-name: trip-hero`, so the card morphs into the tile. Otherwise do step 3 without the morph. |
| N14 | Cancel confirm | Cancel with a dirty draft | The Dialog uses `tp-pop-in`. Choosing Leave cross-fades back to `/trips`. |

## Performance notes
- Animate only `transform` and `opacity`, apart from the few height transitions called out above, which go through `motion` `layout`.
- The count-ups use `requestAnimationFrame` through `motion`'s `animate()` on a motion value. Don't use React state per frame.
- The Money page stays a Server Component. Only `paid-bar.tsx`, `to-pay-row.tsx`, `breakdown-switch.tsx` and `stacked-bar.tsx` (for M5) need `"use client"`. Keep any other animation in CSS.
