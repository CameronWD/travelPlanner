# Modelling a new trip

The order of operations for taking a trip from "we should go to Europe" to a dated,
costed, bookable plan in TEEPEE. Written as steps, in the order the app expects them.

You don't have to do all of these, and you don't have to do them in order — the app is
built to let you sketch first and firm up later. But this is the path of least
resistance: each step gives the next one what it needs.

**The one-line mental model:** a **Trip** holds an ordered list of **Stops**; Stops start
**rough** (a place + a number of nights, no dates) and become **scheduled** (real arrive
and depart dates) when you **firm up**. Everything else — Transport, Accommodation,
things to do, Costs — hangs off those Stops.

---

## Step 1 — Create the Trip

**Where:** Trips list → **New trip** (`/trips/new`)

Fill out:

| Field | Enter | Notes |
|---|---|---|
| **Trip name** | required | e.g. "Europe Summer 2026" |
| **Start date** | optional | Leave blank if you're still sketching |
| **End date** | optional | This is the *soft* end — it auto-extends to cover your Stops |
| **Home currency** | required | Every total in the app is reported in this |
| **Home base** | optional | Where you fly out from and back to, e.g. "Sydney" |
| **Cover photo** | optional | Falls back to an auto-drawn route render if you skip it |

**Leave the dates blank if you don't know them yet.** A date-less Trip is a first-class
thing — it sits in the **Sketching** phase and the Home screen leads with the shape of
the sketch rather than a countdown. You add dates when Stops firm up, not before.

The **Home base** is *not* a Stop. It's the origin you hang the outbound flight off. It
appears in the Plan editor as a card that bookends the itinerary — pinned above the first
Stop, and (on a round trip) below the last one.

---

## Step 2 — Pull in ideas you've already collected *(optional)*

**Where:** **Globe** (`/globe`) → then the Trip's **Wishlist** (More → Wishlist)

If you've been dropping **Markers** on the Globe over time ("Tokyo Tower", "that festival
in Seville"), this is where they pay off:

1. Open the Trip's **Wishlist**.
2. Use **Add from Globe** to copy Markers in, or take the suggestions the board offers —
   it proactively surfaces Markers in countries your Stops are in, ranked by proximity.
3. Vote on ideas with your travel partner to work out what actually makes the cut.

Copying a Marker in makes an independent copy. The Marker stays on the Globe, and the
Wishlist item is thereafter its own thing.

The Wishlist is **trip-wide** — it is not part of any one plan, so every variant of the
trip sees the same pool of ideas.

---

## Step 3 — Sketch the shape: rough Stops

**Where:** **Plan** tab (`/trips/[id]/plan`)

This is the main canvas. Add the places you want to be based in, in rough order:

- Use the **"Add a place…"** quick-add box — type a place, set a **nights** count, hit add.
  Repeat. This is the fast path and the one to use while brainstorming.
- Or use **Add Stop** for the full dialog (place name, country, timezone, chapter, notes,
  attachments), where **Stop type** lets you choose **Rough** or **Scheduled**.

Keep everything **rough** at this stage — a place plus a rough number of nights, no dates.
The point of a rough Stop is that you can reorder it, re-night it and delete it without
any date arithmetic getting in your way.

Reorder with drag, or the **Move up** / **Move down** actions on each Stop card.

> A Stop is a place you are *based*, not everywhere you go. Day trips are things to do
> (Step 9), not Stops.

---

## Step 4 — Group the journey into Chapters *(optional)*

**Where:** Plan tab → **Suggest from countries**, or Settings → **Chapters**

Chapters group a chunk of the journey into a named, coloured band — "the Italy chapter",
covering Rome → Florence → Venice. The Itinerary, Budget and Summary all roll up per
Chapter, so this is what gives you "what did Italy cost us".

- **Suggest from countries** proposes Chapters automatically from your Stops' countries.
  Where your route revisits a country rather than passing through once, it proposes a
  single **Combined chapter** ("Germany & France") instead of several same-named bands.
