# Mobile / PWA manual checklist

## Test context

| Device / mode | Width | Theme |
|---|---|---|
| iPhone SE (installed PWA, Add to Home Screen) | **320 px** portrait — **primary** | Light and Dark |
| iPhone 16 / any modern phone (sanity pass) | **390 px** portrait | Light and Dark |
| Chrome DevTools — Device Toolbar | 320 px and 390 px | Both |

Complete the entire checklist at **320 px light**, then repeat the full pass at **320 px dark**, then do a quick 390 px sweep (focus on anything that looked borderline at 320).

Global pass criteria for every screen:
- [ ] No horizontal page scroll (body never overflows).
- [ ] Nothing bleeds outside its visible container.
- [ ] Long names truncate/ellipsize rather than pushing content off-screen.
- [ ] Icons do not overlap each other or escape their container.
- [ ] All content text ≥ 12 px (pinch-zoom not required to read labels).
- [ ] All form controls (inputs, textareas, selects) render text at **≥ 16 px** on mobile — anything smaller makes iOS Safari auto-zoom the page on focus. (Shared primitives use `text-base sm:text-sm`; any new raw control must follow suit.)
- [ ] Tappable controls are ~44 px in the touch dimension.
- [ ] Bottom tab bar sits **above** the home indicator; bar background reaches the screen edge.
- [ ] Header content clears the notch / Dynamic Island; header background fills behind it.
- [ ] Page content scrolls fully to the last item (nothing hidden behind the tab bar).
- [ ] Both light and dark themes look correct.

---

## Sign-in (`/sign-in`)

- [ ] Sign-in card/form fits within 320 px; no horizontal scroll.
- [ ] Email and password inputs span the available width without overflowing.
- [ ] Sign-in button is full-width or clearly tappable (~44 px tall).
- [ ] App name / logo truncates or wraps cleanly — does not bleed off-screen.
- [ ] "Continue with Google" (or equivalent) fits on one line or wraps gracefully.
- [ ] Dark theme: inputs, labels, and buttons all have sufficient contrast.

---

## Trips list (`/trips`)

- [ ] Trip cards stack in a single column; none overflow horizontally.
- [ ] Long trip titles truncate with ellipsis on the card.
- [ ] The "New trip" / "+" action button is reachable and ~44 px.
- [ ] The user-menu avatar / icon is visible and does not bleed off the header.
- [ ] No horizontal scroll at page level.

---

## New trip (`/trips/new`)

- [ ] Form fits 320 px; all inputs full-width.
- [ ] Date pickers / dropdowns open inside the viewport (no clipping).
- [ ] Submit button is clearly tappable.
- [ ] Dark theme: all labels and inputs legible.

---

## Trip overview (`/trips/[id]`)

- [ ] Trip title in the header clamps to 1–2 lines and does not overflow.
- [ ] Tab bar labels truncate cleanly if the trip name is long.
- [ ] Overview cards / summary tiles stack without horizontal scroll.
- [ ] "Edit trip" and action buttons are ~44 px and reachable.
- [ ] Cover image (if present) is contained — `w-full`, no bleed.

---

## Plan / Itinerary (`/trips/[id]/plan`)

- [ ] Timeline rows are `min-w-0`; long stop names truncate — no row pushes the page wider.
- [ ] Time gutter is compact (≈10–12 px wide) and does not crowd the item content.
- [ ] Time labels are ≥ 12 px and legible.
- [ ] "Add stop / transport / accommodation" buttons are ~44 px and accessible.
- [ ] Drag handles (if visible on mobile) do not bleed outside the row.
- [ ] Smarter-itinerary suggestions panel fits inside the viewport.
- [ ] No horizontal page scroll.

---

## Calendar — Agenda view (`/trips/[id]/calendar`)

- [ ] Calendar opens in **Agenda** by default on mobile.
- [ ] Agenda rows wrap/truncate; no row causes horizontal scroll.
- [ ] Agenda event labels are ≥ 12 px.
- [ ] "Next / prev month" arrows are present and ~44 px.
- [ ] Dark theme: agenda rows and date pills are legible.

## Calendar — Month view (same route, toggle to Month)

- [ ] Month grid scrolls **horizontally inside its own bordered box** — the page body does NOT scroll horizontally.
- [ ] The month header label is flexible and does not overflow.
- [ ] The "back to Agenda" arrow / toggle is **hidden on mobile** (so the user switches via the toggle, not the arrow).
- [ ] Day cells and event dots are legible at 320 px.
- [ ] Dark theme: grid borders and event dots have visible contrast.

