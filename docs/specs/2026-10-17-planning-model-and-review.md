# Spec — Planning model, Flags and the AI Review (2026-10-17)

**Status:** Branch 1 (`feat/planning-model`) merged to `main`;
`cmvaig4j5000u07gwgeqrvtkd` closes on its deploy. Branch 2 built on
`feat/plan-flags-try-lists`, awaiting Cam's review, merge and deploy; on
deploy, resolve `cmvaig9lq000v07gwt50bn7k0`. One spec, three sequential
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
