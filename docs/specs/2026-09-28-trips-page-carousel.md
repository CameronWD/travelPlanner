# Trips page rework — carousel, first run, generated covers

**Source of truth for pixels, copy and layout:** `design_handoff/trips-page-carousel-handoff/`
(`README.md`, `TRIPS_PAGE.md`, `TRIP_COVER.md`, `images/`). This spec records what the
handoff leaves open, where it disagrees with the codebase, and the decisions taken in the
grilling session on 2026-09-28. Where this file and the handoff differ, **this file wins**.

Feedback notes this closes (commit trailers, not `feedback:resolve`, until deployed — ADR 0040):
- `cmukh7ef0000104k226oa1o9g` — trips page cards should look like the Home polaroid cover.
- `cmukh8804000204k2cz7l1778` — card ellipsis only offers Duplicate.

---

## 0. Decisions (from the interview)

| # | Question | Decision |
|---|---|---|
| D1 | "+ Past trip" needs a trip to land in Done. No flag exists. | **Dates only, no flag.** `/trips/new?past=1` makes dates required and changes copy; the trip is Past because its dates are past. Glossary: Phase. |
| D2 | Pins, chips, stamp ink and the last route dot need a stable per-trip colour. | **Derive from creation order.** Walk the viewer's trips by `createdAt` and hand out the 8-hue chapter ramp in turn, coral first. No schema change. Glossary: Trip colour. |
| D3 | Handoff scopes the new covers to `/trips`; glossary says the cover applies everywhere. | **Replace the old fallbacks everywhere.** Route sketch → passport stamp are THE fallbacks. The full route render and monogram are deleted. Glossary: Trip cover image. |
| D4 | Mobile mock shows a Trips / Globe / You tab bar on trips-level pages; today phones get a top bar. | **Add the tab bar, drop the top bar on trips-level phone pages** (`/trips`, `/trips/new`, `/globe`, `/account`, `/help`, `/whats-new`, `/admin`). Inside a trip nothing changes. Search and the theme toggle move to the You (account) page on phones. |
| D5 | Card kebab only offers Duplicate. | **Drop it.** Each card is one link. Duplicate/settings/leave/delete stay reachable from the trip. Resolves `cmukh8804`. |
| D6 | "Main leg" clashes with the glossary's avoid-list for "leg". | **"Main cluster" / "off-frame stops."** Card labels Idea / Planning / Up next / On the road / Done are names for Phases on this page. Glossary: Main cluster, Phase. |

## 1. Decisions taken by the implementer (play-back items)

- **P1 "Back to" switcher.** The most recently opened trip is remembered in a cookie
  (`teepee-last-trip`) written by a server action that the trip layout fires from a small client
  effect on mount, only when the id differs from the one already stored. The trips-level sidebar
  reads the cookie server-side; if it is missing or the trip is no longer one of the user's
  memberships, fall back to the first trip in trips-list order (the Up-next trip). No DB write.
  `proxy.ts` is not widened (its matcher scope is deliberate).
- **P2 Clustering.** Reuse `clusterStops` (single-linkage, 1500 km) from `lib/geo-cluster.ts` for
  grouping; add `pickMainCluster(stops)` beside it that applies the handoff's selection rule
  (most nights, then most stops, then earliest) and returns `{ main, offFrame }`. The Home route
  map keeps its current largest-by-count pick; switching it to most-nights is a follow-up, not
  part of this build. Home base is excluded before clustering.
- **P3 Countdown on the hero.** Same parts as the Home countdown tile: sleeps → `n` / "sleeps /
  to go"; Travelling → `n` / "of {m} / days" with the pill reading ON THE ROAD and the date line
  `Day n of m · {current stop}`; day of departure → "Today". Sleeps use the trip's own today
  (`tripTodayISO`), exactly as Home does.
- **P4 First-run `createTrip(name)`.** A thin Server Action in `app/(app)/trips/actions.ts` that
  calls the existing `createTrip` with `homeCurrency: DEFAULT_HOME_CURRENCY` and no dates, then
  redirects to `/trips/{id}`. It does not fork the create logic.
- **P5 Tokens.** Code uses the repo's existing token names (`bg-canvas`, `border-border-soft`,
  `shadow-hard-*`, `bg-coral`, `bg-sun`, `text-muted-foreground`, `--on-accent-muted`). New
  tokens added to `app/globals.css`: `--status-neutral` (#E4DFD4 light), `--map-fill` (#EAF3F2
  light; a dark counterpart in the same family as the map palette), and `--hue-{name}-ink` for
  every hue in the ramp (dark shade passing 4.5:1 on paper; coral `#B8391D`, teal `#2E8A88`).
  Hex only in `globals.css` and `lib/map-palette.ts`.
- **P6 Map tiles.** Keep the existing CARTO tiles and theme handling; the card ground behind the
  tiles is `--map-fill`. Attribution is drawn manually ("© OpenStreetMap · CARTO") with Leaflet's
  control off, as the Home route map already does.
- **P7 768–1279 (Dock band).** Use the desktop layout but let the page scroll (no `h-dvh` lock,
  no `overflow-hidden`); arrows and dots behave as on desktop. The one-screen, no-scroll frame
  applies only at ≥1280 and ≥820px tall.
- **P8 Tally figures** come straight from `computeTravelStats`: places, nights away
  (`nightsAway`), km (`distanceKm`), nights booked (`accommodationNights`), flights and trains
  (`transport.FLIGHT/TRAIN`), countries. Planned = `.planned`, Been = `.done`. The fun-facts list
  and the eight tiles are removed.
