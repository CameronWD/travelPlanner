# Motion: Plan + Share

Use the tokens in `app/globals.css`:

| Token | Value |
|---|---|
| `--dur-fast` | 120ms |
| `--dur-base` | 180ms |
| `--dur-slow` | 320ms |
| `--dur-exit` | 200ms |
| `--ease-pop` | cubic-bezier(.2,.8,.2,1) |
| `--ease-bounce` | cubic-bezier(.34,1.56,.64,1) |
| `--ease-exit` | cubic-bezier(.4,0,1,1) |

Utilities: `pressable`, `tp-pop`, `tp-pop-in`, `tp-rise-in`, `tp-wiggle`, `tp-slide-*` and `tp-toast-in`.

JS motion uses `motion/react`, wrapped in `<MotionConfig reducedMotion="user">`.

**Reduced motion:** everything below becomes an instant state change or an 80ms fade. Scrolling uses `behavior: "auto"`.

Every bordered button, pill, chip, slot and row link uses `pressable`: hover moves it −1px/−1px; pressed moves it to `shadow-pressed` and +2px/+2px.

## Plan

| # | What | Trigger | Spec |
|---|---|---|---|
| P1 | Page enters | First paint | The header and rail tiles do `tp-rise-in`, staggered: header 0, map 60, fit 120, jump 180ms. The stop rows do `tp-rise-in` with a 40ms stagger, capped at 8 rows (the rest appear with no animation). |
| P2 | Fold / unfold a stop | ⌄ / ⌃ or a row click | The body's height animates 0 ↔ auto with `motion` `layout` (320ms, pop). The content fades in 60ms after the height starts. The chevron rotates 180° (180ms). The toggle button's fill goes card ↔ sun (120ms). Other rows move with `layout`, so nothing jumps. |
| P3 | Select a day | Slot click, ←/→ | The selected slot lifts: `translateY(-2px)`, `shadow-1`, and card → coral fill, 180ms, bounce. The previous slot settles back (120ms). The panel content cross-fades with a 6px slide in the direction of travel: forward slides in from the right, back from the left (180ms out, 180ms in, `AnimatePresence mode="wait"`, keyed by date). The panel **height** animates with `layout` (180ms), so a 2-plan day and a 6-plan day don't snap. |
| P4 | Strip overflow | Selection off-screen, arrow click | `scrollTo({ left, behavior: "smooth" })`. The arrows fade in or out (120ms) based on scroll position. |
| P5 | Day title edit | Click the title | It swaps to an input in place, with no size jump (same font and size). On save, the title does `tp-pop`. The strip slot's band fills sun, scaling `scaleX` 0 → 1 from the left over 180ms. |
| P6 | Drag a plan | Drag start / over a slot / drop | While dragging, the row lifts to `shadow-4` at `rotate(-1deg)`, and a 2px dashed placeholder stays in its place. **Over a strip slot:** the slot scales to 1.06 and its fill goes to `bg-coral/40` (120ms). **Drop on a slot:** that slot flashes coral (a 0 → 1 → 0 fill over 400ms) and its dot count ticks up (`tp-pop` on the new dot). The row leaves the panel with `layout` (the list closes the gap), and a toast "Moved to Sun 13" appears with **Undo**. **Reorder within the day:** dnd-kit's default transform, with 180ms pop. |
| P7 | Schedule an idea | Pick day | The idea chip shrinks and fades out of the ideas box (180ms, exit). The target slot flashes as in P6. If the target day is the selected one, the new row enters with `tp-rise-in`. The ideas count animates down. |
| P8 | Leg pill "add" | Hover | The dashed pill's border dash-offset animates (`stroke-dashoffset`-like; use `background-position` on a dashed `background-image` border, or skip this) and the "Add" label nudges +2px. It's subtle. Optional. |
| P9 | Jump list | Click | Smooth scroll to the stop (`scrollToId`), then the existing `data-highlight` ring: a 3px coral outline that fades out over 1600ms. If the stop was folded, unfold it (P2) after the scroll settles, not during it. |
| P10 | Fit tile state change | A stop is added or edited and the state changes | The tile's background cross-fades between colours (320ms). The big number counts from old to new (320ms, `animate()` on a motion value). Crossing into `over` plays `tp-wiggle` once on the tile. |
| P11 | Add a stop | Create succeeds | The sheet or dialog closes (`tp-slide-down` / `tp-pop-out`). The new row enters at its position with `tp-rise-in` plus a 1600ms highlight ring. Later rows shift with `layout`. The map gets a new pin with `tp-pop`. |
| P12 | Mobile sheets | Open / close | The stop sheet slides up full-screen (`tp-slide-up`, 320ms, pop) and down on close (200ms, exit), and the list behind it scales to 0.97. Bottom sheets (pick a day, add a stop, leg, actions) slide up with the scrim fading to 45% (180ms). Drag-to-dismiss is on the handle: over 30% or a fast flick closes the sheet. The Segmented control in the stop sheet uses a shared `layoutId` pill, as on Money. |
| P13 | Mode tile select | Transport sheet | The selected tile fills coral and `tp-pop`s. Choosing Car collapses the time fields (height, 180ms) and fades in the drive estimate. |

