# Layout audit — spec

Agreed with Cam on 2026-09-24 (grill session). Goal: every screen on `beta` "looks good" —
no overflows, no wasted space, layouts that hold from a 360px phone to a 2560px widescreen.

## Branch rules

- All work on `feat/layout-audit`, cut from `beta` at `2e26916`. Sub-branches may be cut from it.
- Never commit to, merge into, rebase onto or push `main`. Never merge into `beta` without Cam's
  explicit go-ahead. Never push. Never deploy.
- Never run `npm run feedback:resolve`. Subagents never run `npm run feedback:pull`.
- Don't commit `next dev`'s `CLAUDE.md` block.

## Two stages

**Stage 1 — build and run the audit, then STOP for Cam's triage.**
**Stage 2 — the shell change + the findings Cam marks Fix**, planned and executed through the
normal pipeline once triage is done. Stage 2 gets its own plan; this spec fixes its shell
decision now (ADR 0062) so the audit can grade against it.

---

## Stage 1

### 1. `scripts/layout-audit.ts` — `npm run audit:layout`

Built alongside `scripts/contrast-audit.ts` and following its conventions: Playwright is **not** a
dependency (global install, `NODE_PATH=/usr/local/lib/node_modules`, resolved the same way);
`scripts/types/playwright-shim.d.ts` extended if `tsc --noEmit` needs more surface; dev-login
re-auth via the "Continue as You" button; Leaflet screens wait on `.leaflet-marker-icon` and
record a count (never `networkidle` alone); hidden maps are revealed (wishlist "Map" tab, "Show
day map"). Shared helpers may be extracted from `contrast-audit.ts` into a module both use, as
long as `audit:contrast` still passes unchanged.

**Hard safety rule.** The harness talks to the app **only over HTTP**, to a `next dev` server.
It must refuse to run unless `BASE_URL`'s host is `localhost` / `127.0.0.1`. It must never import
`scripts/load-env.ts`, `lib/db`, Prisma, or anything that reads `DATABASE_URL` —
`load-env.ts` prefers `.env.production.local`, so doing so would point it at production. Any
state it needs (the empty trip) it creates through the local app's own UI.

Output goes to a directory outside the repo (default: `$LAYOUT_AUDIT_OUT`, else
`/tmp/layout-audit/<timestamp>`), never into the repo:

- `shots/<set>/<route-label>/<trip>/<width>-<theme>.png` (overlays: `shots/overlay/<overlay-id>/…`) — full-page screenshots, sliced so no single
  image is taller than ~2000px (`…-part2.png` etc.), so a reviewer can read them.
- `findings.auto.json` — every automatic-check hit (schema below).
- `manifest.json` — every capture: route, trip, phase, width, theme, overlay, file paths, marker
  count, and any capture error. A capture that errors is recorded, never silently dropped, and
  makes the run exit non-zero.

### 2. Coverage

Widths: **360 · 375 · 390 · 430 · 768 · 1024 · 1280 · 1440 · 1920 · 2560** (viewport height 900
for ≥768, 800 below; phones use `isMobile`/`hasTouch` + `deviceScaleFactor: 2` at ≤430).

| Set | Routes | Trip | Widths | Themes |
|---|---|---|---|---|
| Deep | every route in the contrast audit's list (incl. `/share/…`, `/signin`, `/privacy`, `/terms`, not-found, a derived `/day/{date}`) | **EU Christmas 2026** (20 stops, Planning) | all 10 | light |
| Phase | Home, `/today`, `/day/{date}`, `/summary`, `/plan` | Japan someday (Sketching) · Blue Mountains by rail (Final prep) · Great Ocean Road, right now (Travelling) · Spirit of Tassie (Past) | 375 · 768 · 1440 · 2560 | light |
| Empty | every trip route | a fresh trip named `Layout audit — empty`, created via `/trips/new` if absent, reused if present | 375 · 1440 | light |
| Dark | the Deep set | EU Christmas 2026 | 390 · 1440 | dark |
| Print | `/print` | EU Christmas 2026 | `page.emulateMedia({ media: "print" })` at 794 (A4) | light |
| Overlays | see below | EU Christmas 2026 | 360 · 390 · 1440 | light |

Trips are resolved **by name** from `/trips` at run time, not by hard-coded id. **Phase is derived
from today's date**, so the phase trips drift: the harness verifies each trip's phase from a
stable marker on Home (a hidden `<span data-trip-phase>` as the Home page's first child — the one
permitted app change in Stage 1) and, if a phase has no trip, records a coverage gap in the
manifest and prints it loudly rather than auditing the wrong phase.

**Overlays** — open each with realistic content: stop editor, accommodation/transport/booking
editors, cost editor, other-cost editor, itinerary manager, make-it-fit (if reachable), fork
switcher, duplicate trip, promote fork, delete stop confirm, add-from-globe, globe marker form,
globe invite, packing templates, card action cluster menu, command palette, feedback panel,
mobile "More" sheet / tab bar menu (phone widths only), the app-header avatar menu, and the
settings danger-zone confirm. Forms at 360/390 are captured a second time with a focused text
input and the viewport height reduced by 300px (simulated on-screen keyboard) — the check is that
the submit/primary action is still reachable. An overlay the harness can't find a trigger for is
recorded as a coverage gap, not skipped silently.

### 3. Automatic checks (run in-page on every capture)

Each hit → one entry in `findings.auto.json`:
`{ id, check, route, trip, width, theme, overlay?, selector, text?, rect, detail }`.

1. **Page scrolls sideways** — `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`
   (not `innerWidth`: in mobile emulation an overflowing page zooms out and `innerWidth` grows to the
   content width, so an `innerWidth` check can never fire on phones); record the widest offending
   elements.
2. **Spills out of container** — an element whose box extends past its nearest ancestor that
   clips or scrolls-hides (`overflow` not `visible`) or past the viewport, excluding elements
   inside an intentional horizontal scroller (`overflow-x: auto|scroll`) and Leaflet panes.
3. **Clipped text with no way to read it** — text node container with `scrollWidth > clientWidth`
   or `scrollHeight > clientHeight` under `overflow: hidden` / `text-overflow: ellipsis`, and no
   `title`, `aria-label`, or tooltip trigger.
4. **Overlap** — two visible interactive elements (or text blocks) whose rects intersect by > 4px
   in both axes, neither an ancestor of the other, excluding intentional stacks (avatar
   `-space-x-*`, badges on icons, Leaflet).
5. **Small tap target** (widths ≤ 430 only) — visible `a, button, [role=button], input, select,
   [role=tab], [role=menuitem]` under 44×44 CSS px, unless an ancestor link/button already meets
   44×44 (the whole row is the target).
6. **Hidden behind fixed chrome** — the last focusable/text element in `main` is covered by the
   mobile tab bar or bottom safe area when scrolled to the end.
7. **Line too long** — a paragraph/list-item block whose rendered line length exceeds ~80
   characters (measured: block width ÷ average glyph width of its computed font).

A zero-capture or zero-element run is a failure (the contrast audit's "broken probe reports
success" trap). The script exits non-zero if any capture errored; findings themselves don't fail
the run in Stage 1 (see Stage 2 gate).

### 4. Visual review

Reviewer subagents, in batches (one route × all its captures per batch, or ~40 images), read the
screenshots plus that route's `findings.auto.json` hits and grade against this bar:

- wasted space; cramped or uneven spacing between siblings; misaligned edges (header vs content,
  card grids); grids leaving a lone orphan card; headings wrapping to a single orphan word; the
  same component styled differently across screens; awkward breakpoint transitions (compare
  adjacent widths); anything the automatic checks flagged that is real.
- **Kit reference:** where the kit (`design_handoff/playground-2/`) draws the screen, it is the
  reference at 390 and 1280. At every other width, or where the kit is silent, this checklist
  decides. Already-logged phase-3 gaps (`docs/follow-ups/2026-09-24-playground-phase-3-gaps.md`)
  are not findings.
- **Shell rule:** anything whose only cause is the current `max-w-5xl/6xl/7xl` centred shell
  (floating rail, blank margins at ≥1440) is folded into one **Shell** finding — ADR 0062 fixes it
  in Stage 2. Per-page wide-screen issues that the new shell would *not* fix (e.g. a page that
  should become two columns, a card that balloons) are separate findings.
- Grades: **Broken** (unusable, overflowing, hidden, overlapping), **Ugly** (clearly wrong to a
  Traveller at a glance), **Polish** (a designer would fix it).
- Each finding: `{ id, route, widths[], themes[], grade, title, what, where (selector/component
  file if known), screenshot (path + crop rect), suggestedFix }`. Duplicates across widths merge
  into one finding with the width list. Cross-screen issues (a shared component) become one
  finding naming every screen.

Merged result: `findings.json` in the output dir.

### 5. Report

- A **private claude.ai artifact page**: findings grouped by screen, each with a cropped
  screenshot (JPEG, cropped to the finding + margin, embedded as data URIs; total page < 16MB),
  width, theme, grade, what and suggested fix. Filter by grade and screen. Each finding has
  **Fix / Skip / Discuss** (+ optional note) that Cam sets from a phone; choices persist on the
  page and Claude reads them back to build the Stage 2 plan.
- `docs/audits/2026-09-24-layout-audit.md` — image-free text summary (counts by grade and screen,
  one line per finding, coverage gaps), committed on the branch.
- **Then stop and wait for Cam's triage.**

### Stage 1 gates

`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` after every task;
`npm run audit:contrast` still `RESULT: PASS` (Playwright via `NODE_PATH`, dev server running).

---

## Stage 2 (planned after triage)

1. **The shell (ADR 0062):** rail pinned to the left viewport edge, full height, sticky; top bar
   full width (logo above the rail); content grows to **~1600px**, then centres in the space right
   of the rail; pages step to 2–3 columns as width grows; a small set of shared page widths
   replaces per-page `max-w-*`; prose (help, legal, journal text, what's new) keeps a readable
   measure within that. Non-trip pages (trips list, globe, account, help, admin, what's new) use
   the same widths with no rail; the globe map fills the content area.
2. **The findings Cam marks Fix** — writing-plans → subagent-driven-development.
3. **Gates:** per task as Stage 1; at the end `npm run audit:layout` re-run with **no new Broken
   findings** vs. the Stage 1 baseline and every Fix-marked finding re-checked, and
   `npm run audit:contrast` `RESULT: PASS`.

## Out of scope

New features; data-model changes; colour/contrast work (the contrast audit owns it); phase-3 gaps
already logged; a dedicated tablet layout (768/1024 get sound responsive behaviour, nothing more).

## Standing constraints

Server Components stay Server Components; Tailwind v4 token classes only; no new hex outside the
named files (ADR 0060); keep `@source not "../design_handoff";`; 3px focus ring, 44px targets,
`aria-current`, labelled icon buttons; motion via `tp-*` / `motion` with
`ease: [0.2, 0.8, 0.2, 1]` and `useReducedMotion()`.
