# A dated return leg is the Trip's deadline, ahead of the Hard end date

Amends ADR 0013. Once a Trip has a **return leg** (`findReturnLeg`: a Transport departing the last Stop that doesn't arrive at another Stop) with a date, that leg's departure — not the **Hard end date** — is what the **projected end** is checked against. The Fit tile reads "{Flying|Driving|…} home {date}" instead of "Home by {date}", the Home-by control and the "Set a home-by date" prompt are hidden, **Make it fit** targets the leg's departure, and the over/near **Flag** is worded against the trip home. A stored Hard end date is kept but dormant while the return leg rules, and takes over again if the leg is deleted or loses its date. Raised by Feedback note `cmutb7bn2`: with a return flight booked, the app showed two "when am I home" dates that could disagree, and prompted for one the flight already answered.

## Consequences

- One deadline is ever shown. Everywhere that said "Home by" (Fit tile, Summary, Plan overview, Flags) reads the same resolver: the dated return leg's departure, else the Hard end date, else none.
- For a multi-leg journey home the deadline is the departure of the leg leaving the last Stop — the moment you have to go, not the moment you land.
- The "return leg lands after the Hard end date" Flag is silent whenever the return leg is the deadline (it would compare the leg with itself); it can only fire for a return leg with no date, which by rule 1 isn't the deadline.
- Each Fork resolves its own deadline from its own return leg.

## Considered Options

- **Show both** ("Home by 8 Jan · Return flight 8 Jan"). Rejected: it keeps the two-dates problem the note complained about.
- **Hide the Fit tile when there's a return leg.** Rejected: nights spare/over is still the useful number; only its reference date was wrong.
- **Write the leg's date into `hardEndDate`.** Rejected: it would silently overwrite a date the Traveller set and couldn't undo itself when the leg moves.
