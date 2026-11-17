# Follow-ups from the cost/paid remodel

Findings surfaced by review during the branch `feat/rough-stop-accommodation-and-paid-costs`
(ADR 0037) that were deliberately left out of scope. Each was judged real but
non-blocking. Recorded here so they are not lost with the scratch workspace.

## Worth deciding on

**"Today" is a UTC calendar date, in an app that defaults to en-AU.**
`lib/dates.ts:27-32` — `formatISODate` uses `getUTCFullYear`/`getUTCMonth`/`getUTCDate`
and is documented twice as a UTC calendar date, so this is a deliberate convention,
not a slip. But TEEPEE defaults to `en-AU`/AUD, and in UTC+10/11 `todayISO()` returns
*yesterday* every morning before roughly 10am local. Shared by the **Today** view,
`agenda-view`, `phase-travelling` and the date engine — so the feature whose job is
"auto-focus on the current trip day" lands on the wrong day all morning. Either
deliberate (for server-rendered consistency) or a real bug in the primary timezone;
the code alone doesn't say which. Changing it is a codebase-wide date-semantics
decision and wants its own plan.

**"Firm up" is canonical in the glossary but appears nowhere in the UI.**
`CONTEXT.md:121` defines Firm up as the rough → scheduled transition; every visible
label says "Set dates for all stops" / "Date all stops from start" / "Set dates for
this leg". This is exactly the silent glossary→UI drift ADR 0037 cited as its reason
for choosing a full rename over a mapping table. The same argument applies here.

**Legacy rows carrying a paid amount with no paid date now read as unpaid.**
A consequence of making `paidAt` the sole paid signal. Until this branch,
`cost-editor.tsx` rendered a free-standing "You paid" box with an optional date on
every card, so amount-without-date was a supported way to record a payment. Those
rows now drop out of every paid total. No backfill is possible without inventing
payment dates, which this branch explicitly refuses to do — the Budget checklist is
the remediation path, and re-ticking offers the preserved amount back. Demo and seed
fixtures were fixed (commit `f908fa2`); real data was not touched.

## Should fix soon

- `handleFirmUp`'s `try/finally` has no `catch` (`components/trip/itinerary-manager.tsx`).
  If `firmUpSegment` *rejects* rather than resolving `success:false`, the accommodation
  nudge's pending marker leaks and the form can open unprompted later. Pre-existing,
  shared with four other call sites.
- `markCostPaid` has no upper bound on the amount where `costSchema` caps at
  `2_147_483_647` (`lib/validations/cost.ts:47`) — int overflow throws into a generic toast.
- `describeChanges("COST")` omits `paidAt` (`lib/activity.ts:200-205`), so
  `markCostUnpaid`'s activity entry has an empty changes list.
- `updateAccommodation` / item actions revalidate only `/trips/{id}`
  (`server/actions/accommodation.ts:268`, `server/actions/items.ts:55-58`); transport
  gets `/budget` free via `"layout"`. Marking paid from a stop dialog leaves the
  checklist and Budget stale.
- `convertCostToHome` still returns `estimatedHome`/`actualHome` (`lib/budget.ts:162-188`)
  and `buildBudget`'s accumulators are `dayEstimated`/`dayActual`/`grandEstimated`/
  `grandActual`. This is exported API shape, not internals — the drift ADR 0037 took
  the big rename to avoid.
- `CostChecklist`'s confirm popover renders a `MoneyInput` whose currency picker is
  interactive but discards selections (`components/trip/cost-checklist.tsx`). Pass
  `currencies={[row.currency]}` or use a plain input.
- Server-side `errors.paidMinor` is discarded for a generic toast rather than surfaced
  on the field, unlike `other-cost-editor.tsx`.
- Disabling a checklist checkbox during un-mark moves focus to `<body>`, losing a
  keyboard user's place on a list designed for rapid ticking. Prefer `aria-busy`.
- The checklist confirm prefills `row.costMinor` while the five dialogs offer back
  `row.paidMinor` — two answers to "how much did I pay?" on adjacent screens.

## Accept / low value

- `paidAtStringSchema`'s `YYYY-MM-DD` branch is shape-only, so `"2026-02-30"` passes
  the regex and yields `Invalid Date`. Unreachable from a native date input and now
  fails safe into a toast.
- Both new actions re-implement `requireCostAccess` inline — deliberate, since they
  return a result where the helper throws `notFound()`.
- A cost card can show a paid amount with no green tick, now that un-ticking preserves
  the amount as history. Consistent with the **Paid** glossary entry.
- The preserved `paidMinor` is not currency-tagged, so editing an un-ticked cost's
  currency leaves a historic amount against the new code.
- `cost-amounts.tsx` switches labels on `paidTotalMinor > 0`, a truthiness gate in a
  codebase whose stated rule is "zero is legal". Harmless for aggregates.

## Not verifiable without a database

The migration `prisma/migrations/20260812000000_cost_and_paid_amounts` has **never been
executed** — this environment has no Postgres. It was verified by reading, against the
`0_init` DDL, and confirmed to rename columns that no index, constraint or view
references, with a backfill predicate matching ADR 0037.

**Deployment ordering is the real risk.** `vercel.json:4` runs
`prisma migrate deploy && next build`, so for a *rename* the old columns disappear while
the previous deployment is still serving traffic — every cost read 500s for the length
of the build, and indefinitely if the build then fails. Additive migrations have no such
window. Deploy at a quiet moment, watch the build, and note that rollback needs a
reverse migration.

Also unverifiable here: how many real paid-with-no-amount rows the backfill will touch,
whether any prod-only object references the old column names, and whether the Prisma
calls in `markCostPaid`/`markCostUnpaid` are valid at runtime (every server-action test
mocks `lib/db`).
