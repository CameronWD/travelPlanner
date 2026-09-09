# Follow-ups from the Feedback panel chat-shape build

Findings from the final whole-branch review of `feat/feedback-panel-chat-shape` (the
Feedback panel becoming a bottom-right docked chat-widget shape). Each was judged real
and triaged **ships-as-follow-up** — recorded here so they survive the build's scratch
workspace. Continues `docs/follow-ups/2026-09-08-feedback-notes.md`.

## Worth doing before the panel sees much phone traffic

- **Rotating a phone while the panel is open leaves it in the wrong modality.**
  `components/feedback/feedback-launcher.tsx` snapshots `docked` once, in `openPanel`,
  from `matchMedia("(min-width: 768px)")`. There is no change listener, so crossing the
  `md` boundary while open desynchronises the CSS shape from the React modality:
  - portrait → landscape on a phone (iPhone landscape ≈ 844px, so it crosses 768px):
    the panel re-renders as the small docked card but keeps the modal overlay, so the
    page behind stays dimmed, blurred, scroll-locked and `aria-hidden` — and because
    outside-click dismissal is deliberately disabled, tapping the backdrop does
    nothing. One tap on the X recovers it and the draft is never lost.
  - desktop narrowed below `md`: the full-screen panel returns without the scroll lock
    or `aria-hidden` it should have.

  Fix is about ten lines: replace the snapshot with a subscription —
  `useSyncExternalStore` over the media query's `change` event, server snapshot
  `false` — gated on `open`. Note `components/trip/calendar-views.tsx:48` has the same
  one-shot `matchMedia` pattern; the consequence is only severe here because it drives
  a dialog's modality.

- **Desktop toasts now fly in from the wrong edge.** The viewport moved to the
  bottom-left at `md`+, but `Toaster` still sets `swipeDirection="right"` and the card
  keeps `motion-safe:tp-slide-in-right` / `tp-slide-out-right`
  (`components/ui/toast.tsx:60-61`, `components/ui/toaster.tsx:21`). So a desktop toast
  animates from the page centre toward the left edge, and dismissing it means swiping
  *into* the page rather than off the nearest edge. Purely cosmetic, but it reads as a
  bug. `md:left-*` variants of the slide utilities already exist in `app/globals.css`.

## Small, cheap, not urgent

- Below `md` the dim-and-blur backdrop is briefly visible during the open and close
  animations: `tp-slide-up` runs 250ms against `tp-fade-in`'s 150ms, so the mobile
  panel now enters over a visibly dimming page. Arguably an improvement — it is the
  standard sheet feel — but it is a change from the previous backdrop-free mobile
  behaviour and was not a deliberate design choice.
- That same backdrop composites a full-viewport `backdrop-blur-sm` on every mobile
  panel open purely to carry Radix's scroll lock, and it is 100% occluded by the
  panel's opaque surface. Occlusion culling of `backdrop-filter` is not guaranteed, so
  it is a small real cost on low-end phones. If it ever matters: give `SheetContent` an
  overlay-className passthrough and neutralise the background for this caller.
- A desktop toast now sits over the frozen `sticky left-0` label column of the Compare
  table (`components/trip/compare-table.tsx:477`) rather than the table's right edge.
  Transient, and the table is readable the moment the toast clears.
- `badgeFor`'s variant type in the launcher is a hand-written `"success" | "muted"`
  union rather than being derived from `badgeVariants`. Deliberate — the narrow union
  is the better contract — but noted in case the variant set grows.
- The docked height calc `min(37.5rem, calc(100vh - 9rem))` has no floor. Only bites
  below a 144px-tall viewport at ≥768px wide; 768×400 landscape still yields a usable
  16rem panel.

## Deliberately settled — do not re-litigate

- **The panel stays open when you click the page behind it.** `onInteractOutside` is
  prevented on purpose: a site chat widget does not vanish because you clicked the
  page, and `CONTEXT.md` promises the page stays *usable* behind it. Closing is the X
  and Escape.
- **Desktop toasts live in the bottom-left now.** The bottom-right belongs to the
  Feedback trigger and the panel docked above it; lifting toasts above a panel up to
  37.5rem tall would strand them mid-screen.
- **Two claims rest on class contracts, not measurement.** jsdom has no layout or
  hit-testing, so "the toast viewport no longer swallows taps" and "a toast no longer
  covers the composer" are pinned by the classes plus a real close-button click — not
  by anything a test measured. Worth one look on a real phone.
