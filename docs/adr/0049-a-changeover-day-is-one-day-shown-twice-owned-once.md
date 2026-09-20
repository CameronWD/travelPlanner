# 0049 — A changeover day is one day, shown twice, owned once

## Status
Accepted (2026-09-20)

## Context

A Feedback note written on 2026-09-20 (`cmu92qjy5000204jy9d7urj20`):

> I love that a place you are leaving and a place you are arriving to have
> the same date. e.g. we leave munich on the 10th so the 10th is available
> to plan in munich but we arrive Stasbourg on the 10th so it is also
> available as a day to plan here. I like that we can add to it from either
> location but currently the activities/events for that day are not adding
> to both - just to the location you added it from.

A **Stop**'s `departDate` and the next Stop's `arriveDate` are the same
calendar day. The plan editor renders each scheduled Stop's slice of the
Timeline day by day, arrive → depart inclusive, so that day renders under
*both* Stop cards. But `app/(app)/trips/[tripId]/plan/page.tsx` groups
scheduled Items strictly by `stopId`, so each card only ever sees the Items
filed to it. The same day, rendered twice, shows two different halves of
itself. On the real December trip this is not an edge case: 26 of the
trip's days are shared between two Stops.

The codebase had already collided with this without naming it.
`components/trip/stop-day-list.tsx` deliberately avoids `rescheduleItem` in
favour of `scheduleItem`'s in-place branch, because `stopForDate`
(`lib/itinerary.ts:171`) resolves a shared date to the *later* Stop and so
silently re-filed Items off the card they were moved on. That workaround is
a symptom of the missing concept, and it carried a comment explaining
itself rather than a rule.

A second defect sits directly beneath it. `scheduleItem`'s copy-in branch
(ADR 0019) creates the placed copy with `stopId: fullItem.stopId ?? null`,
and a Wishlist idea is *defined* by `stopId === null`
(`server/actions/items.ts:490`). So every Item placed from the Wishlist —
including everything placed via **Day ideas** (ADR 0044) — is created with
no Stop at all. It is therefore invisible in the plan editor's day rows on
*every* day, not only shared ones, and its Cost rolls up as "Trip-wide /
Other" in the Budget instead of against the Stop it happens in. A count
against production on 2026-09-20 found 7 dated Items and 0 affected rows,
so this is a live code defect with no data to repair.

## Decision

A **Changeover day** is one day on the Timeline that two consecutive Stops
both claim. It is **shown twice and owned once**.

1. **Shown twice.** Both Stops' cards render the changeover day, and both
   show the union of the Items dated that day — whichever card they were
   added from. The collapsed preview line and its `+N` count show the union
   too, so the summary never contradicts the rows beneath it.

2. **Owned once.** Every scheduled Item keeps exactly one **owning Stop**.
   That is what `lib/budget.ts` counts its Cost against, and the model does
   not gain a second owner or a day-owned Item.

3. **Ownership is visible.** On a changeover day, an Item is marked with a
   muted Stop name on the card that does *not* own it. Without it the
   Budget's per-Stop roll-up becomes unexplainable from the plan editor —
   a dinner you think of as Strasbourg's counts toward Munich and nothing
   on screen says so.

4. **An Item keeps its owner while that owner still covers its date.** It
   re-files only when moved onto a day the owning Stop's stay no longer
   covers, and then to the Stop that does cover it. This replaces the
   `stop-day-list.tsx` workaround with a rule, and it makes moving an Item
   forward off a changeover day re-file it rather than un-slot it to
   things-to-do (ADR 0038).

5. **A placed copy takes the covering Stop.** `scheduleItem`'s copy-in
   branch resolves the Stop covering the target date exactly as
   `rescheduleItem` does. There is no prior owner to preserve, so rule 4
   does not apply and a changeover day simply yields the arriving Stop, per
   `stopForDate`.

## Considered options

