# Spec — Feedback batch: stacked plan days, a bigger stay panel, a near-full-screen map, flight positions, names for Sign-in link users, light mode for everyone, sticky dialog footers (2026-10-04)

**Status:** agreed with Cam 2026-10-04; not yet built.
**Branch:** `feat/feedback-batch-2026-10-04`. Target `main`.
Terminology follows `CONTEXT.md` (amended this round: **Profile photo and display name** — every Traveller has a name).

| Part | Contents | Closes |
|---|---|---|
| A | Plan editor (desktop): the day strip goes; every day of an open Stop is a full day section, stacked, collapsible | `Resolves-Feedback: cmut6gke4000104lfe5qiwt4w` |
| B | Plan editor (desktop): the stay chip becomes an inline stay panel sharing the top of the card with the ideas box; check-in/out times shown everywhere | `Resolves-Feedback: cmut6islx000304lfagmt04nt` |
| C | Plan editor (desktop): the rail's mini map becomes a button; the map dialog becomes near-full-screen and resizes properly | `Resolves-Feedback: cmut6la03000004lb0vs46uax` |
| D | Transport position picker shows where a leg really sits; legs get an anchor when created | `Resolves-Feedback: cmut6hx92000204lfpn25yavf` |
| E | A Traveller whose sign-in brought no name must give a display name | `Resolves-Feedback: cmut6e3c6000004lfadafz4ju` |
| F | Dark mode is parked: every toggle removed, everyone renders light | `Resolves-Feedback: cmurqppcj000004l5fla4t4sc` |
| G | Dialog sticky footer: fix the footer covering the Item dialog; scroll-aware rule + shadow on sticky footer and header | — (Cam, in session) |
| H | Bank details hint copy on Account | `Resolves-Feedback: cmut4ckfz000004jpegpl8x2i` |
| I | Folded-in fixes in rewritten code: "or pick an idea" works; ADR 0049 non-owning-Stop marker on changeover days | — |

**Out of scope (decided):** redrawing the wordmark (the lower-case `teepee.` is intentional,
ADR 0060 — the note was closed won't-fix 2026-10-04); deleting dark-mode code (it is parked,
not removed); plotting rough Stops, stays or Items on the route map; a map redesign beyond
the bigger dialog; the phone plan sheet's layout (it already stacks days); a sticky
"Before the first Stop" for ordinary Stop-to-Stop legs; any data migration of existing
`Transport.anchorStopId` values. The Shopping list note (`cmuqfxlkt…`) is already built on
`main` (spec 2026-10-02 §G) and closes when that deploy is confirmed live.

---

## A. Stacked, collapsible days in the open Stop card (desktop, ≥ `lg`)

**Why.** The open Stop card shows a strip of small day cards plus exactly one full day
section for the selected day. The small cards double up the information and hide every
other day.

**What.**
- `StopOpenBody` drops `DayStrip`. A scheduled Stop's open body renders **every day of the
  stay as a full day section, in date order** — the content `SelectedDay` renders today:
  the sun bar with the date, the inline-editable **Day title**, the "N plans · N booked ·
  €X so far" summary, **Open day ›**, **+ Add**, the plan rows (timed by start time, then
  untimed), the empty state and the "+ Add to…" footer.
- Each day is an **accordion**: its header toggles it. **Every day starts open.** A
  collapsed day still shows its header line (date, Day title, summary) and nothing else.
- **Collapse state is remembered on this device per Trip** (localStorage, keyed by Trip and
  Stop date; per-viewer convenience only — wrapped in try/catch and the page works without it).
- **Moving a plan between days:** each day section (including a collapsed day's header)
  is the drop target that `slot:<stopId>:<date>` was; a collapsed header hovered with a
  plan for a short delay opens. `resolveItemDrop` / `planCollisionDetection` keep their
  contract with the new targets; dragging onto another Stop's day still works. The drag
  hint copy ("Drag a plan onto a day above") is reworded to match.
- **Scheduling an idea onto a day** scrolls that day's section into view and flashes it
  (the P7 flash moves from the strip slot to the section).
- **Hash links:** `#open=…&day=YYYY-MM-DD` keeps opening the Stops; `day=` now scrolls to
  that day's section (opening it if collapsed) instead of selecting it. Per-stop selected
  day state in `PlanBody` goes away.
- A **Changeover day** appears under both Stops as today (and see §I for its marker).
- Phone (`< lg`) is unchanged.
- Tests that assert strip behaviour (`day-strip`, `stop-open-body`, `plan-body`, `motion`,
  `itinerary-manager` desktop drop tests) are updated to the stacked model; `DayStrip`
  is deleted if nothing else uses it.

## B. Inline stay panel beside the ideas box (desktop)

**Why.** The stay is only a small chip ("✓ All 5 nights · in 15:00") that opens a dialog;
check-in/out times are never shown except that chip's first check-in.

**What.**
- The open Stop card's top row holds **two panels side by side, equal width, stretched to
  equal height**: the new **stay panel** ("Where you're staying" — a display heading) and
  the existing **ideas box**. When the card's **own width** is under ~640px (container
  query, not viewport — the 1024–1279 band with dock + rail), they stack, stay first.
- The stay panel lists **one block per Accommodation**: name; check-in date + time →
  check-out date + time, and nights; address with the map link; confirmation number;
  cost with Paid/Unpaid; first line of notes; an attachment count when > 0. Clicking a
  block opens the existing Accommodation view/edit (no new form).
