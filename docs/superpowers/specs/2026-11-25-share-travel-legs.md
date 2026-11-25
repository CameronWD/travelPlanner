# Shared view: travel in the same family as the Plan, 2026-11-25

Agreed with Cam on 25 Nov, after the Plan's travel row shipped. On a shared link, a leg between two Stops is a small icon, "Train to Strasbourg", and a line with the day, the two places and their times. It has no duration, no day marker for an overnight arrival, none of the Plan's sun colour, and the flights to and from the Home base are not listed at all.

## What changes

1. **Look.** A leg is the Plan's travel card (the yellow card with its sun shadow) on the Plan's connector line, with the sun icon marker and its stub, read-only: nothing on it can be pressed. The connector runs unbroken from one Stop card to the next; where two Stops have no leg, nothing is drawn between them.
2. **The line gains** the arrival's day marker and the duration: `Thu 10 Dec · Munich Hbf 09:28 → Strasbourg 13:05 · 3h 37m`; an arrival on another local date shows `+1` (or `−1`) after the arrival time. A leg with no times is unchanged.
3. **The flight or train number is shown**, for a Flight and a Train only, after the duration: `· ICE 9568`. Cam's decision: it is what family would use to follow a flight. A bus or ferry number is not shown (it means little without the operator).
4. **The Home legs are listed.** The leg from the Home base to the first Stop appears above the first Stop, labelled like the others ("Flight to Denpasar"); the leg from the last Stop back appears below the last Stop, labelled "{Mode} home". A Home leg shows its Home end's time but never its place (a drive from home could be a street address); the Home base's place is printed nowhere on the page, so a day row or the Right now card for a leg into Home says "{Mode} home" and names no place, and no zone name reaches the browser; the Home end's time is read in the Trip's Home timezone, or, when the Trip has none, in the other end's zone, as the rest of the app does.
5. **The viewer's own time.** Beside the Right now clock ("for you") and beside each leg's arrival ("arrives Sat 15:45 your time"), read in the viewer's device zone, and only when it differs from the place's time. Every other time on the page stays local to its place; day-plan rows never get it.
6. **The closed Stop card** is the Plan's closed Stop row: a numbered circle in the Stop's colour, the name, a summary line (the first stay by check-in, "+N" for more, then "N plans", each only when the link includes accommodation or daily plans; else the country), the compact dates and a nights chip ("4n") in the Stop's colour, then Show. The open card is unchanged.

## What does not change

- Everything above appears only when the link includes transport.
- Never shown on a shared link: carrier, seat, coach, terminal, gate, platform, the booking reference, notes, Costs.
- The Home base's name is already on a shared link (the route map names it); nothing new is revealed by listing the Home legs.
- The "Right now" card, the route list, the social preview image.

## Words

CONTEXT.md **Travel details** says they are never shown on a shared link. It becomes: only the flight or train number is, when the link includes transport.
