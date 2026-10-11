# Spec 2026-10-11 · Claude connection read pass

Same branch as spec 2026-10-11-activity-history-and-audit-seed:
`feat/activity-history-and-audit-seed-2026-10-11` (one merge to `main`).
Agreed with Cam in the session of 2026-10-11 (grill-with-docs), from a list a
Claude session using the connection wrote after real use.

**Read-only throughout.** No new write tools, no new write paths. Everything
below is real plan only (never a What-if plan), goes through the existing
acting-traveller guards (`runAsTraveller`, `requireTripAccess`), and is
registered and tested the way the existing read tools in `lib/mcp/tools/reads.ts`
and `lib/mcp/reads/` are.

## Part A · Transport: real places and local times (`get_trip_plan`)

- Each Transport gains `depPlace`, `arrPlace` and `notes` (already stored,
  just not returned).
- Each Transport's times come back the way the app shows them, computed with
  the app's own helper (`transportTimeDisplay` / `resolveEndpointZones` in
  `lib/time-display.ts`): for each end, local `time`, `date` and `zone` label.
  The zone rule is the app's: that end's Stop's timezone, else the other end's
  (home and free-text legs), else UTC. Keep the ISO instants alongside.
- Each Stop gains its `timezone`.

## Part B · Travellers (`get_trip_plan`)

`travellers: [{ name, role: "owner" | "traveller", you: boolean }]` — display
name via the existing traveller helpers; `you` marks the token's Traveller. No
email addresses.

## Part C · Costs (`list_costs`, new)

`list_costs(tripId, { unpaidOnly?: boolean, dueWithinDays?: number })`, real
plan only. Each Cost:

- amount in its own currency, and the Home-currency equivalent computed the
  same way the Budget computes it (so totals agree with the app);
- paid state: paid amount and paid date, or unpaid with its Due date if any;
- Settlement (Before you go / On the trip);
- label, category;
- its owner, named: Accommodation (name + Stop), Transport (from → to),
  Activity / Item (title + Stop, + date if scheduled), or Other cost.

`unpaidOnly` keeps only unpaid Costs; `dueWithinDays: N` keeps only unpaid
Costs whose Due date is within N days of today (the trip's current zone, as
Upcoming payments uses). Ordering: Costs with a Due date soonest first, then
the rest in plan order.

## Part D · Attachments

- **In `get_trip_plan`:** every Stop, Transport, Accommodation and thing to do
  carries `files: [{ id, title }]` (title = the Attachment's title, else its
  filename); the trip-level files appear on the trip.
