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

## p3/together

## p3/admin-kit

## p3/og-default
