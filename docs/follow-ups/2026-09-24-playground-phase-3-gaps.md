# Playground phase 3 — gaps

What the kit shows that we chose **not** to build in phase 3, and why. Written for Cam to decide
from — not a to-do list. Spec: `docs/specs/2026-09-24-playground-phase-3.md`. Handoff *defects*
(things the designer got wrong) go in `2026-09-23-playground-design-ask.md` § D instead.

## Out of scope from the start

- **`emails/*.html` — magic-link, invite, trip-reminder, booking-confirmed.** Kit shows: four
  branded HTML emails. We have: no mail sender at all; sign-in is Google + dev login
  (`lib/auth.ts`), invites deliberately send nothing (`server/actions/invites.ts`, ADR 0017).
  Not built because: new feature (mail provider, senders, and for magic-link a new sign-in method).
- **`app/share/[token]/opengraph-image.tsx` + `share.jsx` `ShareOG`/`Unfurl` — per-trip unfurl
  card.** Kit shows: trip name, dates, stops as a link preview. We have: the share page is
  `robots: noindex`. Not built because: product decision (does a private share link unfurl?).
- **`teepee-desktop/DLanding.jsx`, `teepee-mobile/Landing.jsx` — marketing landing.** Kit shows: a
  marketing landing page (hero, sign-in CTA) shown before sign-in. We have: `/` redirects straight
  to sign-in or trips. Not built because: new feature.
- **`teepee-mobile/Onboarding.jsx`, `teepee-desktop/DExtra.jsx` `DOnboarding` — first-run
  onboarding.** Kit shows: a 3-step "Who / Where / When" wizard shown before the first trip. We
  have: no onboarding flow — a new sign-in lands straight on trips. Not built because: new feature.
- **`teepee-mobile/Invite.jsx` — invite flow with access levels.** Kit shows: an add-people, then
  pick-access ("Can edit" etc.), then confirmation wizard. We have: auto-accept on sign-in with no
  access-level picker (ADR 0017). Not built because: product decision.
- **`teepee-desktop/DShared.jsx`, `teepee-mobile/Shared.jsx` — "Your people" screen with a
  shareable join link.** Kit shows: a trip link with an open/invite-only toggle, the people list,
  and forks, as a standalone screen. We have: none of this as a standalone screen. Not built
  because: new feature.
- **`shared/admin.jsx` `More` — mobile "More" hub.** Kit shows: a two-group list ("This trip" /
  "You") fanning out to every screen beyond the four tabs. We have: the phase 2 dock, structured
  differently. Not built because: new feature.
- **`teepee-tablet/` — tablet layout.** Kit shows: a dedicated tablet layout. We have: responsive
  breakpoints only, no tablet-specific layout. Not built because: product decision.
- **`docs/notifications.md` — notification batching, email channels, "Mark paid" and "Time to
  leave" pushes.** Kit shows: batched notifications, email as a delivery channel, and two
  additional push types. We have: the digest push only. Not built because: new feature.
- **`teepee-desktop/*.jsx` — 1280×800 canvas (incl. a 340px aside column).** Kit shows: every
  desktop screen drawn at a fixed 1280×800. We have: content capped at `max-w-7xl`, with no use of
  the extra width on 1440/1920. Not built because: product decision.

## p3/boundaries

- **`components/legal/legal-page.tsx` — `updated` label.** Kit shows: an "Updated {date}" label
  above the title, sourced from the drop-in's `updated` prop. We have: no last-modified date for
  either legal page's copy. Not built because: needs a data model (no source of truth for when the
  Terms/Privacy text last changed).

## p3/core

- **`DTrips.jsx` / `Trips.jsx` — summary strap ("3 planned · 1 done · 12 countries so
  far").** Kit shows: an aggregate line above the trips grid combining planned/done trip
  counts with a lifetime country count. We have: phase-derived counts we could aggregate
  from the trips already fetched, but no per-trip country field to total "countries so
  far". Not built because: needs a data model (no country data recorded per trip/stop to
  aggregate).
- **`shared/forms.jsx` — form surface (new trip).** Kit shows: form fields inside a
  bottom sheet/dialog (`Sheet`) with a single full-width primary CTA in a sticky footer;
  the kit has no dedicated "new trip" screen at all — the "Forms" chip only demos generic
  field styling (`EditStopForm`/`BookingForm`) inside that same sheet chrome. We have: a
  full page at `/trips/new` (route unchanged) with inline "Cancel" + "Create trip"
  actions, since there is no sheet to dismiss on a page. Not built because: product
  decision (controller: keep this a page, not a sheet/dialog).
