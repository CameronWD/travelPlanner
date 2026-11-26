# Paying in a different currency, and a currency list that fits the trip: 2026-11-26

Three things Cam reported on 2026-11-26 while entering costs, and his answer to how far to go: "Happy for you to do the full fix. As long as we don't break any of the data already added."

## The binding rule

**No existing Cost changes.** Every Cost recorded before this work shows the same amounts, counts the same in every total, and keeps the same Refund, on every page and through the Claude connection. The database change is additive and nothing is backfilled.

## 1. The currency list fits the trip

Reported: "When opening the currency thing on the payment screen, it shows a bunch of different currencies. I think by default it should only have the currencies we have included in the trip." And: "I get a list that is larger than the modal and is hard to use."

Today every amount field lists every currency the app knows, about thirty, and the list may grow as tall as the screen.

- **The trip's currencies** are, in this order and without repeats: the Trip's Home currency; the currency of each Stop's country, in route order; every currency already used on a Cost of the Trip (the real plan and What-if plans alike).
- An amount field's currency list shows the trip's currencies. The currency the field currently holds is always in the list, even when it is none of those.
- Below them is one entry, **"More currencies"**, which swaps the list for every currency the app knows, the trip's first. Picking one sets it. Once a Cost uses it, it is one of the trip's currencies from then on.
- A place that is only a layover adds no currency.
- Where there is no Trip (the new-trip flow's Home currency picker), the list is the full one, as today.
- The list never grows taller than about seven rows; beyond that it scrolls inside itself. This holds for the full list too, so it stays inside a dialog.

## 2. What you paid can be in your Home currency

Reported: "When I change the you paid bit, it changes the cost bit to the same currency? Even though I may put a cost in as 550 EURO but then I paid in AUD?"

Today a Cost has one currency for both its cost amount and its paid amount, and the form shows the same picker on both fields.

- A Cost gains a **paid currency**: the currency its paid amount is in. It is either the Cost's own currency or the Trip's Home currency, nothing else. A Cost with none recorded is paid in its own currency, which is every Cost that exists today.
- In the form, "Cost" keeps its full currency picker. **"You paid" has its own**, offering only the Cost's currency and the Home currency (one entry when they are the same, shown as plain text and not a picker). Changing one never changes the other.
- Marking a Cost paid still offers the paid amount pre-filled. Pre-filled, it is the cost amount in the Cost's currency. Switching "You paid" to the Home currency clears the amount for the Traveller to type what left their account; the app does not convert for them.
- **Totals.** A Cost paid in the Home currency counts in Spend so far, and everywhere a paid amount is totalled in the Home currency, as exactly the amount typed. No exchange rate touches it. Its cost amount is still converted at the Cost's rate wherever an estimate is shown, so "paid against estimate" compares the real charge with the estimate.
- **Where a paid amount is shown**, it is shown in its paid currency: "€550 · paid A$905.12".
- **Refunds.** A Refund is money that came back, so it is in the paid currency. A Refund on a Cost paid in the Home currency is entered and shown in the Home currency, can be no more than what was paid, and comes off Spend so far at face value. What the Cost "has cost so far" is the paid amount less a received Refund, in the paid currency.
- **Changing things later.**
  - Changing the Cost's currency leaves a Home-currency paid amount alone.
  - If the Cost's currency is changed to the Home currency, the paid currency is simply the Cost's again.
  - Changing the Trip's Home currency: a Cost paid in the old Home currency keeps its paid amount and now has a paid currency that is neither its own nor Home. It is shown as recorded and converted at the Trip's exchange rate for that currency where a Home total needs it; the form lets the Traveller re-enter it. This is the one case where a third currency can appear, and it must not crash or silently drop the Cost from totals without saying so (the existing "missing rate" line covers it).
  - Marking a Cost unpaid keeps the paid amount and its currency as history, as today.
- **Copies.** A What-if plan copies a Cost without its payment, so without a paid currency. A booking import carries the paid currency with the Cost. Duplicating a Trip copies no Costs.
- **The Claude connection.** A Cost's `paid` gains its currency; recording a payment may name the Home currency. Reads of existing Costs are unchanged apart from the added field.

## Decisions made while planning (2026-11-26)

- **Cards show what was paid.** Cam also reported that a card shows the cost amount for something already paid. The glossary's rule is one current number: the paid amount once Paid, else the cost. The stay's total (its panel and dialog), the Plan's day header and each row's amount in a Plan day printed the cost amount; they now print the current number, in its paid currency. This is the one deliberate change to how an existing Cost is displayed. Nothing stored changes.
- **Both amounts side by side** ("€550.00 · paid A$905.12") appear only on the line for a single Cost paid in another currency. Cards and rows show the one current number.
- **A Cost paid in Home whose own currency has no exchange rate** is left out of Home totals like any Cost with a missing rate, so its cost and paid amounts stay paired, and is named in the missing-rate line. This departs from "counts as exactly the amount typed" for that rare case.
- **Deleting a thing paid in Home** leaves an Other cost in the paid currency for the paid amount.
- **A Cost with no recorded paid currency follows its own currency** when that currency is changed, exactly as before this work, even when its currency was the Home currency. Home is kept as the paid currency through a change of the Cost's currency only when it was recorded explicitly. A save that does not mention a paid currency must write exactly what it wrote before.

## Not in this work

- Paying in a third currency by choice (a EUR cost paid in GBP).
- Part payments or several payments on one Cost.
- Converting the paid amount for the Traveller.
- Any change to how exchange rates are fetched.

## Documents to bring into line

- CONTEXT.md: **Cost** and **Paid** (the paid currency), **Home currency**, **Refund**.
- A new ADR: a Cost's paid amount has its own currency, limited to the Cost's or Home's, and why (hard to reverse; surprising without context; a third currency was the alternative).
- The help guide, where it describes entering a cost and marking it paid.
