# Entering a layover: 2026-11-26

Agreed with Cam on 2026-11-26, the evening Connections went live. Follows `2026-11-26-connections.md`.

## The problem

A journey with a layover is two Transports. To enter one today a Traveller fills the Transport form twice and has to know three rules: leave the middle end without a Stop, pick the same airport on both, and repeat the booking reference. Cam: "normally you would put your flight from origin to destination, and then the layover is in the middle… 'This flight includes a layover'?"

## What changes

The Transport form gains a tick box under the times: **"This flight includes a layover"** when the mode is a flight, **"This journey includes a change"** for a train, bus, ferry or other. A drive has no such box.

Ticking it opens three fields:
- **Layover at** (or **Change at**): the place, chosen with the same place picker the departure and arrival points use. Required.
- **Land there** (or **Arrive there**): date and time, in that place's own time. Required.
- **Leave**: date and time, in that place's own time. Required.

And beside the flight's own number and seat, **Second flight** and its **Seat** (for a train: **Second train**, **Seat**), both optional.

The Traveller fills in From, To, Departs and Arrives for the whole journey, exactly as for a direct flight.

## What saving does

One save makes two Transports, both or neither:
- **The first** runs from the form's From to the layover place, departs at Departs and arrives at Land there. It keeps everything else on the form: carrier, flight number, seat, terminal, gate, booking reference, booking state, notes, the Cost, the files, reminders.
- **The second** runs from the layover place to the form's To (a Stop, a Stop and its arrival point, a place, or Home), departs at Leave and arrives at Arrives. It copies the mode, carrier, booking reference and booking state; takes the second flight number and seat; and has no Cost, notes or files of its own. It sits directly after the first in the same position in the plan.
- Both ends at the layover carry the same place (its name, pin and place id), so they are a Connection and one booking, and the Plan draws them joined with the wait between.

It works when **adding** a Transport and when **editing** one that exists: editing turns the existing Transport into the first of the two, so its Cost and tickets stay where they are.

The save is refused, with the reason beside the field, when: the layover place is missing; Land there is not after Departs; Leave is before Land there; Arrives is not after Leave; or the wait is a day or more ("A layover is under a day. For a longer stay, add a Stop.").

## What it does not do

- The box is not shown for a Transport that is already one of two joined flights. After a split each flight is its own card and its own form; unticking does not merge them, and there is nothing to untick.
- One layover per save. A journey with two is made by ticking the box again on the flight that has the second.
- The Claude connection is unchanged: it adds two Transports itself.
- A What-if plan (Fork) behaves as any Transport save does there.

## Documents to bring into line

- The help guide's layover paragraph: say to tick the box, not to add a second transport.
- The spec `2026-11-26-connections.md` is not changed; this file is the addendum.
