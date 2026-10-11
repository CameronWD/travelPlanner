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
