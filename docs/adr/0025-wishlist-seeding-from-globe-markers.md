# Wishlist seeding from Globe Markers — copy + provenance, overlap on countryCode, proximity ranking

## Context

The **Globe** (ADR 0023) is a shared, cross-trip collection of **Markers**. The
trip-scoped **Wishlist** is a pool of unscheduled **Items**. From the start these
were kept as separate pools with a deliberately-deferred link: "a Trip may later
be seeded from Globe Markers." This ADR builds that link.

Two capabilities, one underlying copy action:

- **(A) Manual pull.** From a Trip's Wishlist board, a member browses their Globe
  and copies chosen Markers into this Trip's Wishlist.
- **(B) Auto-surface.** The Wishlist board proactively suggests Markers that
  "overlap where the Trip is going."

Three decisions carry real trade-offs and are costly to reverse (schema shape +
a matching contract), so they're recorded here.

### Forces

- A `Marker` and a Wishlist `Item` are different types in different aggregates. A
  Marker is Globe-level and trip-agnostic; an Item belongs to a Trip. They share
  the same **Category** value set, which makes the field mapping clean.
- "Where the Trip is going" is expressed by its **Stops**. A `Stop` today carries
  `country` (display name) + `lat/lng` but **no `countryCode`**. A `Marker`
  carries `country`, `countryCode`, `city`, `lat/lng`.
- Matching on display-name strings is fragile: geocoder variance ("Japan" vs
  "日本", "USA" vs "United States") silently breaks equality.
- The app already models "place a copy, keep the source" for plan placements via
  `Item.sourceItemId` with `onDelete: SetNull` (ADR 0019). Reusing that shape
  keeps the mental model consistent.

## Decision

### 1. Seeding is a one-time copy, with provenance

Pulling a Marker into a Wishlist **creates a new unscheduled Item** (a copy). The
Marker stays on the Globe. Field mapping:

| Item field                | ← Marker                                        |
| ------------------------- | ----------------------------------------------- |
| `title`                   | `title`                                         |
| `category`                | `category` (same value set — direct)            |
| `lat` / `lng`             | `lat` / `lng`                                   |
| `address`                 | `city` + `country` joined (e.g. "Kyoto, Japan") |
| `link`                    | `link`                                          |
| `notes`                   | `note`, with `timing` folded in when present    |
| `date`,`stopId`,`forkId`  | null (unscheduled Wishlist idea)                |

The copy is **thereafter independent** of its source Marker — editing the Marker
does not propagate, and vice versa (consistent with ADR 0018/0019 copy
semantics). We add a **nullable `Item.sourceMarkerId`** (relation to `Marker`,
`onDelete: SetNull`) purely to answer *"is this Marker already in this Trip's
Wishlist?"* — it powers dedupe UX and (B)'s filtering, not live syncing.

Provenance lifecycle:

- A Marker shows as **"✓ added"** iff an **unscheduled** Wishlist Item in this
  Trip has `sourceMarkerId == marker.id`.
- Deleting that Wishlist Item makes the Marker **addable again** (no surviving
  Item points to it).
- **Scheduling** the copy (giving it a date) makes the Marker **re-addable** — a
  scheduled Item has conceptually left the Wishlist pool, so it no longer counts
  as "added."
- Deleting the source Marker leaves the copied Item intact; its `sourceMarkerId`
  is set null.

Seeding logs the **same** Activity event as any manual Wishlist add — the feed
cares what changed in the Trip, not the input method.

### 2. Overlap matches on `countryCode`, so a Stop must carry one

(B) surfaces a Marker iff its `countryCode` matches the `countryCode` of any of
the Trip's Stops. To make this reliable we **add a nullable `countryCode` to
`Stop`**, derived via the existing geocode path (ADR 0011), rather than
string-matching display names.

The feature keys off **the viewing user's own Globe** (a user is in at most one).
It surfaces nothing when the viewer is in no Globe, the Globe is empty, nothing
matches, or the Trip has no located Stops — so two members of the same Trip may
see different surfaces. No new permission concept: copied Items are ordinary
shared Wishlist Items.

### 3. Country decides inclusion; proximity only ranks

Country match is the **primary and only inclusion rule**. Proximity to a Stop's
coordinates is a **secondary signal that orders** the matched set (nearest first);
it never adds or removes a Marker. Markers without coordinates still surface and
sort last. The suggestions strip caps at the top **5** proximity-ranked matches,
with overflow spilling into the full "Add from Globe" dialog.

## Consequences

- **Good:** stable country matching immune to geocoder name variance; a single
  copy action shared by (A) and (B); provenance enables clean dedupe and
  suggestion filtering without live-sync complexity; reuses the established
  copy-with-`SetNull`-provenance pattern.
- **Cost:** two nullable schema columns (`Item.sourceMarkerId`, `Stop.countryCode`)
  and a Stop backfill for existing rows (geocode-derived; nulls simply don't match
  until re-derived). Country-primary matching won't surface a marker just across a
  border from a Stop — accepted; proximity-*inclusion* was explicitly deferred.
- **Deferred:** surfacing Globe Markers near a Trip's *existing Wishlist items*
  (not only its Stops) — a proximity-inclusion refinement, not built here.
