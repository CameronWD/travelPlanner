# 0039 — Costs survive their owners according to paid state

## Status
Accepted (2026-09-07)

## Context
Cost is polymorphic (`ownerType` + `ownerId`, no FK), so deleting an
Accommodation, Item or Transport orphaned its Cost rows: the money stayed in
every Budget total, attached to nothing. Deleting the rows instead would
shrink Spend so far — but paid Costs are real money that left an account
(e.g. a non-refundable deposit on a hotel that was later cut from the plan),
and CONTEXT.md promises "nothing paid ever counts as zero."

## Decision
When an owner is deleted (directly, or via a Stop cascading its
Accommodations), inside the same transaction:
- Costs never paid (`paidMinor` and `paidAt` both null) are deleted — they
  were estimates for a thing that no longer exists.
- Costs ever paid (either field set — un-marking keeps `paidMinor` as
  history, and legacy rows carry `paidMinor` without `paidAt`) convert to an
  Other cost (`ownerType: "OTHER"`, `ownerId: null`), labelled
  "<owner or cost label> (deleted)". Amounts, currency, snapshot rate,
  category and plan scope are untouched.

Implemented by `deleteOwnedCostsTx` (`server/actions/owned-costs.ts`);
existing prod orphans are handled once by `scripts/sweep-orphaned-costs.ts`.

## Consequences
- Spend so far and the Budget stay truthful across deletions; cancelled-but-
  paid money shows as an Other cost instead of vanishing or dangling.
- The "(deleted)" label is the only trace of the original owner; drill-down
  from the converted cost to the deleted entity is deliberately not kept.
- Alternatives rejected: delete-everything (paid money vanishes from Spend
  so far); convert-everything (estimate clutter outlives sketching).