- Every suggestion is just a starting point — rename and re-draw freely.
- While the Trip is still rough, a Chapter holds an explicit, ordered set of rough Stops
  you drag into it. Once those Stops get dates, the Chapter becomes an ordinary date range
  and membership is worked out from dates.

Chapters can't overlap and don't have to cover the whole trip — anything outside one is
**Ungrouped**.

---

## Step 5 — Set your constraints

**Where:** **Settings** → Trip details, and the **Plan overview** rail on the Plan tab

Two things worth setting before you start dating Stops:

- **Hard end date** — the day the trip *must* be over by (the return flight, the day back
  at work). It's a constraint, not a computed value: it never moves on its own. The app
  compares your **projected end** against it and raises a **Flag** as you get close or run
  past. Also editable inline from the Plan overview.
- **Round trip** (default on) — whether the Trip returns to the Home base. This governs
  whether a missing return leg gets flagged.

---

## Step 6 — Firm up: turn rough Stops into dated ones

**Where:** Plan tab → **Set dates for all stops** (top of the plan), or per Chapter/leg

This is the step the whole model is built around. Firming up flows dates forward from an
**anchor** — the Trip start date, or the depart date of the preceding scheduled Stop —
using each Stop's nights count:

```
arrive = previous stop's depart
depart = arrive + nights
```

You can:

- **Set dates for all stops** — dates the entire trip from its start date in one pass.
- **Set dates** on a single Chapter or leg — firm up piece by piece, leaving the rest rough.
- Mix freely. One trip can hold rough and scheduled Stops at the same time indefinitely.

Everything stays editable afterwards. Change one Stop's nights or dates and the change
**ripples forward** to the Stops after it.

### Pin the things that are actually fixed

On any scheduled Stop, use **Pin dates** for real bookings and fixed-date events. Ripple
and firm-up will never move a pinned Stop — they flow the flexible Stops in the span
*between* pins. If the flexible Stops can't fit before a pin, the app raises a Flag rather
than overwriting your booking.

The reverse of firming up is **Make rough** / **Clear dates** on a Stop card, if you want
to go back to sketching.

---

## Step 7 — Make it fit, if it doesn't

**Where:** Plan overview rail, or the **Summary** tab

