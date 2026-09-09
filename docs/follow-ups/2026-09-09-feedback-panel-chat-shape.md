# Follow-ups from the Feedback panel chat-shape build

Findings from the final whole-branch review of `feat/feedback-panel-chat-shape` (the
Feedback panel becoming a bottom-right docked chat-widget shape). Each was judged real
and triaged **ships-as-follow-up** — recorded here so they survive the build's scratch
workspace. Continues `docs/follow-ups/2026-09-08-feedback-notes.md`.

## Worth doing before the panel sees much phone traffic

- ~~Rotating a phone while the panel is open leaves it in the wrong modality.~~
  **Fixed** in `d589beb` / `37d216d`: `useDockedViewport` now subscribes to the media
  query via `useSyncExternalStore`, latched on "has ever been opened" rather than "is
  open" so the modality cannot flip underneath Radix's exit animation. Two regressions
  it exposed were fixed in the same pass — focus landing on a note's Delete button
  after the remount (`b58bba6`), and `aria-hidden` being stamped across the whole app
  for the length of every desktop close. Note `components/trip/calendar-views.tsx:48`
  still has the same one-shot `matchMedia` pattern; harmless there, since it drives a
  default view rather than a dialog's modality, but it is the same trap.

- ~~Keyboard focus is dumped to the top of the document when the panel closes.~~
  **Fixed** in `fd60dec`: the trigger is now wrapped in `<SheetTrigger asChild>`, so
  Radix's `triggerRef` is populated and focus returns to the button on both Escape and
  the X. Wiring the ref also woke Radix's `onCloseAutoFocus` during the docked↔modal
  *remount* (which is not a close), where it yanked focus off the write box; the panel
  now only lets that default run when `open` is genuinely false.

- ~~Desktop toasts fly in from the wrong edge.~~ **Fixed** in `32e9628`: the entry
  animation is `tp-slide-in-right` at base and `sm` — where the viewport is still
  right-anchored — and `md:motion-safe:data-[state=open]:tp-slide-in-left` from `md`
  up. Verified against compiled CSS, not assumed: equal specificity, `md:` block
  emitted later, so the override genuinely wins.

- **The trigger is now a toggle, and that was not asked for.** Radix's `DialogTrigger`
  composes `onOpenToggle` onto the click, so clicking the floating button while the
  panel is open now closes it; it used to be a no-op. Defensible for a chat-widget
  shape and focus resolves correctly, but it is a third dismissal route nobody chose,
  it is untested, and the comment at `components/feedback/feedback-launcher.tsx:524`
  still says only the X and Escape close the panel. Decide whether to keep it, then
  make the comment and a test say so.

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
- The comment justifying `swipeDirection="right"` in `components/ui/toaster.tsx:23` has
  a wrong premise. Radix Toast's swipe is pointer-based, not touch-only — a desktop
  mouse-drag dismiss works, and `pointerType === "touch"` merely widens the start
  buffer from 2px to 10px. The *decision* is still right (Radix takes one
  non-responsive value, and touch is the dominant swipe case), so only the reasoning
  needs rewording before it misleads someone.
- The `onCloseAutoFocus` guard reads the last *committed* `open`, which differs from
  "at dispatch time" in two corners jsdom cannot reach, both benign: crossing `md`
  during the ~200ms exit animation briefly pulls focus back into the dismissing panel
  before it settles on the trigger; and unmounting the launcher with the panel open
  refocuses nothing, which is fine because the trigger unmounts too. Worth knowing
  before anyone "simplifies" the guard to a ref.
- The launcher's module-level `MediaQueryList` cache is keyed off the current
  `window.matchMedia` function reference. Correct across the test suite (each stub is a
  fresh closure, and `vi.unstubAllGlobals()` restores a different reference), but two
  tests in one file that both leave `matchMedia` unstubbed share a single cached list
  via module state. Harmless today — the default stub always reports `matches: false`
  and nothing asserts on its identity — but a future test could trip over it. A
  `beforeEach` cache reset would close it off.
- `stubViewport` in the launcher tests discards the query string it is handed, so a
  typo in `DOCKED_FROM`, or drift between it and the `md:` classes in
  `components/ui/sheet.tsx:41-43` or the same `(min-width: 768px)` literal duplicated at
  `components/trip/calendar-views.tsx:48`, would pass every test. Pre-existing weakness,
  not introduced by this branch.
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
