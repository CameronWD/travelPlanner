# 0079. A Refund belongs to the Cost, and totals count it once it is received

Date: 2026-11-25

## Status

Accepted.

## Context

Deleting a Transport, Accommodation or Item whose Cost had been paid turned that Cost into
an Other cost labelled "(deleted)" (ADR 0039) without saying so, and the app had no way to
record that money came back. A refund is something that happens to a payment, so the
question is where it lives and when it changes a total.

## Decision

- A Refund is two nullable columns on the Cost: `refundMinor` and `refundedAt`. An amount
  with no date is expected; with a date it is received.
- A Refund is on a paid Cost only, at least 1 minor unit and never more than the paid
  amount. A Cost with a Refund cannot be marked unpaid until the Refund is removed.
- An expected Refund changes no total. A received Refund makes totals count the cost amount
  and the paid amount less the Refund, never below zero. Every total reads that net from
  one module, `lib/money/refund.ts`.
- A Refund converts to the Home currency at its Cost's own snapshotted rate (ADR 0002).
- Deleting a thing that was paid for asks what happened to the money, and the Other cost it
  leaves carries the answer.

## Alternatives

- **A refund as a negative Cost.** Rejected: it breaks "a Cost shows one number" and splits
  one payment across two rows, so the per-owner roll-ups stop describing the thing that was
  paid for.
- **Asking only on delete.** Rejected: it misses Other costs and bookings that are kept but
  refunded.
- **Counting an expected Refund.** Rejected: spend would be understated if the money never
  arrives.

## Consequences

- One Refund per Cost.
- The currency of a Cost is frozen while it holds a Refund, because the Refund's amount is in
  that currency.
- The "Refunded" group, in the To pay card and the All costs sheet, holds any Cost with a
  received Refund whose shown amount is zero.
- The Refund is converted at the Cost's snapshotted rate, so it cannot differ from the
  Cost's own rate.
- The inline cost row inside the Transport, Accommodation and Item forms cannot edit a
  Refund. It leaves one untouched and refuses a change the rules above forbid.
- A Fork copies no Refund, as it copies no payment.
