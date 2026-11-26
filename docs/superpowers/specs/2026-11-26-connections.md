# Connections (layovers): 2026-11-26

Agreed with Cam on 2026-11-26. He asked how the site treats layovers; it has no such thing. His two connecting journeys (Denpasar → Munich via Bangkok, Rome → home via Doha) are each stored as one Transport with the layover typed into the notes.

## What a Connection is

Two Transports in a row where the first arrives at the place the second leaves from, and the Travellers do not stay there: neither of those two ends is a Stop or the Home base.

"The same place" is the rule the Plan already uses for its "Change at …" line (the first leg's arrival place equals the second's departure place, trimmed, ignoring case), widened to also match when both ends carry the same Google place id.

Decided with Cam:
- A layover is **two Transports**, not a "via" inside one. Flight number, seat, terminal and gate belong to each flight.
- Tickets are **seen on both legs**, shared by rule (§3), not copied.

## 1. The wait, on the Plan

- The line between two stacked travel cards gains the wait: "Layover in Bangkok · 2h 35m" when both legs are flights, "Change at Lyon · 12m" otherwise. The duration uses the house format (`formatDuration`). A trailing code in brackets is dropped from the place ("Bangkok (BKK)" reads "Bangkok").
- The wait is the first leg's arrival to the second's departure. When either time is missing, or the second leaves before the first arrives, or the gap is 24 hours or more, the line shows the place alone ("Layover in Bangkok", "Change at Lyon").
- The existing "Change at …" line between two legs that meet at a Stop keeps working and gains the wait in the same way.
- **The journey home and the journey out.** The Home card at each end of the Plan holds one leg today. A journey home is the leg leaving the last Stop plus every Connection leg after it; a journey out is the leg arriving at the first Stop plus every Connection leg before it. Each is drawn as one stack with its layover lines. Everything that asks "is there a way home", "when do we get home" or "when do we leave home" reads the whole journey: the last leg's arrival, the first leg's departure.

**How it is drawn (decided with Cam on 2026-11-26 from screenshots).** The layover is its own stop on the line between the two travel cards (plane, clock, plane), with the wait in a pill beside the clock, replacing the line of text the first version put between the cards. Both cards keep their marker and share a width. Separate journeys in one slot sit further apart than the Transports of one journey.

## 2. The wait, elsewhere

- **Day view:** a line in the timeline directly after the arrival that starts a Connection, on the day of that arrival: "Layover in Bangkok · 2h 35m".
- **Shared link:** the same line between the two travel cards, and the journey home and out drawn as stacks. It shows only the place and the wait, both of which the cards already reveal. Nothing else about a Transport becomes public.

## 3. Shared tickets

- Two legs of a Connection with the same booking reference (non-empty, trimmed, ignoring case) are **one booking**. A chain of three is one booking too.
- Wherever a Transport's files are listed, a leg shows its booking partners' files after its own, each labelled with the leg it is filed on ("on Denpasar → Bangkok").
- A leg whose booking partner has a Booking confirmation counts as having one: no nudge, no "needs a ticket" mark, in the app and through the Claude connection.
- **Files** still lists each file once, under the leg it was added to. The Cost stays on the leg it was entered on.

## 4. Local time at a place that is not a Stop (found while planning)

A Transport end with no Stop has no timezone of its own today: it borrows the other end's. So a 22:15 arrival in Bangkok on a leg from Denpasar is shown, and saved, in Denpasar's time. With a Connection that is wrong on both legs, and the saved instants make the wait wrong too.

- A Transport end that is a place with coordinates and is neither a Stop nor Home gets its own zone, looked up from the coordinates when the Transport is created or when that end's place is changed, and stored on the Transport.
- Every reader of a leg's times uses, for each end: Home's zone, else the Stop's, else this stored zone, else the other end's, else UTC. So nothing changes for any Transport that has no stored zone, which is every Transport that exists today.
- The Transport form shows and reads each end's time in the same zone the save will use, including straight after a place is picked.
- **This needs a database change** (two optional columns on Transport), which the playback to Cam said there would be none of. It goes to `main` first, then beta once live.

## Not in this work

- A Flag for a too-short Connection (logged in `docs/open.md`).
- Any change to what the booking import proposes. It already makes a connection as two legs; its legs get the stored zone like any other save.
- A "via" on a single Transport.
- Backfilling a zone onto existing Transports. They gain one only when the end's place is changed; until then their times read exactly as they do today.

## Documents to bring into line

- CONTEXT.md: a new **Connection** entry; **Booking confirmation** (shared across one booking); **Transport** (a place end's own zone; the journey home and out).
- The help guide, where it describes travel on the Plan and tickets.
- `docs/open.md`: the short-Connection Flag.

## Cam's real trip, after it is live and only on his word

- Denpasar → Munich becomes Denpasar → Bangkok (TG 440, 32J/32K, the Cost and both ticket PDFs stay here) and Bangkok → Munich (TG 924, 44J/44K), both DHZU24. The Bangkok departure time comes from the ticket PDF.
- Rome → home becomes Rome → Doha (08:55 → 16:05) and Doha → Brisbane (20:25 → 17:30 next day), both 8QPEWK.
