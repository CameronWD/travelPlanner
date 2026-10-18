# Spec — Planning model, Flags and the AI Review (2026-10-17)

**Status:** Branch 1 (`feat/planning-model`) merged to `main`;
`cmvaig4j5000u07gwgeqrvtkd` closes on its deploy. Branch 2 built on
`feat/plan-flags-try-lists`, awaiting Cam's review, merge and deploy; on
deploy, resolve `cmvaig9lq000v07gwt50bn7k0`. Branch 3 built on
`feat/trip-review`, awaiting Cam's review, merge and deploy; on deploy, run
`scripts/review-smoke.ts` (both kinds — see "Branch 3: as built" below) and
then resolve `cmva5yfw4000007lawnx4y88x`. One spec, three sequential
branches, each merged and deployed by Cam before the next starts:
`feat/planning-model` (Branch 1), `feat/plan-flags-try-lists` (Branch 2),
`feat/trip-review` (Branch 3). This spec ships on the first.

**Closes (Main):**
- `cmvaig4j5000u07gwgeqrvtkd` (booking status, tentative Transport, ticket
  details) — Branch 1's last task.
- `cmvaig9lq000v07gwt50bn7k0` (opening hours + closed-day Flags, changeover
  days, checklists inside Items) — Branch 2's last task (item 9 lands in
  Branch 1, items 8 and 10 in Branch 2).
- `cmva5yfw4000007lawnx4y88x` (AI Review trip) — Branch 3's last task.

Each closing commit carries `Resolves-Feedback: <id>`; each is resolved only
once its branch is live on main.

Vocabulary (CONTEXT.md, updated in the grill): **Booking state**, **Slot
time**, **Opening hours**, **Try list**, **Review**, **Finding**.

## Decisions from the grilling