---

## Day view (`/trips/[id]/day/[date]`)

- [ ] Timeline rows use `min-w-0`; long names truncate — no row widens the page.
- [ ] Time gutter is compact; time labels ≥ 12 px.
- [ ] Previous / Next day navigation buttons are ~44 px and clearly tappable.
- [ ] Maps / images inside a day item are contained (`max-w-full`).
- [ ] No horizontal page scroll.

---

## Today view (`/trips/[id]/today`)

- [ ] Identical layout behaviour to Day view (same component).
- [ ] "Today" label / date header fits on one line or wraps cleanly.
- [ ] Timeline rows min-w-0; time gutter compact.
- [ ] No horizontal page scroll.

---

## Budget (`/trips/[id]/budget`)

- [ ] Money hero (total spend) is smaller on mobile — fits without overflow.
- [ ] Estimated and Spent columns are narrower (`w-20`/`sm:w-24`); amounts visible without scroll.
- [ ] Currency picker is narrower on mobile; does not overflow the header row.
- [ ] Long destination / category names truncate with ellipsis.
- [ ] Row actions (edit/delete) are ~44 px and reachable.
- [ ] No horizontal page scroll at any zoom level.

---

## Compare (`/trips/[id]/compare`)

- [ ] On mobile (320 px and 390 px) plans render as **stacked per-plan cards** — NOT a wide table.
- [ ] Each card shows the plan name, key metrics, and promote/delete actions.
- [ ] Plan names in cards truncate if long.
- [ ] Card action buttons (~44 px) are fully visible and tappable.
- [ ] On desktop (≥ 640 px breakpoint) the wide metric table is visible; it is hidden on mobile.
- [ ] No horizontal page scroll on mobile.

---

## Wishlist — list (`/trips/[id]/wishlist`)

- [ ] Wishlist header stacks on mobile (title + controls do not overflow in a single row).
- [ ] Chapter chips truncate with ellipsis rather than pushing the row wider.
- [ ] Wishlist idea cards fit within the viewport; long names truncate.
- [ ] Add / schedule buttons are ~44 px.
- [ ] In-plan marker badge is contained inside the card.
- [ ] No horizontal page scroll.

## Wishlist — map tab

- [ ] Map fills the container without overflowing the viewport.
- [ ] Leaflet popups are constrained to the visible viewport (capped at `max-w-[calc(100vw-1rem)]`).
- [ ] Popup text is ≥ 12 px; popup close button is ~44 px.
- [ ] No horizontal page scroll.

---

## Summary + route map (`/trips/[id]/summary`)

- [ ] Summary stats / cards stack; none overflow.
- [ ] Route map (Leaflet) fills its container; no bleed.
- [ ] Leaflet popups capped to viewport width; text legible.
- [ ] "Share" / export buttons accessible and ~44 px.
- [ ] No horizontal page scroll.

---

## Journal (`/trips/[id]/journal`)

- [ ] Journal entry list: long titles truncate.
- [ ] Entry content / rich text wraps correctly inside 320 px.
- [ ] Image attachments are `max-w-full` — no bleed.
- [ ] Note thread / comment panel opens as an overlay capped to viewport width.
- [ ] Note-thread overlay: header, input, and send button all fit within 320 px.
- [ ] Dark theme: editor and thread panel legible.

---

## Checklists (`/trips/[id]/checklists`)

- [ ] Checklist items truncate long text — no row causes horizontal scroll.
- [ ] Checkboxes and tap targets are ~44 px.
- [ ] Add item input fits within 320 px.
- [ ] Section headers do not overflow.

---

## Files (`/trips/[id]/files`)

- [ ] File list items truncate long filenames.
- [ ] Thumbnail images are contained (`max-w-full`).
- [ ] Upload button is ~44 px.
- [ ] No horizontal scroll at page level.

---

## Activity (`/trips/[id]/activity`)

- [ ] Activity feed rows use `min-w-0`; long event descriptions truncate.
- [ ] Avatar / icon does not escape its row.
- [ ] Timestamp text is ≥ 12 px.
- [ ] No horizontal page scroll.

---

## Settings (`/settings` or trip settings)

