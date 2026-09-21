# 0055 — A shortened Stop hands an Item to the Stop that still covers its day

## Status
Accepted (2026-09-21)

Amends ADR 0049 (*A changeover day is one day, shown twice, owned once*),
which recorded this as a known gap and deferred it for its own spec. This is
that spec.

## Context

ADR 0049's rule 4 keeps an Item with its owning Stop while that Stop still
covers the target day, and re-files it otherwise. It governs Item **moves**:
`scheduleItem` and `rescheduleItem` both call `resolveOwningStop` before
writing a date (`server/actions/items.ts:546,589,712`).

A Stop **re-date** takes a different path — `shiftStopPayloadTx`
(`server/actions/stop-flow.ts`) → `shiftItemDates` (`lib/payload-shift.ts`) —
which is pure ADR 0038 offset math with no concept of an owning Stop:

```ts
const offset = daysBetween(oldArrive, item.date);
const next = offset < 0 || offset > maxOffset ? null : addDays(newArrive, offset);
```

An Item un-slots to `date: null` purely because its offset from the *old*
arrive date no longer lands inside the *new* span — with no check for whether
another Stop still covers its actual calendar date.

ADR 0049's worked example: Munich 5–10, Strasbourg 10–12, a dinner on the 10th
owned by Munich. Shorten Munich to 5–9 and the dinner un-slots into Munich's
things-to-do, even though Strasbourg still covers the 10th and rule 4 would
have re-filed it there. Phase A made this newly *visible*: the dinner used to
vanish off a card nobody was looking at; now it disappears off Strasbourg's
changeover-day card, which the Traveller never touched.

The reason this was deferred rather than folded in is that it is a real
behaviour change — a Stop re-date would be able to move an Item onto a
different Stop's Budget line, which today only an explicit move does.

Extending rule 4 across the *whole* un-slot path turned out to be the wrong
size. When a Stop **moves** rather than shortens — Munich 5–10 becomes Munich
5–10 of the following month — every Item shifts with it, and an Item that falls
off the end has no meaningful calendar date left to be re-filed by: honouring
rule 4 there would strand it on the old dates, re-filed onto whatever unrelated
Stop happens to cover them. That is a worse outcome than un-slotting, and it is
what makes the general case L-sized and edge-case heavy.

The two cases separate cleanly on one question: **does the shift move this
Item's calendar date?**

## Decision

Rule 4 extends into the un-slot path **only where the Item's calendar date is
unchanged by the shift** — that is, where the Item would un-slot because the
Stop shortened away from a day the Item still sits on.

In that case the Item keeps its date and is re-filed to whichever Stop covers
that date (`stopForDate`, the same tiebreak rule 4 already uses where there is
no owner to preserve). If no Stop covers it, it un-slots exactly as it does
today.

Where the shift **does** move the Item's date — a Stop re-dated to a different
span — an Item that falls outside the new span still un-slots. Unchanged.

## Consequences

- **The ADR 0049 example now does the obvious thing.** Shortening Munich hands
  the dinner to Strasbourg, whose card already renders the 10th.
- **A Stop re-date can now move an Item onto a different Stop's Budget line.**
  This is the behaviour change ADR 0049 flagged, accepted deliberately and
  bounded: it can only happen on a day the Item was already sitting on, never
  as a side effect of the Item being carried somewhere new.
- **`lib/payload-shift.ts` stops being purely positional.** It needs to know
  which Stops cover which days, so the set of scheduled Stops becomes an input
  to the shift rather than something only the caller knows. The function stays
  pure; it just takes more.
- **The move case keeps its current behaviour, and that is now a documented
  choice rather than an untested edge.** An Item stranded on the old dates and
  re-filed onto an unrelated Stop would be harder to explain — and harder to
  undo — than one sitting in things-to-do where the Traveller can see it.
- **The full extension is not deferred, it is declined.** If it is ever
  revisited, the reason to reopen is a case where un-slotting on a whole-Stop
  move actually loses information — not a consistency argument, which this ADR
  has already weighed.
- **Undo reverses a re-file.** Because a re-file leaves the Item's date
  untouched, the date pre-image alone cannot undo one — the owning Stop is the
  only thing that moved. The shift therefore reports the Stop it moved the Item
  *off* alongside the one it moved it *onto*, and `restoreStops` writes that
  owner back, so undoing a shortened Stop puts the Cost back on the Budget line
  it came from.
- **Known limitation — a firm-up can re-file onto a Stop that is itself about
  to be re-dated.** `firmUpTrip` (`server/actions/stops.ts`) writes each Stop's
  flowed dates one at a time, outside a transaction, so when it re-dates Stop
  *k* the covering-Stop read still sees Stops *k+1…n* at their **pre-flow**
  dates. The conditions are narrow — Stop *k*'s arrive date must be unchanged
  while its depart date changes (nothing else reaches this path), and a later
  Stop must cover the dropped day at its old dates — but where they all hold,
  an Item can be handed to a Stop that no longer covers that day by the time
  the loop finishes. Accepted as-is: that loop was already non-transactional
  before this ADR, so this is a pre-existing property of firm-up rather than
  something the re-file introduces, and wrapping it is its own piece of work.
