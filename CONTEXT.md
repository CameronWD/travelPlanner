# Trip Planner

A collaborative web app for a couple to plan and run a holiday together: scoping where to go, building a day-by-day itinerary, and tracking what it all costs. Designed to work for any trip, not just one.

## Language

### The trip and its shape

**Trip**:
A single named travel project with an overall date range (e.g. "Europe Summer 2026"). The app holds many trips; you work in one at a time.
_Avoid_: Holiday, vacation (use "Trip" in code/UI consistently)

**Stop**:
A place you are based for a stretch of the trip, plus the dates you are there (e.g. Paris, 3–6 July). A Trip is an ordered sequence of Stops.
_Avoid_: Destination, city, location, leg

**Transport**:
A first-class movement between two Stops — a flight, train, drive, ferry, etc. Has a mode, departure/arrival place & time, a reference (flight/train number), and a cost. Connects Stops in sequence.
_Avoid_: Leg, journey, travel, segment

**Accommodation**:
A first-class place you sleep, attached to a Stop — check-in/out dates, address, confirmation number, cost. Usually one per Stop, occasionally more.
_Avoid_: Hotel, lodging, stay (note: "Stay" is too close to "Stop")

**Timeline**:
The dated, time-ordered list of Items within a Stop (and across the whole Trip). The "calendar" the user sees is a view onto the Timeline.
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
An automatically-detected potential problem surfaced in the Summary — e.g. a Stop with no Accommodation, an empty day, Transport times that don't line up with Stop dates, a very short stay, or backtracking in the route.
_Avoid_: Warning, alert, issue, error

### Supporting concepts

**Today view**:
A focused, read-optimised screen showing what's happening *now/today* for whoever's travelling — next Transport, today's Items, addresses — designed to be glanced at on a phone, offline.
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

**Vote**:
A traveller's interest mark on a Wishlist Item (e.g. must-do / keen / meh) used to decide together what makes the cut.
_Avoid_: Like, rating, rank

**Traveller**:
A person on the Trip with their own login. A Trip is shared between Travellers (normally two). Distinct from generic app "user".
_Avoid_: Member, user, participant

## Flagged ambiguities

_(none yet)_