- [ ] All settings rows fit within 320 px.
- [ ] Toggle / switch controls are ~44 px.
- [ ] Section labels do not overflow.
- [ ] Dark theme: all controls and labels have visible contrast.

---

## Command palette

- [ ] Command palette dialog opens and is capped to viewport width (`max-w-[calc(100vw-1rem)]` or similar).
- [ ] Search input is full-width inside the dialog; does not overflow.
- [ ] Command list items truncate long labels.
- [ ] Dialog is scrollable when the command list is long.
- [ ] Close / dismiss area is clearly accessible.
- [ ] Dark theme: dialog, input, and list items legible.

---

## Notifications dropdown

- [ ] Notification panel/dropdown is capped to viewport width — does not bleed off the right edge.
- [ ] Notification badge count is contained within the bell icon area.
- [ ] Notification rows truncate long text.
- [ ] "Mark all read" / close control is ~44 px.
- [ ] Dark theme: panel background and text legible.

---

## Public share link (`/share/[token]`)

- [ ] Share page loads without auth and fits 320 px.
- [ ] Share rows (stops, budget items) wrap or truncate — no horizontal scroll.
- [ ] Long trip/item names truncate.
- [ ] Sign-in prompt / CTA fits within the viewport.
- [ ] Dark theme: all content legible.

---

## Print page (`/trips/[id]/print`)

- [ ] Print layout is contained at 320 px viewport (for screen preview); no element bleeds off.
- [ ] Images are `max-w-full`.
- [ ] Text is ≥ 12 px.
- [ ] No horizontal page scroll in the browser (pre-print).

---

## Keyboard in dialogs (2026-10-11)

Real devices only — no headless browser shows an on-screen keyboard
(spec `docs/specs/2026-10-11-phone-keyboard-sheets.md`). Run on **iPhone
Safari** and **Android Chrome**, both in the browser and installed to the home
screen.

- [ ] Open "Add thing to do" and "Edit day title"; tap a field low in the form.
      The sheet sits right on top of the keyboard (no part of it hidden behind),
      the header is one slim row (title and ✕ only), the drag handle is gone,
      Save is visible, and the focused field is in view.
- [ ] Type a few characters — the field stays in view; the footer stays docked
      on the keyboard with no blank home-indicator gap under it.
- [ ] Close the keyboard (Done / tap outside the field) — the sheet returns to
      its normal height, handle and header.
- [ ] Rotate to landscape (with or without the keyboard open) — out of scope
      for the sheet/keyboard behaviour: most phones are wider than 640 px in
      landscape, so dialogs switch to the centred desktop layout with no
      keyboard handling at all. Check what it actually does and note it here,
      rather than expecting the portrait sheet behaviour.
- [ ] Scroll the page / let the iOS toolbar collapse with no keyboard — the
      sheet does **not** switch to the compact state.
- [ ] Close the dialog with the keyboard open, then reopen it — it opens at its
      normal size, not the keyboard size.
- [ ] The Feedback sheet (phone, below md) behaves the same when its write box
      is focused.
- [ ] Android Chrome only: focus an input on a normal page with the tab bar
      visible (e.g. a Reminder field on Home, or the journal editor) — the
      app-wide `interactiveWidget: "resizes-content"` now resizes every page,
      not just dialogs. Note whether the tab bar rides up over the keyboard,
      and how much space (if any) is left between the tab bar and the
      keyboard.

---

## Claude connection (2026-10-12)

- [ ] Connect the Claude connection on the phone app (Settings → Connectors →
      Add custom connector), signing in to Teepee as part of the flow.
- [ ] Run a read through Claude (for example, ask it to list the trip's
      stops) and confirm it comes back.
- [ ] Account → Connected apps shows the connection, with when it was
      connected and that it has been used.
- [ ] Disconnect it from Connected apps, then confirm the next Claude call
      fails.
- [ ] Reconnect it the same way and confirm it works again.
- [ ] After the deploy, sign in once with Google and once with the email
      Sign-in link, each on a device that isn't already signed in.

---

## 390 px sanity pass

After the full 320 px run, reload each screen at 390 px and confirm:

- [ ] Nothing that was borderline at 320 px regresses at 390 px.
- [ ] Stacked Compare cards are still stacked (breakpoint is `sm:` = 640 px, so 390 px stays on cards).
- [ ] Calendar month-grid box still scrolls inside its container.
- [ ] All safe-area, truncation, and overflow rules still hold.
- [ ] Both light and dark themes still correct.