| # | Decision |
|---|---|
| R1 | One spec, three branches, in the order: planning model → Flags and Try lists → Review. |
| R2 | **Booking state** — *No booking needed* / *To book* / *Booked*, on Items, Transport and Accommodation, plus an optional **book-by date** on To book. Separate from **Paid** (a Cost's business) and from the Wishlist. A booking reference (Item `booking`, Transport `reference`, Accommodation `confirmation`) implies Booked unless the Traveller set the state; Transport and Accommodation default to To book without one, Items to No booking needed. Booking import lands Booked. **Tentative Transport is a To book leg** — no separate concept. Shown as a "To book" badge on cards and Timeline, and a "Still to book" list on Home (by book-by date). |
| R3 | **Slot time** on an Item: the ticket's time, an **arrive-by** margin (minutes), and **refundable** (yes / no / not known). The Item's start time stays the Traveller's plan; when only a slot time is set, start defaults to slot − arrive-by. Timeline: "Tour 12:00 · be there 11:45"; card: "Non-refundable". Booking import extracts these when the document says. **Cost per person declined** (money is one group total). Items only. |
| R4 | **Opening hours** on an Item, three layers: weekly hours (per weekday closed or one/two spans), **seasons** (a date range with its own weekly hours, replacing the usual), **closed dates**. Local to the Item's Stop. Shared by a thing to do and its placed copies. Entered in the Item dialog (collapsed weekday grid) and by Claude via `set_opening_hours` (with an optional source link); nothing auto-fetched in Branch 1. Card shows "Open 10:00–18:00 today" for its scheduled date. |
| R5 | **Changeover owner for Claude** (note item 9): the app already shows it (ADR 0049); `get_trip_plan`, `get_stop` and `get_day` mark each Changeover-day Item with its owning Stop. |
| R6 | **Try list** on an Item: shared ticks, ticked on Day/Today, "2/5 tried" on the Timeline, shared by a thing to do and its placed copies, MCP `set_try_list` / `tick_try_entry`. Not a Checklist. |
| R7 | **Six new Flags** (real plan only, Surprise-aware, silent when the data is missing): Closed that day (warning), Before opening (warning), After closing / within 30 min of closing (warning), Late for the slot — start after slot − arrive-by (warning), Book by soon (≤ 7 days, info) / overdue (warning), Still to book close to the day — a To book leg or stay within 14 days with no book-by date (info). Shown wherever Flags are; no `get_flags` deep mode. |
| R8 | **Review** = a saved run with **Findings** (severity, category — closure, season, ticket, holiday, logistics, stale note, packing, booking — target, title, detail, optional suggested fix, optional source). Includes current Flags restated as Findings plus model-only checks. A suggested fix that maps to an existing action gets **Apply** (runs it, with Undo); otherwise **Dismiss**. |
| R9 | A Review reads the Trip **as everyone on it sees it** (every Surprise masked, as a Share link does), so any Traveller on the Trip may read it. Things inside a Surprise are not reviewed (the per-person Flags still cover them). |
| R10 | **History:** every Review kept (who, when, kind, summary line). A **Reviews** tab beside **Summary**. Finding states: **Open**, **Applied** (by, when), **Dismissed** (by, when), **No longer found** (by a later Review). A new Review matches its Findings to the previous by category + target, carrying history; a dismissed Finding stays dismissed. Home shows "N open from the <date> review". |
| R11 | **Two kinds:** **Standard Review** — Claude Sonnet 5; **Deep Review** — Claude Opus 5 (adaptive thinking). Both use Anthropic's server-side web search (`web_search_20260209`, ≤ ~15 searches) and structured output validated by a zod schema; models are settings (`REVIEW_MODEL_STANDARD`, `REVIEW_MODEL_DEEP`). Each run records an **AiUsage** row. Runs as a background job; the tab shows "Reviewing… (started by Cam)". |
| R12 | **Permission per account**, set by an Admin on the Admin page: **Off** (default — no option shown anywhere, `review_trip` not listed to Claude), **Limited** (1 Review per day and 2 per week, per account across Trips; Standard and Deep each count one; at the cap the button reads "Next Review available <day>"), **Unlimited** (Cam and Xanni for now). Everyone: one Review running per Trip at a time. Reading, Apply and Dismiss are open to everyone on the Trip. |
| R13 | **MCP:** `review_trip(tripId, depth = "standard" | "deep")` starts one and returns its id; `get_review(reviewId)`; `list_reviews(tripId)`; Branch 1/2 tools: `set_booking_state`, the slot fields on `add_/update_thing_to_do`, `set_opening_hours`, `set_try_list`, `tick_try_entry`; every write returns the row (F6 contract). |

## Branch contents

**Branch 1 — Planning model:** Booking state (schema, actions, forms, badges, Home "Still to book", booking import, MCP); Slot time (schema, Item form, Timeline/card copy, booking import extraction, MCP); Opening hours (schema, Item dialog grid, card line, MCP `set_opening_hours`); Changeover owner in MCP reads. Closes `cmvaig4j…`.

**Branch 2 — Flags and Try lists:** the six Flags (lib/flags.ts kinds, flags-loader reads, Summary/badge/Next steps/get_flags); Try list (schema, Item dialog, Day/Today ticking, Timeline count, MCP). Closes `cmvaig9lq…`.

**Branch 3 — Review:** permission levels (schema, Admin page toggle, gating in UI and MCP tool listing); Review + Finding storage and matching; the background job (Claude API, web search, structured output, AiUsage, limits); Reviews tab, Apply/Dismiss with Undo, Home line; MCP tools. Closes `cmva5yfw…`.

## Branch rules

As every branch: never commit to, merge into, rebase onto or push `main`;
never deploy; never run `feedback:resolve`; subagents never run
`feedback:pull`; don't commit `next dev`'s CLAUDE.md block. Integration tier
and `next build` in the sandbox: throwaway Postgres on localhost; build in a
copy without `.env.production.local`. Any real Claude API call in this
sandbox needs a key the sandbox does not have — Branch 3's model calls are
unit-tested with the SDK mocked and smoke-tested by a packaged script Cam
runs (as the booking importer did).

## Out of scope

Cost per person; a `get_flags` deep mode; auto-fetching opening hours outside
a Review; a private Review for a Surprise's planner; weighting Deep Reviews
heavier than Standard against the limits; scheduling Reviews automatically
(e.g. a month before departure).

## Branch 1: as built (2026-10-17)

Built section by section (S schema/validations/helpers, then A booking
state, B booking-state display, C slot time, D opening hours + Changeover
owner), each reviewed; Task Z ran the gate and wrote this section. Full
gate: `npm test` (816 files, 11152 tests), `npx tsc --noEmit`, `npx eslint .`
(0 errors), `npm run knip` (clean), the integration tier against a sandbox
Postgres (29 files, 157 tests), and `npm run build` in a throwaway copy —
all green (task-Z-report.md has the exact run).

**What a Traveller sees:**
- Every existing leg and stay with no booking reference now reads **To
  book** (S's migration backfill), so Home's "Still to book" card fills up
  for most Trips the day this ships, not just new ones.
- Day one: past legs and stays read **Booked**. The backfill marks a leg
  that has already departed (`depAt < now()`) and a stay already checked
  into (`checkIn <= today`, so tonight's hotel counts) Booked and held
  (`bookingStateSet = true`), so the past does not fill "Still to book".
  **Deploy note:** once the new build is live, re-run the backfill once,
  because rows written by the old build during the deploy window miss it.
  It is idempotent (it only touches rows with `bookingStateSet = false`):

  ```sql
  UPDATE "Transport" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("reference"), '') IS NOT NULL;
  UPDATE "Accommodation" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("confirmation"), '') IS NOT NULL;
  UPDATE "Item" SET "bookingState" = 'BOOKED' WHERE "bookingStateSet" = false AND NULLIF(btrim("booking"), '') IS NOT NULL;
  UPDATE "Transport" SET "bookingState" = 'BOOKED', "bookingStateSet" = true WHERE "bookingStateSet" = false AND "depAt" < (now() AT TIME ZONE 'UTC');
  UPDATE "Accommodation" SET "bookingState" = 'BOOKED', "bookingStateSet" = true WHERE "bookingStateSet" = false AND "checkIn" <= to_char((now() AT TIME ZONE 'UTC') + interval '14 hours', 'YYYY-MM-DD');
  ```
- The Plan's day row's "Booked ✓" pill now follows the `bookingState`
  column, not merely whether a reference is present — a leg a Traveller
  marked To book despite having a reference shows "To book", not "Booked".
- A copy placed from a Wishlist idea (onto a day, or by Claude) carries the
  idea's opening hours, and, if the idea's Booking state was already chosen,
  its state and book-by date too.

### Section S — schema, one migration, validations, pure helpers

1. The stored `bookingState` is always the *effective* state, plus a
   `bookingStateSet` flag for whether the Traveller chose it; readers
   (Home, Flags) filter the column directly, with no re-derivation.
2. `activeBookBy` is the one book-by rule; in practice (see Deviations)
   `bookBy` is cleared from the row, not merely hidden from readers, the
   moment the state leaves To book.
3. `refundable` is `Boolean?` (true/false/`null` = not known), not an enum;
   MCP speaks `YES`/`NO`/`UNKNOWN` in both directions.
4. `arriveByMinutes` is 0–720 and needs a slot time; `defaultStartFromSlot`
   clamps at 00:00 rather than rolling into the day before.
5. Opening hours are a JSON `String` column (schema header forbids Prisma
   `Json`), not tables — one column, no join, for Branch 2's Flags too.
6. Shape: a season is a recurring `MM-DD` range; a closed date is
   `YYYY-MM-DD` or a recurring `MM-DD`; precedence is closed date → the
   shortest covering season (ties: first listed) → the usual week; an
   absent weekday means not known; spans are 1–2 per day, `24:00` is
   midnight; the `set_opening_hours` source link lives inside the JSON;
   empty hours serialise to `null`.
7. Placed copies share hours by copying on place and writing to the whole
   family, not by reading through `sourceItemId` (which is `SetNull`).
8. Fork carries every new column (a faithful copy); Duplicate carries only
   `openingHours`, the rest fall to column defaults; the Surprise
   placeholder masks every new field.
9. No `CHECK` constraints and no new indexes.
10. The migration backfill treats a whitespace-only reference as none, and
    only touches rows with `bookingStateSet = false` (idempotent).

### Section A — booking state behaviour

1. A `bookBy` sent with a result that isn't To book is refused on the
   field; a stored `bookBy` is cleared silently once the state leaves To
   book (a choice of Booked, or an un-chosen leg gaining a reference).
2. The form sends `bookingState` only once it's chosen; typing a reference
   on an un-chosen thing flips it to Booked. `bookingState` is never in a
   `*_CLEARABLE` list (a null there would erase a choice); `bookBy` is.
3. A placed copy inherits the idea's *chosen* state and its book-by date
   while To book; an un-chosen idea's copy re-derives; references are
   never copied.
4. A Fork copies all three columns as they stand; Duplicate strips
   references so writes fresh defaults (TRANSPORT → To book, ITEM → No
   booking needed).
5. Booking import lands Booked as a chosen state (`bookingStateSet` true)
   even when the document prints no reference.
6. `set_booking_state` replaces both values through the existing
   `update_*` actions — one write path, one Activity line; omitting
   `bookBy` clears it.
7. MCP exposes `bookingState` + `bookBy` only, never `bookingStateSet`.
8. Not changed: Flags and the unbooked-transport nudge (Branch 2's
   business), Print and Share (no booking state shown), the help guide
   (follow-up candidate, not done here).

### Section B — booking state display

1. Badge copy: normal size is two badges ("To book" + "Book by …");
   `compact` (leg pill, day rows) folds them into one. Booked and No
   booking needed add nothing new, except the Plan day row's existing
   "Booked ✓" pill, which now follows `bookingState`.
2. Badge placement: ItemCard, TransportCard/LegPill, AccommodationCard/
   StayPanel, every Timeline row, and the Plan day row's summary
   ("N booked · M to book"); never Share or Print.
3. Home "Still to book": real-plan only, Surprise-aware, sorted by book-by
   then the thing's own date then label (nulls last); capped at 5 rows on
   phone, 6 on desktop; shown in Planning/Final-prep on phone and
   Sketching/Planning/Final-prep on desktop; hidden while empty, Travelling
   or Past.
4. Existing Trips light up the day this ships, per S's backfill (see "What
   a Traveller sees" above) — called out as expected, not a bug.

### Section C — slot time

1. The default start is computed server-side on write (`createItem`,
   `updateItem`, `scheduleItem`, copy-in placements), and never overwrites
   an explicit start.
2. Clearing a start re-defaults it when a slot is set; changing the slot
   afterwards doesn't move a start the server already defaulted (Branch
   2's "Late for the slot" Flag covers the drift).
3. No date means no default; scheduling the idea later applies it then.
4. Copy: "Slot 12:00 · be there 11:45"; only `refundable: NO` shows
   "Non-refundable".
5. Placed copies and Forks carry the slot fields; Duplicate drops them to
   column defaults.
6. The Surprise placeholder masks `slotTime`/`arriveByMinutes`/
   `refundable` (null/`UNKNOWN`), like `booking`.
7. Booking import: an arrive-by outside 1–240 minutes is dropped; a
   `startTime` equal to the `slotTime` is dropped (the ticket time reported
   twice) and re-defaulted by `createItem`; a differing start is kept.
8. MCP `refundable` is not nullable on update (`UNKNOWN` = not known);
   `slotTime`/`arriveByMinutes` take `null` to clear.
9. Form: a native `<details>` "Ticket" disclosure after Start/End, open
   when the Item already has a slot, a margin, a known refundability, or a
   field error.
10. Not changed (follow-up candidates): the ICS feed, print, the mobile
    stop sheet's day rows and the Share page don't show the slot.

### Section D — opening hours (R4) and the Changeover owner (R5)

1. Write-through to the whole family (the edited row, audited, plus a
   silent `updateMany` over the rest), not read-through `sourceItemId`.
2. "Open 10:00–18:00 today" says "today" only on the row's actual today;
   shown on the Timeline (Day view, Travelling Home) and `ItemCard` with a
   date; not on the plan editor's compact rows, the calendar agenda, print
   or Share (Branch 2's "Closed that day" Flag covers the plan editor).
3. The Item dialog sends `openingHours` only when the editor changed it
   (like `surpriseForIds`), never through `ITEM_CLEARABLE`.
4. `owningStop` (`{ id, name }` or `null`) is on every `McpDayItem`, not
   only Changeover-day ones; on a Changeover day it names the Stop the
   Cost counts against.
5. A hidden Surprise Stop's *name* is shown (its shell, like a Transport
   endpoint); a hidden Surprise Item's placeholder always nulls
   `openingHours`.
6. Activity records one UPDATED line on the edited Item; the family's
   other rows are written silently (they're copies of the same place).
7. A Fork edit still writes the family, the real-plan idea included,
   silently, as every Fork edit is; Fork and Duplicate copies snapshot and
   leave the family.
8. `add_thing_to_do`/`update_thing_to_do` do not take `openingHours`;
   `set_opening_hours` is the one MCP path (R13).
9. The MCP prompt copy that said Teepee holds no opening hours was
   rewritten (D.12) now that it does.
10. **The hours family never crosses a Surprise** (controller ruling): a
    write on a row that is itself a Surprise (its own, or inherited via its
    Stop/Chapter) reaches only that row; otherwise the family write
    excludes Surprise rows. A planner sets a Surprise copy's hours
    separately.

### Deviations from the briefs

- **S's actual exports were authoritative** wherever A/B/C/D assumed
  otherwise: `refundable` is `Boolean?`, not an enum; `openingHours` is a
  JSON `String` column shaped `week`/`seasons`/`closed`/`source` (not
  `Json`/`weekly`/`closedDates`/`sourceUrl`); `hoursOn` returns
  `DayHours | null` carrying `by` and `seasonLabel`; the booking-state
  write rule lives once in `lib/booking-state.ts`, reused rather than
  duplicated.
- **A.3:** placed copies carry the idea's chosen Booking state and book-by
  — not "not copied" as first assumed — because a To-book idea placed on a
  day still needs booking.
- **C.2/C.3:** the default start is filled in `itemSchema`'s transform and
  `scheduleItem`'s end-needs-start check moved after the slot merge, so a
  slot+end+no-start input isn't refused before the default fills it.
- **C.11/C.13:** `MAX_ARRIVE_BY_MINUTES` is 720 (S's bound), not the
  brief's 240; MCP refundable writes accept `YES`/`NO`/`UNKNOWN`, mapped in
  the handler; Booking import keeps `arriveBy` only alongside a slot.
- **D.1–D.5:** the D briefs assumed a different `OpeningHours` shape
  (`Json`, `weekly`/`closedDates`/`sourceUrl`); S's actual shape was
  authoritative throughout, recorded in `d-as-built.md`.
- **D.3 (fix rounds 1–2):** the Surprise boundary above; the family
  `updateMany` runs inside the edited row's own transaction, with Activity
  recorded after commit (not inside the transaction, to avoid a phantom
  entry on rollback).
- **D.11/D.13 (fix round 1):** opening hours are parsed once at the MCP row
  edge, not re-parsed or cast downstream; `get_day` never invents an
  `owningStop` name, looking up real-plan Stop names instead.
- **Task Z:** `activeBookBy`'s comment said a book-by date is "kept on the
  row in any state" — stale. It's cleared from the row, not merely hidden
  from readers, the moment the state leaves To book. Corrected.

### Deferred

Five gaps that didn't meet the bar for this gate are logged in
`docs/open-follow-ups.md` under **PM-01..05** (2026-10-17 · Planning model):
the Activity summary for opening hours when only a season's content
changes, the opening-hours family recipients read before the write's
transaction, the overdue book-by showing the same as a future one, `/plan?stop=`
not read by the Plan page, and null-clear tested only on `update_accommodation`.

## Branch 2: as built (2026-10-18)

Built section by section (S the shared Try list/family foundation, then F
the six Flags, then T the Try list's app and Claude surface), each reviewed;
Task Z ran the gate and wrote this section. Full gate: `npm test` (824
files, 11,309 tests), `npx tsc --noEmit`, `npx eslint .` (0 errors), `npm
run knip` (clean, after Task Z's four fixes below), the integration tier
against a sandbox Postgres (32 files, 175 tests), and `npm run build` in a
throwaway copy — all green (task-Z-report.md has the exact run).

**What a Traveller sees:**
- Summary, the plan editor's badge and Home's Next steps now count six more
  Flags on the real plan: **Closed that day**, **Before opening**, **After
  closing** (or within 30 minutes of it), **Late for the slot**, **Book by
  soon** / **Overdue**, and **Still to book close to the day** — each
  Surprise-aware and silent whenever the data behind it (hours, a slot, a
  book-by date) isn't there.
- Tapping an Item Flag opens that Item's day (`/day/<date>`); an undated
  thing to do opens its Stop on the plan. Neither opens the Item's dialog
  directly yet (FT-01).
- The Item dialog has a Try list editor: add, rename, remove and reorder
  entries, and mark one "Tried" — a plain text list of the things to try,
  see or buy there, not a Checklist.
- Day view and both Today cards let a Traveller tick a Try list entry
  directly, with the tick shown at once and rolled back (with a toast) if
  the server refuses it.
- Any row whose Item carries a Try list shows its progress on the Timeline,
  for example "2/5 tried"; on Day and Today the count lives in the list's
  own heading instead, so it follows the ticks as they happen.
- Claude can read a Try list and its progress wherever it already reads an
  Item (`get_trip_plan`, `get_stop`, `get_item`, `get_day`), and write it
  with `set_try_list` (the whole list, Claude's `{id?, text, tried?}` shape)
  and `tick_try_entry` (one entry). `get_wishlist` is the one reader that
  still doesn't carry it (FT-04).

### Section S — the Try list column, model and validations, the Item family, copies and masking

1. `Item.tryList` is a JSON `String?` column, mirroring Opening hours: one
   column, no join, no `CHECK` constraint and no new index.
2. `lib/try-list.ts` is zod-free so components can import it, and holds the
   whole pure model: `TryList`, `TryEntryInput`, `newTryEntryId`,
   `applyTryListInput` (the merge), `withEntryTried` (the tick),
   `untickAll` and `tryListProgress`.
3. `applyTryListInput` keeps an entry's id and its tick when the input names
   a current id (unless the input gives `tried`); an id the current list
   doesn't recognise becomes a new entry with a fresh server id rather than
   being refused — a stale dialog or a second tab still saves the text. A
   repeated id in one write is refused by `tryListInputSchema`.
4. Entry ids are 8 characters of `[a-z0-9]` from `crypto.getRandomValues`;
   the schema accepts `[a-z0-9]{1,32}` so a hand-edited or older id still
   parses.
5. The stored list parses strictly (unknown key, duplicate id or more than
   30 entries all read the column as no list), mirroring
   `openingHoursSchema` — Duplicate therefore drops an unreadable list
   rather than copying garbage.
6. `lib/item-family.ts` replaces the old private opening-hours-only family
   helpers with one shared module (`itemFamilyRoot`, `itemFamilyWhere`,
   `itemFamilyRecipients`, `writeItemFamily`) used by both Opening hours and
   the Try list; `itemFamilyRecipients` takes an optional client (default
   `db`) so T's locking transaction can read it on `tx`.
7. The family shares ticks: a placed copy, and a Fork's copy, carry the
   idea's Try list exactly as it stands, ticks included (R6 "shared
   ticks"); Duplicate keeps the ids and text but resets every tick to
   untried.
8. The Surprise placeholder (`PlaceholderItem`) masks the Try list to
   `null`, like every other field a hidden Item doesn't show.

### Section F — the six Flags (R7)

1. `lib/flags.ts` gains an `ITEM` `FlagTargetType`, five new rule functions
   (`flagClosedOnDay`, `flagOutsideOpeningHours`, `flagLateForSlot`,
   `flagBookByDates`, `flagStillToBookSoon`) and the three thresholds that
   drive them (`CLOSING_SOON_MIN = 30`, `BOOK_BY_SOON_DAYS = 7`,
   `STILL_TO_BOOK_WITHIN_DAYS = 14`).
2. The two date-based rules (Book by, Still to book) need the Trip's own
   `today`; without it they stay silent, like every existing Flag starved
   of its input. The assemblers every production list goes through
   (`lib/flags-loader.ts`, `lib/next-steps-builder.ts`) make `today`
   required, so it's a type error to forget it there.
3. Only plan placements flag: an Item with neither a Stop nor a date (a
   Wishlist idea) is skipped by every new rule, keeping the badge equal to
   the Summary list without touching the shared Surprise-fragment `where`.
4. Surprise: the new rules filter by `hiddenItemIds` and `hiddenStopIds`
   directly, not through `outsideHidden` — an Item of a *visible* Stop on a
   Changeover day shared with a hidden Stop still flags, and a leg into a
   hidden Stop (Transport is the outside of a Surprise) still flags too.
5. An overnight Item (its end is at or before its start) gets no After
   closing check at all, because the end lies on the next day and comparing
   it against today's spans would be false (FT-07 is the one edge this
   leaves open: a start right before closing with no flag).
6. Wording follows the existing Flag voice: every message ends with ".", a
   season closure names the season when it has a label ("closed on Tuesdays
   (Winter)") and says "at that time of year" when it doesn't, a `24:00`
   close reads "midnight", and a leg reads like "the train from Nuremberg to
   Munich" (CAR is "the drive"; a Home end is the Home base name).
7. Compare counts the six new kinds in every column, Forks included, with
   `today` set to the real plan's Trip today — reading CONTEXT.md's "a Fork
   has its own … Flags" literally, so a Fork's own closures and overdue
   bookings count against it rather than disappearing from the comparison.
8. An Item Flag names the Item an item Flag is about (`get_flags` gains
   `itemId`); nothing else about `get_flags` changed — still no deep mode.
9. The final-prep demo seed now stores a real `bookingState` through
   `bookingStateWrite` (the same rule every writer uses) and gives it one
   To-book dinner, so the new booking Flags have something to show; real
   Trip seeding has the same original gap but isn't touched (FT-03).

### Section T — Try list behaviour (R6)

1. `createItem`/`updateItem` take `tryList` under the PATCH contract (never
   through `ITEM_CLEARABLE`, sent only when the editor actually changed it,
   exactly like `openingHours`); `setTryList` replaces the whole list and
   `tickTryEntry` flips one entry, both atomic across the Item family.
2. Every family writer — ticks, list edits, `setOpeningHours` and the
   opening-hours path of `updateItem` — now takes the same `lockItemFamily`
   lock (`SELECT … FOR UPDATE` over the family's rows, in id order) inside
   its transaction, because an unlocked writer and a locking tick could
   otherwise deadlock (40P01). Taking one lock, in one order, everywhere
   avoids that.
3. The merge runs under that lock: an entry with a known id keeps its tick
   unless the write names one, so a dialog opened before a partner's tick
   doesn't erase it on save; an unknown id becomes a new entry (a stale
   dialog's rename survives as an addition); a repeated id in one write is
   refused.
4. A tick on an entry that's gone is refused with "That one is no longer on
   the list."; a tick to the state the entry is already in is a no-op
   success.
5. Ticking records no Activity (the Packing/Shopping precedent: ticked off
   one at a time, as you go, it would just be noise); adding, renaming,
   removing or reordering entries records one UPDATED line with the
   before/after list. A tick-only `set_try_list` call (texts unchanged)
   compares equal and records nothing either.
6. It shows wherever an Item reaches the Day view, Today, the plan editor,
   the Wishlist board and the Item dialog; it's tickable only in the
   Timeline's `day` variant (the Day page and both Today cards) — the
   calendar agenda, Print and the Share page show nothing, following the
   Opening-hours precedent.
7. The dialog editor edits entries and marks one "Tried"; it never ticks —
   ticking belongs to Day and Today.
8. `requireRowAccess("item", id)` gates who may tick or edit (any Trip
   member not surprised by the Item — there's no read-only role); the MCP
   tools add `requireRealPlanRow`.
9. MCP gains `set_try_list({ itemId, entries })` and `tick_try_entry({
   itemId, entryId, tried? })`, both returning the updated Item (the F6
   write-returns contract); every MCP read that already carries an Item
   (`get_trip_plan`, `get_stop`, `get_item`, `get_day`) now carries its Try
   list too. `set_try_list`'s commit (`31769773`) carries
   `Resolves-Feedback: cmvaig9lq000v07gwt50bn7k0`, Section T's — and this
   spec's Branch 2 — last task.

### Deviations from the briefs

- **S's actual exports were authoritative** wherever F or T assumed
  otherwise, per the controller's ruling before any task started: there is
  no `lib/try-list-ops.ts` — the pure list ops (`resolveTryList` →
  `applyTryListInput`, `tickEntry` → `withEntryTried`, `triedCount` →
  `tryListProgress`) live in `lib/try-list.ts` (S.2); `tryListInputSchema`
  already existed from S.3, so T.2 only wired it into `itemSchema`; the
  family helper is `lib/item-family.ts`'s `itemFamilyRecipients(item,
  client?)`, not a private `items.ts` helper taking `(client, item)`.
- **The lock helper is `lockItemFamily`, shared by every family writer**
  (T.3), not a Try-list-only lock as first briefed — see Section T,
  decision 2.
- **T.1's brief-mocked deterministic ids don't work:** `applyTryListInput`
  mints ids inside its own module, so `vi.mock("@/lib/try-list")` can't
  intercept them; T.1's unit tests match new ids by shape
  (`/^[a-z0-9]{8}$/`) instead.
- **T's integration fixture ids were adapted** from the brief's `"it-e1"`
  (which fails S's real `[a-z0-9]{1,32}` id schema — no hyphens) to
  schema-valid ids with a comment explaining why (T.12).
- **F.11's demo seed field order** in `prisma/demo/persist.ts`'s Item `data`
  block differs cosmetically from the brief's snippet (the booking-columns
  spread sits after `sourceMarkerId` instead of straight after `booking`);
  object literal field order has no runtime effect.
- **Task Z (this gate):** `npm run knip` found three Flag threshold
  constants (`CLOSING_SOON_MIN`, `BOOK_BY_SOON_DAYS`,
  `STILL_TO_BOOK_WITHIN_DAYS`) and the `TryEntry` type exported but unused
  outside their own modules. Fixed in four separate `fix(...)` commits: the
  three constants are now asserted against the boundary values their tests
  already exercised (`lib/flags-planning.test.ts`), tying each threshold to
  the behaviour it drives instead of a duplicate literal; `TryEntry` (S.2)
  simply stopped being exported, since nothing outside `lib/try-list.ts`
  names it — consumers take `TryList` or `TryEntryInput`.

### Deferred

Seven gaps that didn't meet the bar for this gate are logged in
`docs/open-follow-ups.md` under **FT-01..07** (2026-10-17 · Flags and Try
lists): an Item Flag deep link that opens the dialog rather than the day,
Compare passing no hidden Stop/Item ids to `detectFlags`,
`prisma/real/persist.ts` not storing Booking state, `get_wishlist` ideas
carrying no Try list or Opening hours, a family's recipients being read
before its row lock, other multi-row Item transactions (Forks, Stops) not
taking the family lock, and an overnight Item starting just before closing
going unflagged.

### Final fix wave (whole-branch review, 2026-10-18)

- **A save that also hides the Item keeps it off the family (I1).** The
  Surprise part of `updateItem` lands after its family write, so the family
  is now worked out by `itemFamilyRecipientsForSave`: a save that sets a
  non-empty `surpriseForIds`, or whose Stop is inside a live Surprise,
  reaches only the edited row (Try list and Opening hours alike).
- **A tick reaches each family row on its own list (I2).** `lockItemFamily`
  returns every locked row's list, and `tickTryEntry` applies
  `withEntryTried` to each row separately, writing only the rows that hold
  that entry and actually change. A revealed Surprise copy whose list
  diverged keeps its other entries. Outcomes are unchanged ("gone" and
  "unchanged" read the edited row only).
- **Known limitation:** whole-list writes (`setTryList`, and the dialog's
  `updateItem`) stay last-writer-wins across the family: they write the
  edited row's merged list over every recipient, so a revealed copy's
  diverged entries are replaced by a whole-list edit made elsewhere in the
  family.
- **Every tick refreshes the plan (I3),** including "unchanged" and "gone",
  so a stale page reconciles with a partner's tick or a removed entry.
- **A drive needs no booking by default (I4, Cam's ruling).** A CAR
  Transport leg with no booking reference now derives **No booking needed**
  (`NONE`), not To book, unless the Traveller chose a state; a reference
  still means Booked. `lib/booking-state.ts` gains a `DRIVE` subject and
  `transportBookingSubject(mode)`, which every Transport writer passes:
  `createTransport`/`updateTransport` (so MCP and Booking import, which go
  through them), the Fork copy (`lib/fork-plan.ts`), Duplicate trip (which
  now stores the mode's default instead of leaving the column default), the
  demo's `demoBookingColumns` and the Transport dialog's preview. A mode
  change on an unchosen leg re-derives the state, because `updateTransport`
  takes the subject from the mode after the write. Existing rows are fixed
  by a new data-only migration,
  `20261018120000_drive_booking_default` (the Branch 1 migration is
  deployed and stays untouched).
- **Deploy note (I4):** rows written by the old build during the deploy
  window miss the migration, so re-run its statement once after the deploy
  is live. It is idempotent:

  ```sql
  UPDATE "Transport" SET "bookingState" = 'NONE', "bookBy" = NULL
  WHERE "bookingStateSet" = false AND "mode" = 'CAR' AND NULLIF(btrim("reference"), '') IS NULL;
  ```

  `prisma/real/persist.ts` still stores no Booking state at all (FT-03), so
  a drive it loads takes the column default (To book) like every other leg.
- **Minors and parked review items.** The promote preview selects the
  fields Compare reads and passes the real plan's today, so its Flag delta
  matches Compare (M5). Text typed in "New thing to try" but not added is
  saved with the list and makes the dialog dirty (M6). The badge parses
  Opening hours only for placed rows (M7). FT-06 names `deleteItem` (M8).
  The Try list editor describes a ticked entry as Tried, never submits on
  Enter in a rename, and keeps focus on a sensible control after a move;
  `flag-list.tsx`'s `FlagTargetType` switch is exhaustive; `get_stop`'s
  description names `openingHours` and `tryList`; and the badge=Summary,
  Changeover-day, tick-isolation and Surprise-payload tests were added.
- **Final gate (this wave):** `npm test` (824 files, 11,339 tests),
  `npx tsc --noEmit`, `npx eslint .` (0 errors, 7 warnings, all in files
  this branch doesn't touch), `npm run knip` (clean), the integration tier
  against a sandbox Postgres (33 files, 180 tests), and `npm run build` in a
  throwaway copy: all green.

## Branch 3: as built (2026-10-18)

Built section by section (P permission and limits, then R Review/Finding
storage, matching and Apply/Dismiss/Undo plus P.8's counted-starts helper,
then J the background job, then U the Reviews tab, then M the MCP tools),
each reviewed; Task Z ran the gate and wrote this section. Full gate: `npm
test` (855 files, 11,686 tests), `npx tsc --noEmit`, `npx eslint .` (0
errors, 8 warnings — 7 pre-existing in files this branch doesn't touch, one
new style warning on an un-exported constant only used as a type), `npm run
knip` (clean, after Task Z's seven fixes below), the integration tier
against a sandbox Postgres (43 files, 232 tests), and `npm run build` in a
throwaway copy — all green (task-Z-report.md has the exact run).

**What a Traveller sees:**
- A **Reviews** tab sits beside Summary everywhere Summary appears (primary
  nav, the More page, the phone More sheet, the rail's More match set, the
  ≥1280px sidebar's Keep group, the ⌘K Go to list, the Help legend's sidebar
  list), icon `SearchCheck`.
- The two run buttons, **Standard Review** and **Deep Review**, show only to
  an account whose Review permission is Limited or Unlimited — today that is
  only `cammark.williams@gmail.com` and `xanni99.m@hotmail.com`, the two
  accounts the migration grants Unlimited (Cam's ruling: his personal
  account, not his work one). Everyone else sees no option where the buttons
  would be — Off shows nothing, "no option shown anywhere" (R12).
- A Limited account (none exist yet; an Admin grants it on `/admin`) sees the
  same buttons until it uses its allowance — 1 Review per rolling 24 hours
  and 2 per rolling 7 days, across every Trip the account can reach, Standard
  and Deep each counting one — then one disabled button reading "Next Review
  available today at HH:MM" / "tomorrow" / a weekday name / "next <weekday>",
  in the viewer's device timezone. A failed run, or a stale RUNNING row over
  15 minutes old, never counts against it.
- While one runs, the tab reads "Reviewing… (started by <name>)" and polls
  every 10 seconds (skipping a hidden tab); Home shows the same fact as one
  line under the What's New banner, linking to the tab.
- The latest Review's Findings group by category, each with its severity,
  detail and an optional source link (opened in a new tab only when it
  parses as `http(s)`). **Apply** (a 6-second toast Undo, plus a persistent
  Undo on the Finding), **Dismiss**, and Undo of a Dismiss all show only on
  the Trip's latest DONE Review's OPEN (or APPLIED, for Undo) Findings — an
  older Review is read-only. **Undo of an Apply works on any Review**,
  because it only ever restores captured values or reopens the Finding, so
  it can never misrepresent history.
- History lists every past Review (who, when, kind, summary line); once a
  newer Review supersedes it, each of its Findings reads Open, Applied,
  Dismissed (by, when) or **No longer found**, and a Dismissed Finding found
  again stays Dismissed rather than reopening.
- Whoever started a Review, or acted on a Finding, and then had their
  account deleted, is shown as **"a former Traveller"** rather than
  vanishing (`Review.startedById` and `Finding.stateById` are both nullable,
  `onDelete: SetNull`).
- A Finding whose target a Surprise now hides from the viewer is dropped
  from the list, the counts and Claude's reads; a suggested fix aimed at a
  hidden or deleted row is withheld, so Apply reports "That's no longer in
  the plan" instead of reaching into a Surprise. This can't be perfect: text
  that *names* something which only became a Surprise after the Review ran
  can't be masked after the fact (a known limitation, not a bug).

**What Cam must set in Vercel:** nothing new beyond what the booking importer
already needs — Reviews run on the same `ANTHROPIC_API_KEY`. Optionally set
`REVIEW_MODEL_STANDARD` (default `claude-sonnet-5`) and `REVIEW_MODEL_DEEP`
(default `claude-opus-5`) if either should differ from the default. The full
steps — including the deploy-time spend limit, keeping Fluid compute on with
Max Duration at 300 s, and the first real Review to check after deploy — are
in `docs/DEPLOY.md`'s "Enabling Reviews" section.

**`scripts/review-smoke.ts` — the hard deploy gate.** Run
`ANTHROPIC_API_KEY=… npx tsx --conditions=react-server scripts/review-smoke.ts standard`
and the same with `deep`, using whichever `REVIEW_MODEL_STANDARD`/
`REVIEW_MODEL_DEEP` Production will use. Each prints the model, time,
searches, cost and the Findings it would store, then `PASS` or `FAIL` (exit
1 on `FAIL`); pass a `get_trip_plan` JSON saved from a Claude connection as a
second argument to smoke-test a real Trip instead of the built-in Kyoto
sample. **Branch 3 must not deploy until both print PASS.** A Review sends a
strict `submit_review` client tool in the same request as web search, whose
results carry citations — a pairing the unit tests (the SDK mocked) can't
verify and this sandbox can't run at all (no `ANTHROPIC_API_KEY`). A `400`
whose message mentions citations means the pairing is refused live and needs
a code change (drop `strict: true`), not a setting; `docs/DEPLOY.md` spells
out every other failure mode.

### Section P — permission and limits

1. **Cam's granted account is his personal address, not his work one.**
   The migration matches `cammark.williams@gmail.com` and
   `xanni99.m@hotmail.com` case- and space-insensitively and grants only
   those two UNLIMITED; every other existing account, Cam's work address
   included, is OFF. A missing address updates nothing.
2. **Permission is a `User` column, not an env var**, so an Admin can change
   it from `/admin` with no deploy; Admin standing (`ADMIN_EMAILS`) and
   Review permission stay independent — an Admin is Off until set otherwise.
3. **An unknown stored value reads as OFF** (`parseReviewPermission`), like
   every other enum-ish `String` column with no `CHECK` constraint.
4. **`REVIEW_STALE_AFTER_MS = 15 * 60_000` is defined once**, in
   `lib/review-permission.ts`; R, J and U import it from there rather than
   redefining it.
5. **Limit windows are DB-backed, not `lib/rate-limit.ts`'s in-memory
   counter**, because a per-account cap across Trips, instances and deploys
   needs rows, not process memory. A start is inside a window when `start >
   now − window`; at exactly `start + 24h` it has left. DONE and fresh
   RUNNING rows count; FAILED and stale RUNNING (over 15 minutes) don't.
6. **`nextAvailableAt` with both caps full** is the later of the two moments
   the windows free up, not simply the oldest start's.
7. **The label's day is the viewer's device timezone**, since no timezone is
   stored per User; MCP has no timezone, so it returns the ISO instant
   instead. Wording: "today at HH:MM", "tomorrow", a weekday (2-6 days
   away), "next <weekday>" at exactly 7 days (the weekly cap), so it can't
   misread as today.
8. **The start lock is on the `User` row** (`SELECT … FOR UPDATE`), the same
   pattern as `lockItemFamily`'s raw `FOR UPDATE`; it doesn't by itself
   serialise two different accounts starting on one Trip — J's per-Trip lock
   covers that.
9. **The Admin panel is a three-way Segmented control per account row**, not
   a Select, saving on click; Cam's own row is editable too.

### Section R — Review and Finding storage, matching, Apply/Dismiss/Undo

1. **`suggestedFix` lives in `lib/review/schema.ts`, not `lib/review/types.ts`.**
   `types.ts` stays zod-free (U's client components import it for labels and
   enum values); the schema sits beside it instead.
2. **No `"flag"` category.** Each restated Flag maps by its id prefix onto
   one of the eight categories (closures/hours → CLOSURE, the slot → TICKET,
   book-by/still-to-book/stays → BOOKING, everything else → LOGISTICS);
   `origin: "FLAG"` already says where it came from. A drift test fails when
   a new Flag id has no mapping.
3. **A Finding's key is `category|targetType|targetRef[|flagId]`**
   (`targetRef` is `targetId ?? date ?? "-"`); a restated Flag appends its
   own stable Flag id so two Flags sharing a category and target each match
   themselves across runs.
4. **Only an unmatched OPEN Finding becomes GONE.** An unmatched DISMISSED
   or APPLIED Finding keeps its state, so "Dismissed by Xanni" is never
   erased by a later Review that simply didn't re-raise it.
5. **A match records `previousId` and carries `firstFoundAt`** forward, so
   history has a real "first found" date to show.
6. **Apply and Dismiss work only on the Trip's latest DONE Review's
   Findings** (refusal code `"replaced"`), because matching only reads the
   latest DONE Review forward. **Undo works on any Review.**
7. **Undo refuses when the target has changed since Apply** (`"changed"`):
   Apply stores both the before and after values, and Undo checks the row
   still holds "after" before writing "before" back, so a later edit is
   never silently overwritten.
8. **Booking Undo restores "not chosen"**, not a hand-picked state: when the
   state before Apply was derived, Undo sends `bookingState: null`, and the
   row re-derives from its reference as it did before.
9. **Apply claims the Finding (a conditional `updateMany … WHERE state =
   OPEN`) before running the action**, and releases it on failure, so two
   simultaneous Applies — or an Apply racing a Dismiss — run the action at
   most once; Undo of a Finding still mid-claim (no payload yet) is refused
   (`"applying"`).
10. **Reads hide a Finding whose target a later Surprise now hides**, even
    though R9 made the Review safe when it ran — `requireFindingAccess`
    treats a hidden Finding as missing, and DAY/TRIP Findings (no
    `targetId`) are kept by an `OR` rather than a bare `NOT IN` (which would
    drop every target-less row).
11. **The revalidation scope is `"reviews"`** (`lib/revalidate.ts`), covering
    Home and `/reviews`; R.10 is its only owner, so U.1 became a no-op.
12. **`saveReviewResult` re-validates each fix and refuses a non-RUNNING
    row.** An invalid fix is stored as no fix (Dismiss-only); a save onto an
    already-FAILED or already-DONE Review reports `saved: false` rather than
    double-writing.
13. **A known, unfixed race:** a Dismiss landing in the instant between a new
    Review's read of the previous Findings and its commit is not carried
    forward — the window is one transaction long.
14. **A deleted actor's name survives.** `Finding.stateById` is `SetNull`
    too, so a Dismissed or Applied Finding whose actor's account is gone
    still reads "a former Traveller" rather than losing its subject.

### Section J — the background job

1. **Structured output is a strict client tool (`submit_review`), not
   `output_config.format`.** The documented alternative to JSON output
   formats, which are incompatible with web search's citations; a forced
   `tool_choice` can't combine with thinking, so the prompt states the
   expectation instead and the job nudges once on a bare `end_turn` before
   failing.
2. **`eager_input_streaming` stays off**, so the server fully validates the
   strict input before the job ever reads it — the job only calls
   `finalMessage()`, never deltas.
3. **`maxDuration = 300`** on both the Reviews page and `/api/mcp` (Vercel
   Hobby's ceiling); the job aborts its own call at `REVIEW_RUN_BUDGET_MS =
   270_000` and records FAILED itself, with the 15-minute stale rule still
   covering a platform-level kill.
4. **Deep sends `thinking: { type: "adaptive" }`** (`effort: "high"`,
   `max_tokens: 64_000`); Standard sends no `thinking` block at all (Sonnet
   5 runs adaptive by default) with `effort: "medium"` and `max_tokens:
   32_000`. Neither sends `budget_tokens`.
5. **`pause_turn` is resumed with no extra user message**, at most
   `REVIEW_MAX_CONTINUATIONS = 3` times, bounding web search at roughly `4 ×
   max_uses`; a top-level `cache_control` lets each continuation read the
   prefix from cache.
6. **The Review reads the plan as a Share link's null viewer would**
   (`loadTripPlanView(tripId, null)`), the same Surprise masking R9 asks
   for — booking references, confirmation numbers, Attachment titles,
   Traveller names and `you` are all dropped; every `surprise` object
   becomes a bare `true`.
7. **The restated Flags are computed the same way** (`loadFlagRows(tripId,
   null)`) so Claude's `<current_flags>` and R's `flagsToFindings` agree on
   what everyone sees.
8. **Hidden or invented ids move to the TRIP level.** A Finding whose target
   isn't a visible entity of that type in the input (an invented id, a
   Surprise placeholder, a hidden Stop's shell) is stored as a TRIP Finding
   instead; a suggested fix pointed at an unknown id, or that fails R's
   schema, is dropped and the Finding becomes Dismiss-only.
9. **One Finding per key, Flags before Claude's** (`mergeDrafts`), so R10's
   matching never sees two Findings sharing a key; Claude's own Findings cap
   at `MAX_MODEL_FINDINGS = 40`, truncated rather than rejected.
10. **The start lock is `FOR NO KEY UPDATE` on the User row, then the Trip
    row, always in that order**, so starts never deadlock; inside the lock,
    stale RUNNING rows of that Trip *and* that account are flipped to
    FAILED first, so neither blocks nor counts regardless of P's read
    filters.
11. **`runReview` is a system job**: it never calls `requireUser`, reads
    `startedById` off the row, and returns at once for a row that's missing
    or no longer RUNNING — it may run inside the MCP route's `after()`,
    possibly still carrying `runAsTraveller`'s context, but never uses it.
12. **The smoke script takes an optional saved `get_trip_plan` JSON**; with
    none, it reviews a built-in Kyoto sample (a Monday museum closure,
    Culture Day, a stale note, a still-to-book train, a hidden Surprise).

### Section U — the Reviews tab

1. **"Reviews" sits right after Summary** in `primaryNav` (keeping
   `lib/help-guide.test.ts`'s nav-drift guard covering it), and everywhere
   else Summary appears, with no rail/Dock/phone-tab slot of its own, icon
   `SearchCheck`.
2. **Apply, Dismiss and Undo show only on the latest DONE Review** — an
   older one is a read-only record whose Findings were already carried
   forward or marked "No longer found" by matching.
3. **Undo appears twice:** the 6-second toast after Apply (the existing
   `useUndoableAction` pattern) and a persistent **Undo** button on an
   APPLIED Finding of the latest Review, since R's saved payload outlives
   the toast. Dismiss itself keeps no toast-Undo, but an already-Dismissed
   Finding of the latest Review still offers Undo (R's own rule, which
   supersedes an earlier brief assumption that Dismiss had none at all).
4. **The "Next Review available <day>" label is the viewer's device
   timezone**, via `deviceTimeZone()`, with the server render falling back
   to the Trip's current timezone.
5. **Run panel precedence:** Off shows nothing; no API key disables both
   buttons ("Reviews are not set up"); a Review already running on the Trip
   disables both; at the cap, one disabled button names when it returns;
   otherwise both "Standard Review" and "Deep Review" are live.
6. **`ReviewPoller` refreshes every 10 s while a Review runs**, skipping a
   hidden tab, and unmounts itself once the refreshed page no longer shows
   one.
7. **The Home line sits directly under the What's New banner**, above both
   the phone and desktop trees, reusing `latestReview` with no new query;
   Reviews and Home both render dates in the Trip's current timezone, which
   is deterministic on the server (the run panel's own label is the one
   place that needs the viewer's).
8. **A Finding's `source` renders only when it parses as `http(s)`**, opened
   with `rel="noopener noreferrer"` — the model wrote it, so it's untrusted.
9. **Each `FindingCard` carries its own `canApply`/`canDismiss`/`canUndo`**
   (R's computed flags), not one page-level "actionable" gate, because Undo
   of an Apply must still show on a Finding whose Review is no longer the
   latest — a single review-wide flag couldn't express that.
10. **Left out on purpose:** `GUIDE_NAV_LABELS`/help prose and the layout-
    and contrast-audit route lists, both optional and unenforced.

### Section M — MCP

1. **The tool list is built per request, from the freshly loaded
   permission.** `buildMcpServer(caller)` registers `review_trip` only when
   `caller.reviewPermission` is Limited or Unlimited; an Admin's change
   takes effect on Claude's very next request, with no SDK `disable()` or
   listing hook needed.
2. **Gating fails closed twice.** The tool isn't registered for Off (the SDK
   answers "Tool review_trip not found"), and `startReview` re-checks the
   permission itself inside its own transaction, so a call that somehow
   reaches it anyway still starts nothing.
3. **`get_review` and `list_reviews` reuse R's own reads** (`listReviews`,
   `getReview`) rather than a parallel query, so Claude gets exactly R's
   guard order, Surprise masking (a hidden Finding's fix and `fixWith` both
   null, the Finding itself dropped from lists and counts), stale-as-FAILED
   status and "a former Traveller" naming, for free.
4. **Same vocabulary in reads and writes.** `depth` is `"standard" |
   "deep"` in both `review_trip` and the reads; a Finding's `target.type`
   uses the same words `set_booking_state`'s `kind` takes; `fixWith` names
   the existing tool that would make the change.
5. **No `apply_finding` or `dismiss_finding` tool.** Claude can already make
   a suggested change with the tool `fixWith` names, but can't move the
   Finding itself to Applied or Dismissed — R13 lists only the three tools
   (a candidate follow-up, RV-01).
6. **The instructions follow the listing:** every caller's base instructions
   gain one sentence about reading Reviews; the Reviews-running sentence is
   appended only for a caller who can actually run one.
7. **`maxDuration = 300` on `/api/mcp`**, matching the Reviews page, because
   a Review started from Claude runs its model call inside the route's own
   `after()`.
8. **A stale run reads as FAILED** through the same effective-status rule R
   and J use, with the text "This Review stopped before it finished.", so
   Claude stops polling a dead run.

### Deviations from the briefs

- **Each earlier section's actual exports were authoritative** wherever a
  later brief assumed otherwise — notably: `lib/review/fix.ts`'s
  `suggestedFixSchema` lives beside `types.ts`, not inside it (R.2);
  `REVIEW_STALE_AFTER_MS` is defined once in `lib/review-permission.ts` and
  re-exported, never redefined (R.2, per the Reconciliation rule); U's
  `nextReviewLabel` re-exports P.4's already-shipped-and-tested function
  rather than shipping a second, differently-worded one ("today at HH:MM",
  not "later today" — U.4); M.2's reads are thin mappers over R's
  `listReviews`/`getReview`, not a parallel narrow query as M's own brief
  first assumed.
- **P.2's brief-supplied migration test had two bugs**, both in the test
  only: it asserted Cam's *work* address as UNLIMITED (contradicting the
  granted-accounts rule and the migration's own SQL) and asserted the
  `GRANTED` array's length as 3 when it has 2. Both assertions were
  corrected to match the spec-correct, already-right migration.
- **R.1: `Review.startedById` and `Finding.stateById` are nullable, with
  `onDelete: SetNull`** (a controller ruling during review, not in the
  brief), so a Dismissed or Applied Finding's "who" survives the actor's
  account being deleted as "a former Traveller", instead of losing its
  subject or cascading away.
- **R.7: a test was made deterministic.** The brief's assertion compared a
  `firstFoundAt` against the real wall clock, which fails in a sandbox whose
  date sits before the brief's hard-coded reference instant; the fix passes
  an explicit `now` through `saveReviewResult`'s `meta` instead.
- **J.4: `loadTripProjection` was split from `getTripProjection`**, the same
  pattern J.3 already used for the plan reader, because the brief's call
  chain would have hit `requireUser`/`auth()` inside a job that runs with no
  session.
- **J.7: `callReviewModel` now truly never throws** — client construction
  (which throws with no API key) was outside any `try` in the brief and is
  now caught and reported as `unreadable`.
- **J's Finding categories are UPPERCASE** (`CLOSURE`, `TICKET`, …), matching
  R's actual enum, not the lowercase strings several briefs (J, U) assumed
  before R's values were pinned.
- **J.8: `failReview` wraps R's `markReviewFailed`** rather than writing its
  own `updateMany`, and that function's third parameter became an options
  object (`{ now?, aiUsageId? }`) so a failed run still carries its spend.
- **J.10: `beginReview`'s stale sweep uses `lte`, not `lt`**, so a RUNNING
  row exactly `REVIEW_STALE_AFTER_MS` old is swept consistently with
  `effectiveReviewStatus`'s own `>=` check.
- **U.2/U.6: each `FindingCard` carries `canApply`/`canDismiss`/`canUndo`**
  rather than the brief's single page-level `actionable` flag — see Section
  U decision 9; `ShownReview.actionable`/`isLatest` are kept for page-level
  copy, not as the button gate.
- **U.6: `loadReviewsPage` only handles the one case `getReview` itself
  doesn't** — a `reviewId` for a *different* Trip than the page — since the
  real `getReview` already calls `notFound()` on a missing id rather than
  resolving `null` as the brief's mock assumed.
- **M.5 reuses `reviewPermissionOf`** as a second small query rather than
  widening the existing acting-Traveller select, keeping `ActingUser` at
  four fields (a candidate follow-up, RV-03); on a `"limit"` refusal it
  appends "The next one is available from `<ISO>`." so `nextAvailableAt`
  reaches Claude, since `runTool` would otherwise drop it.
- **Task Z (this gate):** `npm run knip` found seven exports with no
  importer outside their own module — `DEFAULT_REVIEW_MODELS` (J.1),
  `mcpInstructions`, `APPLY_STALE_AFTER_MS` (R.9), `REVIEW_STATUSES` (R.2),
  `McpFinding` (M.2), `TravellerRef` (R.8) and `ShownReview` (U.6). All
  seven are still used inside their own file, so only the `export` keyword
  came off, in one `fix(review,mcp): …` commit; no behaviour change.

### Deferred

Four gaps that didn't meet the bar for this gate are logged in
`docs/open-follow-ups.md` under **RV-01..04** (2026-10-18 · AI Review):
Claude can't Apply or Dismiss a Finding itself, the 50-Review history cap
has no way to page further, the MCP route's permission check is a second
query rather than folded into the existing one, and a theoretical deadlock
window between starting a Review and saving one that has been noted but not
yet commented or fixed.

Separately, six smaller items were raised and parked during the R, J, U and
M code reviews for a later whole-branch fix wave rather than fixed on this
gate (per the controller's addendum, not Task Z's to do): recording AiUsage
right after the model call rather than after draft cleaning; the
stranded-Apply cutoff and its conditional payload save; Undo's rollback
using `landedStep` and the throw-after-move case; `reviewPermissionOf`
calling through `parseReviewPermission`; the MCP vocabulary wording items
(`FIX_WITH_TOOL`'s `bookingState`→`state`, note-append semantics, APPLIED's
meaning, the DAY target, UTC for next-available, and `list_reviews`'s cap in
its own description); and the deadlock comment above (RV-04).
