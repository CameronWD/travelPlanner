# Cost and paid amounts replace estimated/actual, and paid requires an amount

## Context

A **Cost** carried an `estimatedMinor` (mandatory) and an `actualMinor` (optional),
plus a `paidAt` date. Two problems surfaced together.

**The words were wrong.** "Estimated cost" is a required field, so a Traveller
booking a £128 flight — a known, invoiced price with nothing estimated about it —
had to type it into a box labelled as a guess. The mandatory-estimate rule looked
like an accident of the model, and the natural reaction was to want the estimate
made optional so a Cost could be a real price with nothing behind it.

**Marking something paid could quietly lie.** `paidAt` was independent of
`actualMinor`, so a Cost could be paid with no amount recorded. `buildSpendSoFar`
then added `actualHome ?? 0` to "paid so far" while adding the full cost amount to
`paidEstimate` — so a £340 hotel marked paid with no actual displayed as
**"Paid £0 · £340 under estimate"**. This was rare only because three hoops
guarded it: the actual and date-paid fields were hidden until an estimate was
entered, and the paid tick only rendered when an actual existed. Adding the
obvious convenience — a one-tap "mark as paid" — would have mass-produced the
misleading state, because a toggle does not ask for an amount.

We considered making the estimate nullable so a Cost could be actual-only. We
rejected it: 36 files read the estimate as a guaranteed number, and every Budget
roll-up (category, per-day, per-chapter, grand total) sums it directly. Worse, it
makes the trip's "estimated total" ambiguous once some Costs have no estimate. We
also considered collapsing to a single `amountMinor` plus a paid flag — simplest
model, but it discards "I thought £300, it came to £380", which is most of what
Spend so far and the Budget variance views exist to show.

The insight that resolved it: the two amounts were never *guess vs truth*. They
are **what this costs** and **what actually left your account**. Under that
reading a known price is not an exception at all — it is simply a very confident
cost amount, and paying exactly it yields zero variance, which is correct.

## Decision

1. **Rename both amounts to match the domain, everywhere.** `estimatedMinor` →
   `costMinor`, `actualMinor` → `paidMinor`, in the schema, all 36 consuming files
   and the on-screen labels ("Cost", "You paid"). The glossary, the code and the
   screen use one word per concept. We deliberately took the large rename over a
   documented glossary→UI mapping table, having just found exactly that kind of
   silent drift elsewhere: **Firm up** is the canonical term for the rough →
   scheduled transition but appears nowhere in the UI, which says "Set dates for
   all stops". A mapping table is a promise to keep two vocabularies in sync, and
   this codebase had already broken that promise once.

   Note the collision this creates: `budget-hero-row` already had a `paidMinor`
   prop meaning the trip-wide total. That prop becomes `paidTotalMinor` so
   `paidMinor` unambiguously means "what was paid for this one Cost".

2. **The cost amount stays mandatory.** Every Cost has one. It is the Traveller's
   best number today — a guess while sketching, the real price once booked — so a
   known price needs no fictional estimate.

3. **A Cost cannot be marked paid without a paid amount.** Ticking "Paid" reveals
   and requires the paid amount, pre-filled with the cost amount so the common
   case ("it cost what I thought") is one gesture, and the date defaults to today.
   Every figure in Spend so far is therefore real money.

4. **Backfill existing rows** where `paidAt` is set and the paid amount is null,
   setting the paid amount to the cost amount. Those rows are exactly the ones
   displaying the "£0 paid, under estimate" state today.

## Consequences

- **"Why won't it let me just tick paid?"** is the question this ADR answers. The
  trade-off is deliberate: a little friction at the point of entry buys a Spend so
  far view that is never wrong. The pre-filled amount is what keeps that friction
  to a single tap.
- **`buildSpendSoFar`'s `?? 0` fallback becomes dead** once the backfill runs and
  the invariant holds. It should be removed rather than left as a quiet
  reassurance that the case is handled — it is the bug.
- **The backfill assumes people paid roughly what they reckoned.** True often
  enough to beat the alternatives (silently un-ticking paid things, or leaving a
  wrong total on screen indefinitely), and any row that is wrong is editable.
- **Reversible only at a price.** Undoing means another migration to rename the
  columns back; the "paid needs an amount" rule is cheap to relax later, but
  relaxing it re-opens the misleading-total hole.
