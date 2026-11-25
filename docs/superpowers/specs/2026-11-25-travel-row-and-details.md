# Travel on the Plan: a proper row, with Travel details, 2026-11-25

Agreed with Cam on 25 Nov. On the Plan a Transport is a 28px pill between two Stop cards showing mode, route and departure time. It is the smallest thing on the page and carries the dates the plan hangs off; the arrival time, booking reference, flight or train number and seat only appear after a tap. A Transport also has nowhere to keep a flight number or a seat: the Booking import reads them and folds them into Notes.

## 1. The travel row on the Plan

The pill becomes a row of up to three lines:

```
[icon] Train Munich Hbf → Strasbourg            Booked
       Thu 10 Dec 09:28 → 13:05 · 3h 37m
       ICE 9572 · Coach 7 · Seat 42 · QX7P2M       📎
```

- **Line 1:** the mode and route exactly as the pill words them today, the Booking state badge, the paperclip when a file is attached.
- **Line 2:** the departure day and time as today, then the arrival time (with "+1" when it lands on a later day, by the number of days) and the duration. A leg with no times keeps today's text (a drive's estimate, or the day).
- **Line 3:** the Travel details line (section 2), then the booking reference. Absent when both are empty.
- **Colour:** sun, the Day view's colour for travel. A solid sun tile behind the mode icon; a pale sun wash behind the row.
- **Distinct from a Stop:** it stays on the connector line with its station dot; it is inset, sized to its content on a wide screen and full width of the strip on a phone; it has no sections.
- **Everywhere the pill is today:** between Stops, stacked legs with "Change at…", and the Home base legs at the top and bottom.
- **Unchanged:** a tap opens the Transport as today; the accessible name; the missing-leg prompt, which keeps its dashed outline and gets no sun.

## 2. Travel details on a Transport

Seven optional short-text values, 60 characters at most each, shown by mode:

| Mode | Fields, in order, with their labels |
|---|---|
| Flight | Airline, Flight number, Seat, Terminal, Gate |
| Train | Operator, Train number, Coach, Seat, Platform |
| Bus | Operator, Bus number, Seat |
| Ferry, Other | Operator, Service number, Seat |
| Car | Hire company |

Stored as `carrier`, `serviceNumber`, `seat`, `terminal`, `gate`, `coach`, `platform`.

- **Changing the mode** keeps what was typed and hides what does not apply. A hidden value is kept, not cleared, and is not shown anywhere while hidden.
- **The Travel details line** is the values that apply to the mode, joined with " · ", in this order: carrier, number, coach, seat, terminal, gate, platform. Coach, seat, terminal, gate and platform are prefixed with their word ("Seat 42") unless the value already starts with it. A flight with a flight number leaves the airline off the line (the number carries it).
- **Where it shows:** the Plan's travel row; the Day view's Departs row; the details sheet shown when a Transport is tapped; the Transport card on a Booking import Proposal.
- **The Booking import** fills carrier, number and seat from what it already reads. Class stays in Notes. A value Claude marked uncertain highlights on its own field.
- **Claude's tools** (`add_transport`, `update_transport`, `get_transport`, `get_trip_plan`) read and set all seven.
- **A Fork** copies them. **Duplicating a Trip** drops them, as it drops the booking reference.
- **Activity** records a change to each by its label.
- **Private:** none of the seven appears on a shared link or in the Calendar feed.

## 3. Not in this work

- Flight delay alerts (`docs/open.md`).
- Moving details out of the Notes of Transports already imported.
- Notes on the row.
- Boarding time, booking class, ferry cabins.
- The printed plan, the in-app Calendar, the Digest.

## 4. Deploy

Seven nullable columns on `Transport`: additive, no backfill, one deploy. Beta and previews read the production database without migrating, so `main` must be deployed before beta receives this code.

## 5. How it is checked

Unit tests per piece; the branch tier once; and a look at the row in a browser on the local demo trip, phone and desktop widths, light and dark, before it is called done. Cam looks at it on his phone before the freeze.
