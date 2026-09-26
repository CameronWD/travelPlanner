# Beta feedback fixes — 2026-09-26

Branch: `fix/beta-feedback-fixes-2026-09-26` (cut from `beta`). Closes the
"unambiguous fixes" bucket of the 36 beta Feedback notes pulled 2026-09-26.
Design-heavy themes (Trip home desktop layout, plan editor cards, rail
consolidation, Trips list, Money split, reminders, hidden-when-shared tag,
Wishlist questions, landing page, motion library, weather hue, readable URL
slugs) are **deferred** to their own sessions and are not touched here.

Each item names the Feedback note it closes; the commit that does the work
carries `Resolves-Feedback: <id>` (ADR 0040). Nothing is resolved in
production from this branch.

## 1. What's new banner overlaps the trip box — `cmuhtjtvd000904l53q8kdse8`

Trip home renders the banner, the cover card and the phase view as a bare
fragment, and the cover card carries a negative top margin that was written
assuming nothing sits above it. Fix: the banner and the cover no longer
overlap at any width; the trip home stacks them with the same vertical
rhythm the Trips list already uses for the same banner.

## 2. A thing to do can be deleted — `cmuhubk0k000004lclphxproj`

Only Wishlist ideas can be deleted today; the Item edit dialog has Cancel and
Save only. Fix: the Item edit dialog offers **Delete** for any existing
Plan-owned Item (a thing to do or a scheduled Item), using the existing
`deleteItem` action and the same confirm-before-delete pattern the Wishlist
uses. Wishlist ideas keep their existing delete. Unschedule stays as it is;
Delete removes the Item from the Plan (Costs follow ADR 0039 as they already
do for `deleteItem`).

## 3. Date picker defaults to the Stop's first date — `cmuhugzni000904jwpz1ggxhj`

When adding or editing an Item in the plan editor, the date field defaults
to the selected Stop's arrive date; with no Stop, to the Trip's start date;
with neither, it stays empty. Changing the Stop in the dialog re-defaults the
date only while the Traveller has not typed a date themselves. The dialog is
told each Stop's arrive date (the `StopOption` passed in today carries only
id and name).

## 4. Transport sits in the day at its departure time — `cmuhtad17000404l5sab0wtw1`

A Transport is always placed above every timed entry on a day regardless of
its time. Fix: in `orderDayEntries`, a Transport with a departure time slots
among timed entries by that time (a timed Accommodation check-in/out already
does); a Transport with no time keeps the existing top-of-day position. The
day page, the Agenda and the Travelling home all read this order.

The train the note describes cannot be a Transport (a Transport never renders
under "Anytime"); it is most likely an Item with the times in its title. That
is data, not code — Cam converts it or we look at why an Item was easier.

## 5. Day-page entries open their details — `cmuhtdlz7000504l5tcfrj0mp`

On the single day page, clicking a scheduled Item, a Transport, or an
Accommodation check-in/out opens the same edit dialog the plan editor uses,
in place, so the Traveller can read or edit and close without leaving the
day. All three kinds. The Agenda view (which shares the Timeline component)
gets the same behaviour for free where it is editable; the read-only share
page does not.

## 6. The rail highlights Days on a day page — `cmuhsf6jo000104l6b4hlz1if`

`/trips/:id/day/:date` is a day of the Days view, so the rail's **Days**
entry (and the mobile tab bar's) is active there. Active-match rules move
from "path starts with the entry's href" to an explicit per-entry match
list so this is not a special case.

## 7. "Today" leaves the rail — `cmuhs3si2000104l51ck81ibo`

ADR 0010 and the glossary say the Today view **is** the Travelling-phase
Home, not a separate tab; the rail still lists "Today" and its route only
redirects home. Fix: remove the Today entry from the rail and the mobile tab
bar. The `/today` route keeps its redirect so old links still land.

## 8. Agenda centred; no shift when switching views — `cmuhtxbjk000b04l5bgnn6ewb`, `cmuhs558i000004l6k1xdiqz2`

Agenda is left-aligned under the toolbar at `max-w-3xl`; the day page centres
the same width. Fix: Agenda centres (`mx-auto`) like the day page. The Days
toolbar keeps the same structure and height in both views: the Segmented
control stays in the same place and the month title/arrows area is reserved
(rendered inert, not removed) in Agenda, so switching views moves nothing but
the body.

Out of scope: the Agenda→Month flash on first load for a Month user (server
renders Agenda first because the choice is in localStorage). Noted for later.

## 9. Buttons keep their size while loading — `cmuhu1c5i000204jwyokb6p5d`

The shared Button adds a spinner beside the label when `loading`, so every
one of ~57 call sites grows ~24px and shrinks back. Fix in the primitive: the
spinner overlays the label (label kept in flow but invisible) so width and
height never change. The five buttons that also swap their label text while
working (rates panel, attachment list, fork switcher, journal editor) are
made stable too, by keeping the label or reserving the wider width.

## 10. Map pins and lines use the Stop colour — `cmuhunvk1000004jqjpuyf69u`

The home map colours pins and route lines by Chapter (neutral with Chapters
off); the calendar and plan editor colour by Stop (six hues by Stop order,
`lib/stop-colours.ts`). Fix: pins take their Stop's colour, and each route
line takes its destination Stop's colour, regardless of Chapters — one rule
for the map, matching the calendar. `stop-colours` gains a hex accessor for
the map (via the existing `hueHex`). Applies everywhere the map is fed Stop
colours: Planning and Past home, Summary, share page.

## 11. Tab titles name the page and the Trip — `cmuht5itv000004l5948amusj` (title half)

Trip pages all show a bare "Teepee". Fix: page-first titles through the
existing root template (`%s · Teepee`):

- Trip home: `Christmas in Europe 2026 · Teepee`
- Trip subpages: `Days · Christmas in Europe 2026 · Teepee` (Plan, Days,
  Money, Wishlist, Summary, Journal, Checklists, Notes, Help, …)
- Single day: `Thu 10 Dec · Christmas in Europe 2026 · Teepee`
- Non-trip pages keep their existing `Page · Teepee`.

Help drops its repeated "Teepee". The readable-URL half of the note is
**deferred** (slugs touch every link, share links, the offline cache and old-id
redirects); the trailer on this branch names the note as *partially*
addressed in the resolve note, not resolved — Cam decides at resolve time.

## Verification

Each item lands with a test that fails before and passes after where the
behaviour is logic (4, 6, 9, 10, 11 via `generateMetadata`; 3 via the form's
default), and `npx vitest run`, `npx tsc --noEmit`, `npm run lint` stay green.
Items 1, 5, 8 are layout and need a manual pass in the running app.
