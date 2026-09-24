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
- **`teepee-desktop/DLanding.jsx`, `teepee-mobile/Landing.jsx` — marketing landing.** We have: `/`
  redirects. Not built because: new feature.
- **`teepee-mobile/Onboarding.jsx` / desktop onboarding.** We have: none. New feature.
- **`teepee-mobile/Invite.jsx` — invite flow with access levels.** We have: auto-accept on sign-in
  (ADR 0017). New feature / product decision.
- **`DShared.jsx`, `Shared.jsx` — "Your people" with a join link.** We have: none. New feature.
- **`shared/admin.jsx` `More` — mobile "More" hub.** We have: the phase 2 dock. New feature.
- **`teepee-tablet/`** — tablet layout. We have: responsive breakpoints only. Product decision.
- **`docs/notifications.md` — batching, email channels, "Mark paid" and "Time to leave" pushes.**
  We have: the digest push only. New feature.
- **Wide-screen layout** — kit is drawn at 1280×800 (incl. a 340px aside column). We cap content
  at `max-w-7xl`. Using extra width is a design decision the kit doesn't make.

## p3/boundaries

## p3/core

## p3/together

## p3/admin-kit

## p3/og-default
