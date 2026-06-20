# Trip Planner — Specification

_A collaborative trip-planning web app for two partners. Status: **awaiting sign-off** (no code until "go for it")._

Terminology in this doc follows `CONTEXT.md` — the canonical glossary.

---

## 1. Vision

The "ultimate trip planner" for a couple: scope out where to go, build a day-by-day
itinerary across multiple cities, track what it all costs in your home currency, and get
an at-a-glance summary that flags ways to improve the trip. Works for any holiday, not
just the upcoming Europe trip.

## 2. Shape of the app (architecture)

- **Synced web app**, mobile-first, installable to the home screen (PWA). Used on a
  laptop while planning and on phones during the trip.
- **Two logins, one shared trip.** Both partners sign in (Google) and see the same data.
- **Offline:** read/view your trip offline (itinerary, addresses, bookings, budget are
  cached). Editing requires a connection.
- **Stack (recommended, free-tier friendly):** Next.js (App Router, React, TypeScript) ·
  Postgres via Prisma · Auth.js with Google provider · file storage via an
  S3-compatible bucket (e.g. Cloudflare R2) or Vercel Blob · deploy target Vercel +
  managed Postgres (e.g. Neon). I build & run locally; you deploy later with my guide.
- **Light + dark mode**, warm & playful visual style (soft rounded cards, warm accents).
- **Privacy:** trips are private; you invite your partner by email and only invited
  Travellers can open a trip.

## 3. Domain model (see CONTEXT.md for definitions)

- **Trip** — name, date range, **Home currency**, Travellers. Holds everything below.
- **Stop** — a place + date range you're based there. Ordered sequence within a Trip.
- **Transport** — first-class movement between two Stops (mode, depart/arrive place &
  time, reference #, cost).
- **Accommodation** — first-class, attached to a Stop (check-in/out, address, confirmation
  #, cost).
- **Item** — a thing to do/see on the **Timeline**; has a **Category**, optional cost,
  location, notes, link, booking ref. Either **scheduled** (date + optional start/end
  time) or **unscheduled** (in the **Wishlist**).
- **Cost** — money on a Transport/Accommodation/Item: own currency, **estimated** (always)
  + **actual** (optional). **Other cost** = standalone (insurance, eSIM, spending money).
- **Exchange rate** — per Trip, auto-fetched + cached, manually overridable.
- Supporting: **Note**, **Vote**, **Attachment**, **Checklist** (pre-trip + packing),
  **Flag**, **Traveller**.

**Proposed Item categories:** Sightseeing · Food & Drink · Activity/Experience ·
Nightlife · Shopping · Other. (Each colour-coded; used for budget grouping.)

## 4. Scheduling & time rules

- An Item is unscheduled (Wishlist), scheduled to a day with no time, or scheduled with a
  start (+ optional end) time.
- Times are stored against each Stop's local time zone from day one, so flights that cross
  zones (depart 23:00, arrive 06:00 next day) are correct. Polished time-zone *display*
  lands in a later phase, but the data is correct from the start.

## 5. Budget rules

- Every Cost recorded in its own currency with the **exchange rate snapshotted** at entry,
  so historical totals stay stable. Home-currency total recomputed from originals + rates.
- Budget view = read-only roll-up: grand total (Home currency), breakdown by Category, by
  Stop, and per day, each showing estimated vs actual and the gap. **No target/cap.**
- **Shared pot** — no per-person splitting.
- Accommodation cost spans nights; per-day view spreads it across the nights stayed.

## 6. Summary

- Overview: each Stop with nights, the Transport between Stops, cost per Stop/day, and a
  **route map**.
- Automatic **Flags**: Stop with no Accommodation · empty day · Transport times outside
  Stop dates / lands after next check-in · very short stay · route backtracking.

## 7. Key screens

Trips list · Trip overview (stops + route) · Calendar/agenda (by day) · Day view ·
**Today view** (focused, offline) · Wishlist board (with **Votes**) · Budget · Summary ·
Checklists (pre-trip + packing) · Attachments · Settings (currency, rates, invite,
theme).

## 8. Feature set (all confirmed except Weather, which is dropped)

Core itinerary · Wishlist→schedule · Budget (multi-currency, est/actual) · Summary+Flags ·
Today view · Map/directions links · Time-zone aware times · Pre-trip checklist · Packing
list · Booking/document storage · Export/print + read-only share · Notes/comments · Wishlist
voting · Reminders/notifications · Photos/journal. AI assistant designed-for, built later.

## 9. Delivery phases (nothing cut — ordered; each phase is usable)

- **P0 Foundation** — scaffold, Google auth, DB schema, create/list/invite Trips, layout,
  theme, PWA shell.
- **P1 Core itinerary** — Stops, Transport, Accommodation, Items + Categories, Timeline/Day
  view, Wishlist→schedule. _(The heart — usable trip planner.)_
- **P2 Budget** — Costs (est/actual, currency), Other costs, exchange rates, Budget view.
- **P3 Summary & map** — overview, route map, automatic Flags.
- **P4 On-the-go** — Today view, map/directions links, time-zone display, offline read cache.
- **P5 Together & prep** — Notes, Wishlist voting, pre-trip checklist, packing list+templates.
- **P6 Docs & sharing** — Attachments (file storage), export/print, read-only share link.
- **P7 Notifications & journal** — reminders/push, photos/journal.
- **P8 (future)** — AI assistant.

## 10. Out of scope / dropped

- Weather/climate. Per-person cost splitting. Budget targets/caps. Full route optimiser.
  Native mobile app. Full offline-first editing with auto-merge.

## 11. Build process (per project CLAUDE.md)

On "go for it": superpowers **writing-plans** → ordered independent tasks, then
**subagent-driven-development** to execute (fresh subagent per task, with spec-compliance
and code-quality review loops). Run end-to-end without per-task check-ins.
