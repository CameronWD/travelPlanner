# Hard end date is a separate advisory constraint, not a cap on the soft end date

A Trip's `endDate` is *soft*: it auto-extends to cover scheduled Stops and never shrinks, so by construction it can never be "exceeded". To let a Traveller plan against a real deadline (a return flight, the day back at work) we add a **Hard end date** as a second, optional `Trip.hardEndDate` field rather than making `endDate` itself hard. The app compares the Trip's **projected end** — every Stop's nights flowed forward from the anchor (rough Stops included) via the existing `flowDates` engine, without saving — against the Hard end date, and raises a **Flag** (`info` when within a couple of nights, `warning` when past it) that surfaces in the Summary, Next steps, and inline on the Plan overview.

## Considered Options

- **One field, two modes** (a hand-set `endDate` becomes a fixed cap that stops auto-extending). Rejected: it overloads a single field with two opposite behaviours, and loses the ability to show *both* the computed end and the deadline side by side.
- **A hard cap that blocks planning past the date** (constrain firm-up / the date pickers). Rejected: planning past your deadline and *then* being told is the whole point — the signal is advisory, so it is a Flag, never a constraint.

## Consequences

- Two end-date concepts now coexist: the **soft end date** (computed, scheduled Stops only) and the **projected end** (computed, all Stops). They diverge whenever rough Stops trail the last scheduled one. `computeProjectedEnd(stops, anchor)` is the shared helper; the Plan overview, Summary, and the Flag detector all read it.
- The Hard end date warning is dormant until the Trip has an anchor (a start date or a scheduled Stop) — a fully date-less Trip can be summed in nights but not projected onto the calendar.
