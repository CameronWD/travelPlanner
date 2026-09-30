# Spec — Money, New trip, Plan, Share + PageHeader (2026-09-30)

**Source of truth:** the handoff at `design_handoff/budget-onboard-plan-share/`
(`budget-onboard-2026-09-30/{MONEY,NEW_TRIP,MOTION}.md`,
`plan-share-audit-handoff/{PLAN,SHARE,AUDIT,MOTION}.md`, images, reference
mocks). Build what those documents say. **This spec records only where we
depart from or fill gaps in them** — where this file and the handoff
disagree, this file wins.

Branch: `feat/budget-onboard-plan-share-2026-09-30`. One branch, four phases,
each ending green (`npm test`, typecheck, lint, build) and tagged. Motion for
a phase is that phase's last task. Nothing merges or deploys without Cam's
go-ahead; target is `main` (no beta round).

| Phase | Tag | Contents |
|---|---|---|
| 1 | `phase-1-money` | `<PageHeader>` + trip-header change (§A), Money (§B), mechanical PageHeader swap on Files, Activity, Compare, Journal, More |
| 2 | `phase-2-new-trip` | New trip flow (§C), `Trip.roughMonth` migration, Globe `?added=` arrival |
| 3 | `phase-3-plan` | Plan (§D), Checklists booking-parser tab removed + counts + Reminders restyle, Calendar and Wishlist headers + empty-state copy |
| 4 | `phase-4-share` | Share (§E), `showTravellers` + `sourceShareLinkId` migrations, Settings → Share links "Show who's going" switch, Route copy |

**Out of scope:** Settings redesign, Summary redesign, More tile hues, Print.

---

## A. PageHeader and the trip layout header

- `components/ui/page-header.tsx` per `AUDIT.md` §1, rendering the **`<h1>`**
  straight away (no `as="h2"` interim). Update the "tops out at h2" tests in
  `help/page.test.tsx` / `more/page.test.tsx` and any others that break.
- `TripHeaderFrame` hides the layout's trip header (name h1, dates, currency
  badge, avatars, fork switcher, bell) on every route that renders
  `PageHeader` — same mechanism as Home/Day today. Routes not migrated this
  round (Settings, Summary, Print, Today, Day, Home) keep their current
  behaviour.
- `PageHeader` gains a trailing slot for the **NotificationBell** (as Home and
  Day headers carry it). The layout supplies it so pages don't wire it.
- **Fork switcher** becomes an outline pill in PageHeader actions on Plan and
  Money, shown exactly when the layout shows it today.
- **Member avatars** are dropped from PageHeader pages (Money has Split with
  N; Home/Day keep theirs; Settings lists everyone).
- Delete the title class constants (`CHECKLISTS_TITLE_CLASS`,
  `FILES_TITLE_CLASS`, `COMPARE_TITLE_CLASS`, …) and update their tests.

## B. Money

As `MONEY.md`, using PageHeader for its header, plus:

1. **Per person** = `grandTotal / TripMember count` (owner included; pending
   Invites excluded). Split with N shows for ≥2 members and links to
   `settings#travellers`.
2. **Sidebar Money count** (new, beside Plan/Wishlist): unpaid costs overdue
   or due within 14 days; hidden at 0; not on forks. Same pattern as
   `PlanCount`.
3. **Partial payment** via a **⋯ row menu** at every width (Mark partly paid,
   Edit cost). **No long-press.**
4. **All N costs ›** opens a sheet (mobile) / Dialog (desktop) with the full
   merged list using the same `to-pay-row`; on mobile its footer holds the
   Rates strip.
5. **Row tap** (not the checkbox) opens the cost's owner edit (stay → stay,
   item → item, other → `OtherCostEditor`); where that's awkward for an owner
   type, fall back to the ⋯ menu only.

## C. New trip

As `NEW_TRIP.md`, plus:

