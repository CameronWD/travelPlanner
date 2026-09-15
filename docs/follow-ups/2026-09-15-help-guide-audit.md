# Help guide: claim-by-claim accuracy audit

**Date:** 2026-09-15
**Branch:** `docs/help-guide-refresh`
**Scope:** every section of `components/trip/help-guide.tsx` *except* `trip-shape`,
`chapters`, `search`, `trip-settings` and `globe`, which earlier tasks on this
branch rewrote. (`chapters` is revisited for one specific claim only, and
`trip-settings` for one omission only — both were handed to this task
explicitly.)

Only *quoted control names* are covered by an automated guard
(`GUIDE_UI_STRINGS` in `lib/help-guide.ts`). Everything else is unguarded prose.
This document is the evidence trail for the sweep: what was checked, against
what, and the verdict — including the claims that turned out to be fine.

**Rule applied throughout:** `CONTEXT.md` and `docs/adr/` are authoritative for
*intent*; the CODE is authoritative for what the app *does today*. Where they
disagree, the code wins and the disagreement is noted.

---

## Summary

| | Count |
|---|---|
| Claims checked | 116 |
| Wrong / misleading enough to correct | 13 |
| Accurate as written | 103 |
| Recorded but deliberately left alone | 5 |

Thirteen corrections were made, each with a scoped regression test. The single
biggest finding is that the guide asserts a **drag-moves vs button-copies**
distinction on the Calendar that **does not exist** — both paths copy. It was
stated twice, in two different sections.

---

## Corrections made

### C1 — `giving-a-day`: dragging an idea onto a day does NOT move it

**Claim:** "Drag an idea onto a day and it **moves** there: the idea now has
that date, so it leaves the board."

**Source of truth:** `components/trip/calendar-views.tsx:116-135`,
`server/actions/items.ts:459-537`, ADR 0019.

**Verdict: WRONG.**

`handleDropItem` branches on `wishlistIds.has(itemId)`:

```ts
const result = wishlistIds.has(itemId)
  ? await scheduleItem(itemId, { date: dateISO })
  : await rescheduleItem(itemId, dateISO);
```

`wishlistIds` is built from the very `wishlistItems` array that renders the
rail, and the rail's `<li>` rows are the **only** `draggable` elements in month
view (`calendar-views.tsx:225-230`). So a dragged idea *always* takes the
`scheduleItem` branch, whose copy-in path creates a **new** placed row with
`sourceItemId` set and leaves the idea untouched (`items.ts:490-537`). There is
no code path by which dragging a Wishlist idea removes it from the board.

Drag and the little calendar button are the **same operation**. The guide
invented a distinction between them.

**Correction:** both routes described as putting a copy on the day, with the
idea staying on the board.

---

### C2 — `undecided`: the same false distinction, restated

**Claim:** "Dragging an idea onto a day instead **moves** it: the idea takes
that date, so it leaves the board and gets no tick. It isn't lost — it's on the
day you dropped it on."

**Source of truth:** as C1.

**Verdict: WRONG**, same root cause. Recorded separately because it is a
separate section with its own wording, and a reader who only opens "Ideas you
haven't decided on" would be misled independently.

**Correction:** the section now says both routes copy, and the "one thing that
catches people out" framing is re-pointed at the thing that *is* true and
surprising — that the copy is per-plan, so the shared idea can sit on a
different day in each version of the plan.

---

### C3 — `together`: opening the bell does not clear the count

**Claim:** "Reading it clears the count."

**Source of truth:** `components/trip/notification-bell.tsx:40-95`,
`components/trip/mark-read-on-view.tsx`,
`app/(app)/trips/[tripId]/activity/page.tsx:46`.

**Verdict: WRONG.**

The dropdown has no mark-read-on-open behaviour. `markAllRead` fires only from
an explicit **Mark all read** button (`notification-bell.tsx:47-51, 84-90`,
disabled while `unreadCount === 0`). The count also clears by visiting the full
Activity page, which mounts `MarkReadOnView`. Merely opening the bell leaves the
badge exactly where it was.

**Correction:** names **Mark all read**, and says opening Activity clears it
too. `"Mark all read"` added to `GUIDE_UI_STRINGS`.

The other two parts of the same paragraph are **ACCURATE**: the unread count
filters `actorId: { not: user.id }`, and the list rendered in the dropdown has
no actor filter, so it does show both travellers.

