# Spec: Booking import

**Status:** agreed in the 2026-10-14 session (grill), building on branch
`feat/ai-booking-importer`. Target `main`.
**Source:** Cam's AI-features brief (2026-10-14), feature 1 of the roadmap in
`docs/ai-features.md`. Also switches on the dormant AI seam (follow-up TC-01).
**Decision record:** no ADR. CONTEXT.md gains **Booking import** and
**Proposal**.

## What it is

On a Trip, a Traveller drops a booking (PDF, screenshot/photo, `.eml`) or
pastes its text. Claude reads it and returns what it found; TEEPEE shows each
find as a **Proposal** — the real card it will become, marked as a preview —
and the Traveller confirms, edits then confirms, or discards each one. Nothing
is written until a Proposal is confirmed.

## Decisions

**Replace, don't extend, the old parser.** Keep the `lib/ai.ts` plumbing (the
`ANTHROPIC_API_KEY` gate, `import "server-only"`, lazy SDK import,
`messages.parse` + `zodOutputFormat`, `AiResult`). Delete
`parseBookingConfirmation`, `aiParseBooking`, `components/trip/ai-booking-parser.tsx`
and its two mount points (`transport-form-dialog.tsx`, `plan-header-actions.tsx`).
The one entry point is the plan header.

**Model.** `AI_MODEL` env var, default `claude-haiku-5-5`, read in one place in
`lib/ai.ts`. Request: effort `low`, no `temperature`/`top_p`/`top_k`, no
explicit `thinking` — valid unchanged on Haiku 5.5, Sonnet 5.5 and Opus 5.5.
Switching model = change `AI_MODEL` in Vercel and redeploy. A price table keyed
by model sits beside it, including Haiku 5.5's 100K-token tier ($0.10/$0.50 per
MTok up to 100K prompt tokens, $0.50/$2.50 above). An unknown model still
works; its usage row has no cost and an error report says the price is
missing. `AI_MODEL` is shared with the dormant suggestions/packing features; a
per-feature override is out of scope.

**Input.**
- PDF → `document` block; PNG/JPEG/WebP/GIF → `image` block; pasted text →
  text; `.eml` → parsed server-side to body text plus embedded PDFs/images.
- Rejected with a hint: HEIC ("share it as a screenshot or JPEG"), `.msg`
  ("forward it or paste the text").
- Limits: 10 MB (existing `validateUpload`), 30 PDF pages, pasted text keeps
  `MAX_BOOKING_TEXT_CHARS`, 20 Booking imports per Traveller per hour via the
  existing rate limiter.

**Extraction schema — Claude reports, code decides.** Claude returns only what
the document says; every field nullable, never invented.

```
{ isBooking, notBookingReason,
  proposals: [{ kind: transport|accommodation|item,
    confidence: high|medium|low, doubleCheck: string[], uncertainFields: string[],
    transport?: { mode (TRANSPORT_MODES), carrier, reference,
                  dep/arr: { place, city, country, localDateTime }, seat, travelClass },
    accommodation?: { name, address, city, country, checkIn, checkOut,
                      checkInTime, checkOutTime, confirmation },
    item?: { title, category, date, startTime, endTime, place, address, city, country, booking },
    cost?: { amount (decimal string), currency (ISO 4217), paidAmount, paidDate } }] }
```

- Times are local wall times as printed. Code converts each end using the
  matched or proposed Stop's timezone, or the Home timezone.
- Car hire maps to `CAR` (pickup/drop-off are the ends, carrier is the hire
  company). Seat, class and non-flight carrier go into Notes.
- Cost: code converts to minor units. Paid only when a paid amount is shown
  ("booked" is not paid, ADR 0037). A paid Cost with no payment date takes the
  booking date, else today.
- Item category from the existing list, else the default.
- The response is re-validated server-side with zod before any Proposal is
  built. A partial result shows the good Proposals plus "We may have missed
  something in this booking — check it against the original."

**Matching (code, deterministic).**
1. Home base first (name/country) → `depIsHome` / `arrIsHome`.
2. Existing Stops the importing Traveller may add to, by city/country and date
   overlap.
3. Otherwise a proposed **scheduled** Stop: dates from the bookings that need
   it, timezone from `guessTimezoneForCountry`, placed in date order.
- A booking whose dates clash with its Stop's attaches anyway with a warning
  badge on the card (Accommodation reuses `accommodationDateWarnings`;
  Transport gets the same treatment). Stop dates are never moved.
- A best match that is a Surprise Stop the Traveller is surprised by → the
  Proposal shows "This belongs to a Stop you can't add to" and cannot be
  confirmed.

**Duplicates.** Same reference on this Trip (`Transport.reference`,
`Accommodation.confirmation`, `Item.booking`), ignoring case and spaces; for
Transport also the same mode and date (a return flight shares one reference).
Records hidden from the Traveller are skipped. A duplicate warns on its card,
naming the existing record; Confirm is still allowed.

