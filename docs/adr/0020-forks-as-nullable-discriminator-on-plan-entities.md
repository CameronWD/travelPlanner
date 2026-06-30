# Forks stored as a nullable `forkId` discriminator on Plan entities

A **Fork** is a variant **Plan** over six entities that currently hang directly off `tripId`: Stop, Chapter, Transport, Accommodation, Item, Cost. We considered three storage shapes and chose a **nullable `forkId` discriminator**: a small `Fork` table (id, tripId, name, createdAt, author) plus a nullable `forkId` column on those six entities, where **`forkId = null` *is* the real plan**.

## Considered Options

- **Shadow Trip** (a Fork is a hidden Trip row) — rejected: a Trip implies its own membership, Wishlist, share link, calendar feed and other trip-wide things, which fights the rule that those are *shared* across a Trip's Plans, not forked.
- **Mandatory `planId` FK** (re-parent the six entities from `tripId` to a new `Plan`) — clean, but forces a data migration of every existing Trip and touches every query.
- **Nullable `forkId` discriminator** — chosen.

## Consequences

- **Zero data migration**: every existing row already represents the real plan (`forkId` null). Live-plan reads gain a `forkId IS NULL` filter; Fork views load by `forkId`.
- **Promote** = delete the real plan's rows for those entities, re-tag the chosen Fork's rows to `forkId = null`, delete the remaining Forks' rows.
- Trip-wide tables (Wishlist/unscheduled Items, ExchangeRate, Note, Vote, ChecklistItem, Attachment, JournalEntry, ShareLink, CalendarFeed, Activity) are never tagged and so are shared by all Plans for free.
- Every query over the six Plan entities must be audited to scope by `forkId` correctly — the main ongoing cost of this approach.