---

### C4 — `chapters`: disabled bands do not come back "exactly as they were"

**Claim:** "your bands aren't thrown away, they just stop showing, and come back
exactly as they were if you switch them on again."

**Source of truth:** `server/actions/trips.ts:406-448`, ADR 0021 §4.

**Verdict: WRONG (overclaim).**

`setChaptersEnabled` re-runs `recomputeChapterSpans` for the real plan **and
every fork** whenever `enabled` is true — its own comment says "Bands may have
gone stale while hidden — self-heal every plan (ADR 0021 §4)." Turning chapters
off only flips the flag, but turning them back on re-derives every span from
where its member stops now sit. If you re-dated stops while chapters were off,
the bands come back **healed to the new dates**, not as they were.

**Correction:** says the bands come back re-drawn around wherever the places
have moved to, rather than exactly as they were.

---

### C5 — `dates-and-pins`: the ripple is span-scoped, not "everything after"

**Claim:** "Change one place from three nights to five and everything after it
shifts along by two — the ripple."

**Source of truth:** ADR 0038 (*span-scoped ripples*), `lib/reorder.ts:303-326`
(`collisionPush`), `lib/reorder.test.ts:433-440`.

**Verdict: MISLEADING (overclaim).**

ADR 0038: "A date edit ripples only on collision. Later Stops shift forward just
enough to stay non-overlapping, each keeping its own lead-in slack… No
contiguous repack." `collisionPush` `break`s out of the loop the moment a
follower's `arriveDate` already clears the new cursor. The existing unit test
"pushes only overlapped followers, letting gaps absorb" asserts a later stop
with a gap in front of it is *untouched*.

So the guide's example is only true when there is zero slack anywhere
downstream. In general the ripple stops as soon as a gap absorbs it — and stops
dead at a pin.

**Correction:** says later places shift only as far as they must, and a gap
already in the plan absorbs the change.

---

### C6 — `forks`: the variant banner is not quoted accurately

**Claim:** the banner says "Editing variant — not live".

**Source of truth:** `components/trip/variant-banner.tsx:18-21`.

**Verdict: WRONG as a quotation.** The rendered text always interpolates the
variant's name and carries a second sentence:

> Editing variant "{name}" — not live. Your calendar, summary and sharing still
> follow your real plan.

The four-word string the guide quotes is never rendered. (`"Editing variant"` in
`GUIDE_UI_STRINGS` still matches, because the guard is a substring check — which
is exactly why this one slipped through.)

**Correction:** the guide now describes the banner rather than pretending to
quote it verbatim, and keeps the name interpolation visible to the reader.

---

### C7 — `forks`: a variant does not travel to "every screen"

**Claim:** "It travels with you across every screen on the trip."

**Source of truth:** `components/trip/trip-nav.tsx:14-24`,
`components/trip/variant-banner.tsx` call sites (plan, wishlist, budget only).

**Verdict: WRONG.**

The active variant is carried purely by a `?plan=` search param, and only the
plan-scoped nav links append it. `trip-nav.tsx` says so outright: "Plan-scoped
surfaces keep the active variant (?plan=); dated views always follow the real
plan." Navigate to Calendar, Summary, Journal, Checklists, Files or Activity and
the variant silently drops. `VariantBanner` is rendered on exactly three pages.

This also contradicted the guide's own next paragraph, which correctly says
editing a variant never touches the dated screens.

**Correction:** names the three screens that carry the variant and says the
dated screens always show the real plan.

---

### C8 — `sleeping-moving`: two field names are not the app's words

**Claims:** accommodation takes "the confirmation number off the booking email";
transport records "the flight or train number".

**Source of truth:** `components/trip/accommodation-form-dialog.tsx:393`
(`label="Booking confirmation"`),
`components/trip/transport-form-dialog.tsx:556`
(`label="Booking reference / number"`).

**Verdict: MISLEADING.** Both describe the right box with the wrong words, and
the writing rules require the UI's exact words. The transport one is the worse
of the two: the field is a single mode-independent reference, not a
flight-number field, and there is no per-mode relabelling.

**Correction:** both now use the real labels. Added to `GUIDE_UI_STRINGS`.

---

### C9 — `things-to-do`: the field list omits Stop and the time fields

