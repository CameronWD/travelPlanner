# 0075 — Update actions take a PATCH: undefined keeps, null clears

## Status
Accepted (2026-10-16). Decided in the tidy-up re-grill
(`docs/specs/2026-10-14-tidy-up-pass.md`, card 3.L, decision Q13).

## Context

Eight update actions (`updateStop`, `updateTrip`, `updateAccommodation`,
`updateTransport`, `updateCost`, `updateReminder`, `updateItem`,
`updateChapter`) replaced the whole row with the input they were given: an
absent field was written as `null`, `false` or a schema default. The app's
forms always resend the whole form, so that held for them. The Claude
connection's update tools did not: each loaded the row, checked access a
second time, and hand-merged the fields it was given before calling the
action — eight `loadXForPatch` / `mergeXPatch` pairs, one of them recalling a
data-loss round on `hardEndDate`.

## Decision

1. Every update action takes `Patch<Input>` (`lib/patch.ts`): a field left
   `undefined` keeps its value, `null` clears it, any other value replaces it.
2. The action merges the patch onto the row it already holds, validates the
   merged whole with the entity's existing schema, then writes. Entity rules
   that need the current row (a Stop's mode from its dates, a Transport end,
   a Cost's paid pair and Due date, completing an inline Cost) live in pure
   modules beside it: `lib/stop-patch.ts`, `lib/transport-patch.ts`,
   `lib/money/cost-patch.ts`.
3. Forms still send their full input. The update call passes it through
   `toPatch(input, clearable)`, which turns each listed field the form left
   empty into `null`. `undefined` cannot mean "clear": it is "keep", and
   React's server-action encoding drops `undefined`-valued keys anyway.
4. The Claude tools pass the caller's fields straight to the action after
   the real-plan check (`lib/mcp/real-plan.ts`).

## Consequences

- One load and one merge per update; merge rules live next to the write.
- A field a form forgets to list in `toPatch` keeps its old value when the
  Traveller empties it — each form's test asserts its clearable fields.
- Fields an action already treated as "absent = leave alone" keep that
  meaning (Trip `homeName`/`homeTimezone`/`roundTrip`, Item
  `surpriseForIds`, a Reminder's `stopId`); `null` reads the same as absent
  for those.
