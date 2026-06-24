# Trip Planner

A collaborative web app for a couple to plan and run a holiday together: scoping where to go, building a day-by-day itinerary, and tracking what it all costs. Designed to work for any trip, not just one.

## Language

### The trip and its shape

**Trip**:
A single named travel project. It may have an overall date range (e.g. "Europe Summer 2026"), but while it's still just an idea it can be **date-less** — a name and nothing more — and gain a range only as its Stops are firmed up. A start date, if set, is the default **anchor** for firming up; the end date is soft and auto-extends to cover the planned Stops. The app holds many trips; you work in one at a time.
_Avoid_: Holiday, vacation (use "Trip" in code/UI consistently)

**Phase**:
Which stage of its life a Trip is in, used to decide what the **Home** leads with. A Trip moves through **Sketching** (still date-less, just rough ideas), **Planning** (dated, departure comfortably ahead), **Final prep** (departure imminent), **Travelling** (underway), and **Past** (over). Derived from the Trip's start date and today — never stored.
_Avoid_: State, status, stage, step

**Stop**:
A place you are based for a stretch of the trip (e.g. Paris). A Trip is an ordered sequence of Stops. A Stop is either **rough** — a place plus a rough number of nights, with no dates yet, jotted down while sketching the shape of the trip — or **scheduled**, pinned to an arrive and depart date. One Trip freely mixes rough and scheduled Stops; you firm them up piece by piece. Dated views (Timeline, Calendar, Today, Summary) work off scheduled Stops.
_Avoid_: Destination, city, location, leg; for the rough/scheduled split avoid "draft", "tentative", "planned"

**Chapter**:
A named, coloured **date range** within a Trip that groups a chunk of the journey into one piece (e.g. "the Italy chapter", covering Rome → Florence → Venice). A Stop, Transport or cost belongs to whichever Chapter's dates cover it (a Stop is placed by its arrive date); the Itinerary, Budget and Summary roll up per Chapter. Chapters are optional, cannot overlap, and need not cover the whole Trip — any date under no Chapter is **Ungrouped**. A Transport that crosses from one Chapter into another — or runs to/from home, outside every Chapter — is **between-legs travel**, shown on the seam between Chapters and as its own Budget line rather than inside any Chapter's total. While a Trip is still being sketched a Chapter can be **rough**: it has no dates yet and instead holds an explicit, ordered set of rough Stops dragged into it. Once those Stops are dated (see **Firm up**) the Chapter becomes an ordinary date range and membership is computed from dates as above. So explicit membership is a brainstorming scaffold only; for any dated Stop, dates are the source of truth.
_Avoid_: Phase, leg, segment, part

**Transport**:
A first-class movement between two Stops — a flight, train, drive, ferry, etc. Has a mode, departure/arrival place & time, a reference (flight/train number), and a cost. Connects Stops in sequence.
_Avoid_: Leg, journey, travel, segment

**Accommodation**:
A first-class place you sleep, attached to a Stop — check-in/out dates, address, confirmation number, cost. Usually one per Stop, occasionally more.
_Avoid_: Hotel, lodging, stay (note: "Stay" is too close to "Stop")

**Timeline**:
The dated, time-ordered list of Items within a Stop (and across the whole Trip). The "calendar" the user sees is a view onto the Timeline — either an **Agenda** (day-by-day list) or a **Month** (calendar grid) view of the same underlying days.
_Avoid_: Schedule, agenda

**Item**:
A thing to do or see that sits on the Timeline — an activity, a sight, a meal, a booked experience. Carries a **Category** (see below), an optional cost, location, notes, link and booking reference. An Item is either **scheduled** (pinned to a date/time) or **unscheduled** (in the Wishlist). Accommodation and Transport are NOT Items — they are first-class types of their own.
_Avoid_: Event, entry, task

**Category**:
The classifier on an Item used for colour-coding and budget grouping (e.g. Sightseeing, Food & Drink, Activity, Shopping, Other). Final list TBD.
_Avoid_: Type, tag, label

**Wishlist**:
The pool of unscheduled Items you've collected but not yet committed to a day — candidate places/activities. Scheduling an Item moves it from the Wishlist onto the Timeline; it's the same Item, just with a date/time now.
_Avoid_: Backlog, ideas, bucket list, shortlist

### Money

**Home currency**:
The single currency a Trip's totals are reported in (e.g. AUD). Set per Trip.
_Avoid_: Base currency, local currency

**Cost**:
A money amount attached to a Transport, Accommodation, or Item — recorded in its own currency, with an **estimated** amount (always) and an optional **actual** amount. Converted to the Home currency for totals.
_Avoid_: Price, expense, spend