**Claim:** the form's fields are Title, Category, Date, Address, Link, Booking
reference, Notes, Cost.

**Source of truth:** `components/trip/item-form-dialog.tsx:401-563`,
`components/trip/inline-cost-fields.tsx:62-123`.

**Verdict: WRONG (incomplete).** The real order is Title, Category, **Stop**,
Date, **Start time**, **End time**, Address, Link, Booking reference, Notes,
Attachments, Cost (then the Paid follow-ups once a cost is entered).

The missing time fields matter: the very next section tells the reader "Times
are optional" without ever having said where times are entered.

**Correction:** Stop and the two time fields added to the list. Attachments and
the Paid follow-ups left out deliberately — Paid has its own section, and
Attachments are covered under "Getting ready".

---

### C10 — `getting-ready`: the paperclip is not on "every card"

**Claim:** "the paperclip button sits on every card".

**Source of truth:** `components/trip/attachment-popover.tsx:19-33`,
`components/trip/card-action-cluster.tsx:96-107`, `CONTEXT.md` Attachment entry.

**Verdict: MISLEADING (overclaim).** Attachments are limited to Stop, Transport,
Accommodation, Item and Marker. `home-base-card.tsx`, `trip-card.tsx`,
`weather-daylight-card.tsx`, `reminders-card.tsx`, `spend-so-far-card.tsx` and
`upcoming-payments-card.tsx` have no attachment affordance at all. The sentence
also contradicted its own first half, which had just named the three things that
take a file.

**First correction (WRONG — superseded, see C10b):** "on every card" replaced
with "those cards each carry a paperclip button".

---

### C10b — the C10 correction was itself wrong *(caught in review)*

**The first fix traded one false claim for another.** "those cards each carry a
paperclip button" narrowed the *set* of cards correctly but re-asserted the
paperclip for all three named targets and on every screen size. Both are wrong.

**Source of truth:** `stop-card.tsx:435, 459-464, 552-576`,
`item-card.tsx:122`, `card-action-cluster.tsx:96-107, 148-156`.

Three separate facts, verified individually:

1. **The paperclip is desktop-only.** On the Stop card it is wrapped in
   `<div className="hidden sm:block">` (`stop-card.tsx:435`); in
   `CardActionCluster` likewise (`card-action-cluster.tsx:97-98`). On a phone
   both fold into the `⋯` `MoreActionsMenu` as an "Attachments (N)" item that
   opens a bottom sheet. So the sentence was wrong on **every phone** — for
   every target it named.
2. **A thing to do parked under a Stop has no paperclip at all.** Its row in
   `stop-card.tsx:552-576` renders only the `DayPickerMenu` and a pencil.
   `item-card.tsx:122` renders `CardActionCluster` under
   `mode === "wishlist"` only; the non-wishlist branch is a bare edit button.
   A thing to do takes files through the **Attachments** field on its own edit
   form (`item-form-dialog.tsx:532`), which requires saving it first.
3. Only the Stop and the two booking types carry the paperclip affordance at
   all, and then only on a wide screen.

**Correction:** the sentence now says a place and the bookings on it carry the
paperclip on a wide screen, with the phone `⋯` menu named — matching the
established pattern already used in the `together` section for the speech
bubble — and calls out the thing to do as the exception that takes files in its
own form.

**Lesson for this document:** C10 was the one correction made from a summarised
finding rather than from reading the rendering code end to end. The summary said
"only Stop, Transport, Accommodation, Item and Marker", which is true of the
*data model* (`CONTEXT.md`) and false of the *affordance*. Checking what a model
permits is not the same as checking what a card renders.

---

### C11 — `word-list` **Transport**: the mode list is incomplete

**Claim:** "A flight, train, drive or ferry between two places".

**Source of truth:** `lib/enums.ts:13-20` —
`["FLIGHT","TRAIN","BUS","CAR","FERRY","OTHER"]` — surfaced as six options in
the form via `lib/transport.ts:37-38`.

**Verdict: WRONG.** Phrased as a closed list, it drops Bus and the Other
catch-all — a third of the real modes. Even `CONTEXT.md:41` hedges with "etc.",
which the word list's phrasing threw away. (The `sleeping-moving` prose hedges
correctly with "whatever it is" and needed no change.)

**Correction:** the entry now lists all six.

---

### C12 — `word-list` **Firm up**: the anchor is not always the trip start

