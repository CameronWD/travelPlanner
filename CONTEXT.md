# TEEPEE

A collaborative web app for a couple to plan and run a holiday together: scoping where to go, building a day-by-day itinerary, and tracking what it all costs. Designed to work for any trip, not just one.

## Language

### The trip and its shape

**Trip**:
A single named travel project. It may have an overall date range (e.g. "Europe Summer 2026"), but while it's still just an idea it can be **date-less** — a name and nothing more — and gain a range only as its Stops are firmed up. A start date, if set, is the default **anchor** for firming up; the **soft end date** auto-extends to cover the planned Stops. Distinct from this is an optional **Hard end date** the Traveller may set as a ceiling. The app holds many trips; you work in one at a time.
_Avoid_: Holiday, vacation (use "Trip" in code/UI consistently)

**Plan**:
The itinerary *arrangement* of a Trip — its ordered Stops (and their nights/dates), the Transport between them, Accommodation, Chapters, scheduled Items, and the estimated Costs attached to all of those. A Trip has exactly one **real plan** — the live arrangement every dated view, the **Summary**, the **Calendar feed**, sharing and reminders read from — and zero or more **Forks**: non-live Plans kept alongside it for comparison. Trip-wide things are *not* part of a Plan and are shared across all of a Trip's Plans: the **Wishlist**, **Checklists**, **Journal**, **Notes**, **Attachments**, **Exchange rates**, **Home currency**, name, cover image and **Traveller** membership.
_Avoid_: Itinerary (that's the editable view onto a Plan), variant (a Fork is the variant), version

**Hard end date**:
An optional, Traveller-set date the Trip must be over by — a return flight, the day back at work. It is a *constraint*, not a computed value: it never moves on its own and never auto-extends. Distinct from the **soft end date** — the computed end (the last Stop's depart) that only ever grows to cover scheduled Stops. A Trip with no Hard end date is simply unconstrained. The app compares the Trip's **projected** end (every Stop's nights flowed forward from the anchor, rough Stops included — see **Firm up**) against the Hard end date and raises a **Flag** as the plan nears (info) or runs past it (warning); the Plan overview shows the same state inline.
_Avoid_: Deadline, cap, limit; soft end date (that's the computed end); Pinned (reserved for Stops); hard/soft are the only end-date qualifiers

**Projected end**:
Where the Trip is *currently heading* — the depart date of the last Stop once every Stop's nights are flowed forward from the anchor (rough Stops included), using the same engine as **Firm up** but without saving anything. Differs from the **soft end date**, which covers only *scheduled* Stops; when rough Stops trail the last scheduled one, the projected end runs later. It is what the **Hard end date** is checked against. Needs an anchor (a start date or a scheduled Stop); a fully date-less Trip has a nights total but no projected calendar end.
_Avoid_: Soft end date, computed end (those cover scheduled Stops only)

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
A thing to do or see that sits on the Timeline — an activity, a sight, a meal, a booked experience. Carries a **Category** (see below), an optional cost, location, notes, link and booking reference. An Item is either an **unscheduled** Wishlist idea (trip-wide, shared across all Plans) or a **scheduled** Item placed on a particular **Plan**'s Timeline (pinned to a date/time, and belonging to that Plan). Scheduling **places a copy** of a Wishlist idea onto the current Plan — it does not consume the idea, which stays in the shared Wishlist (see **Wishlist**). Accommodation and Transport are NOT Items — they are first-class types of their own.
_Avoid_: Event, entry, task

**Category**:
The classifier on an Item used for colour-coding and budget grouping (e.g. Sightseeing, Food & Drink, Activity, Shopping, Other). Final list TBD.
_Avoid_: Type, tag, label

**Wishlist**:
A trip-wide, shared pool of unscheduled Items — candidate places/activities you've collected but not committed to a day. It is *not* part of any **Plan**: the same Wishlist is seen by every Plan (the real plan and all Forks). Scheduling an idea **places a copy** of it onto the current Plan's Timeline as a Plan-owned scheduled Item; the idea itself **stays in the Wishlist** (shown with a "✓ in this plan" marker), so it can also be placed differently in another Plan. **Votes** stay attached to the shared Wishlist idea, never to the placed copy. Un-scheduling removes only the current Plan's copy; the idea remains in the pool.
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

**Spend so far**:
A read-only money lens, distinct from the **Budget** roll-up, tracking how actual spending compares with estimates: the **estimated** total, what's been **paid** to date (Costs carrying a paid date), how those paid Costs' actuals run over/under their own estimates, and the estimated amount still to come. Cash-flow basis — a Cost counts once it's marked paid. Surfaced on the Budget view and the Travelling/Past **Home**. Like the Budget it has no target or cap; over-estimate spending is shown here only, never raised as a **Flag**.
_Avoid_: Burn-down (implies a cap we don't have), budget pace, remaining budget, overspend alert

**Exchange rate**:
The conversion factor between a currency and the Home currency. Auto-fetched and cached, with optional manual override per Trip.
_Avoid_: FX, forex

### Overview

**Summary**:
The read-only overview of a whole Trip: each Stop with its nights, the Transport between Stops, cost per Stop/day, and a map of the route. Also runs automatic checks and raises **Flags**.
_Avoid_: Report, dashboard

**Flag**:
An automatically-detected potential problem surfaced in the Summary — e.g. a Stop with no Accommodation, **no Transport connecting two consecutive Stops** (a missing connection), a night at a Stop with **no Accommodation cover** (a coverage gap, finer than a Stop with none at all), an empty day, Transport times that don't line up with Stop dates, a very short stay, backtracking in the route, a **packed day** (more scheduled than is realistic), a day whose plans are **geographically spread out** (located Items far apart), Items whose times **overlap**, a **long driving day** (more estimated driving in one day than is comfortable), a **Pinned** Stop the surrounding plan can't fit around, or the plan's **projected** end running up against (within a couple of nights) or past the **Hard end date**. A Flag is always something the Traveller can act on; pure awareness signals (e.g. spending over estimate — see **Spend so far**) are not Flags.
_Avoid_: Warning, alert, issue, error

**Home**:
The adaptive front door of a Trip — the screen you land on. It reads the Trip's **Phase** and leads with whatever matters now: the shape of the sketch, a countdown and **Next steps**, final-prep checklists, the live day while Travelling, or a wrap-up once Past. The live Travelling view (the **Today view**) is part of the Home, not a separate screen.
_Avoid_: Dashboard, landing (and don't conflate with Summary, which is the full report)

**Next steps**:
The ranked list of what to do next on a Trip, shown on the **Home**. Combines **Flags** (problems already detected) with forward nudges that aren't problems — rough Stops to firm up, Stops with no Accommodation, undated Chapters, a missing packing list, unbooked Transport — each linking to where you act on it.
_Avoid_: To-do, tasks, suggestions, actions

### Supporting concepts

**Firm up**:
Turning rough Stops into scheduled ones by flowing dates forward from an **anchor** — the Trip start, or the depart date of the preceding scheduled Stop — using each Stop's rough night count (arrive = previous depart; depart = arrive + nights). One action can date a whole leg — or the entire Trip from its start date in a single pass; every Stop stays editable afterward, and changing one Stop's nights or dates ripples forward to the Stops after it, stopping at any **Pinned** Stop. The reverse — clearing a Stop's dates to sketch again — is making it **rough**.
_Avoid_: Lock in, commit; reserve "schedule" for Items

**Pinned**:
A scheduled Stop whose dates the Traveller has fixed — a real booking or a fixed-date event — so firming up and ripple never move it. Ripple flows the flexible Stops in each span between the anchor and the next Pinned Stop; if they can't fit before a Pinned Stop's arrive date the app raises a **Flag** rather than overwriting the pin, and any slack before a pin is simply left as free days.
_Avoid_: Locked, fixed, frozen

**Make it fit**:
An advisory assistant offered when the Trip's **projected end** runs past the **Hard end date**. It proposes a preview-then-apply plan to bring the projected end onto or under the Hard end date, via two routes shown side by side: **trim** — reduce nights across the **flexible** (non-**Pinned**) Stops, defaulting to a split proportional to each Stop's length, down to a floor of 1 night, and editable before applying; or **drop** — remove a Traveller-chosen flexible Stop, each candidate previewing the resulting end and which best closes the gap. **Pinned** Stops are never trimmed or dropped. Nothing changes until the Traveller applies it; trimming a scheduled Stop ripples its dates forward exactly as **Firm up** does. If trimming every flexible Stop to the floor still can't reach the date, it says so and points to dropping a Stop, unpinning one, or moving the Hard end date.
_Avoid_: Optimise, auto-plan, rebalance (it never acts on its own); "flexible" just means not **Pinned**

**Today view**:
The focused, read-optimised view of what's happening *now/today* for whoever's travelling — next Transport, today's Items, addresses, tonight's stay — designed to be glanced at on a phone, offline. It is the **Travelling** phase of the **Home**, not a separate tab.
_Avoid_: Now view, agenda

**Day map**:
An on-demand map of a single day's plan — its located Items as a numbered route in time order, with tonight's Accommodation and the day's Transport points marked. Available on both the Day view and the Travelling **Home**, collapsed until opened. It offers one-tap **directions** out to an external maps app (the whole day's route, or a single hop between Items) but never computes travel time itself, and plots only what has coordinates.
_Avoid_: Route map (that's the whole-Trip map shown in the Summary)

**Checklist**:
A list of tickable tasks. Two flavours: a **Pre-trip checklist** (visas, insurance, eSIM, with optional due dates) and a **Packing list** (reusable across Trips via templates).
_Avoid_: To-do, tasks

**Attachment**:
A file (PDF/image) stored against a Trip, Transport, Accommodation or Item — tickets, confirmations, passport scans.
_Avoid_: Document, upload, file

**Note**:
A free-text comment left by either traveller on a Stop, Item or booking — lightweight collaboration between the two of you.
_Avoid_: Comment, remark

**Activity**:
A recorded thing a Traveller did on the Trip — created, changed or removed a Stop, Item, Transport, Accommodation, Chapter or Cost, or left a Note — captured with who did it, when, and (for a change) which fields moved from what to what. The chronological list is the **Activity feed**; the Activity your *partner* has done since you last looked is your unread **notifications**, surfaced on a bell. Recorded for both Travellers (the feed is shared history) but you are never notified of your own Activity.
_Avoid_: Log, audit, event, history, update (as a noun)

**Calendar feed**:
A private, read-only subscription of a Trip's Timeline that an external calendar app (Google/Apple/Outlook) can follow by URL. It reflects the Trip's scheduled Items, Transport and Accommodation and refreshes on the *external* app's own schedule (not instantly). One per Trip, shared by both Travellers, and revocable (resetting it invalidates the old URL). One-way: the app publishes the feed; it never reads changes back from the external calendar.
_Avoid_: Sync (implies two-way), integration

**Discreet mode**:
A device-local display mode (stored in a cookie, per browser) that disguises the app as a generic spreadsheet/"workspace" tool so a trip can be planned unobtrusively on a work screen. The plan view becomes an editable stop-by-stop spreadsheet. It changes presentation only — never the underlying trip data, and it is never shared with other trip members.
_Avoid_: Incognito, stealth mode, private mode, boss mode

**Vote**:
A traveller's interest mark on a Wishlist Item (e.g. must-do / keen / meh) used to decide together what makes the cut.
_Avoid_: Like, rating, rank

**Traveller**:
A person on the Trip with their own login. A Trip is shared between Travellers (normally two). Distinct from generic app "user".
_Avoid_: Member, user, participant

**Invite**:
A pending, email-addressed grant of access to a Trip — it names the email of the person a Traveller wants to bring on. An Invite becomes Traveller membership automatically the next time that person is signed in under a matching email; it is never delivered as a link or message, so it lives only as a record on the Trip, not something the invitee receives. It is **Pending** until matched, and can be cancelled while still Pending. Distinct from a **Traveller** (an Invite is the not-yet-joined precursor) and from the read-only public **share link** (which grants no membership).
_Avoid_: invitation link/email, membership request, share

**Trip cover image**:
The single picture that represents a Trip wherever it's shown (currently the trips-list card and the Trip **Home** hero). A photo the Traveller uploads; when none is set the app falls back to an auto-generated **route render** — a stylised drawing of the Trip's located Stops as pins joined by a path, *not* a real tile map — and, for a Trip with no located Stops yet, a neutral monogram panel. The old hashed warm-gradient cover is retired.
_Avoid_: thumbnail; avatar/image (that's a Traveller's photo); banner; "route map" alone (reserved for the interactive Leaflet map on the Summary / the **Day map**)

**Duplicate**:
Creating a brand-new Trip from an existing one's reusable *structure* — its Stops (carried over as **rough**), Chapters, Wishlist and Checklists — with every date reset, so a proven skeleton can seed a fresh Trip. A one-way clone: the new Trip is fully independent of its source, and the source is untouched. Distinct from a **Fork** (a what-if *variant* **Plan** of the same Trip, kept alongside the real plan and compared before one is chosen).
_Avoid_: Copy, clone (use "Duplicate" in UI/code); Template (reserved for the reusable **Packing list** templates); Fork (that's the dated variant)

**Fork** _(planned — not yet built)_:
A what-if *variant* **Plan** of a Trip, kept alongside the **real plan** so different arrangements (e.g. Italy-first vs +Switzerland) can be compared before one is chosen. A Fork is a full-power Plan — you edit it with the same tools as the real plan (add/reorder/re-night Stops, **Firm up**, **Pinned**, **Make it fit**, Transport, Accommodation, scheduled Items, estimated Costs) and it has its own **projected end**, **Flags** and **Budget** — but it is *not live*: editing a Fork never touches the dated views, **Summary**, **Calendar feed**, sharing or reminders, which always follow the real plan. Forks are **shared** between both **Travellers** and may be created from the real plan or from another Fork (peers afterward, no parent tree); a soft cap of ~4 keeps the **Compare** view readable. Forks are silent in the **Activity** feed except for three milestones: a Fork created, **promoted**, or discarded. Available only in pre-departure **Phases** (Sketching, Planning, Final prep). Distinct from **Duplicate** (which throws dates away to seed an independent *new Trip*) and from **Make it fit** (which previews trim/drop edits to *one* Plan, not parallel variants).
_Avoid_: Duplicate, copy, scenario, branch, version

**Promote**:
Making a **Fork** the Trip's new **real plan**: the Fork's arrangement replaces the current real plan, and all Forks are then discarded — the exploration is resolved. Irreversible, and guarded by a confirm that previews the change and explicitly lists any *committed* things in the outgoing real plan the swap would lose — **paid** Costs, **Accommodation**/**Transport** confirmation numbers, and **Attachments** on Plan entities. Trip-wide things (Wishlist, Checklists, Journal, Notes) are untouched. Recorded as an **Activity**. Distinct from **Make it fit** (edits one Plan) and **Duplicate** (spawns a new Trip).
_Avoid_: Apply, commit, merge, accept, choose

**Compare**:
The read-only side-by-side view of a Trip's **real plan** and all its **Forks**, one column each, the real plan as the leftmost baseline. Rows cover **Route** (Stops in order, nights, countries), **projected end** vs **Hard end date**, **Budget** total (estimated, Home currency), **Flags** (by severity), Stop and night totals, and transit metrics (scheduled transit time, driving hours, flight count). Each Fork's figures show a **delta** against the real plan. From a column you open a Fork to edit, or **Promote** it.
_Avoid_: Versus, diff, dashboard

## Flagged ambiguities

_(none yet)_
