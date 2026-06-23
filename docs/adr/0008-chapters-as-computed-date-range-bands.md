# Chapters as computed date-range bands, not stored Stop membership

Chapters group a long Trip into named, coloured legs ("the Italy chapter") so the
Itinerary, Budget and Summary can roll up per chunk of the journey (see CONTEXT.md).
The first real trip is Brisbane → Finland → UK → Ireland → France → Italy → Brisbane
over five weeks, where a flat list of ~15 Stops reads as one undifferentiated scroll.

Two model choices were open:

1. **How is membership stored?** A `chapterId` foreign key on each Stop (explicit,
   queryable) versus computing membership from dates (nothing to keep in sync).
2. **Where does cross-chapter travel cost land?** Absorbed into an adjacent chapter
   (subtotals tie to the grand total on their own) versus surfaced separately.

The trip is round-trip from home, so the outbound and return flights have a `null`
Stop endpoint (home is not a Stop — `Transport.fromStopId` / `toStopId` are already
nullable), and the international hops between countries are the largest line items.
Any rule that forces every flight into a chapter either inflates a chapter with a
flight that is really "getting home" or has nowhere to put a bookend flight.

## Decision

1. **A Chapter is a named, coloured date range and nothing more.** The only schema
   change is a new `Chapter` table (`tripId`, `name`, `colour`, `startDate`,
   `endDate`). `Stop`, `Transport` and `Cost` are unchanged.

2. **Membership is computed from dates at read time.** A Stop, Transport or cost
   belongs to the Chapter whose `[startDate, endDate]` covers it; a Stop is placed by
   its **arrive date** (the band it starts in) when its dates straddle a boundary.
   Chapters **cannot overlap**; any date under no Chapter is **Ungrouped**. No
   membership id is persisted anywhere.

3. **Cross-chapter and home-bookend Transport is "between-legs travel."** A Transport
   whose departure and arrival fall in different Chapters — or to/from home, outside
   every Chapter — is not part of any Chapter's total. It renders on the seam between
   Chapters in the Itinerary and as its own line in the Budget. The by-Chapter Budget
   therefore reconciles as: Σ(chapter subtotals) + Ungrouped + Between-legs +
   Other-costs = grand total.

4. **Chapters are optional and additive.** A Trip with no Chapters renders exactly as
   today (flat list, everything Ungrouped). Auto-suggest-from-country only fills
   currently-Ungrouped spans, never overwriting hand-made Chapters.

## Consequences

- **Zero migration.** Adding the feature is one new table; every existing Trip is
  unaffected and renders unchanged. No backfill.
- **Nothing to keep in sync.** Editing a Stop's dates, dragging a band, or adding a
  Stop re-groups everything automatically. Deleting a Chapter just drops the band —
  its span becomes a gap (Ungrouped); Stops never silently merge into a neighbour.
- **Honest per-chapter totals.** A chapter row is "what we spent *in* that leg," with
  the expensive international hops visible on their own "Between legs" line rather than
  buried inside a country.
- **The cost:** membership is recomputed per render via a date-overlap pass wherever
  Chapters roll up, and is not directly queryable by foreign key. Fine at trip scale
  (tens of Stops); it would not suit thousands.
- **Reversible only at a price.** Moving to stored membership later means a migration,
  a backfill from dates, and rewriting the roll-ups. Computed membership was chosen
  deliberately for its lightness — Chapters are a presentation grouping, not a new
  spine in the domain.