**Other cost**:
A standalone Cost not attached to any timeline thing — travel insurance, visas, eSIM, spending-money buffers. Still rolls into the budget.
_Avoid_: Misc, extra

**Budget**:
The read-only roll-up view: grand total (in Home currency), and breakdowns by Category, by Stop, and by day, each showing estimated vs actual. No target/cap — totals only.
_Avoid_: Budget cap, limit (there is no limit feature)

**Exchange rate**:
The conversion factor between a currency and the Home currency. Auto-fetched and cached, with optional manual override per Trip.
_Avoid_: FX, forex

### Overview

**Summary**:
The read-only overview of a whole Trip: each Stop with its nights, the Transport between Stops, cost per Stop/day, and a map of the route. Also runs automatic checks and raises **Flags**.
_Avoid_: Report, dashboard

**Flag**:
An automatically-detected potential problem surfaced in the Summary — e.g. a Stop with no Accommodation, an empty day, Transport times that don't line up with Stop dates, a very short stay, backtracking in the route, a **packed day** (more scheduled than is realistic), Items whose times **overlap**, or a **Pinned** Stop the surrounding plan can't fit around.
_Avoid_: Warning, alert, issue, error

**Home**:
The adaptive front door of a Trip — the screen you land on. It reads the Trip's **Phase** and leads with whatever matters now: the shape of the sketch, a countdown and **Next steps**, final-prep checklists, the live day while Travelling, or a wrap-up once Past. The live Travelling view (the **Today view**) is part of the Home, not a separate screen.
_Avoid_: Dashboard, landing (and don't conflate with Summary, which is the full report)

**Next steps**:
The ranked list of what to do next on a Trip, shown on the **Home**. Combines **Flags** (problems already detected) with forward nudges that aren't problems — rough Stops to firm up, Stops with no Accommodation, undated Chapters, a missing packing list, unbooked Transport — each linking to where you act on it.
_Avoid_: To-do, tasks, suggestions, actions

### Supporting concepts

**Firm up**:
Turning rough Stops into scheduled ones by flowing dates forward from an **anchor** — the Trip start, or the depart date of the preceding scheduled Stop — using each Stop's rough night count (arrive = previous depart; depart = arrive + nights). One action can date a whole leg; every Stop stays editable afterward, and changing one Stop's nights or dates ripples forward to the Stops after it, stopping at any **Pinned** Stop. The reverse — clearing a Stop's dates to sketch again — is making it **rough**.
_Avoid_: Lock in, commit; reserve "schedule" for Items

**Pinned**:
A scheduled Stop whose dates the Traveller has fixed — a real booking or a fixed-date event — so firming up and ripple never move it. Ripple flows the flexible Stops in each span between the anchor and the next Pinned Stop; if they can't fit before a Pinned Stop's arrive date the app raises a **Flag** rather than overwriting the pin, and any slack before a pin is simply left as free days.
_Avoid_: Locked, fixed, frozen

**Today view**:
The focused, read-optimised view of what's happening *now/today* for whoever's travelling — next Transport, today's Items, addresses, tonight's stay — designed to be glanced at on a phone, offline. It is the **Travelling** phase of the **Home**, not a separate tab.
_Avoid_: Now view, agenda

**Checklist**:
A list of tickable tasks. Two flavours: a **Pre-trip checklist** (visas, insurance, eSIM, with optional due dates) and a **Packing list** (reusable across Trips via templates).
_Avoid_: To-do, tasks

**Attachment**:
A file (PDF/image) stored against a Trip, Transport, Accommodation or Item — tickets, confirmations, passport scans.
_Avoid_: Document, upload, file

**Note**:
A free-text comment left by either traveller on a Stop, Item or booking — lightweight collaboration between the two of you.
_Avoid_: Comment, remark

**Calendar feed**:
A private, read-only subscription of a Trip's Timeline that an external calendar app (Google/Apple/Outlook) can follow by URL. It reflects the Trip's scheduled Items, Transport and Accommodation and refreshes on the *external* app's own schedule (not instantly). One per Trip, shared by both Travellers, and revocable (resetting it invalidates the old URL). One-way: the app publishes the feed; it never reads changes back from the external calendar.
_Avoid_: Sync (implies two-way), integration

**Vote**:
A traveller's interest mark on a Wishlist Item (e.g. must-do / keen / meh) used to decide together what makes the cut.
_Avoid_: Like, rating, rank

**Traveller**:
A person on the Trip with their own login. A Trip is shared between Travellers (normally two). Distinct from generic app "user".
_Avoid_: Member, user, participant

## Flagged ambiguities

_(none yet)_
