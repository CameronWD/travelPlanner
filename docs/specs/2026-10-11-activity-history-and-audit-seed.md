# Spec 2026-10-11 · TC-07 Activity for Checklists, Reminders, Votes, Day titles; TC-08 clickInCard; TC-09 demo seed toggles

One branch: `feat/activity-history-and-audit-seed-2026-10-11`. Agreed with Cam
in the session of 2026-10-11 (grill-with-docs). Domain decisions are recorded
in `CONTEXT.md` (**Activity**) and ADR 0012's 2026-10-11 amendment.

## Part 1 · TC-07 · More Activity

Every line below goes through the existing `recordActivity` hook
(best-effort, after the write succeeds; ADR 0012). Activity done through a
Claude connection gets **via Claude** for free, because the MCP tools call
these same server actions. New entity types are added to
`ACTIVITY_ENTITY_TYPES` in `lib/activity.ts` with their noun, label and
field specs, and the feed's `headline` handles each one so nothing reads
doubled up (the trap the `DAY_TITLE` branch already guards against).

### A. Checklist items (`server/actions/checklists.ts`) — entity `CHECKLIST_ITEM`

Checklist items have no Plan, so they are always recorded (no fork gate).
The label is the item's text, snapshotted.

| Action | Recorded? | Line, roughly |
|---|---|---|
| `addChecklistItem` | yes, CREATED | "added *Travel insurance* to the pre-trip checklist" |
| `updateChecklistItem` | yes, UPDATED with field diffs (text, due date, assigned to) | "updated *Travel insurance*" + diffs |
| `deleteChecklistItem` | yes, DELETED | "removed *Travel insurance* from the pre-trip checklist" |
| `toggleChecklistItem` on a **Pre-trip** item | yes | "ticked off *Travel insurance*" / "un-ticked *Travel insurance*" |
| `toggleChecklistItem` on Packing or Shopping | **no** | — |
| `setBuyState` | **no** | — |
| `reorderChecklistItem` | **no** | — |
| `saveAsTemplate` / `deleteTemplate` | **no** | — |
| `applyTemplate` | yes, one `{ summary }` line | "added 23 items from the *Beach* template" |

The list name in the line comes from the item's kind (pre-trip checklist,
packing list, shopping list).

### B. Reminders (`server/actions/reminders.ts`) — entity `REMINDER`

Add, edit and remove are all recorded. Edits carry field diffs for the
title, the date and the Stop it's about. The label is the Reminder's title:
"added the *Print the insurance docs* reminder", "updated … · date 26 Nov → 28 Nov".

### C. Votes (`server/actions/votes.ts`) — entity `VOTE`

- `setVote` records one line naming the Wishlist idea and the level:
  "voted must-do on *Sintra*". When it replaces an existing vote, the line
  says what changed: "changed their vote on *Sintra* from keen to meh". When
  the level is unchanged, nothing is recorded.
- `clearVote` records **nothing**.
- No fork gate: Votes sit on the trip-wide Wishlist.
- No grouping of bursts (out of scope; log as a follow-up only if it bites).

### D. Day titles (`server/actions/day-titles.ts`) — `DAY_TITLE`, reworded

Still recorded through `recordPlanActivity` (forks stay silent). Each line now
names the title, the date and the Stop, snapshotted at the time:

- new: "titled Fri 11 Dec in Lisbon *Sintra day trip*"
- rename: "renamed Fri 11 Dec in Lisbon from *Sintra day trip* to *Rest day*"
- clear: "removed the *Sintra day trip* title from Fri 11 Dec in Lisbon"

The action reads the existing row (if any) before writing, to tell new from
rename and to keep the old text. Rows already in the feed (bare "updated a day
title") keep rendering exactly as today; no backfill.

### E. Tests

Each action's existing test file gains assertions that the right Activity is
recorded and that the excluded actions record nothing (packing tick, buy
state, reorder, templates other than apply, clear vote, unchanged vote).
`lib/activity.ts`'s pure tests cover the new headlines and labels, including
legacy `DAY_TITLE` rows.

## Part 2 · TC-08 · `clickInCard` finds `Button`-rendered triggers

- Extend `scripts/types/playwright-shim.d.ts` so `Locator` has
  `getByRole(role, { name, exact })` (real Playwright already has it).
- `resolveClickInCardTarget` in `scripts/layout-audit/overlays.ts` scopes with
  `card.getByRole(...)`; the CSS text-selector builders (`roleTagSelector`,
  `textSelector` and friends) go. The no-Card fallback (unscoped
  `page.getByRole`) stays.
- Rewrite the Step docblock that justified the CSS route.
- Unit tests in `overlays.test.ts` updated for the new calls.
- Verified live if the local app is up: `save-template` opens at ≥1024px.

## Part 3 · TC-09 · The demo seed switches on what it seeds

`prisma/demo/persist.ts` sets `forksEnabled` when a demo trip ships any forks
and `chaptersEnabled` when it ships any chapters — worked out from the data,
no new field on `DemoTrip`. Covered by `prisma/demo/persist.test.ts`.

## Docs

`docs/open-follow-ups.md`: strike TC-07, TC-08, TC-09 with what was done.

## Out of scope

Grouping bursts in the feed. Activity for Packing/Shopping ticks, reorder,
templates, clearing a vote. Backfilling old Day-title rows. `audit:layout`'s
trip-by-name resolution (GM-05).
