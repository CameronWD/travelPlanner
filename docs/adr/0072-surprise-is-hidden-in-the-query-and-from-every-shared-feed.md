# 0072 — Surprise is hidden in the query, from every shared feed, and reveals itself only once it is over

## Status
Accepted (2026-10-12)

## Context

A Surprise (CONTEXT.md **Surprise**, spec `2026-10-12-tc-12-surprise`) is a
Stop or an Item one Traveller is arranging that a chosen set of other
Travellers may see the outside of but not the inside. By the time this ADR
is written that "inside" is read by roughly thirty call sites across the
app, the Digest, Share links, the Calendar feed and the Claude connection:
the Plan, Day view, Calendar, Summary, Print, Budget, Wishlist, Files and
Activity pages, Search, the AI assistant, nav counts, three Home loaders,
Next steps, Flags, Reminders, the trip layout, the share page, the ICS
route, the digest dispatcher and the MCP reads. There was no single loader
any of them were required to use.

ADR 0051 settled the shape of Share links before Surprise existed, and its
first decision is the constraint that bites here: "viewers have no
identity — a link names an audience, not a person." A Share link, like the
Calendar feed, is a bearer token with nobody signed in behind it, so there
is no Traveller to check "is this one of the surprised" against.

The Calendar feed is one more case of the same shape: one subscription per
Trip, shared by every Traveller, that cannot tell whose calendar app is
reading it.

Whatever a Surprise hides must therefore be decided once, in one place, in
a way that a new reader cannot skip by accident, and a shared feed with no
viewer must treat "is anyone surprised by this" as its own single yes/no
rather than trying to ask "surprised to whom".

## Decision

1. **One loader hands every reader its `where` fragments, and a drift guard
   enforces it.** `lib/surprise-visibility.ts` is the only place that knows
   what a surprised Traveller's query must exclude; every reader above
   imports it rather than re-deriving the rule. `lib/surprise-guard.ts` does
   the equivalent check for Attachment bytes (a file's content is reached by
   id, not by a list query, so it is guarded at the point of fetch rather
   than filtered out of a `findMany`). `lib/surprise-readers.guard.test.ts`
   asserts, by import, that the full reader list still goes through one or
   the other — in the style of `lib/trip-shell-reads.test.ts`'s layout
   guard — and walks every trip page by name so a new page that calls
   `db.item.findMany` or `db.accommodation.findMany` directly fails the
   guard instead of silently shipping a leak.

2. **The Calendar feed and Share links hide the inside from everyone until
   reveal, rather than becoming per-Traveller.** Neither carries a viewer to
   check against (ADR 0051), so neither can answer "surprised to whom" —
   only "is this live". A live Surprise is therefore cut from both feeds in
   full, for the planner included, until it is revealed; a planner who
   wants to see their own Surprise on their calendar opens the Plan instead.

3. **Automatic reveal is the day after the end, never on the day.** A Stop
   reveals the day after its depart date, in the Stop's own timezone; an
   Item reveals the day after its day. Arriving somewhere is not the same
   as the surprise having happened, so reveal cannot land on the arrive
   date or the Item's own day — a rough Stop or an undated Item, having no
   such day, reveals only by hand.

4. **Activity rows are stamped at write time with the Surprise they were
   written inside.** Rather than re-deriving at read time whether an
   Activity row falls inside a currently-live Surprise, each row records
   which Surprise (if any) it belonged to when it was written. A reader
   filters on that stamp directly; reveal does not need to rewrite history,
   because the stamp simply stops being hidden once its Surprise is no
   longer live.

## Alternatives rejected

- **Render-time filtering.** Checking visibility in each page's own render
  path, rather than in the query, was rejected: every one of the thirty
  reads would need its own correct check, and a missed one renders the
  inside before anything can catch it. Filtering in the `where` clause
  means the row is never fetched at all.
- **Per-Traveller Calendar feeds.** One feed URL per Traveller would let the
  feed itself filter by viewer, but it multiplies a token that is already
  bearer-shaped, and ADR 0051 already settled that a link names an audience
  rather than a person; redoing that design for Surprise alone was rejected
  as a second, inconsistent sharing model.
- **Reveal on the arrive date.** The glossary's first draft tied reveal to
  the Stop's arrive date / the Item's day, on the reasoning that once you
  are there the surprise has landed. Rejected during the grill: arriving
  somewhere and the surprise having happened are different moments — a
  birthday dinner booked for the Thursday of a week-long stay should not
  reveal itself on the Monday you arrive.

## Consequences

- The planner's own Calendar feed lacks their Surprise's inside while it is
  live, even though they are never one of the surprised — the cost of the
  feed having no viewer to exempt them with.
- A new reader of Item or Accommodation rows must import
  `lib/surprise-visibility.ts` (or, for Attachment bytes,
  `lib/surprise-guard.ts`) or it fails `lib/surprise-readers.guard.test.ts`
  before it ships.
- Once revealed, a stamped Activity row shows in the feed in its place,
  alongside one new line naming who revealed it; none of the rows that were
  hidden while the Surprise was live are counted as unread on reveal, since
  nobody was ever notified of them as unread in the first place.
- The Home nudge ("Reveal the surprise in Paris?") appears on the arrive
  date, ahead of the automatic reveal the day after, so the planner who
  wants to reveal over the trip itself is prompted in time to do it by hand.