**Claim:** "flowing the nights forward from where the trip starts."

**Source of truth:** `CONTEXT.md:133-134` ("the Trip start, **or the depart date
of the preceding scheduled Stop**"), `lib/firm-up.ts:38-78, 106-119`.

**Verdict: MISLEADING.** Firming up a single Chapter anchors on the preceding
scheduled stop, not on the trip start. The guide's own `dates-and-pins` section
states this correctly, so the word list contradicted the body of the same
document.

**Correction:** the entry now says "from the trip's start, or from where the
place before it ends".

---

## Checked and accurate

Recorded because a section checked and found clean is a result.

### `sixty-seconds` — ACCURATE
- Six-step order Plan → Calendar → Budget → Summary matches the real nav
  (`trip-nav.tsx:14-23`). *Note:* Summary is a top-level tab on desktop but
  lives in **More** on the phone (`mobile-tab-bar.tsx:29-40`). The guide links
  rather than claiming a tab position, so nothing is wrong.
- "first day at the top" — `lib/plan-order.ts:14-34` sorts scheduled stops by
  `arriveDate` ascending.
- Summary "reads the whole trip back to you and points out what's missing" —
  matches `summary/page.tsx` (per-stop nights, transport, cost, route map,
  `FlagList`, `MakeItFit`) and `CONTEXT.md:115-117`.
- "everything saves as you go" — no autosave exists and the dialogs have real
  Save buttons, but there is no separate publish/sync step and light
  interactions (votes, drops) persist on one tap. True in the sense intended.
- "the other one of you picks up your changes the next time they open the
  screen" — verified there is **no** realtime transport anywhere (no websocket,
  socket.io, Pusher, Ably, SWR or polling). `revalidatePath` only. The claim is
  exactly right.

### `things-to-do` — ACCURATE apart from C9
- `"Add Thing to Do"` at the bottom of the Stop card — `stop-card.tsx:583-595`.
- "Only the first line is required" — `lib/validations/item.ts:28-33` marks only
  `title` `.min(1)`. `category` is a non-optional enum at schema level, but the
  form seeds it with `SIGHTSEEING` and the pill selector has no unset state, so
  a user can never submit it blank. True as written for any reader.
- Category drives colour (`lib/categories.ts:11-27`) and Budget grouping
  (`lib/budget.ts:249-278`).
- Address is geocoded server-side on save and only resolvable addresses get
  coordinates — `server/actions/items.ts:108-117, 291-300`.
- The pencil edit affordance is present on both desktop and phone for item rows
  (no `sm:` gating) — `stop-card.tsx:552-576`.

### `giving-a-day` — ACCURATE apart from C1
- Month/Agenda toggle labels exact — `calendar-views.tsx:150-158`.
- Wishlist rail is month-view only, `lg:flex-row` beside / stacked below, and
  hidden when empty — `calendar-views.tsx:198-255`.
- The calendar button is a `CalendarCheck`, `aria-label="Schedule {title}"`, and
  genuinely copies — `calendar-views.tsx:234-247`.
- `"Add to this day"` creates a brand-new dated row —
  `day/[date]/page.tsx:493-501`.
- Timed items sort by time, untimed sit underneath under "Anytime" —
  `lib/itinerary.ts:366-379`, `timeline.tsx:86-153`.
- Weather/daylight require coordinates — `day/[date]/page.tsx:372-405, 450`.
- `"Show day map"` exact; numbered markers, an "H" marker for *tonight's* stay
  specifically, and an "Open today's route" maps handoff — `day-map-panel.tsx:30-38`,
  `day-map.tsx:40-79, 252-283`.

### `undecided` — ACCURATE apart from C2
- Wishlist ideas always carry `forkId: null` and are shared by every plan —
  `lib/plan-scope.ts:19-26`, `items.ts:229`, `CONTEXT.md:61-62`.
- Vote labels Must / Keen / Meh exact, both travellers' marks side by side —
  `lib/enums.ts:35`, `vote-control.tsx:36-40, 99-186`.
- `"Add from Globe"` at the top of the board, gated on `hasGlobe` —
  `wishlist-board.tsx:220-228`.
- `"Schedule this"` copies; the idea then shows a tick and `"in this plan"` —
  `item-card.tsx:254-261`, `wishlist-board.tsx:340-348`.
