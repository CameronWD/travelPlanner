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

## p3/together

## p3/admin-kit

## p3/og-default