- **`DHome.jsx` — "Beds" card.** Kit shows: an accommodation-completeness stat ("3 of
  4", "Hakone still needs one"). We have: accommodation records per stop, but no
  trip-wide "stops with vs. without a booking" rollup surfaced anywhere on Home. Not
  built because: new feature (no existing aggregation computes this).
- **`DHome.jsx` — "Busiest day" card.** Kit shows: the single day with the most
  scheduled items, isolated on Home ("Sat 18 · 6 things · travel day"). We have:
  per-day item counts are queryable (e.g. the itinerary builder), but nothing rolls
  them up trip-wide into a "busiest day" figure. Not built because: new feature (needs
  a trip-wide aggregation that isn't computed today).
- **`DHome.jsx` — "What's been happening" activity feed, inline on Home.** Kit shows:
  the 3 most recent activity events rendered directly on Home. We have: the same data
  on a full Activity page (`/trips/[tripId]/activity`), not embedded on Home. Not
  built because: new feature/placement decision — out of Task 10's file scope
  (`page.tsx`, `trip-cover.tsx`, `reminders-card.tsx`), since embedding it is a change
  to the Phase content, not the 3 files this task restyles.
- **`shared/onthego.jsx` Today — header chips ("JST · home +2h", "☼ 18°").** Kit shows:
  a time-zone-offset-from-home chip and a weather chip beside the day header. We have:
  zone labels computed per transport time only, and weather data on other surfaces, not
  on Home's Travelling phase. Not built because: new feature (neither is surfaced on the
  trip home today).
- **`shared/onthego.jsx` Today — "Up next" card: arrival column + "Open ticket" /
  "Directions" buttons.** Kit shows: Leaves → Arrives times with places, plus a ticket
  and a directions action. We have: the next departure's label, leave time and zone
  (restyled into the kit's coral card); arrival time and ticket/directions actions are not
  passed to the countdown. Not built because: new feature (new actions, and the
  countdown's props carry no arrival).
- **`shared/onthego.jsx` Today — "1 of 5 done" + per-row checkboxes on Today's plan.**
  Kit shows: tick-off state per plan row and a done count. We have: no done state on
  items. Not built because: needs a data model.
- **`shared/onthego.jsx` Today — "Tomorrow · Sat 18" card.** Kit shows: tomorrow's
  transport and bed as ListRows in the rail. We have: the itinerary for every day, but
  Home only surfaces today. Not built because: new feature.
- **`shared/onthego.jsx` Today — "Hakone needs a bed / ! no bed yet" Tonight card.** Kit
  shows: when tonight has no booking, a lilac card flagging it with "Add a booking" /
  "Search nearby". We have: the Tonight's stay card only when a booking exists (restyled
  to the kit's lilac card); nothing renders for a bed-less night. Not built because: new
  feature (the no-bed flag lives on Summary/Next steps, not on Travelling Home).
- **`shared/onthego.jsx` Today — "Spent today" + "+ Log a cost".** Kit shows: today's
  spend and a dashed log-a-cost button. We have: paid-so-far against the trip's cost
  (shared pot), restyled into the kit card; no per-day spend figure and no inline add on
  Home. Not built because: new feature (per-day spend isn't computed for Home; adding a
  cost lives on the Money tab).
- **`DHome.jsx` / `Home.jsx` — "Route · 12 nights" teal card.** Kit shows: a teal card
  listing each stop with its nights ("Tokyo 4n"). We have: the same stops drawn on the
  route map card (Leaflet) in the Planning phase, plus the stop list on Plan. Not built
  because: new feature (a second, list-form route summary on Home).
- **`DHome.jsx` — hero footer "Sydney 21:35 · JQ19 → HND 06:15".** Kit shows: the
  outbound flight from home under the countdown. We have: the home base and outbound leg
  are known to Next steps (as nudges), but the hero is not given the outbound transport.
  Not built because: new feature (the hero has no outbound-leg data today).
- **`shared/onthego.jsx` Summary — "Flags" StatCard + "Worth a look" list (Past
  phase).** Kit shows: a coral flag-count stat and the urgency-sorted flag list with fix
  buttons. We have: flags on the Summary page and (for Planning) Next steps; the Past
  phase Home shows no flags, since there is nothing left to fix on a finished trip. Not
  built because: product decision (flags are forward-looking; Past Home is a recap).
- **`shared/onthego.jsx` Summary — per-stop table (Stop · Dates · Nights · Bed · Cost ·
  Per day) and the map caption.** Kit shows: the stop table under the map. We have: the
  same table on the Summary page, not on Past Home. Not built because: new feature
  (embedding the Summary table on Home).
- **`DWishlist.jsx` / `Wishlist.jsx` — who added the idea (avatar + name) on each card.**
  Kit shows: the adder's avatar and name in the card's top-left. We have: no creator on
  `Item` (the category chip sits there instead). Not built because: needs a data model.
- **`DWishlist.jsx` / `Wishlist.jsx` — heart vote count chip.** Kit shows: a single
  heart toggle with a running count. We have: the Must / Keen / Meh vote picker plus the
  other traveller's level (restyled in place of the heart). Not built because: product
  decision (our three-level vote carries more than a like count; swapping would drop data).
- **`DWishlist.jsx` / `Wishlist.jsx` — filter chips over the list (All / Tokyo / Kyoto /
  Day trips / Food / Unplaced).** Kit shows: stop and category filters on the list. We
  have: the stop filter chips on the Map view only (restyled to kit Chips); the list is
  grouped instead. Not built because: new feature (list filtering).
- **`Wishlist.jsx` — two-column card grid at phone width.** Kit shows: 2-up cards at
  390px. We have: 1-up below 640px, 2-up from `sm`, 3-up from `xl`. Not built because:
  product decision (our cards carry the vote picker, cost editor and a 44px Schedule
  button, which do not fit a ~175px column).

- **`DDays.jsx` / `Days.jsx` — "Packed · 6 things" sticker on the day card.** Kit shows: a
  coral day-load chip pinned over the selected day's card. We have: no day-load measure; the
  Day page shows the day's rows only. Not built because: new feature.
- **`DDays.jsx` / `Days.jsx` — "Heads up — that's a lot for a travel day. Move one to
  Sunday?"** Kit shows: a busy-day advisory suggesting a move to another day. We have: the
  tight-connection advisory (`DayFeasibility`, "Getting around"), restyled into the kit's sun
  heads-up card; no busy-day heuristic and no move suggestion. Not built because: new feature.
- **`DDays.jsx` day panel — "Kyoto · check-in day" day-type line.** Kit shows: the stop plus
  what kind of day it is under the date. We have: stop, country and time zone. Not built
  because: new feature.
- **`Days.jsx` / `DDays.jsx` — the day as a panel beside/below the month grid.** Kit shows:
  one Days screen, calendar on top (or left) with the selected day's plan beneath (or in the
  right panel). We have: a dedicated Day route (prev/next, map, ideas, journal) linked from
  the calendar page (Task 12b), with its plan in the kit's day card. Not built because:
  product decision (the Day route carries far more than the kit panel).
- **`DDays.jsx` / `Days.jsx` — month tiles filled solid with the stop's hue.** Kit shows: each
  stop's days as fully hue-filled tiles (teal Tokyo, lilac Kyoto). We have: the kit tile shape
  wearing the stop's soft tint plus a hue band down its left edge, both from
  `lib/stop-colours.ts` (Task 12b). Not built because: product decision (the stop-colour
  derivation is shared with the plan editor and is fixed for this phase; it has no solid-fill
  class).
- **`DDays.jsx` / `Days.jsx` — travel days as ink tiles ("FLY SYD", "FLY HOME") with a
  "Flights" legend chip.** Kit shows: flight days drawn as solid ink tiles with a flight label,
  and an ink "Flights" chip in the legend. We have: every day coloured by its Stop, with the
  transport mode and check-in/out icons on the tile (desktop) and a "Travel day" chip in the
  agenda. Not built because: product decision (a travel day still belongs to a Stop; recolouring
  it hides where you sleep).
- **`DDays.jsx` / `Days.jsx` — Month / Week switch.** Kit shows: a Week view beside Month. We
  have: Month / Agenda (every trip day as a kit day card). Not built because: new feature (a
  week view).

## p3/together

- **`shared/together.jsx` `Activity` — day groups ("Today" / "Yesterday" / "Mon 29 Sep") with a
  clock time on each row.** Kit shows: rows grouped under uppercase day labels, each row's time as
  "10:42". We have: one flat, newest-first list in the kit Card with our relative time
  ("9h ago", "16 Jul 2026") in the trailing column. Not built because: product decision (the page
  renders on the server, which has no Traveller time zone to cut "today" at; wrong-day labels for
  an AU Traveller would be worse than none).
- **`shared/together.jsx` `Activity` — per-person avatar tones (lilac Alex, sun Jess, teal
  you).** Kit shows: each Traveller's avatar in their own accent. We have: the coral initials
  fallback for everyone, as in the bell. Not built because: needs a data model (no per-Traveller
  colour is stored or derived anywhere).
- **`shared/together.jsx` `Activity` — entity name in bold ("moved **Arashiyama**") and a
  one-line detail under every row ("to Mon 20 Oct", "saved offline").** Kit shows: bold actor
  and bold entity, plus a detail line for every event. We have: bold actor, then `headline()`'s
  one string unchanged (shared with the bell and pushes); a detail line only where we record one
  (field changes, note excerpt). Not built because: product decision (`headline()` stays one
  string; per-verb detail lines would need new activity payloads).

- **`shared/together.jsx` `Journal` — "Write today" button in the header.** Kit shows: a primary
  pencil button beside the entry count. We have: entries written from each Day page's journal
  editor; the Journal page is read-only (each day card's date links to its Day page). Not built
  because: new feature (a Journal-page entry point that picks today's date).
- **`shared/together.jsx` `Journal` — stop name eyebrow ("TOKYO") over each card's date.** Kit
  shows: the day's stop as an uppercase label above the date. We have: the date heading only; the
  Journal page fetches entries and photos, not stops. Not built because: new feature (a stop
  lookup per journal date on this page).
- **`shared/together.jsx` `Journal` — one card per entry.** Kit shows: each card is one person's
  entry, their avatar top-right, with that entry's photos. We have: one card per date holding
  every Traveller's entry (ARCH-DAT-6) and the date's shared photos, the writers' avatars
  top-right and a name line under each entry. Not built because: needs a data model (journal
  photos belong to a date, not to an entry).

- **`shared/together.jsx` `Checklists` — items grouped into titled cards ("Documents", "Money",
  "Bookings"), each with its own "2/3" count and "+ Add item".** Kit shows: a 3-column grid of
  group Cards per tab. We have: one kit Card per tab holding every item (sorted as before), one
  "N of M done" count and one add form below. Not built because: needs a data model (checklist
  items have no group/section field).
- **`shared/together.jsx` `Checklists` — "N of M done" on the same row as the Pre-trip / Packing
  switch.** Kit shows: the count right-aligned beside the Segmented. We have: the count
  right-aligned above the progress bar, one line lower. Not built because: product decision (the
  count is per tab and the tabs live in the Server Component page; lifting it would mean a new
  client wrapper around the tabs for one label).
- **`shared/together.jsx` `Checklists` — per-person avatar tones (teal CW, sun JM).** Kit shows:
  each assignee's avatar in their own accent. We have: the coral initials fallback (24px, as in
  the kit) for everyone. Not built because: needs a data model (no per-Traveller colour).
- **`shared/together.jsx` `Checklists` — Packing "Start from a template" chips ("+ City break",
  "+ Beach", …).** Kit shows: a dashed Card of one-tap starter templates. We have: the Templates
  bar (apply one of your saved templates from a menu, or save this list as one) restyled as a
  dashed Card, plus the AI "Draft packing list" button. Not built because: new feature (built-in
  starter templates).
- **`shared/together.jsx` `Files` — filter chips ("All" / "Tickets" / "Stays" / "Trip").** Kit
  shows: ink/white chips filtering the grid. We have: files grouped under a label per kind
  (trip-level first, then "Transport", "Accommodation", …). Not built because: new feature
  (client-side filtering).
- **`shared/together.jsx` `Files` — "offline" / "online only" chip on every file and "4 of 6
  saved for offline · 3.2 MB".** Kit shows: per-file offline-cache status and a total. We have:
  size and added date on each card; attachments are cached by the service worker when opened
  (ADR 0043) but the page doesn't read the cache. Not built because: new feature (reading
  per-file Cache Storage state into the page).
- **`shared/together.jsx` `Files` — scope sub-line naming the thing ("Transport · Fri 17",
  "Stay · Kyoto").** Kit shows: the file's parent booking/stop and its day. We have: the kind as
  the group label and the file's tile tone (coral transport, lilac stay, teal trip/stop, sun
  activity); the sub-line is size and added date. Not built because: needs a data model (the
  page fetches attachments only; naming each target needs a lookup per target type).
- **`shared/together.jsx` `Files` — "+ Add files" header button and a drag-and-drop dropzone.**
  Kit shows: a primary header button and "Drop files or tap to add". We have: the tap-to-pick
  tile (first cell of the grid), copy "Tap to add a file" because nothing handles a drop and the
  picker takes one file at a time. Not built because: new feature (drag-and-drop, multi-file
  upload).

- **`shared/together.jsx` `Compare` — plan picker row ("Real plan" vs "Plan B · Naoshima" chips
  and a dashed "+ New fork" chip).** Kit shows: one fork chosen at a time against the real plan,
  and a chip that starts a new fork. We have: every fork shown at once as its own card, in the
  saved fork order (the reorder arrows move it); forks are created from the Plan page's fork
  switcher. Not built because: new feature (a fork picker on this page, and fork creation here).
- **`shared/together.jsx` `Compare` — summary Card under the columns ("Plan B adds a night and
  ¥26k", a sentence of what changed, "Discard Plan B" / "Make Plan B real").** Kit shows: one
  written-out verdict with a discard and a promote button. We have: each fork card ends with our
  route-diff summary line ("+Zermatt · +Interlaken · Rome ?→6n") and the owner-only Promote
  button (opens the existing promote dialog); per-stat delta chips carry the numbers. Not built
  because: new feature (a generated plain-language verdict, and discarding a fork from this page).
- **`shared/together.jsx` `Compare` — stats as three compact values ("¥312k", "Legs 5").** Kit
  shows: Nights · Cost · Legs only, cost rounded to thousands. We have: eight stats (nights, trip
  cost with "shared pot", stops, transit, driving, flights, flags, projected end with its hard-end
  status) at full precision, since the page is for comparing them. Not built because: product
  decision (dropping stats we compute would lose comparison information).

- **`shared/onthego.jsx` `Globe` — All / Been / Want switch, the "been" chip on rows and the
  been / want-to-go legend.** Kit shows: an ink Segmented filtering places you've been from places
  you want to go, lilac "been" chips, and a two-dot legend under the map. We have: every Marker is
  a place you want to go; the list filters by search, country and category (kit Chips), and pins
  are coloured by category. Not built because: needs a data model (a Marker has no been/want
  state).
- **`shared/onthego.jsx` `Globe` — "23 someday" and "3 trips" stat chips.** Kit shows: lilac
  countries, coral someday and white trips counts. We have: lilac "N countries" and coral
  "N markers", both counted from the Globe's Markers. Not built because: new feature (the Globe
  page fetches no trips, and "someday" needs the been/want split above).
- **`shared/onthego.jsx` `Globe` — "+ To a trip" on each row, and the trip name as the row's
  sub-line ("Japan in Autumn").** Kit shows: a secondary button that adds the place to a trip's
  wishlist, and the trip a been-place came from. We have: a Marker is pulled into a Trip from that
  Trip's Wishlist board (Add from Globe / suggestions); the sub-line is city · category · when.
  Not built because: new feature (a trip picker on the Globe) and needs a data model (a Marker
  records no trip).
- **`shared/onthego.jsx` `Globe` — place-name labels beside every map pin.** Kit shows: each pin
  with a pill label ("Kyoto", "Lisbon"). We have: category-coloured pins (lib/map-pins.ts, owned by
  the audit-findings work) whose name shows in the popup on tap. Not built because: product
  decision (always-on labels overlap on a real, zoomable tile map; pins are out of this task's
  scope).
- **`shared/onthego.jsx` `Globe` — "+ Drop a pin" header button.** Kit shows: that copy. We
  have: "+ Add marker", because the button opens place search rather than dropping a pin, and
  CONTEXT.md reserves "pin" language (Markers are added or dropped; "Pinned" is a Stop). The map
  caption uses the kit line with our noun: "Tap the map to drop a marker". Not built because:
  product decision (copy accuracy).

## p3/admin-kit

## p3/og-default
