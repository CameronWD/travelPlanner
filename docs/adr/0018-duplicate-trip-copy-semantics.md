# Duplicate Trip: copy the skeleton, reset dates, copy co-travellers

When a Traveller **Duplicates** a Trip we copy the reusable *structure* — Stops (carried as **rough**), Chapters, Wishlist/Items (as unscheduled), Checklist item text, and Transport **connections stripped of times/reference/cost** — and **reset every date**, while deliberately **dropping** all booking-and-money detail (Accommodations, all Costs/Other costs, Exchange rates) and all trip-specific history (Notes, Votes, Attachments, Reminders, Journal, Activity, Share link, Calendar feed, cover image). The new Trip is fully independent of its source.

## Why this shape

The use case is "seed *next* year's trip from a proven skeleton," so anything date-, money-, or booking-specific is stale and would mislead. What's worth reusing is the route shape — which Stops, in what order, connected by what mode of Transport — plus the Wishlist research and packing/pre-trip lists.

## The surprising one: members are copied

Duplicating **copies the co-Traveller memberships**, granting them access to the new Trip, rather than leaving the duplicator as sole owner. Rationale: this is a two-person app where the same couple reuses skeletons trip after trip, so re-inviting every time is pure friction; the confirm dialog tells the duplicator that their co-travellers will be added. The alternative (sole owner, re-invite each time) was rejected as needless friction for the only realistic user shape. A future reader will reasonably wonder why a "copy" grants others access — this is why.

## Out of scope

**Fork** — a *dated* what-if variant kept alongside the original and compared before one is chosen — is a separate, not-yet-built concept, deliberately not addressed here. Duplicate always throws dates away; Fork would keep them.

## Amendment — 2026-09-23 (`feat/rollout-gate`, `ARCH-ADR-1`)

**Co-Travellers are now carried as pending Invites, not as memberships.** The
section above titled *"The surprising one: members are copied"* describes the
behaviour as it was until this branch; it is kept as written because it
records why the original choice was made, but **its claim that duplication
copies memberships is no longer true of the code.**

`duplicateTrip` now creates a `TripMember` row for the duplicator alone.
Every other Traveller on the source Trip gets a pending `Invite` on the new
Trip instead, carrying their source role, stamped with the same 30-day
`expiresAt` as any other Invite, created inside the same transaction as the
Trip. A co-Traveller whose email cannot be resolved is skipped entirely — no
Invite and no membership. The confirm dialog and the help guide say
"invited", not "added".

The finding (`ARCH-ADR-1`) was that a copy silently re-granted access with no
per-Traveller consent. That was defensible when the only realistic shape was
one couple reusing a skeleton; it is not defensible once Travellers are
independent, because duplicating a Trip someone else is on would re-grant
them access to a Trip they have never seen and cannot decline. An Invite is
the shape that already models "you may join if you want to" — it becomes
membership by email match on their next sign-in (ADR 0017), which for the
couple case is indistinguishable from the old behaviour, and for everyone
else is a grant they participate in.

**This ADR's dependency is now tracked, not latent:** the *"copied as-is"*
framing above must be read as history. Anyone changing duplication semantics
should update this ADR rather than the amendment.
