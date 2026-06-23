# Concurrency: lock-then-swap reorders; network I/O outside DB transactions

Two post-deploy fast-follows concern write correctness now that the app is
multi-user in production (Postgres everywhere — see ADR 0005):

1. **List reorders.** Stops and pre-trip/packing ChecklistItems are ordered by an
   integer `sortOrder` that is swapped between two adjacent rows on each move. The
   original `moveStop` / `reorderChecklistItem` read the list *outside* the
   transaction and wrapped only the two writes in a batch `$transaction([...])`.
   Two travellers reordering the same list at the same instant could both read the
   same pre-state and produce a transposed / lost-update ordering. Low-severity
   (re-dragging fixes it; no data loss) but real.

2. **Cost + FX snapshot.** Creating a Cost snapshots an FX rate. Resolving the rate
   makes a network call (Frankfurter) that also caches the result in `ExchangeRate`.
   The cache write and the Cost write were two separate statements; a failure
   between them left a harmless but orphaned `ExchangeRate` row with no
   corresponding `Cost` row.

## Decision

1. **Reorders use pessimistic locking.** `moveStop` / `reorderChecklistItem` open an
   interactive transaction, issue `SELECT ... FOR UPDATE` over the affected list
   (Stops by `tripId`; ChecklistItems by `tripId` + `kind`) to lock and re-read the
   rows, compute the swap from the *locked* snapshot, and write — all inside the one
   transaction. A concurrent reorder blocks on the lock, then re-reads the corrected
   order. Raw SQL is used for the lock because Prisma cannot express `FOR UPDATE` on
   `findMany`. We deliberately do **not** add `@@unique([tripId, sortOrder])` — it
   would be violated transiently mid-swap.

2. **Network I/O stays out of DB transactions.** FX rate resolution (the network
   fetch) happens *before* any transaction is opened. `getRateForTrip` is split into
   `resolveRateForTrip` (read + fetch, no writes, returns a `persist` descriptor)
   and `persistRate` (the cache upsert, accepting either `db` or a `tx`).
   `createCost` / `updateCost` resolve the rate first, then persist the rate and
   write the cost together in one interactive transaction. `getRateForTrip` keeps
   its exact previous behaviour by composing the two, so `/api/fx` and `rates.ts`
   are unaffected.

## Consequences

- Reorders are serialized per-list and correct under concurrency, at the cost of one
  extra locked read and Postgres-only `FOR UPDATE` semantics (fine — all environments
  are Postgres).
- Raw SQL appears in two server actions; it is minimal and documented inline.
- A cost-write failure no longer leaves a cached rate behind: the cache updates only
  when the cost is actually written.
- Tests assert call shape (a `FOR UPDATE` query is issued; persist + create share one
  tx) because the test sandbox has no Postgres; true lock behaviour is exercised
  against Postgres in CI/prod.