- Under the blocks, a **coverage line**: "All N nights covered", or "X of N nights — no bed
  {days}", with **+ Add another place**. No Accommodation: "No bed yet · + Add a stay".
  Rough Stop: "Needs dates first".
- `AccommodationRow` / `AccommodationCard` also show check-in/out **times** where set, so the
  stay dialog and the phone sheet's Stay tab get them too.
- The folded `StopRow` keeps its small stay chip.

## C. Route map on desktop

**Why.** The 210px rail tile is too small to use, and its "big" dialog is 44rem × 480px.

**What.**
- The rail's `PlanMiniMap` tile is replaced by a compact **"Route map ⤢" button card**
  that opens the dialog; the freed height goes to the Fit tile and the jump list.
- `PlanMapDialog` on desktop becomes **near-full-screen** (~92vw × ~92vh); the map fills it.
  Phone stays full-screen as today. Clicking a pin still closes the dialog and jumps to the Stop.
- `RouteMap` calls Leaflet `invalidateSize` when its container resizes (ResizeObserver),
  so a resized window or dialog redraws correctly.
- What is plotted is unchanged (scheduled Stops).

## D. Transport position shows where the leg really sits

**Why.** On Christmas in Europe every leg opens saying its position is "Before Denpasar".
Every leg there has `anchorStopId = null` (the real-trip importer never set it); the
timeline places null-anchor legs by a fallback (`resolveTransportSlot`: after the
from-Stop, else before the to-Stop, else head), but the edit dialog shows null as
"Before {first Stop}".

**What.**
- `TransportForm`'s position picker initialises from `resolveTransportSlot(transport, stops)`
  — the slot the timeline actually renders — so Munich → Strasbourg opens "After Munich".
  Saving without touching the picker does not move the leg.
- "Before {first Stop}" is offered only where it can hold: a leg arriving at the first
  Stop, or one with no from-Stop. Other legs don't get the option.
- Legs get a real anchor at creation: the real-trip importer, fork creation, Duplicate,
  the demo seed and the plain **Add transport** button store the slot they would resolve
  to. No migration of existing rows.
- Tests: a null-anchor leg with a from-Stop opens on "After {from}"; the head option's
  visibility rule; each creation path sets the anchor.

## E. Every Traveller has a name

**Why.** A Sign-in link brings no name; such a Traveller shows as "Traveller" / "T" to
everyone, and the only place to set a name is unsignposted on Account.

**What.**
- A **"What should we call you?"** dialog on the Trips page for any signed-in user with
  **no `displayName` and no provider `name`** (new and existing users alike). One Display
  name field (max 60, same validation as Account's `setDisplayName`) and **Save**. It
  **cannot be dismissed** without a name (no close button, Escape/outside-click do nothing).
- For a brand-new Sign-in link user it shows **before** the Welcome dialog; the Welcome
  dialog follows once a name is saved. Google users never see it.
- Account's Display name field starts **empty** when no `displayName` is set, with the
  fallback shown as placeholder — Save can no longer store "Traveller" or an email prefix by accident.
- `CONTEXT.md` amended (done in session).

## F. Light mode for everyone (dark mode parked)

**Why.** Cam isn't happy with dark mode; everyone uses light for now. Keep the dark code.

**What.**
- Remove every theme toggle: phone header (`app/(app)/layout.tsx`), sidebar footer,
  the dock account menu's theme item, the command palette's "Toggle theme", and the
  Account page's phone theme button.
- `ThemeProvider`: the pre-hydration script and `resolveTheme` always resolve **light**,
  ignoring `prefers-color-scheme` and any stored `trip-planner-theme` (a stored "dark" is
  overwritten to light) — existing dark users switch on their next visit.
- `app/layout.tsx` `themeColor` is the light colour only; `app/global-error.tsx` drops its
  `prefers-color-scheme: dark` block.
- Kept, dormant: the `.dark` palette in `globals.css`, map dark tiles/palette, `ThemeProvider`
  and `ThemeToggle` (unmounted). A one-line note in `docs/open-follow-ups.md` records that
  dark mode is parked and how to bring it back.
- Help guide and the `CONTEXT.md` command-palette entry stop mentioning the theme toggle.

## G. Dialog sticky footer and header

**Why.** Editing a thing to do, after adding an attachment, the footer bar (Cancel / Save
changes) ended up covering most of the dialog on desktop. Separately, nothing shows the
footer is sticky.

**What.**
- **Reproduce first** in a real browser (Item dialog, desktop, add an attachment, return
  to the dialog), find the cause, fix it in the shared dialog/footer — the Item form is a
  two-column grid on `sm+` with the footer as its last grid row, a likely suspect — and
  check the other entity dialogs that share the pattern. Add a regression test for the cause.
- **Scroll-aware edge:** when content is hidden beneath the sticky footer it shows a 2px
  top rule in the border colour and a soft upward shadow; scrolled to the end, both fade
  out. The sticky header gets the mirror treatment once the body is scrolled. Short
  dialogs look unchanged.

## H. Bank details hint

`components/account/traveller-details-card.tsx` bank details hint becomes:
**"Only the people on your Trips ever see this — never a Share link."**

## I. Folded-in fixes

- **"or pick an idea"** in an empty day section opens that Stop's ideas ready to schedule
  onto that day (today it looks for a control that only exists inside an open IdeaSheet,
  so it does nothing).
- **ADR 0049 rule 3:** on a Changeover day, a plan shown on the card of the Stop that does
  **not** own it carries a muted "· {owning Stop}" marker — desktop day sections and the
  phone stop sheet.