- "the same idea can sit on day three of one and day five of another" — ADR 0019
  states this almost verbatim and `sourceItemId` supports it.

### `sleeping-moving` — ACCURATE apart from C8
- `"Add Accommodation"` exact — `itinerary-manager.tsx:1601-1610`. It is
  rendered as a sibling immediately after the Stop card rather than inside the
  `StopCard` component, but it reads as part of the card on screen; no change.
- `"Add transport"` exact (lowercase t) and rendered in the gaps between stop
  blocks — `itinerary-manager.tsx:1628-1646`.
- The accommodation coverage flag really compares booked nights against the
  stay — `lib/flags.ts:708-736`.
- Both forms embed `InlineCostFields` — `accommodation-form-dialog.tsx:430-444`,
  `transport-form-dialog.tsx:593-607`.
- No responsive difference on either add button.

### `money` — ACCURATE throughout
- Cost / Paid as the two numbers; `"You paid"` and `"Date paid"` on the follow-up —
  `inline-cost-fields.tsx:64-116`.
- Ticking Paid pre-fills the amount from the cost —
  `inline-cost-fields.tsx:54-60`, `cost-checklist.tsx:150-153`.
- Never paid without an amount — `lib/validations/cost.ts:128-134` and
  independently `server/actions/costs.ts:298-309`.
- "home currency" is the app's own term — `trip-details-form.tsx:116`,
  `CONTEXT.md:77-79` (which explicitly rejects "base currency"). Manual rate
  override real — `lib/fx.ts:83-107`, `rates-panel.tsx:99-238`.
- Four hero tiles including cost-per-day — `budget-hero-row.tsx:58-123`.
- `"By category"`, `"By destination"`, `"By chapter"`, `"Day by day"` all exact —
  `budget/page.tsx:420, 473, 499, 562`. Each is hidden when it has no data, and
  "By chapter" is additionally empty when chapters are off; the guide does not
  claim they are always shown.
- Cost and paid render as two aligned columns — `cost-amounts.tsx:19-41`.
- `"Mark off what you've paid"` exact — `budget/page.tsx:408`.
- `"Other costs"` exact, right rail on desktop / further down on a phone —
  `budget/page.tsx:610-624`.
- Both hidden on a variant (`!activeFork`) — `budget/page.tsx:404, 610`.
- "no limit or target to set" — no cap logic exists; `CONTEXT.md:101-103`
  explicitly rejects the idea.

### `getting-ready` — ACCURATE apart from C10
- Exactly three tabs, labels exact — `checklists/page.tsx:84-102`.
- Due date and assignee on Pre-trip only (`showDueDate`/`showAssignee` are
  `false` for Packing) — `checklists/page.tsx:108-135`, `checklist.tsx:222-257`.
- Packing templates save per-user and apply into any trip —
  `packing-templates-bar.tsx:38-98, 196-200`.
- Files page groups by what the file belongs to — `files/page.tsx:24-32, 63-80`.
- Card-attached files do appear on the Files page — every upload carries the
  `tripId` and the page queries by `tripId` regardless of target.

### `together` — ACCURATE apart from C3
- Notes attach to exactly Stop, Accommodation, Transport and unscheduled
  Wishlist items — matches the guide's list exactly.
- Speech bubble inline on desktop (`hidden sm:block`), folded into the `⋯`
  sheet on phone (`sm:hidden`) — `card-action-cluster.tsx`, `stop-card.tsx`.
- A thing to do parked under a place has no note thread, only the plain `Notes`
  field in its own form.
- Activity records real per-field before/after values —
  `lib/activity.ts` `describeChanges()`, rendered `label: from → to`.

### `search` — not re-audited (Task 3).

### `away` — ACCURATE
- The travelling-phase home really shows today's ordered plan, a next-transport
  countdown, tonight's stay and spend so far — all four verified in
  `components/trip/home/phase-travelling.tsx`.
- Journal editor on the day page with a dashed `+` photo tile; the Journal tab
  aggregates into one thread.
- Warm-cache offline: the service worker is network-first for navigations and
  serves the cached copy on failure (ADR 0016).
- "Changes do need a connection to save" — true for every plan entity. See the
  note below about Feedback notes.
- `"Create calendar feed"` exact, opt-in, one-way — the panel itself says
  "One-way: your itinerary publishes to this feed."

