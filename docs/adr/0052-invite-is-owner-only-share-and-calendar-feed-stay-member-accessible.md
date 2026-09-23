# 0052 — Invite is owner-only; Share links and the Calendar feed stay member-accessible

## Status
Accepted (2026-09-21)

## Context

`SW-05` (raised during the final whole-branch review that produced
`docs/open-follow-ups.md`) found three server actions gated on
`requireTripAccess` alone — a membership check, not a role check:
`inviteToTrip` (`server/actions/invites.ts:40`), `createShareLink`
(`server/actions/share.ts:97`) and `createCalendarFeed`
(`server/actions/calendar-feed.ts:59`). Each extends who or what can reach a
Trip's data beyond its current membership, and none required anything more
than plain membership to do it.

This was not the same shape as the `duplicateTrip` P0 it sits next to
(`HG-12`, struck): `duplicateTrip` let a co-traveller mint themselves a
fully-owned copy of a trip while the settings UI already restricted
duplication to owner/admin — server and UI disagreed, and the server lost.
Here they agree. `app/(app)/trips/[tripId]/settings/page.tsx` computes
`canManageTrip` (owner-or-admin) at line 36 and uses it only for the Danger
zone at line 221; the Invite, Share-link and Calendar-feed controls render
for every member, exactly matching what the server allowed. So this was the
design working as built, not an unenforced gate — which is why it was raised
as an open question rather than fixed alongside the P0.

ADR 0051 already drew a careful line for **Share links**: a **never-shared
floor** no dial can pierce — money, Notes, confirmation numbers, booking
references, Journal, Checklists, Attachments, Wishlist and Forks are
structurally unreachable on any link, because the public page never selects
those fields and an off dial means the query never runs. That ADR was
precise about what a *link* may expose.

But an **Invite** grants full Traveller membership, and a new member sees
*everything* the floor was built to keep off a link — every cost figure,
every booking reference, the Journal, all of it. So the app had been careful
about what a link reveals and silent about who may hand out membership
itself: the floor guarded the front door while the side door — who gets to
let someone in at all — stood open. An Invite is also **transitive** in a way
neither a Share link nor a Calendar feed is: the person a member adds can, on
the old behaviour, add someone else in turn, with no owner ever in the loop.

A Share link, by contrast, is bounded by ADR 0051's floor no matter who
creates it, and a Calendar feed exposes only schedule (Transport,
Accommodation dates, scheduled Items) — never cost, Notes, or any of the
floor's contents. A member handing out either leaks far less than a member
handing out full membership. That asymmetry — Invite grants unbounded,
transitive access; Share link and Calendar feed grant bounded, non-membership
access — is why the three split rather than moving together.

## Decision

1. **`inviteToTrip` becomes owner-or-admin.** It gains the same guard shape
   as `deleteTrip` (`server/actions/trips.ts:258`, ADR 0045): after
   `requireTripAccess` resolves `{ user, membership }`, refuse unless
   `membership.role === "owner"` or `isAdminEmail(user.email)`. Admin bypass
   applies for the same reason it does on Delete and Duplicate — the operator
   listed in `ADMIN_EMAILS` gets no exemption from membership
   (`requireTripAccess` still `notFound()`s a non-member), only from the
   ownership check, consistent with ADR 0045.

2. **`createShareLink` and `createCalendarFeed` deliberately stay open to
   any member.** This is not an oversight left for later — it is the point
   of this ADR. A future reader must not "fix" these for consistency with
   Invite: they are unlike Invite precisely because of the asymmetry above.
   Both remain gated on `requireTripAccess` alone.

3. **Nothing is retroactive.** Existing Trip memberships stand exactly as
   they are — nobody is demoted or removed. Any Invite already pending
   (created by a non-owner under the old behaviour) stands and still
   resolves to membership on matching sign-in; this decision only changes
   who may create a *new* Invite from this point forward.

## Consequences

- A co-traveller can no longer bring someone onto a Trip without the owner
  (or an admin) doing it, or at least approving it by being the one who acts.
  The transitive-invite chain — a member invites someone who invites someone
  else — is closed at the first link.
- The member-accessible route for letting an outsider *see* a Trip without
  granting membership is now, unambiguously, a Share link — which is exactly
  what ADR 0051 built: a bounded, revocable, per-audience view with a floor
  nothing can pierce. A member who wants to show the Trip to someone they
  are not ready to add as a Traveller reaches for that, not an Invite.
- The Invite and Danger-zone controls now require the same UI gate: the
  settings page's existing `canManageTrip` (owner-or-admin) must cover the
  Invite panel too, so a non-owner is never shown a control the server will
  now refuse. Server and UI already agreed before this change; the risk this
  guards against is UI and server drifting apart *after* it, the same way
  they drifted for `duplicateTrip`.
- This is a deliberate behaviour change, not the closing of an unenforced
  gate — worth stating plainly, since the equivalent P0 (`duplicateTrip`)
  really was the latter. A Traveller who relied on inviting a partner
  themselves loses that ability unless they are the owner or an admin.

## Amendment — 2026-09-23 (`feat/rollout-gate`, `ARCH-TEN-7` and `ARCH-DAT-1`)

**1. The Calendar feed now actually carries ADR 0051's never-shared floor.**

The Context above justifies the feed's member-accessible gate on the belief
that "a Calendar feed exposes only schedule (Transport, Accommodation dates,
scheduled Items) — never cost, Notes, or any of the floor's contents".
`ARCH-TEN-7` found that **that belief was false of the code**: the feed's
route selected `Item.booking`, `Item.notes`, `Accommodation.confirmation` and
`Accommodation.notes` into the event DESCRIPTION, and `Transport.reference` —
a booking reference — into the event **SUMMARY**, where it reaches calendar
previews, notifications and lock screens. A bearer-token URL with no identity
was handing out exactly what ADR 0051 built a structural floor to keep off a
Share link.

All five fields are now removed from the feed — from the route's `select`
blocks, from the `Ics*` types, and from the SUMMARY builder in `lib/ics.ts`,
which is the real serialiser. Addresses, place names and route endpoints are
kept: they are schedule, and a calendar event without a location is not much
of a calendar event.

**The reasoning in the Context above is therefore now sound rather than
merely stated.** The asymmetry it rests on — Invite grants unbounded
transitive access; a Share link and a Calendar feed grant bounded,
non-membership access — is what actually holds in the code. Decision 2
(`createShareLink` and `createCalendarFeed` stay open to any member) is
unchanged and is now on firmer ground than when it was written.

**2. Whole-branch destruction is owner-only.**

`ARCH-DAT-1`'s other half was that every member held irreversible delete
power over everything. Two actions that destroy a whole branch of a Trip's
content now take the same owner-or-admin gate as Delete, Duplicate and
Invite:

- **`deleteStop`** — a Stop takes its Accommodations, their confirmation
  numbers and its unpaid Costs with it.
- **`promoteFork`** — promoting discards the outgoing real plan and every
  other Fork.

Everything else on a Trip remains open to any Traveller on it, which is still
the rule this ADR's Consequences describe. The line drawn is *destroying a
branch of the Trip*, not *editing the Trip*. A Trip member can also now be
removed (`removeTripMember`) or leave (`leaveTrip`), which the original
membership model had no path for at all — note that neither revokes
deployment-level sign-in, which is ADR 0057's allowlist, not this one's.
