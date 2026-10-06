# Spec — Feedback batch: resolved notes behind a toggle, a return leg as the deadline, roomier stay and edit dialogs, Schedule offers that place's days, metro-line legs, clickable Stop rows, Globe filter, portrait covers on phones, Trips tally at mid widths (2026-10-05)

**Status:** agreed with Cam 2026-10-05; not yet built.
**Branch:** `feat/feedback-batch-2026-10-05` (cut from `session/2026-10-05`). Target `main`.
Terminology follows `CONTEXT.md` (amended this round: **Resolution** added; **Feedback note**, **Feedback panel**, **Hard end date** amended). New ADR: **0068** (a dated return leg is the Trip's deadline; amends 0013).

| Part | Contents | Closes |
|---|---|---|
| A | Feedback panel: resolved notes hidden after 7 days behind "Show resolved (N)"; every resolved note shows Done / Won't fix, the date and its Resolution | — (Cam, in session) |
| B | Trips list: the map/tally row has a fixed height from md to xl so the tally can't overflow | `Resolves-Feedback: cmutai0m4000604l8mtbi92xt` |
| C | A dated return leg is the Trip's deadline (ADR 0068) | `Resolves-Feedback: cmutb7bn2000104lbwqrew0qo` |
| D | Stay dialog becomes a large detail view; the four big edit forms go large with paired fields | `Resolves-Feedback: cmutc4u82000004jm8e6ck4xm` |
| E | Wishlist Schedule offers the days you're near that place | `Resolves-Feedback: cmutbubrw000004l2g7ev7p8y` |
| F | Multi-leg transport stacks vertically on the connector, metro-style | `Resolves-Feedback: cmutb5cd5000504jugb51nurn` |
| G | The whole Stop header toggles it; the folded stay chip opens the stay detail view | `Resolves-Feedback: cmutb6vtl000004lba7hzqysz`, `Resolves-Feedback: cmutb86et000204lb5g9y2tez` |
| H | Globe: the filter box can't be mistaken for adding a place | `Resolves-Feedback: cmut9zwzv000204l8tem63thb` |
| I | Phone Trip home: a portrait cover shows whole, small, beside the trip name | `Resolves-Feedback: cmutd5703000004lenvgzu71m` |

**Out of scope (decided):** deleting resolved notes from the database (hidden only); a "seen" state for Resolutions (the 7-day window stands in); a Google Maps / Places integration (follow-up GM-01); new data for change-over points between legs; desktop cover changes; any migration.

**Already handled in session, not part of the build:** 8 notes shipped on `main` resolved; the attachment-delete note (`cmut7xzkh…`) resolved Done (fixed by 2026-10-04 §K); two Globe notes (`cmuta8uec…`, `cmutagr0k…`) closed Won't fix as repeats of `cmut9zwzv…`.

---

## A · Feedback panel: Show resolved

- `FeedbackNoteView` gains `resolution: string | null` and `resolvedAt: string | null` (`lib/feedback-view.ts`, `VIEW_SELECT`).
- The panel lists every Open note, plus any Done / Won't fix note whose `resolvedAt` is within the last 7 days. The rest are hidden.
- A "Show resolved (N)" button at the top of the log, where N counts the notes hidden right now; it is absent when N is 0. It reveals them in their normal date order and becomes "Hide resolved". The state is not remembered: hidden again each time the panel opens.
- Each resolved note: body struck through as now; Done badge (success) or Won't fix badge (muted) as now; beneath it an indented line, "Done 5 Oct — {Resolution}" or "Won't fix 5 Oct — {Resolution}". A note with no Resolution text shows just the status and date.
- Admins get the same rule across every author's notes.
- `/work/CLAUDE.md`'s "Closing a Feedback note" step 1 changes from "Write the note for *me*" to: write the Resolution **to the note's author**, in plain words; operator caveats go in the commit or follow-ups (CONTEXT.md **Resolution**).
- Before deploy, the operator rewords any existing Resolutions that read as internal (e.g. today's dark-mode one names `FORCED_THEME`). This uses `feedback:resolve` and is done by the main session with Cam, not by the build.

## B · Trips list: map/tally row at mid widths

- Cause: `.tally-card { container-type: size }` (`app/globals.css:318`) means the card's content doesn't size it. Below `xl` nothing gives the row a height, so the row collapses to the map's `min-h-[150px]` and the tally overflows.
- Fix: from `md` up to `xl`, `TRAVELS_ROW` (`app/(app)/trips/page.tsx`) has a fixed height of 360px. ≥xl is unchanged. Phones are unchanged (TallyStrip).
- Verify by screenshots at 768, 1024 and 1264 wide, with the tally showing 4 cells and nothing overflowing.

## C · A dated return leg is the deadline (ADR 0068)

- A single resolver, e.g. `resolveTripDeadline(plan)`, returns `{ kind: "return-leg", date, mode } | { kind: "hard-end", date } | null`: `findReturnLeg` (`lib/home-base.ts`) if that leg has a departure date, else `Trip.hardEndDate`, else null.
- The `fitTileModel`, Fit tile, Summary, Plan overview, `hardEndState`, Make it fit, and the projected-end Flag all read it instead of `hardEndDate` directly.
- Fit tile, return-leg case: "{Flying|Driving|Train|Bus|Ferry|…} home {Fri 8 Jan}" in place of the Home-by control. The "Set a home-by date" prompt is hidden. Nights spare/over count against the leg's departure.
- Flag copy, return-leg case: "…past your flight home" (mode-aware). The "return leg lands after the Hard end date" Flag doesn't fire while the return leg is the deadline.
- For a multi-leg journey home, the deadline is the departure of the leg leaving the last Stop.
- Each Fork resolves its own deadline.
- A stored `hardEndDate` is untouched: dormant, and used again if the leg is deleted or loses its date.

## D · Stay detail view and roomier edit forms

- `StayDialog` uses `size="lg"`. The selected stay shows as a detail layout: name header; address + map link; check-in / check-out with times; "{n} of {m} nights" coverage; booking reference; cost and paid state; notes; attachments; an **Edit** button that opens the existing `AccommodationFormDialog`.
- Several stays on one Stop: a chip row at the top switches between them, with "+ Add a stay" at the end of the row. Opening from a block or chip selects that stay.
- The `AccommodationFormDialog`, `TransportFormDialog`, `ItemFormDialog` and `StopFormDialog` use `size="lg"` on sm+. Natural pairs sit side by side: dates, times, cost + currency, paid amount + status, booking ref + link. Notes and attachments stay full width. Phones are unchanged.
- Target: a typical Transport or Accommodation form fits without scrolling at 1920×911. Otherwise the body scrolls under the pinned header/footer (spec 2026-10-04 §G).
- The small forms (Reminder, Chapter, Schedule) stay `md`.
- Verify by screenshots of the four forms at 1920×911 and 1280×800 with real-shaped data.

## E · Wishlist Schedule offers that place's days

- Wishlist only; the Calendar's Schedule entry is unchanged.
- Idea with coordinates and one or more Stops within 50 km on the current Plan: the date field becomes day chips grouped by those Stops ("Rome · Sat 19 · Sun 20 · Mon 21"), with two separate stays labelled separately. Picking a chip sets the date; times work as now.
- Nearest Stop within 50 km is rough (undated): offer "Add to {Stop}'s things to do", which uses the existing ADR 0022 path.
- No coordinates, or nothing within 50 km: every Trip day as chips grouped by Stop, with the line "Not near any Stop — pick any day".
- Always a "Pick another date" link back to the plain date field.
- Distance uses the existing haversine helper, if there is one.

## F · Metro-line transport legs

- `LegRow` (`components/plan/leg-pill.tsx`) stacks legs vertically in travel order, one per line, each with a station dot on the connector beside its pill. A single leg looks as it does now, plus the dot.
- Where a change-over place is already known (one leg's arrival place = the next leg's departure place), show it as small text by that dot. No new data.
- Applies to both compact (phone) and desktop rows, and to outbound/return bookend rows.

## G · Clickable Stop rows and stay chip

- Clicking anywhere on the `StopRow` header (`components/plan/stop-row.tsx`) toggles open/fold, except on interactive descendants (the ⋯ menu, chevron, drag handle, chips that are buttons).
- The chevron stays the accessible control, with its `aria-expanded` and label. The header click is a pointer convenience: no extra role or tab stop.
- Phone: a tap toggles; press-and-hold still drags. Check that the dnd activation constraint doesn't count a short tap as a drag start.
- The folded row's stay chip becomes a button that opens the Stop and the §D stay detail view on that stay. "No bed yet" opens it ready to add one.

## H · Globe filter box

- `MarkerFilters` placeholder becomes "Filter your markers" (and the aria-label to match).
- Filters match nothing while a query is set: the empty state reads "Nothing called '{query}' on your globe yet", with an "Add {query}" button that opens `MarkerForm` with the place search prefilled with the query.
- Globe with zero markers: filters hidden; one empty state pointing to "Add marker" or tapping the map.

## I · Portrait cover on the phone Trip home

- Phones (below `sm`), where `coverAspect` is portrait: no full-width band. A small portrait frame (about 96×128px, rounded, card border) sits right of the trip name and shows the whole photo (object-contain, no crop).
- Landscape or square: the band as now. Desktop: unchanged.
- Tapping the frame does what tapping the band does today.
