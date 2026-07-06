# The Globe is an account-level shared aggregate, decoupled from Trips

## Context

We're adding the **Globe** — a single, shared, cross-trip collection of
**Markers** (places/things/events the members want to visit someday), rendered as
a world map plus a list. Its whole point is to *outlive and precede* any one
Trip: you build it up over time and draw on it when planning trips.

This is the first thing in the app that is genuinely **account-level**. Until now
*everything* shared — Wishlist, Notes, Journal, Checklists, exchange rates — is
shared only because it hangs off a **Trip**, and access is governed by
`TripMember`. The Globe deliberately does *not* hang off a Trip, yet it still
needs to be shared between the two people who plan together.

The user's requirement is specific: **one** Globe that both partners belong to —
not one-per-person that gets merged, and not "everyone I've ever co-travelled
with can see my places."

Alternatives considered:

1. **Per-user private Globe.** Each user owns their own; nothing shared. Simplest
   data model (a `userId` column on `Marker`), but fails the core requirement —
   the couple wants a *shared* collection, and a private one would need a whole
   sharing feature bolted on later anyway.
2. **Derive visibility from Trip co-travellers.** No new membership: your Markers
   are visible to anyone you share a Trip with. No new invite flow, but it
   *leaks* — a third person on a single Trip would suddenly see your entire
   worldwide collection — and it makes "whose Globe am I looking at?" ambiguous.
   Sharing that isn't scoped to the thing being shared is a bug waiting to
   happen.
3. **Scope Markers to a Trip.** Contradicts the feature: the Globe must be
   trip-agnostic.

## Decision

Model the Globe as its **own aggregate with its own membership**, structurally
parallel to `Trip` / `TripMember`:

- **`Globe`** — the shared aggregate. **`GlobeMember`** — `(globeId, userId,
  role)`, mirroring `TripMember`. **`Marker`** belongs to a `Globe`, not to a
  user and not to a Trip.
- **One shared Globe, both members on it — never one-per-person.** A user is a
  member of **at most one** Globe, so there is never a "which Globe?" choice
  anywhere in the UI or the code.
- **Born once, then joined.** The first member to open `/globe` lazily creates
  the Globe and becomes its owner. The partner is brought on by the **same
  email-match Invite flow as Trips** (ADR 0017): an emailed invite becomes
  membership the next time that person is signed in, reconciled on app-load.
  We extend the existing `acceptPendingInvitesForUser` reconciliation to also
  accept pending **Globe** invites — one hook, both aggregates.
- Access to a Globe and its Markers is gated by `GlobeMember`, exactly as Trip
  data is gated by `TripMember`.

We keep the Globe **decoupled from Trips**. A later step will let a Trip *copy*
Markers into its Wishlist and auto-surface overlapping Markers, but that is a
one-way, opt-in link built on top — it does not make the Globe part of any Trip.

## Consequences

- **A schema migration adds three tables/relations** (`Globe`, `GlobeMember`,
  and a Globe-scoped `Invite` path) plus a `Marker` model. This is the first
  account-level aggregate; future account-level features have a pattern to copy.
- **Two membership systems now exist** (`TripMember`, `GlobeMember`). That's the
  "why is there a *second* one?" a future reader will hit — this ADR is the
  answer: the Globe is shared but is not a Trip, so it needs its own gate.
- **Reusing the ADR 0017 invite flow** means no new delivery mechanism (still no
  links/emails sent) and consistent behaviour, at the cost of the same
  constraint: membership only materialises once the invitee signs in under a
  matching email.
- **The "at most one Globe per user" rule** keeps every query and screen free of
  a globe-selector. If multi-globe membership is ever needed, it is an additive
  change (drop the constraint, add a switcher) — not a rewrite.
- **Deferred edge: merging two already-populated Globes.** If both partners
  create a Globe before either invites the other, accepting the invite must
  consolidate them onto one. We build the happy path (invite before both pin) and
  treat the merge as a rare, later concern rather than blocking v1 on it.
