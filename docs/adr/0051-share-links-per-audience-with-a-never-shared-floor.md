# 0051 — Share links per audience, with a never-shared floor

## Status
Accepted (2026-09-20)

## Context

Sharing had no ADR: one bearer-token `ShareLink` per trip, a single public
page, everything-or-nothing. The trip-ready feature needed different levels
of detail for different audiences (family vs the group chat), and a share
page that is useful *during* the trip, not only before it.

Two designs were considered for "not everyone gets every detail": one link
with content toggles (the CalendarFeed pattern), or many links, each
labelled for its audience and carrying its own scope.

## Decision

1. **Many links per trip, scoped per link.** `ShareLink` drops its `tripId`
   unique; each link carries a required `label` and three dials —
   `includeAccommodation`, `includeTransport`, `includeDailyPlans`. One link
   per audience; revoking one never touches another. A single toggled link
   cannot serve two audiences holding it at the same time — that
   requirement is inherently per-audience.

2. **A never-shared floor no dial can pierce.** Money/costs/budget, Notes,
   confirmation numbers, booking references, Journal, Checklists,
   Attachments, Wishlist and Forks are never exposed on any link. The floor
   is structural: the public page never selects those fields, and an off
   dial means the corresponding query never runs. No configuration —
   present or future — can leak a booking reference, because there is no
   code path that reads one.

3. **The public page reads the Phase.** Same engine as the Home
   (`computeTripPhase`, today in the trip's current-stop timezone): pre-trip
   shows a countdown line, Travelling leads with a today card (day number,
   local time, weather, today's plan within scope), Past shows an ended
   line. Deliberately excluded: live check-ins/status, countdown timers,
   journal sharing — the share answers "where are they and what's the
   plan", not "are they safe right now".

4. **Grandfathering.** The migration turns each existing link into a
   full-scope link labelled 'Shared link' with its token unchanged —
   holders of an old URL see exactly what they saw before.

## Consequences

- Viewers still have no identity: a link names an audience, not a person;
  anyone holding the URL sees that audience's view. Rotation remains the
  remedy for a leaked URL.
- `share.ts` now returns the unified ActionResult (closes the ADR 0027
  holdout).
- The dials gate the today card and the day-by-day identically; a section
  can never appear in one and be hidden in the other.

## Amendment (2026-09-27) — the Journal becomes a per-link dial

Beta Feedback note `cmuhvsabe` asked for the family link to show "how the
trip is going and the odd picture". Decision 3's exclusion of journal sharing
is reversed, narrowly:

- A fourth dial, **`includeJournal`**, off by default and off on every
  existing link. When on, the public page gains a "How it's going" section:
  each arrived Trip day's Journal entries, newest first, attributed by display
  name only (no profile photo, no email).
- **Journal photos only.** They are served by a link-scoped route that
  returns an Attachment only if it is a `JOURNAL` photo of that link's Trip
  and the dial is on. Every other Attachment — tickets, passport scans,
  confirmations — remains outside the floor; there is still no code path from
  a Share link to one.
- **Per-entry opt-out.** An author may mark an entry "keep off Share links";
  such an entry (note and photo) is never selected for any link.
- The rest of the floor — money, Notes, confirmation numbers, booking
  references, Checklists, Wishlist, Forks, Item photos — is unchanged.

Why a dial rather than a floor exemption: the Journal is personal prose.
"The group chat" and "Mum & Dad" warrant different answers, which is the
exact case per-audience links exist for.

## Amendment (2026-09-30) — "Show who's going" is a fifth dial, off by default

The Plan/Share handoff (2026-09-30) puts the Travellers on the Share page
hero. It is admitted as a dial, not a default:

- A fifth dial, **`showTravellers`**, **off by default and off on every
  existing link** — the same rule as `includeJournal`. A link already sitting
  in a group chat does not start showing who is on the trip until someone
  turns it on for that audience. (The handoff proposed `@default(true)`;
  rejected for that reason.)
- **When on**, the hero shows each Traveller's display name **and profile
  photo**. Email is never selected on any Share link, dial or no dial.
- **Journal attribution follows the dial.** With `showTravellers` off, a
  Journal entry is still attributed by display name only, as the 2026-09-27
  amendment says, and its avatar renders initials. With it on, the avatar may
  show the photo — that audience has already been shown the faces.

Why a dial rather than on-by-default: who is travelling is identity, not
itinerary. "Mum & Dad" and "the group chat" warrant different answers, and a
default flip would decide that for every existing audience at once.
