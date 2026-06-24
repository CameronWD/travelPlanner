# Rough Stops & rough Chapters with pinning: explicit membership while sketching, date-bands once scheduled

Amends ADR 0008 (chapters as computed date-range bands). ADR 0008 stands for the
**dated** trip; this ADR covers the **sketch** phase that precedes dates.

## Context

The planning flow must support brainstorming a trip top-down before any dates
exist: sketch the legs ("France", "Italy") and drop rough places into them
("Paris ~3 nights"), reorder freely, then flow dates forward. ADR 0008 places a
Stop in a Chapter by the date band covering its **arrive date** — which cannot
work before a Stop has dates. Couples also need some dates to be **fixed** (a
booked return flight, a dated concert) while everything around them stays
flexible.

## Decision

1. **A Stop is `rough` (no `arriveDate`/`departDate`/`timezone`, carries a rough
   `nights` count) or `scheduled` (dated). A scheduled Stop may also be
   `pinned` (its dates are fixed).** One Trip freely mixes them.

2. **While rough, membership is explicit and ordered:** `Stop.chapterId` +
   `Stop.chapterSortOrder`. A Chapter may itself be `rough` (nullable
   `startDate`/`endDate`). This is a brainstorming scaffold only.

3. **Once a Stop is scheduled, dates are the source of truth** (ADR 0008): the
   read model groups dated Stops by date band and ignores their `chapterId`.
   Firming up a rough leg sets the Chapter's dates to span its now-dated Stops,
   so the band and the prior explicit grouping agree. Making a Stop rough again
   clears its dates and restores explicit membership.

4. **Firming up flows dates forward from an anchor** (Trip start, or the depart
   date of the preceding scheduled Stop) using each Stop's nights:
   `arrive = previous depart`, `depart = arrive + nights`. A **pinned** Stop is
   an immovable boundary: flexible Stops flow in the span before it; if they
   cannot fit, a **Flag** is raised rather than overwriting the pin; slack
   before a pin is left as free days.

5. **Trip dates are optional.** A Trip can be date-less; a start date, if set, is
   the default anchor. The end date is soft and auto-extends to cover scheduled
   Stops.

## Consequences

- **Small additive migration:** nullable date columns + four new Stop columns +
  a Chapter→Stop relation. Existing trips are unaffected (all Stops scheduled,
  all Chapters dated) and render exactly as before.
- **Two membership mechanisms coexist** (explicit for rough, computed for
  dated), reconciled by the "dates win once scheduled" rule. The read model
  picks per-Stop based on whether it has an arrive date.
- **Dated views (Calendar, Today, Summary, ICS, Budget) only ever show
  scheduled Stops;** rough Stops (null dates) are filtered out at the query/lib
  boundary.
- **Reversible at a price:** dropping rough support later means dropping the new
  columns; the dated-trip behaviour is unchanged by this ADR.
