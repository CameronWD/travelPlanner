# Spec 2026-10-11 · Phone dialogs that survive the keyboard

Same branch: `feat/activity-history-and-audit-seed-2026-10-11` (one merge to
`main`). Raised by Cam in the session of 2026-10-11: on a phone, editing a day
or adding something opens a bottom sheet, the keyboard comes up, and only a
thin strip of the form stays usable between the sticky header and the sticky
footer.

## Cause (confirmed in code)

- Below `sm`, `DialogContent` (`components/ui/dialog.tsx`) and `SheetContent`
  (`components/ui/sheet.tsx`) are `fixed inset-x-0 bottom-0 max-h-[90dvh]`
  bottom sheets; `size="full"` dialogs are `100dvh`.
- On iOS Safari the on-screen keyboard overlays the page: neither the layout
  viewport nor `dvh` shrinks, so the sheet keeps its height, its lower part sits
  behind the keyboard, and Safari scrolls the page to reveal the focused field.
  What remains visible is the sticky header (`min-h-[72px]`), the sticky footer
  (with `env(safe-area-inset-bottom)` padding the keyboard makes pointless) and
  a sliver of form.
- Nothing listens to `window.visualViewport`; the viewport has no
  `interactive-widget` setting.

## Behaviour

Phone only (below `sm`). Desktop dialogs and the `md:` desktop Sheet card are
unchanged.

1. **A keyboard-aware viewport hook** (`useKeyboardViewport`) reads
   `window.visualViewport` (`height`, `offsetTop`) and reports
   `{ keyboardOpen, visibleHeight, bottomInset }`, where `bottomInset` is the
   distance from the layout viewport's bottom to the visible area's bottom.
   `keyboardOpen` is true when the visible height is more than 120 px shorter
   than `window.innerHeight` (ignores the iOS toolbar collapsing). Updates on
   `visualViewport` `resize` and `scroll`, rAF-throttled. With no
   `visualViewport` (old browsers, SSR, tests) it reports keyboard closed and
   the sheets behave exactly as today.
2. **While the keyboard is open, the phone sheet sits on the keyboard and fills
   the visible area:** `bottom: bottomInset px`, `max-height` and (for
   `size="full"`) `height` = `visibleHeight px`, set as inline style or CSS
   variables on the content element. Rounded top corners kept; the drag-handle
   pill hidden to save space.
3. **Compact header while typing:** the header's `min-h-[72px]` drops to a
   single slim row (around 48 px) with the eyebrow/description hidden; the
   title and the close button stay.
4. **Footer stays docked** at the bottom of the visible area (it already is the
   sticky bottom of the scroll body); its `env(safe-area-inset-bottom)` padding
   is dropped while the keyboard is open.
5. **Focus reveal keeps working:** the existing `revealFocusedField` logic still
   runs against the resized sheet; after the sheet resizes, the focused field is
   re-revealed once (it may have been covered mid-transition).
6. **Android:** the root viewport gains `interactiveWidget: "resizes-content"`
   (Next's `Viewport` export), so Chrome shrinks the layout for the keyboard
   and the existing `dvh` sizing already fits; the hook then sees no gap and
   does nothing extra.
7. Data attribute `data-keyboard="open"` on the content element while open, so
   CSS (and tests) can target the compact state.

## Verification

Unit tests drive the hook with a fake `visualViewport` (resize/scroll events)
and assert the sheet's style/attributes for open and closed states, for
`DialogContent` (md, lg, full) and `SheetContent`. **A real iPhone and Android
check is required** — no headless browser here shows an on-screen keyboard.
That check needs the branch reachable on a phone (a preview deploy or the local
dev server over the LAN); Cam decides how, since pushing or deploying is his
call.

## Out of scope

Redesigning any individual form. Desktop dialogs. Native-app behaviour.
