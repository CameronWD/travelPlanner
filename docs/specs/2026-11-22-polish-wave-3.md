# Polish, wave 3: nits and carried-over items

Branch `chore/polish-wave-3`, cut from `main` after wave 2 is merged and pushed. Last of
three branches working through `docs/audits/2026-11-20-polish-audit.md`; ids are the
audit's (N1 to N12 are its "Carried over from the notes branch" list, in order). Cam marked
every item "fix" on 20 Nov 2026. Choices are built the recommended way and logged in
`docs/audits/2026-11-20-polish-decisions.md`.

Rules for every item: holds from 320 to 2560 px wide, in light and dark theme, with existing
tokens and components. No new dependency, no schema change, no new route, one `loading.tsx`.
Nothing may reveal a Surprise's hidden content. Dialog titles are Title Case.

## 1. Shell

- **S5.** Overlapping avatars in the trip header never clip a person's initials: each avatar
  has a ring in the surface colour and the overlap is small enough that both initials read.
- **S6.** On a phone's trip home the trip name appears twice at most: the switcher and the
  hero card keep it; the page header between them does not repeat it.
- **S7.** The Feedback button never covers a row's controls or a card's text on a phone: it
  sits above the tab bar with the content's bottom padding clearing it on every page, and on
  the Day view it does not cover the weather card's sunset time at 320 px.
- **S8.** The What's new marker is a small badge of the same style as the notification
  bell's count, not a bare dot.

## 2. Trip home and maps

- **H6.** A map card's attribution row is not cut by the card's rounded corner, and the zoom
  control does not sit over the Home marker on the route map.
- **H7.** A past trip's phone hero shows the trip's title; the sketching route list's
  columns line up; empty-state copy does not end on a one-word line (`text-balance`); a
  warning's icon has the same colour on phone and desktop.

## 3. Trips, Plan, Day

- **T2.** On desktop New trip, Continue sits beside or directly under the input, not at the
  far edge of a wide card.
- **P6.** A rough Stop on a phone does not use "Drag to reorder" as its only subtitle (show
  its nights or nothing); the Firm up button sits inside its banner; date ranges use one dash
  style everywhere on Plan (the en dash with thin spacing the Day view uses); Book by pills
  use the same type size as the pill beside them; a drive within one region names the region
  once.
- **P7.** In Delete stop the cost, attachment and note lines wrap in full, as the stay line
  does since X6.
- **D7.** An empty Day plan card says "nothing" once and has no dead band; the Journal
  card's padding matches its neighbours; the phone Day plan header gives its title room
  (Day map and the count drop to a second line when they do not fit).

## 4. Summary, Money, Activity

- **U4.** The on-screen Print preview wraps cleanly on a phone and is centred on desktop.
- **M3.** The desktop Trip cost card has no large empty block under its bar.
- **A1.** Desktop Activity rows sit in a readable measure with the time close to its text.

## 5. Copy and public pages

- **G4.** Apostrophes and quotation marks in the app's own copy are curly everywhere. Text
  a Traveller typed, code, URLs and test fixtures are untouched.
- **L3.** Terms and Privacy end with a footer that links onward (home, the other document).
  The landing page's blank bands on a phone close up. Public pages stay light-only.

## 6. Dialogs

- **O7.** No big gap between a sheet's title and its first field, and no empty band under a
  small dialog's buttons.
- **O8.** Add from Globe's filter shows its magnifier; the desktop inline Add reminder form
  has a capped width; Reminders on desktop wrap at a readable measure; the More sheet's rows
  use the app's row style with the close button in the header; the Day map dialog's first
  list row is not clipped; Delete stop shows the app's focus ring, not the browser's; the
  trip switcher's bottom actions line up with the trip names.

## 7. Carried over from the notes branch

- **N1.** Trip home does not shift on a slow load, and the Day view does not shift on load:
  find the late shift in each and reserve its space. Target: 0 on the harness's CLS set.
- **N2.** The Trips skeleton sits at the page's own offset (not 6 px high). Its dots row is
  left as it is.
- **N3.** No hydration mismatch on Plan: the timezone label renders the same on the server
  and in the browser.
- **N4.** An idle Day page prefetches each neighbour and each other page once, not three
  times.
- **N5.** A Reminder brought back by the other Traveller or by Claude appears on an open
  Reminders card without a reload (on the next refresh the page already makes).
- **N6.** A surprised Traveller sees no "Add a title" control on a Surprise day.
- **N7.** Measure the Day page's compressed size on the 36-day trip and record it in the
  decisions list. No build unless it is over 300 KB compressed.
- **N8.** Dragging a desktop window across 1024 px on the Day view triggers no stray scroll
  correction.
- **N9.** The proxy answers a failed session lookup without waiting for its error report.
- **N10.** Deep Review asks for confirmation before it starts. Standard Review still starts
  on one tap.
- **N11.** `CONTEXT.md` says that a dismissed Reminder is counted on Checklists ("Dismissed
  (n)") and nowhere else.
- **N12.** No build: the install nudge stays at the foot of the phone Trips list.

## Also in this wave, from waves 1 and 2

- Plan's desktop "Add a stop" has a Cancel like every other dialog.
- The share page's route card stretches by its own class, not a descendant selector.