### `something-off` — ACCURATE
- All sixteen flag rules in `lib/flags.ts` were enumerated. Each of the guide's
  seven examples maps to a real rule; none are invented. The guide says "Flags
  are things like", so the three it doesn't mention (empty days, route
  backtracking, tight connections) are not an error.
- Exactly two severities — `export type FlagSeverity = "warning" | "info"`
  (`flags.ts:20`). No red severity exists.
- The hard-end overrun **is** a real Flag (`hard-end-over`, severity `warning`,
  `flags.ts:673-698`) *and* separately drives hardcoded red in three places
  (`plan-overview.tsx:22-23`, `make-it-fit.tsx:191`, `compare-table.tsx:114-118`).
  The guide's careful "a Flag is never red, but the app does turn red" is a
  correct description of two mechanisms, not a contradiction. This was checked
  specifically because it reads like one.
- Warnings sorted before infos on Summary — `flag-list.tsx:146-177`.
- `"Over hard end"` exact — `compare-table.tsx:108`.
- `"Next steps"` exact, shown only in the planning/final-prep phases (never
  sketching, travelling or past), ranked by an explicit priority table, with
  every line a deep link, and a "You're all set" empty state.

### `make-it-fit` — ACCURATE throughout
- Trigger, both headings (`"Trim nights"`, `"Or drop a stop"`), the
  headroom-proportional split, the floor of one night in the *suggestion* with
  manual editing allowed down to zero, the projected end date on each drop
  candidate, pinned stops excluded from **both** trim and drop, `"Apply trim"`
  exact with everything before it a preview, and the impossible-case message
  naming exactly the three options the guide names
  (`make-it-fit.tsx:241-245`).

### `dates-and-pins` — ACCURATE apart from C5
- Exactly two states; pinned is an attribute of scheduled, not a third state.
- The firm-up flow algorithm matches `lib/firm-up.ts:38-78` exactly.
- `"Firm up all stops"` exact and first in the render tree —
  `itinerary-manager.tsx:1670-1687`. Per-chapter `Firm up` exists at
  `1800-1812`.
- "the same engine re-dates the plan when you drag a place into a different
  position" — **verified against the code, not the ADR.** ADR 0014
  (`drag-reorder-rough-only`) is superseded by ADR 0021; scheduled stops are
  draggable today (`itinerary-manager.tsx:1088-1094, 1196-1294`), only pinned
  ones are barred. The guide is right and the ADR title is stale.
- The pin conflict message exists and says the pin was kept —
  `itinerary-manager.tsx:799, 837`. Slack before a pin is left as free days —
  `lib/firm-up.ts:36`.
- `"Clear dates"` desktop / `"Make rough"` in the `⋯` menu on phone, both exact —
  `stop-card.tsx:392-405, 264-272`.

### `forks` — ACCURATE apart from C6 and C7
- Dropdown in the trip header between the member avatars and the bell —
  `trips/[tripId]/layout.tsx:116-153`.
- `"New variant"` exact — `fork-switcher.tsx:385-396`.
- Fork scoping is structural via the nullable `forkId` discriminator (ADR 0020).
- Wishlist, checklists and journal are all genuinely shared (as are notes,
  votes, attachments, rates and more — the guide gives examples, not a list).
- Compare puts the real plan leftmost and diffs added / dropped / re-nighted /
  reordered plus end date, total and flag counts — `compare-table.tsx:479-489`,
  `lib/compare.ts:479-582`.
- Promote deletes the real-plan rows, retags the chosen fork, then
  `fork.deleteMany({ where: { tripId } })` — every other version really is
  discarded, irreversibly — `server/actions/forks.ts:747-778`.
- The confirmation really does enumerate paid costs, booking confirmations and
  attachments — `promote-fork-dialog.tsx:89-93`, `forks.ts:626-660`.
- Forking is blocked once travelling or past, client **and** server.

### `word-list` — ACCURATE apart from C11 and C12
Stop, Chapter, Home base, Thing to do, Wishlist, Globe, Vote, Accommodation,
Cost, Paid, Flag, Next steps, Variant, Pinned, Rough and Activity all match
their `CONTEXT.md` entries and the code.