- **`list_attachments(tripId)`, new:** the Trip's full index, like the app's
  Files page — each file's id, title, filename, type (mime), size, uploader's
  name, and its owner named as in Part C ("Activity: Neuschwanstein tour at
  Füssen, Fri 18 Dec", "Transport: Dublin → Como", "Trip"). Attachments on
  fork-owned things are excluded.
- **`get_attachment(attachmentId)`, new:** access-checked through the file's
  Trip. Images return as MCP image content. PDFs return their extracted text
  (new dependency: a small PDF-text library, e.g. `unpdf`); a PDF with no text
  layer returns a clear "this PDF is a scan with no readable text" message.
  Files over 10 MB are refused with a clear message; extracted text is capped
  (truncated with a note) so one document can't swamp a conversation. Other
  types return metadata and a "can't be read here" message. Globe Marker files
  are out of reach (not trip-scoped).

## Docs

- `docs/connect-claude.md`: the "It can read" list gains costs (itemised),
  attachments (list and read), Travellers, local times and transport places;
  the "cannot touch" line keeps Attachments as not writable.
- `docs/open-follow-ups.md`: add **TC-11 · Booking details as their own
  fields** — cancellation deadline, "cash only", who booked / who paid; today
  they live in free-text notes. A model and app-form change, not a connection
  change; deferred.

## Out of scope

Any write tool. Attachment upload/rename/delete. OCR of scanned PDFs. Globe
Marker files. TC-11.

## Part E · Day-planning prompts (added 2026-10-11, same session)

Two new MCP prompts in `lib/mcp/prompts.ts`, alongside `review-plan` and
`pack-for`. Prompts are instructions, not tools: they add no write access.
Both tell Claude to change nothing until the person agrees.

**The logistics check** (shared wording, used by both prompts). For each
stop on the day, in order:

- **Address** — confirm it resolves with `search_places` and name the place
  it matched.
- **Getting there** — from the previous place, give the **options** (walk,
  metro/train, bus/tram, car/taxi, as they apply) with a rough time each,
  recommend one, and confirm the gap allows for it.
- **Opening hours** — for that date and weekday, including seasonal and
  holiday closures, and whether booking is needed.
- **Fixed times** — the day's Transport (local times from `get_trip_plan`),
  check-out and check-in fit, with a buffer for airports and stations.
- Mark each point **verified** (say how — e.g. web search, `search_places`)
  or **unverified**. Teepee holds no opening hours or routing data; anything
  Claude cannot check with its own tools is flagged, never guessed.

**`plan-day`** — args `tripId`, `date` (YYYY-MM-DD), optional `brief`.
1. Read `get_trip_plan` (the Stop for that date, what's already on the day,
   Transport in local time, check-in/out), `get_wishlist` (ideas and Votes —
   favour must-dos) and `list_attachments` (existing tickets for the day).
2. Draft a timed itinerary that respects Transport and check-in/out times.
3. Run the logistics check on the draft and fix what fails.
4. Propose the itinerary, the getting-there options between stops, the check
   results, and a suggested Day title.
5. After the person agrees, build it as real things to do: Wishlist ideas via
   `schedule_thing_to_do`; new things via `add_thing_to_do` with date,
   stopId, startTime/endTime and address; the title via `set_day_title`.
   Never put the schedule in a note. Leave things already on the day alone
   unless told to move or delete them.

**`check-day`** — args `tripId`, `date`. Reads `get_trip_plan` (and
`list_attachments` for tickets), runs the logistics check on the day as it
stands, and lists problems with suggested fixes (including better
getting-there options). Changes nothing until the person agrees.

## Part F · Vocabulary for the connection (added 2026-10-11, same session)

So Claude files things as the right kind with the right Category. Wording
only: no new write ability, no change to what any tool accepts.

1. **Server instructions** (`MCP_INSTRUCTIONS`, sent on connect) grow into a
   short glossary drawn from `CONTEXT.md`: Stop (rough vs scheduled, Pinned);
   Transport is strictly Stop-to-Stop (or Home) and drives the dates — a day
   trip or local bus/train/metro is a thing to do in **Getting around**,
   never a Transport; Wishlist idea vs scheduled thing to do; Day title vs
   Note (never put a schedule in a Note); the Categories and when to use each
   (Place = somewhere to go, Sightseeing = something to see); a Cost belongs
   on its booking (Transport/Accommodation/thing to do), Other cost only for
   standalone money (insurance, visas); Settlement (Before you go / On the
   trip); the Checklist kinds; Reminder (said once, the evening before) vs
   Checklist item (persists until ticked).
2. **Field descriptions** on every enum input in the MCP tools — Category,
   transport mode, Settlement, Checklist kind, Vote level — explaining each
   value, built from one module that derives the value list from the app's
   own lists (`lib/categories.ts`, `lib/enum-values.ts`) so they can't drift.
3. **A guard test** that fails when a Category, mode, Settlement, Checklist
   kind or Vote level exists in the app without a description for Claude.

## Part G · Writing style (added 2026-10-11, same session)

Anything Claude writes into Teepee (titles, Day titles, notes, Reminders,
Checklist items, cost labels, booking notes) reads like a person jotting in a
shared planner, not like AI. The rule, carried in `MCP_INSTRUCTIONS` and in
both day-planning prompts:

> Write like a person jotting in a shared trip planner. Short, plain,
> concrete. No em dashes, no semicolons, no exclamation marks. No filler or
> hype ("nestled", "vibrant", "hidden gem", "must-see", "immerse"). Titles are
> a few words ("Sintra day trip", "Dinner at Taberna da Rua"). Notes are one or
> two short sentences with the useful facts: times, prices, booking refs, what
> to bring.

Instruction only; nothing rewrites what Claude sends.
