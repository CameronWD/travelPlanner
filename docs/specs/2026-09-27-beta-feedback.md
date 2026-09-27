# Beta Feedback lot — 2026-09-27

Agreed spec for the 10 open beta Feedback notes plus the desktop Home redesign
(`docs/specs/2026-09-27-desktop-home.md`, read together with the amendments
below). Terms follow `CONTEXT.md` (new this lot: **Day title**, **Item photo**,
**Profile photo** / **display name**, **Journal**, **Your travels**). ADR 0051
amended 2026-09-27 (Journal dial).

## Delivery

- Branch `feat/beta-feedback-2026-09-27`, cut from `beta`.
- Each note's work carries a `Resolves-Feedback: <id>` trailer on the commit
  that does it. Do **not** run `feedback:resolve`; do not hand-edit the inbox.
- A Release note (ADR 0056) for each Traveller-noticeable change, crediting the
  Feedback note's author.
- Migrations are additive only (DEPLOY.md §4b safe). No dropped column/index an
  old build's query compiles to.
- Nothing merges to `beta`/`main`, nothing deploys, without the operator's go.
- Update ADR 0010 (adaptive Home — desktop layout) and ADR 0061 (rail interim
  resolved: header retired at ≥768px).

## A. App shell — `cmuhvq385`