If your **projected end** (every Stop's nights flowed forward, rough ones included) runs
past your **Hard end date**, **Make it fit** appears. It offers two routes side by side:

- **Trim** — reduce nights across the flexible (non-pinned) Stops, split proportionally by
  default, down to a floor of one night. Editable before you apply.
- **Drop** — remove one flexible Stop, with each candidate previewing the end date it
  would give you.

It previews; it never acts on its own. Pinned Stops are never trimmed or dropped.

---

## Step 8 — Connect the Stops: Transport

**Where:** Plan tab — the **Add transport** button in the gap between two Stop cards

Add a leg for each movement. Each Transport carries:

| Field | Notes |
|---|---|
| **Mode** | flight, train, drive, ferry, … |
| **From** / **To** | Stops, or the Home base, or left unset |
| **Departure time** / **Arrival time** | timezone-aware |
| **Booking reference / number** | e.g. flight number |
| **Notes**, **Attachments** | tickets, confirmations |
| **Cost** | see Step 10 |

Don't forget the **bookends**: the outbound leg (Home base → first Stop) and, on a round
trip, the return leg (last Stop → Home base). Add these from the Home base cards at the
top and bottom of the plan.

A leg that crosses from one Chapter into another is **between-legs travel** — it shows on
the seam between Chapters and gets its own Budget line rather than sitting inside either
Chapter's total.

---

## Step 9 — Somewhere to sleep: Accommodation

**Where:** Plan tab → **Add Accommodation** on a Stop card

Check-in, check-out, address, booking confirmation, notes, attachments, cost. Usually one
per Stop, occasionally more if you move mid-stay.

Accommodation needs check-in and check-out dates, so the Stop has to be **scheduled**
first — the app will offer to set dates for that leg if you try it on a rough Stop.

Nights at a Stop with no accommodation cover get flagged, so this is one of the things
that makes the Summary go quiet.

---

## Step 10 — Fill in the days: things to do

**Where:** Plan tab (per Stop), then the **Calendar** / **Day** views

There are three forms an Item takes, and they're a progression:

1. **Wishlist idea** — trip-wide, no Stop, no day. The pool of candidates (Step 2).
2. **Thing to do** — attached to a Stop but not yet given a day. Add these with **Add
   Thing to Do** on any Stop card. This works even while the Stop is still rough, which
   makes it the natural place to park "we should do X while we're in Rome".
3. **Scheduled Item** — given a date and time, so it lands on the Timeline and shows in
   Calendar, Day and Today views.

Give a thing-to-do a date and it slots onto the Timeline. Scheduling a *Wishlist* idea
places a **copy** onto the current plan — the idea stays in the shared Wishlist marked
"✓ in this plan", so it can be placed differently in another variant.

Each Item carries a **Category** (used for colour coding and budget grouping), plus
optional cost, location, notes, link and booking reference.

---

## Step 11 — Money

**Where:** anywhere a Cost lives (Transport, Accommodation, Item), plus the **Budget** tab

Costs are entered where the thing is, not in a separate ledger. Every Cost has:

- **Cost** — what the thing costs, in its own currency. A guess while you're sketching,
  the real price once it's booked. It's the same field either way; a known price isn't a
  special case.
- **You paid** + **Date paid** — filled in once money has actually left your account. The
  paid amount is pre-filled with the cost amount, so confirming a thing that cost what you
  expected is one gesture.

Then on the **Budget** tab:

1. **Other costs** — standalone costs attached to nothing on the timeline: insurance,
   visas, eSIM, spending money. Give each a description and a category.
2. **Exchange rates** — auto-fetched and cached; override manually per Trip if you want to
   lock a rate you actually got.
3. Read the roll-ups: **By category**, **By chapter**, **By destination**, **Day by day**,
   each showing cost vs paid. Between-legs travel gets its own line.
4. **Mark off what you've paid** — the paid checklist. This is the reconciling gesture the
   Budget view is built for; tick down the list as you book things.
5. **Spend so far** — the separate lens tracking real spending against what you reckoned
   things would cost: total cost, paid to date, how the paid amounts ran over or under,
   and what's still to come.

There's no budget cap or target anywhere in the app, by design — totals only.

---

## Step 12 — Check your work

**Where:** **Summary** tab, and the Trip **Home**

- The **Summary** is the read-only overview: each Stop with its nights, the Transport
  between them, cost per Stop and per day, and a map of the route. It also runs the
  automatic checks and raises **Flags** — a Stop with no Accommodation, two consecutive
  Stops with no Transport between them, a missing outbound or return leg, an overstuffed
  day, Items whose times overlap, a long driving day, backtracking in the route, a pinned
  Stop the plan can't fit around, a projected end running past your Hard end date, and
  more.
- The Trip **Home** shows **Next steps** — the Flags plus forward nudges that aren't
  problems yet: rough Stops to firm up, Stops with no accommodation, undated Chapters,
  unbooked Transport, a missing packing list. Each one links to where you act on it.

Work the Next steps list until it's quiet. That's the loop.

---

## Step 13 — Try alternatives before committing *(optional)*

**Where:** the **variant switcher** in the trip header → **Compare plans**

If you're torn between "Italy first" and "add Switzerland", don't edit and undo — fork it.

1. Create a **New variant** from the switcher in the trip header. It's a full-power plan:
   add and reorder Stops, firm up, pin, Make it fit, Transport, Accommodation, scheduled
   Items, Costs — all of it.
2. Edit it exactly like the real plan. Nothing you do in a variant touches the dated
   views, the Summary, the calendar feed, sharing or reminders.
3. Open **Compare plans** for a side-by-side: route, projected end vs hard end date,
   budget total, flags by severity, stop and night totals, transit metrics — each variant
   shown as a delta against the real plan.
4. **Promote** the winner to make it the real plan. This is irreversible, and it discards
   the other variants. The confirm dialog lists exactly what the swap would lose from the
   outgoing plan — paid Costs, confirmation numbers, attachments.

Variants are shared with your travel partner, capped around four to keep Compare readable,
and only available before departure.

The Wishlist, Checklists, Journal, Notes, Attachments, exchange rates, home currency and
Home base are **trip-wide** — every variant shares them, so you never duplicate that work.

---

## Step 14 — Get it out of the app

**Where:** **Settings**, plus the **More** menu

- **Travellers** — invite your partner by email. The invite becomes real membership the
  next time they sign in under a matching address.
- **Calendar feed** — a private read-only URL your phone calendar can subscribe to. One
  per trip, revocable. One-way: the app publishes, it never reads changes back.
- **Share link** — read-only public link for anyone who needs to see the plan but not
  edit it.
- **Checklists** — a pre-trip checklist (visas, insurance, eSIM, with due dates) and a
  packing list that's reusable across trips via templates.
- **Files** — tickets, confirmations, passport scans, attached to the trip or to
  individual bookings.
- **Print** — a printable trip summary with the route map.

---

## Step 15 — While you're actually travelling

**Where:** Trip **Home** (it switches to the **Today view** automatically)

Once the trip is underway the Home leads with today: next Transport, today's Items,
addresses, tonight's stay — built to be glanced at on a phone, and it works offline.

- **Day map** — open on any day for its located Items as a numbered route in time order,
  with tonight's accommodation and the day's transport points marked. One tap out to your
  maps app for directions.
- Keep ticking Costs as **paid** on the Budget tab as money actually moves — that's what
  keeps **Spend so far** honest.
- **Journal** — write up each day, with photos.

---

## Quick reference: what depends on what

```
Trip (name, home currency)
  └─ Home base ......................... needed for outbound/return legs
  └─ Stops (rough) ..................... the sketch
       └─ Chapters ..................... optional grouping; roll up budget & itinerary
       └─ Things to do ................. work on rough Stops
       └─ FIRM UP → Stops (scheduled)
            └─ Accommodation ........... needs dates
            └─ Transport ............... connects scheduled Stops
            └─ Scheduled Items ......... need dates → Timeline, Calendar, Day, Today
            └─ Costs ................... on Transport / Accommodation / Items
                 └─ marked paid ........ → Spend so far
```

**Trip-wide** (shared across the real plan and every variant): Wishlist, Checklists,
Journal, Notes, Attachments, exchange rates, home currency, Home base, name, cover image,
travellers.

**Plan-scoped** (different in each variant): Stops, Transport, Accommodation, Chapters,
scheduled Items, Costs.

---

## Vocabulary worth getting right

| Term | Means |
|---|---|
| **Stop** | A place you're *based* for a stretch. Rough (nights, no dates) or scheduled (arrive/depart). |
| **Firm up** | Flowing dates forward from an anchor to turn rough Stops into scheduled ones. |
| **Pinned** | A scheduled Stop whose dates are fixed — ripple never moves it. |
| **Chapter** | A named, coloured date range grouping part of the journey. Can't overlap. |
| **Soft end date** | The computed end — the last scheduled Stop's depart. Only ever grows. |
| **Hard end date** | The date you set that the trip must be over by. Never moves on its own. |
| **Projected end** | Where the trip is currently heading, rough Stops included. What's checked against the hard end date. |
| **Item** | A thing to do or see. Wishlist idea → thing to do → scheduled Item. |
| **Cost** / **paid** | What it costs; what actually left your account, and when. |
| **Flag** | An automatically-detected problem you can act on. Shown in the Summary. |
| **Fork / variant** | A what-if plan kept alongside the real one, compared then promoted. |
| **Duplicate** | A brand-new trip seeded from this one's structure, dates thrown away. |
| **Globe / Marker** | The cross-trip map of places you want to go someday. Seeds Wishlists. |