**Preview.** A Booking import sheet (the `FormDialog`/Sheet pattern), opened
from the plan header only when AI is configured: drop zone, file picker, paste
box. Proposals are grouped under their Stop heading in plan order; proposed
Stops are dashed "New stop" headings in date order, with their dependent
Proposals nested. Each Proposal renders with the real card — `TransportCard`
(with `LegPill` as its header), `AccommodationCard`, `ItemCard` — without
edit/cost/attachment controls, inside a dashed frame with a "Preview" badge.
Confidence, double-check notes, duplicate and date warnings sit with the card;
uncertain or missing fields are highlighted through a new optional `highlight`
prop on each card.

**Edit.** The existing Transport/Accommodation/Item/Stop form dialogs gain
optional `initialValues`, `onDraftChange` and `onSubmitOverride` props. In
Proposal mode Save reads "Confirm" and confirms instead of creating; a mini
preview card inside the dialog, and the card in the sheet, update live.

**Confirm.** `confirmProposal(tripId, proposal, forkId?)` re-validates with the
existing zod schemas and calls the existing `createStop`, `createTransport`,
`createAccommodation`, `createItem` (the last three changed to also return the
new `id`) with the inline Cost — so geocoding (Nominatim/Photon), timezone
conversion, FX snapshot, Activity and Fork handling behave exactly as a typed
entry. It writes to the plan being viewed. A dependent Proposal writes its
proposed Stop first; if the booking then fails, the Stop stays (it is a valid
Stop) and the card shows the error. Confirming a proposed Stop's dependent
confirms the Stop; discarding the Stop discards its dependents.

**Original file.** Kept in the browser only. After the first successful
confirm it is uploaded once with the existing `uploadAttachment` to that
record (same validation and quota). Pasted text attaches nothing. All
discarded, or the sheet closed → nothing stored; an abandoned import cannot
be resumed.

**Failures.**

| Situation | Message |
|---|---|
| Wrong type / too big / over 30 pages (checked before any API call) | Plain reason, with the HEIC/`.msg` hints |
| Encrypted, corrupt or blank file | "We couldn't read that file. Try a screenshot of the booking instead." |
| `isBooking: false` | "This doesn't look like a booking: {reason}." + Try another file |
| Booking with no usable Proposals | "Nothing we could add" variant |
| Our rate limit | "You've done a lot of imports this hour. Try again in N minutes." |
| Anthropic 429/529/5xx (after SDK retries) | "The reader's busy right now — try again in a minute." File kept for retry |
| Bad key / our 400 | Generic message + error report (ADR 0059) |
| `stop_reason` `max_tokens` or `refusal` | Treated as unreadable + error report |
| AI not configured | Entry point not shown |

**Spend.** New `AiUsage` table, one row per Booking import: trip id, Traveller
id, model, input / output / cache-read / cache-write tokens, estimated USD,
Proposal count, outcome (`ok` / `not_booking` / `unreadable` / `api_error` /
`rate_limited`), duration, created at. Never document content, extracted
values or filenames.

**Access.** Any Traveller on the Trip (`requireTripAccess`), real plan or the
Fork being viewed. Not exposed over MCP.

**Privacy page.** Add one sentence: when a Traveller uses a Booking import,
the file or text they choose is sent to Anthropic to be read, and TEEPEE keeps
it only if they confirm a Proposal. Keep the "only if switched on" framing the
page's tests pin.

**Rollout.** Straight to `main`. `docs/DEPLOY.md` gains the step: set
`ANTHROPIC_API_KEY` (optionally `AI_MODEL`) on main and redeploy, noting it
also switches on the dormant suggestions and packing features (TC-01).

**Build order.**
1. `docs/ai-features.md` (roadmap).
2. Backend extraction: schema, request building, `.eml`/PDF handling, usage
   logging, failure mapping — tested against a committed fictional sample
   booking with a mocked client. A live smoke script (`scripts/`) for Cam to
   run with a real key, since this sandbox has none.
3. Matching and duplicates.
4. `confirmProposal` and the id-returning creates.
5. Booking import sheet and preview cards.
6. Edit with live preview.
7. Privacy page, DEPLOY.md, removal of the old parser.

**Currencies (added in session).** Widen TEEPEE's currency list from 10 to
every currency Frankfurter (the ECB rates `lib/fx.ts` uses) supports — 30 in
all, adding BRL, CNY, CZK, DKK, HKD, HUF, IDR, ILS, INR, ISK, KRW, MXN, MYR,
NOK, PHP, PLN, RON, SEK, TRY, ZAR — everywhere a currency can be chosen, not
only in the importer. Currencies the ECB does not publish (VND, AED, MAD, EGP,
PEN, ARS, KWD…) stay out; a Booking import in one of them still drops its Cost
with a note.

**Out of scope (decided):** `.msg` and HEIC; MCP access to Booking imports;
resuming an abandoned import; moving Stop dates; a per-feature model override.