**Items belong to both Stops on a shared day** — rejected. It has to answer
"which Stop does it ride with when the two disagree?" and every answer is
arbitrary. `CONTEXT.md`'s **Item** entry has a scheduled Item *riding with
its Stop*, keeping its offset from that Stop's arrive date and un-slotting
when the day no longer fits (ADR 0038); two owners make that undefined. It
would also have to invent a rule for splitting a Cost across two Budget
lines, which nobody asked for.

**Always re-file to the arriving Stop on a changeover day** — rejected.
That is what `stopForDate` does on its own, and it means dragging an Item
onto the 10th silently moves its money from Munich's Budget line to
Strasbourg's. Preserving an owner that still covers the date changes
nothing the Traveller did not ask to change.

**No ownership marker** — rejected. It is the tidier screen, but it trades
a visible oddity for an invisible one: the Budget attribution becomes
undiscoverable except by opening the Edit dialog.

## Consequences

- The plan editor is now the only surface where one Item can appear twice
  on screen at once, when both adjoining Stop cards are expanded. That is
  the intent, not a bug, and the marker is what distinguishes the copies.
- `stopForDate`'s later-Stop tiebreak is unchanged. It is now used only
  where there is no owner to preserve — placing a Wishlist copy, and
  re-filing an Item that has left its owner's stay.
- The `handleMove` comment in `stop-day-list.tsx` becomes obsolete; the
  behaviour it describes is now the documented rule rather than a local
  workaround.
- **Known gap, deliberately left open (2026-09-20 review): rule 4 governs
  Item *moves* only, not a Stop *re-date*.** `scheduleItem` and
  `rescheduleItem` both call `resolveOwningStop` before writing an Item's
  date, so dragging an Item keeps its owner while that owner still covers
  the target day. Re-dating a Stop is a different code path —
  `shiftStopPayloadTx` (`server/actions/stop-flow.ts`) calling
  `shiftItemDates` (`lib/payload-shift.ts`) — and that path is pure ADR 0038
  offset math with no concept of an owning Stop at all: an Item un-slots
  (`date: null`) purely because its offset from the OLD arrive date no
  longer lands inside the NEW arrive/depart span, with no check for whether
  some other Stop still covers its actual calendar date. Concretely: Munich
  5–10, Strasbourg 10–12, a dinner on the 10th owned by Munich; shorten
  Munich to 5–9 and the dinner un-slots to Munich's things-to-do, even
  though Strasbourg still covers the 10th and rule 4 would have re-filed it
  there instead. Phase A (this ADR) makes this newly visible in a way it
  wasn't before: the dinner used to simply vanish off a card nobody was
  looking at; now that Strasbourg's card renders the 10th as its own
  changeover day, the dinner disappears from a card the Traveller never
  touched. Extending rule 4 into the re-date/un-slot path is a deliberate
  behaviour change — it would mean a Stop re-date can re-file an Item onto a
  *different* Stop's Budget line, which today only an explicit Item move
  does — and it deserves its own spec and review rather than being folded
  into this fix wave. `lib/payload-shift.ts` and `server/actions/stop-flow.ts`
  are intentionally untouched.
- **Known gap, recorded but not changed (2026-09-20 review): the in-place
  branch of `scheduleItem` now writes `stopId`, which it never touched
  before rule 4.** That write is rule 4 working as designed when the target
  date falls inside some Stop's stay. But when an Item is dated OUTSIDE
  every Stop's stay (a gap day no Stop covers), `resolveOwningStop` falls
  through to `stopForDate`, which returns `null` for a gap day — so the
  Item's `stopId` is now nulled where before this rule existed it simply
  kept whatever Stop it had. The visible effect: that Item's Cost moves from
  its old Stop's Budget line to "Trip-wide / Other" (`lib/budget.ts`'s
  unowned bucket) purely because it was rescheduled to a day with no owning
  Stop. This follows rule 4 as written — an owner is preserved only "while
  that owner still covers its date" — but was never an explicit decision
  when the rule was written, since a Wishlist gap-day case wasn't the
  scenario rule 4 was designed around. Left as-is for this fix wave.
