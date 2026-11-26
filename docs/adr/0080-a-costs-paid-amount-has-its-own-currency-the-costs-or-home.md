# 0080. A Cost's paid amount has its own currency, limited to the Cost's or Home's

Date: 2026-11-26

## Status

Accepted.

## Context

A Cost had one currency for both its cost amount and its paid amount. Cam entered a room at
EUR 550 that left his account as A$905.12, and the shared picker changed both amounts. The
real charge is the number on the statement, and the app could not hold it.

## Decision

- A Cost gains a nullable `paidCurrency`. Null means the Cost's own currency, which is every
  Cost that existed before; nothing is backfilled.
- It is written only as the Cost's own currency (stored as null) or the Trip's Home
  currency. One module, `lib/money/paid-currency.ts`, owns the rule.
- A paid amount in Home counts at face value, with no exchange rate, in Spend so far and
  every other Home total of paid money. The cost amount still converts at the Cost's rate,
  so paid against estimate compares the real charge with the estimate. One function,
  `convertCostToHome`, owns the roll-up.
- A Refund is in the paid currency.
- A Cost with no recorded paid currency follows its own currency when that currency is
  changed, exactly as before, even when its currency was the Home currency. Home is kept
  through a change of the Cost's currency only when it was recorded explicitly. A save that
  does not mention a paid currency must write exactly what it wrote before.
- In the form, "You paid" has its own picker offering the Cost's currency and Home.
  Switching it clears the amount; the app does not convert.

## Alternatives

- **Any third currency by choice.** Rejected: it needs a rate for each payment, and for a
  third currency the real charge is not what left a Home account anyway.
- **Converting the paid amount for the Traveller.** Rejected: the point is the real number
  from the statement.
- **Keeping one currency and telling people to enter the Cost in Home.** Rejected: it loses
  the price in the currency it was quoted in, and the estimate with it.
- **A second Cost row for the payment.** Rejected, as in 0079: one payment, one row.

## Consequences

- One nullable column, no backfill. Every existing Cost reads and totals as before.
- One deliberate display change: cards show the current number (the paid amount in its paid
  currency, less a received Refund, once Paid). The stay's total, the Plan's day header and
  each row of a Plan day printed the cost amount for a paid Cost before.
- If the Home currency is changed after a Cost was paid in the old one, that paid amount
  stays in the old currency. It converts at the Trip's rate for that currency, or is left
  out of Home totals and named as a missing rate.
- A Refund's currency is the paid currency, so a Refund on a Cost paid in Home no longer
  blocks changing the Cost's currency.
- Deleting a thing paid in Home leaves an Other cost for the paid amount in the paid
  currency. A What-if plan still copies no payment.
