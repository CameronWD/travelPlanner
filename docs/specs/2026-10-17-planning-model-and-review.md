# Spec — Planning model, Flags and the AI Review (2026-10-17)

**Status:** agreed in the 2026-10-17 session (grill). One spec, three
sequential branches, each merged and deployed by Cam before the next starts:
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