- **P9 Removed code.** The old trips-list `TripCard`, `AnimatedList` grid, dashed "Start a new
  trip" card, `EmptyState`, "Your travels ↓" link, `YourTravels`, `TravelStatsTiles`, the fun
  facts, `RouteRender`/`MonogramCover`, and `lib/route-render.ts` go, with their tests. `WhatsNewBanner`
  stays on the page (below the header). `TripCoverCard` stays for Home.
- **P10 Old `TripCover` callers** (phone Home cover band and tile) switch to the new `TripCover`
  in a non-polaroid "band" fit: the sketch/stamp draws into whatever box the caller gives it.

---

## 2. Build order (handoff README, kept)

1. **Shell tweaks** (`TRIPS_PAGE.md` §1 + D4): trips-level sidebar, trip-switcher "Back to"
   card (P1), Trips row count, hide switcher at 0 trips, phone tab bar + top-bar removal, account
   page search + theme rows on phones.
2. **Trip cover system** (`TRIP_COVER.md` + D2, D3, D6, P2, P5): `trip-cover.tsx` (photo →
   sketch → stamp, polaroid frame sizes hero / small / mobile-hero, hover "Add photo / Change"
   opening the existing `CoverUploaderDialog`), `cover-route-sketch.tsx`, `cover-stamp.tsx`,
   `lib/trips/route-sketch.ts` (`pickMainCluster`, `projectToBox`, dot sampling ≤14, same-city
   → null), `lib/trips/trip-colour.ts`.
3. **Trips page, desktop** (`TRIPS_PAGE.md` §2–6): page, header, carousel (client), hero card,
   standard card, travels map (client), tally (client toggle, `teepee:tally-mode` in
   localStorage, container query for 4 vs 6 cells), `lib/trips/trip-status.ts` (card label, sort,
   countdown), `lib/trips/tally.ts`.
4. **First run, desktop** (§7 + D1, P4): first-trip card, past-trip card, empty map hint,
   dashed empty tally; "in between" rule (ideas only, no stops → populated layout, dashed tally).
5. **Mobile, both states** (§8 + D4).
6. **Loading, errors, a11y** (§9–10): new `loading.tsx` skeletons, map ErrorPanel in-card,
   tally hidden on stats failure with the map spanning 12 columns, stretched-link cards with the
   next-step chip as a sibling link, focus rings, `aria-hidden` covers.
7. **Past-trip flow** (D1): `/trips/new?past=1` — title "Log a past trip", dates required
   ("When did you go?"), submit copy "Add trip"; the trips page "+ Past trip" button and the
   mobile row link to it.

Every task ships with tests in the repo's colocated vitest style; the pure helpers in
`lib/trips/` are unit-tested against fixed `today` values.

---

## 3. Acceptance

- At 1440×900 with 4 trips the page shows header, one carousel row with peek, dots, map and
  tally with no page scroll; at 1440×800 the page scrolls and the travels row is ≥360px.
- With 0 trips: "Welcome to teepee, {first name}", "Nothing planned yet", first-trip card
  (Enter submits, disabled until a trimmed name exists, "Starting…" pending, inline error),
  past-trip card, world map with hint, dashed tally, no arrows, no "+ New trip", no switcher in
  the sidebar.
- Typing a name and pressing Start planning lands on that trip's Home in its no-stops state.
- A trip with a photo shows it; removing the photo shows the route sketch when the main cluster
  has ≥2 stops, otherwise the stamp; a same-city trip shows the stamp.
- Christmas in Europe fixture (Sydney home → Bali 4n → London … Rome 31n): the sketch draws
  Europe, the chip reads "+ Bali", the caption reads "London → Rome".
- Map pins and legend chips share each trip's colour; done trips are full opacity; no leg is
  drawn from the home base; "All trips" plus at most 3 trip chips then "+N" with a popover.
- Tally defaults to Been if any trip is Past, else Planned; the choice persists; zero-valued
  stats are dropped; "0 countries" never renders.
- Phone (<768) trips-level pages show the Trips / Globe / You tab bar and no top bar; inside a
  trip the chrome is unchanged; the account page offers search and the theme toggle on phones.
- The card menu is gone; every card is a single link with an accessible name of
  `{name}, {status}, {countdown}`.
- `npm test`, `npm run lint` and `npx tsc --noEmit` pass.

---

## Built (2026-09-28)

- Tab bar height keeps the shared `--tp-tab-bar-h` (76px + safe area) rather than the handoff's 88px, so phone chrome is one height inside and outside a trip.
- The Home route map keeps its largest-cluster pick (P2); the cover's most-nights pick lives in `lib/trips/route-sketch.ts`.
- The hero polaroid is one responsive frame (`mobile-hero` look below `md`, `hero` from `md`) rather than two separately-mounted instances.
- The travels map mounts one variant chosen by a `matchMedia` gate, rather than rendering both and hiding one with CSS.
- Tally segments with 0 countries are disabled, and the headline shows "—" when both sides are 0.
- The Trips-row count shows only on trips-level pages, not inside a trip.
- The hero's next-step chip includes Reminders, matching the Home tile's chip set.
- `pinHtml` gained a `shadow` option.
- Sign-out on the phone account page is a plain button, not a one-item dropdown menu.
- On touch devices the trips-page covers carry no Add-photo pill; the trip Home's own Add-photo / Change controls are the affordance there.