### legend — ACCURATE
- The mobile tab bar really is Home / Plan / Calendar / Budget / More with
  `Home`, `Map`, `CalendarDays`, `Wallet`, `Menu` — `mobile-tab-bar.tsx:17-22,
  32-37`, matching `help-legend.tsx:234-241` exactly.
- Green check, paperclip-with-number, amber `AlertTriangle` and `Clock` all
  verified with the stated meanings.
- "you'll be asked to confirm first" on delete — every delete path traced
  (stops, chapters, transports, accommodations, wishlist items, checklist items,
  attachments, fork discard) goes through `useConfirm` /
  `useDeleteWithConfirm` / a dedicated dialog. No unconfirmed delete found.

---

### C13 — `trip-settings`: Duplicate omits the transport connections

**Claim:** Duplicate copies "the same places, chapters, wishlist and
checklists, with every date wiped".

**Source of truth:** ADR 0018, `lib/duplicate-trip.ts:1-11, 174`.

**Verdict: WRONG (incomplete).** Transport connections *are* copied, **stripped
of times, reference and cost** — ADR 0018 names them explicitly in what carries
over. A user duplicating a trip will see the legs reappear with nothing in them,
which the guide's list gave them no reason to expect.

Handed to this task as a candidate; it holds, and it is cheap to say, so it was
corrected rather than left.

**Correction:** the list now includes "the legs that join the places up,
stripped back to just the mode".

---

## Recorded and deliberately left alone

### L2 — `trip-settings`: "only the person who created the trip sees them"

`settings/page.tsx:31-34` now reads `isOwner || isAdminEmail(user.email)`, so
the claim is no longer literally exhaustive. **Left as-is deliberately.** The
guide ships to every user and the Global Constraints forbid mentioning the
`ADMIN_EMAILS` override; the sentence remains true for every reader who is not
an operator of the app. Flagging here so the next person does not "discover" it
and write the admin power into the guide.

### L3 — Legend: the `MapPin` specimen is ambiguous in the app *(app issue, not a guide issue)*

The legend says a `MapPin` means "Has a location, so it shows on the map". In
the app, `MapPin` is used **twice, identically**: as a decorative glyph next to
a stop's country (`stop-card.tsx:335-338`) or an item's stop name
(`item-card.tsx:112-117`), regardless of whether coordinates exist; and inside
`MapLink` (`map-link.tsx:14-20`), which renders *nothing* without a location and
is the real signal. The two sit side by side and look the same.

**Out of scope here.** Fixing the guide can't fix this — the legend is
describing an app affordance that is genuinely ambiguous. The right fix is in
the UI (differentiate the decorative pin, or drop it), which is an app-behaviour
change this task must not make. Raising it as a follow-up.

### L4 — `away`: "changes do need a connection to save" has one exception

ADR 0041 and `lib/feedback-queue.ts` let **Feedback notes** queue in
localStorage while offline and flush on reconnect. Every plan entity still
requires a connection, which is what the sentence is about, and the guide does
not document the Feedback feature at all. Left unqualified; noting it so a
future Feedback section doesn't contradict this paragraph.

### L5 — `something-off`: "places that still have no dates" is a Flag, not a nudge

The guide offers it as an example of a "gentler nudge" mixed in with the Flags.
It is in fact `flagRoughStops` (`flags.ts:452-462`, severity `info`), fed into
`buildNextSteps` with `source: "flag"`. The distinction is invisible to a
reader — both render as one line in the same ranked list — and the other example
given ("a packing list you haven't started") *is* a genuine nudge. Not worth
rewording. Recorded for completeness.

### L6 — `word-list` **Journal**: "while you're away" is a framing, not a gate

`JournalEditor` is rendered unconditionally on the day page with no phase check
(`day/[date]/page.tsx:504-524`) — unlike Day ideas, which *is* gated on
`phase === "travelling"`. You can write a journal entry for any date at any
time. The word list's "while you're away" describes the intent rather than a
restriction, and `CONTEXT.md` has no Journal entry to contradict. Left alone.

---

## Note on the drift guard

C6 is the instructive failure. `"Editing variant"` was in `GUIDE_UI_STRINGS` and
passing, because the guard asserts the string appears *somewhere* in a file under
`components/` or `app/`. It cannot catch a quotation that is accurate as a
prefix but wrong as a whole, and it cannot catch a label that has grown an
interpolated value in the middle. Worth remembering before trusting the guard as
proof a quotation is right.
