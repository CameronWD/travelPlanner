# Spec — Planning model, Flags and the AI Review (2026-10-17)

**Status:** Branch 1 built on `feat/planning-model`; awaiting Cam's review,
merge and deploy; on deploy, resolve `cmvaig4j5000u07gwgeqrvtkd`. One spec,
three sequential branches, each merged and deployed by Cam before the next
starts: `feat/planning-model` (Branch 1), `feat/plan-flags-try-lists`
(Branch 2), `feat/trip-review` (Branch 3). This spec ships on the first.

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
