# Mobile / PWA manual checklist

Run on an installed iPhone PWA (Add to Home Screen), portrait, ~390px.

## Safe area (standalone)
- [ ] Bottom tab bar sits **above** the home indicator (not under it); bar background still reaches the screen edge.
- [ ] Header content clears the notch / Dynamic Island; header background fills behind it.
- [ ] Page content above the tab bar is fully scrollable to the last item (nothing hidden behind the bar).

## Touch targets
- [ ] The `⋯` card overflow button is comfortably tappable (~44px).
- [ ] Day view: Previous / Next day controls are easy to hit (not a tiny chevron).

## Layout at 390px
- [ ] Calendar opens in **Agenda** by default; switching to Month works and the grid is legible.
- [ ] Budget rows: long destination names truncate; estimated/spent amounts stay on-screen (no horizontal scroll).
- [ ] A long stop/item/transport name truncates with an ellipsis rather than overflowing.
- [ ] Opening a big form (add stop / item / transport / cost): the sheet scrolls, the title stays pinned, the ✕ and the submit button are both reachable.

## General
- [ ] No element causes horizontal page scroll.
- [ ] Both light and dark mode look correct.