- ≥768px: **no top app bar**, anywhere signed-in. One logo on screen.
- ≥1280px: full 248px sidebar per desktop-home spec §1: sun fill, sticky
  `100dvh`, lockup → `/trips`; search field (see B); **trip switcher** card
  (status line: "68 sleeps to go" / "Day 5 of 35" / "Back home"; menu lists the
  user's Trips, then All trips, + New trip); trip nav **Home, Plan, Days, Money,
  Wishlist, More** (no "Today" — Today view *is* Home while Travelling). Plan
  count = number of **Flags** on the real plan; Wishlist count = number of
  Wishlist ideas; hidden at 0. Active row coral + ink shadow +
  `aria-current`. "ALL TRIPS" eyebrow → Trips, Globe. Footer: avatar, display
  name, "Account" link, theme toggle.
- Outside a Trip the sidebar shows lockup, search, (no switcher selection /
  switcher shows "Choose a trip"), and the Trips/Globe section; footer the same.
- 768–1279px: existing 96px Dock (mark, icon+label items, search icon →
  full-screen search). Trip switcher becomes a compact pill in the page header.
- <768px: unchanged (phone header + tab bar).
- Avatar menu keeps Help, What's new, Admin (if admin), Sign out.
- Keep `?plan=` fork threading, `isNavActive` rules, More sheet behaviour.
- Notification bell lives in the trip page header (desktop-home §2).

## B. Search — `cmuhvu6z7`

Overrides desktop-home §1's search button.

- The sidebar search is a **real text input** (44px, white, 2px ink border,
  radius 12px, search icon, placeholder "Search or jump…").
- Focus/click shows the caret in place; a panel anchored below shows **Go to**
  and **Do** when empty, **Find** results as you type (same data/actions as the
  existing command palette; real plan only; offline message for Find).
- No ⌘K keycap. Tooltip shows the platform shortcut (⌘K on Mac, Ctrl K
  elsewhere). The shortcut focuses the field (at ≥1280px); where there is no
  field (Dock, phone) it opens the existing full-screen palette.
- Keyboard: arrows move through results, Enter activates, Esc closes/clears.

## C. Desktop Home — Sketching / Planning / Final prep

Build `docs/specs/2026-09-27-desktop-home.md` §2–§10 at ≥1280px (the 1024–1279
band gets the same content in a narrower grid; <768px keeps today's phone Home)
with these amendments:

- Primary button reads **"+ Add a stop"** (not "Add a place") and opens the
  add-Stop flow.
- "Hey {first name}" uses the Traveller's **display name** (J).
- Route map fits the largest **geographic cluster** of located Stops (never
  called a chapter); middle chip reads "{Continent} · N stops" (country name if
  the cluster is one country). Pin fill = the Stop's colour
  (`lib/stop-colours.ts`). Clicking a pin opens the Plan scrolled to that Stop
  (reuse G's scroll/highlight).
- "Sort these out" is built from **Next steps** (`lib/next-steps*`), plus
  Reminders due within 7 days, ordered: those reminders, then Transport, then
  the rest; max 4 rows. Dates via `formatDayLabel` (`lib/dates.ts`).
- The Reminders panel/tile go; a Reminder shows on Home from 7 days before its
  date (CONTEXT updated).
- A date-less (Sketching) Trip's countdown shows "Pick your dates".
- People stack opens the Trip's people sheet (Invite only for the Owner).

## D. Desktop Home — Travelling / Past

- **Travelling:** same header and tile language, 12-col grid. Row 1: coral tile
  "Day N of M" with today's Stop (polaroid if cover), + **Spend so far** tile
  (sun). Row 2: **Today** (today's plan, next Transport, tonight's stay) +
  **Day map**. Row 3: **Today's journal**, full width, last.
- **Past:** same header; existing wrap-up content restyled into tiles on the
  grid. No new content.
- Phone: today's layout; Travelling adds Today's journal as the **last** card.

## E. Home card spacing — `cmuhvvx2a`

One spacing rule on every phase: 14px gaps on phones, 18px at ≥1024px, rows and
columns alike, including under any cover. A test pins it (no other gap values
in the phase components' layout containers).

## F. Portrait covers on the trips list — `cmuj4l1d9`

- Store the cover's aspect ratio (width/height) on `Trip` at upload; one-off
  backfill script for existing covers (reads image headers from storage; run by
  the operator, not in a migration). Client-side detection stays as fallback.
- Desktop (≥1024px) trip cards with a portrait cover render as a row: photo left
  (~40% width, the whole portrait visible), details right. Regular and featured
  cards. Landscape / route render / monogram unchanged. Phone unchanged.

## G. Stops list in the plan side panel — `cmuhvbi4h`

- Below `PlanOverview` in the sticky aside (≥lg): a "Stops" list. Home base row
  first and (round trip) last; Stops in plan order, grouped under Chapter
  headings when Chapters are on. Row: Stop colour dot, name, dates or "~N
  nights".
- Click → smooth-scroll to the Stop card and briefly highlight it (respect
  reduced motion). Scroll-spy highlights the Stop in view. List scrolls inside
  the aside if long. Follows the Plan (Fork) being viewed.

## H. Day titles — `cmuhvc6jn`

- New entity `DayTitle (stopId, dayIndex, title)` — plan-scoped through its
  Stop; `dayIndex` = 0-based offset from the owning Stop's arrive date. Unique
  per `(stopId, dayIndex)`.
- Rides with its Stop on re-date (offset preserved automatically). A title whose
  index is beyond the stay is kept but not shown; shows again if the stay grows.
- Changeover day: at most one Day title for the date; owned by the Stop it was
  set from; shown under both Stop cards. Setting it from the other card edits
  the existing one.
- Fork copy/promote carry titles with their Stops; Duplicate drops them.
- Edit inline on the plan editor's day row header (empty = no title; clear to
  remove). Shown on the Day view heading, Days agenda + month cell, Home Today
  tile, and Share-link day-by-day. Not in the Calendar feed.
- Recorded as Activity like other plan edits.

## I. Item photo — `cmuhv7doa`

- One optional photo per Item: an image `Attachment` (targetType ITEM) flagged
  as the Item's photo (e.g. `Item.photoAttachmentId`). Existing upload /
  compression / storage / serve route.
- Set from the Item dialog (upload, or drop an image); replace/remove there.
- Thumbnail on plan-editor Item rows (things to do + day rows), Wishlist cards;
  larger in the Item dialog and Day view; tap opens full size.
- Scheduling a Wishlist idea (copy-in, ADR 0019) copies the storage object so
  the placed Item has its own photo. Fork copy likewise.
- Never on Share links.

## J. Profile photo and display name — `cmuhvqysk`

- New "Profile" card at the top of **Account**: upload + circular crop, remove,
  edit display name.
- Resolution: uploaded photo → sign-in provider image → initials. A Traveller-set
  name/photo is never overwritten by signing in again.
- One shared avatar component replaces the ~10 copy-pasted `initials()` sites
  and renders everywhere a Traveller appears (sidebar footer, trip header stack,
  Notes, Votes, Journal, notifications, checklist assignees, invites, admin).
  Must not rely on JWT-captured image/name alone: changes show for the user
  immediately and for others on next load.
- Photo served only to people sharing a Trip or Globe with the user; never on
  Share links.

## K. Journal — `cmuhvsabe`

- Writable only for Trip days that have arrived (Trip-local today, day ≥ start,
  ≤ min(today, end)); stays writable after the Trip ends. Server-enforced.
  Before day 1 the Journal shows "Opens on day 1".
- Per Traveller per day: one note (≤500 chars, visible counter, server-enforced
  on new/edited text) and one photo. Journal photos become per-author (store the
  author, keyed to the date); adding a second replaces the first after confirm.
- Existing longer notes and multi-photo days are kept and displayed unchanged.
- Travelling Home gets **Today's journal** (your note/photo for today + your
  co-Travellers'), last on the page. Journal page becomes the full timeline and
  lets you write any arrived day. Day view keeps showing entries.

## L. Journal on Share links — `cmuhvsabe`

Per ADR 0051 amendment: `ShareLink.includeJournal` (default false). Share page
section "How it's going": arrived days, newest first, each Traveller's note and
photo, by display name only. Link-scoped photo route returns only JOURNAL photos
of that Trip while the dial is on. Per-entry "Keep off Share links" switch.

## M. Your travels — `cmuhw0f0w`

- Section below the trip cards on `/trips`, with a jump link at the top.
- **Travel map:** Leaflet (map palette), every Trip the user is a Traveller on,
  real plan only, drawn as its route of located Stops; colour by past / now /
  upcoming, upcoming dashed. Click → popover with name, dates, links to Home
  and Plan. Trips with no located Stops omitted.
- **Travel stats**, counting only what has happened (Stop days ≤ today, real
  plan, `forkId: null`) with "+N planned" for the future: countries visited
  (flags), places (Stops), Trips taken, nights away, Transport counts by mode
  (flights, trains, buses, ferries, drives), nights of Accommodation, distance
  travelled (great-circle km over located Transport legs), fun facts: longest
  trip, most-visited country, farthest place from Home base.
- Personal (the user's Trips only), derived, nothing stored.
