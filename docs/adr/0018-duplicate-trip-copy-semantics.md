# Duplicate Trip: copy the skeleton, reset dates, copy co-travellers

When a Traveller **Duplicates** a Trip we copy the reusable *structure* — Stops (carried as **rough**), Chapters, Wishlist/Items (as unscheduled), Checklist item text, and Transport **connections stripped of times/reference/cost** — and **reset every date**, while deliberately **dropping** all booking-and-money detail (Accommodations, all Costs/Other costs, Exchange rates) and all trip-specific history (Notes, Votes, Attachments, Reminders, Journal, Activity, Share link, Calendar feed, cover image). The new Trip is fully independent of its source.

## Why this shape

The use case is "seed *next* year's trip from a proven skeleton," so anything date-, money-, or booking-specific is stale and would mislead. What's worth reusing is the route shape — which Stops, in what order, connected by what mode of Transport — plus the Wishlist research and packing/pre-trip lists.

## The surprising one: members are copied

Duplicating **copies the co-Traveller memberships**, granting them access to the new Trip, rather than leaving the duplicator as sole owner. Rationale: this is a two-person app where the same couple reuses skeletons trip after trip, so re-inviting every time is pure friction; the confirm dialog tells the duplicator that their co-travellers will be added. The alternative (sole owner, re-invite each time) was rejected as needless friction for the only realistic user shape. A future reader will reasonably wonder why a "copy" grants others access — this is why.

## Out of scope

**Fork** — a *dated* what-if variant kept alongside the original and compared before one is chosen — is a separate, not-yet-built concept, deliberately not addressed here. Duplicate always throws dates away; Fork would keep them.