1. **Rough month** (CONTEXT.md): add `Trip.roughMonth String?` ("YYYY-MM").
   Never feeds the date engine, Flags or Phase (the trip stays Sketching).
   Cleared whenever a start date is set (any code path that sets
   `startDate`). Shown on the preview, the Trips-page card ("Sometime in
   April" in the countdown's place) and the Home countdown tile. **No "How
   long?" stepper.**
2. **Past mode** step 2 offers **Exact dates only** (no Month mode); keeps
   "Add the dates you went".
3. **Past mode** step 3 "Where did you stop?" is **optional** (Skip).
   `createTrip` accepts optional `stops`, created as **rough** Stops,
   geocoded as `LocationCombobox` does. With stops → `/globe?added=<tripId>`;
   none → trip home.
4. **"Where to first?" card** stops creating the trip directly; it routes to
   `/trips/new?name=…&step=2`. Remove `startFirstTrip` if unused after.
5. **No View Transitions morph** (N13): do the pop-and-lift, redirect,
   countdown-tile drop-in and toast only.
6. Focus shell as a **`(focus)` route group** with its own layout (URLs
   unchanged).
7. First-trip eyebrow uses the display name; without one, "Let's start your
   first trip."
8. **`?fromShare=<token>`** (from §E): step 1 pre-filled with
   "{trip name} (my version)"; after create, `copyRouteFromShare` seeds the
   rough stops.

## D. Plan

As `PLAN.md`, plus:

1. **Add a stop stays reachable while scrolling** (Feedback `cmum87uq…`, shipped
   in `77ff7307`): header gets Chapters · Paste a booking · + Add a stop as
   mocked, **and** the sticky rail's Jump list tile gets a full-width outline
   **+ Add a stop** footer row. Chapters is header-only. The
   `PLAN_ASIDE_ACTIONS_ID` portal can go.
2. **Notes / Files / Reminders**: off the folded row as specced; ⋯ items open
   a Dialog (desktop) / sheet (mobile) hosting the existing `NotesSection`,
   `AttachmentList` and reminders list. **Also** a quiet link row at the foot
   of the open body ("2 files · 3 notes · 1 reminder",
   `text-[13px] text-muted-foreground`, lucide icons), only when any exist,
   each part opening the same Dialog.
3. All five **mobile sheets** in; stop sheet mirrors `?stop=<id>`.
4. **Near-route ranking**: sort geocoder results client-side by distance to
   the route's centroid (no geocoder change).
5. **Drag onto a day slot** only within the same stop's strip (changeover
   days included). Undo toast calls `scheduleItem` with the prior date/times.
6. `#open=…&day=…` hash state coexists with `#stop-<id>`; a `#stop-` link
   wins (opens + rings that stop).
7. Rough stops drag by long-press on mobile (existing dnd-kit).
8. `transport-card.tsx` stays (used by `cost-editor.tsx`); only removed from
   the plan list.
9. **Chapters switch moves to Settings.** Settings gets an always-visible
   "Group this trip into chapters" switch (`setChaptersEnabled`), with the
   Chapters card under it only when on. The Plan header's **Chapters** pill
   shows only when chapters are on (as PLAN.md §1.1) and no longer turns
   them on or off. This is the only Settings change besides §E's share switch.

## E. Share

As `SHARE.md`, plus:

1. **`ShareLink.showTravellers Boolean @default(false)`** — off on every
   existing link (ADR 0051 amendment 2026-09-30). When on: names **and**
   photos on the hero. Journal author avatars show the photo only when on,
   initials otherwise. Email is never selected.
2. **Invite-only door (ADR 0057)**:
   - Top bar pill "Plan your own trip" → the landing page's **Request access**
     panel, with `?ref=share&t=<token-hash-prefix>` (never the raw token).
   - CTA card body: "Teepee keeps the route, the days and the money in one
     place, for everyone who's going. It's invite-only for now — ask for a
     spot." Button: **Request access**.
   - **Use this route**: signed in → `/trips/new?fromShare=<token>`;
     otherwise sign-in with `callbackUrl` carrying `fromShare` (a rejected,
     not-yet-allowed visitor loses it — accepted).
3. **Route copy** (CONTEXT.md): `copyRouteFromShare(token)` goes through the
   normal `shareLink` lookup (a revoked link no longer resolves → refuse),
   copies public-projection stops only as rough, records
   `Trip.sourceShareLinkId String?` (plain string, no FK, so attribution
   survives revocation).
4. Right now's local time: a small client clock ticking each minute rather
   than `revalidate = 300`, unless the page is already statically cached.

## Verification before hand-off

Per phase: unit tests named in each handoff doc, updated page tests, the
`shadow-soft` / `bg-card/40` bans extended to new components, Share privacy
regression tests (no `reference`, `confirmation`, `costMinor`, email in the
HTML). At the end: screenshots at 1440×900 and 390 of every redesigned
screen, Money not scrolling at 1440×900, and the migration list.