## Share

| # | What | Trigger | Spec |
|---|---|---|---|
| S1 | Page enters | First paint | The hero drops in: `translateY(16px)` → 0 with `rotate(-1deg)` → 0, 420ms, bounce. The polaroid lands 120ms later (from rotate 10° to 4°, bounce). The sections below `tp-rise-in` as they scroll into view (IntersectionObserver, once each, 60ms stagger within a row). |
| S2 | Live dot | During stage | The 8px coral dot in the pill pulses its **ring** (not the dot): box-shadow 0 → 6px at 0 → .35 alpha, 1.8s, `ease-out`. It loops **only in this one place**, so it reads as "live". It doesn't pulse with reduced motion. |
| S3 | Progress bar | Mount (mobile during) | The fill does `scaleX` 0 → value, 700ms, pop, 200ms delay. |
| S4 | Countdown | Mount (before) | Counts up to the value over 600ms, pop. It plays once per session per token (`sessionStorage`). |
| S5 | Map "They're here" | Mount (during) | The current pin scales 0.6 → 1.1 → 1 (360ms, bounce). The tag pill drops from −8px (240ms) 200ms later. The travelled legs draw in: the solid polyline's `stroke-dashoffset` goes from its length to 0 over 700ms. |
| S6 | Right now items | Mount | The done items' strike-through draws left to right (`background-size` 0 → 100%, 180ms each, 60ms stagger). |
| S7 | Fold stop (Day by day) | Show ⌄ | The same as Plan P2. On mobile, switching stops with the picker cross-fades the open block (120/180ms). |
| S8 | Stop index | Scroll | The active row's background moves between rows with a shared `layoutId` (180ms). |
| S9 | Polaroids | Hover (desktop) | Lift −4px and rotate toward 0°, `shadow-5` (180ms, bounce). The scroller snaps (`snap-x`). |
| S10 | CTA | Viewport enter | A one-time `tp-pop` on the button when the CTA card enters view. No looping or bouncing after that. |
| S11 | Use this route | Click | Button loading state, then on to sign-in or New trip, where New trip's N1 plays. The rough stops appear on the new trip's Plan with P1's stagger. |

## Performance
- Animate only `transform` and `opacity`, apart from the called-out height transitions, which go through `motion` `layout`.
- The Share page stays server-rendered. The only client pieces are the fold toggles, the mobile stop picker, the polaroid scroller, the optional clock, and the IntersectionObserver entrance wrapper. The entrance wrapper can be one tiny client component that adds a class.
- Nothing on the Share page loops except S2.
