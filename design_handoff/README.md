# Handoff: TEEPEE — "Bold Modular" redesign

<!-- ─────────────────────────────────────────────────────────────
     REBUILD PROGRESS — maintained by the build sessions.
     A fresh session should read THIS block first to see where we
     are, then use the (static) design reference below.
     Tick the checkboxes and append to the session log as work lands.
────────────────────────────────────────────────────────────── -->

## 📍 Rebuild progress (live)

- **Last updated:** 2026-07-15
- **Branch:** `feat/bold-modular-rest` (off `main`@`e7f9e7d`) holds Tier 2 **②–⑥ + ⑦a** — 8 commits (`c8d89d9`→`f348850`), all section-reviewed, **NOT merged / NOT pushed**. `main` holds Tier 1 + Tier 2 ① (merged locally, not pushed). Full state detail: `.superpowers/sdd/progress.md` (ledger) + `docs/superpowers/plans/2026-07-14-bold-modular-rest-MASTER.md` (roadmap).
- **Current focus:** ✅ WHOLE PROGRAM COMPLETE **and MERGED to `main` locally** (Cam go-ahead 2026-07-15). `feat/bold-modular-rest` (40 commits `c8d89d9`→`56b3d07`) `--no-ff` merged → **`main` @ `070e843`**. Whole-branch opus review = merge-ready (0 Critical/Important). Full suite **200 files / 2351 tests** green; tsc/eslint clean. **NOT pushed** (merge only, per Cam). **Owed: Cam's local `npm run dev` visual-fidelity pass** (nothing was renderable in-sandbox). Optional deferred tidy: dead `author` prop on JournalEditor; hoist compare-table `forkDotColors`.
- **Approach:** ship in sections, in this README's order (Tier 1 → Tier 2 ①–⑦ → secondary screens).

**Tier 1 — Foundation**
- [x] Display font **Fraunces → Space Grotesk** — done in commit `1dcf719` (spec+quality review clean; visual light/dark pass pending local `npm run dev`)

**Tier 2 — Structure** (README order)
- [x] ① `countdown-hero` → solid coral block — built + reviewed (opus whole-branch: merge-ready); 4 commits (`b65c1bb`→`9a4c642`), **merged to `main` locally** (merge `e7f9e7d`, not pushed); visual pass owed
- [x] ② `phase-planning` → route promoted above next-steps — built on `feat/bold-modular-rest` (`c8d89d9`), not merged
- [x] ③ `budget-glance` → quiet "SPENT SO FAR" strip + thin success bar — built (`f1e73fc`), not merged
- [x] ④ `next-steps-card` → filled square hue chips — built (`255dc5f`), not merged
- [x] ⑤ primitives → `Card` chunkier radius (`rounded-3xl`, global), `Button` pill quick-actions — built (`404120f`), not merged. **← recommended local visual-check point**
- [x] ⑥ maps → CARTO Positron / Dark-Matter tiles (theme-aware, all 4 maps) + ADR 0033 — built (`470551b`), not merged; markers already divIcon (unchanged)
- [x] ⑦ desktop → TripNav underline (**already present**) + **Home** desktop right-rail (`f348850`, ⑦a) + **Summary** rail (`fb774b8`) + **Plan** rail (`a9d73ea`) built (⑦b); **Calendar** rail already shipped (`calendar-views.tsx` month-view `lg:flex-row` + wishlist `<aside>`) — left as-is

**Later — secondary screens** (mocks exist; no per-component recipe) — **full rebuild** (Cam's decision)
- [x] **Wishlist** (`8c63021`→`5cf2b49`) — teal globe-suggestions pill strip, title-only header + inline stop headers, Bold-Modular ItemCards (category pill top-right, full-width coral "Schedule this"), pill VoteControl (amber MUST / teal KEEN)
- [x] **Day detail** (`4e0e442`→`379d610`) — sky→teal gradient weather card, borderless DayNav (44px targets kept), flush timeline (hued left-border timed cards, dashed untimed, emerald/rose accommodation), tighter rhythm
- [x] **Journal** (`a8e3699`→`dda24ea`) — hairline date dividers, chunkier entry cards + avatar/time footers + grid photo galleries; editor card with combined "Saved · n/5000" status
- [x] **Files** (`007e63c`→`88b5d61`) — full dashed dropzone + coloured mime chips (non-compact only; popover `compact` branch untouched), unified grouped list, single upload zone via additive `showUpload` prop
- [x] **Checklists** (`0b949a8`→`4caf77a`) — underline tabs (call-site overrides, `tabs.tsx` untouched), Bold-Modular rows, humanized due badges (Overdue/Due soon), pill add form; AI panels/templates radius aligned
- [x] **Settings** (`8f15945`→`84dd000`) — bold section cards, merged danger zone (Duplicate + destructive-outline Delete), public-share-link **toggle switch** (wired to existing create/revoke, TDD), Bold-Modular traveller rows
- [x] **Compare** (`178c38b`) — visible heading, `rounded-3xl` table + `divide-y` rows + index-coloured header dots + pill Promote + square delta badges (semantic `<table>` + per-stop route rows kept)
- [x] **Activity** (`9eb19db`) — chunkier feed card + avatar/hover/row polish
- [x] **Share/Print** (`1c686d3`) — card radius/shadow aligned; print `@media` block + RouteMap untouched
- [x] **Home Travelling ("Today")** (`3540090`) — bold header, emerald tonight's-stay, amber next-departure (`a36aedc`), `rounded-2xl` cards
- [x] **Home Past ("That's a wrap")** (`2acb8f3`) — dark recap hero (fixed dark, light+dark safe) + inline FINAL SPEND card + coral/outline CTAs
- [x] **Globe** (`43b3f63`→`56b3d07`) — pill search + category filter chips (`categoryAccent` dots), Bold-Modular country rail, desktop map+rail grid (Leaflet map untouched, ⑥)
- [x] ⑦b — Plan / Summary desktop right-rails built (`fb774b8`, `a9d73ea`); Calendar rail was already present

**Session log**
- _2026-07-14_ — Staged the port into sections, added this tracker, agreed Tier 1 scope.
- _2026-07-14_ — **Tier 1 shipped**: display font Fraunces → Space Grotesk (`app/layout.tsx`, `globals.css` fallback→sans + comment, `app/layout.test.tsx` mock). Commit `1dcf719`. tsc/eslint/vitest (2320) green; **merged to `main` locally** (merge `4c4f12e`), section branch deleted, **not pushed**. Visual light/dark + discreet-mode check still owed on local `npm run dev`.
- _2026-07-14_ — **Tier 2 ① built**: `CountdownHero` → coral block, via 3 tasks + 1 a11y fix — additive `describePhase.countdownValue/countdownUnit`, `currencySymbol` helper, the coral-block rebuild + `PhasePlanning` wiring, `role="img"` on the number group. 4 commits on `feat/bold-modular-countdown-hero` (`b65c1bb`→`9a4c642`). All task reviews clean; **opus whole-branch review = merge-ready**. tsc/eslint/vitest (2328) green; order arrays & `globals.css` untouched. **Merged to `main` locally** (merge `e7f9e7d`), branch deleted, **not pushed**. Coral-block visual pass (light/dark, Space Grotesk number, decorative circle) owed on local `npm run dev`.
- _2026-07-14_ — **Tier 2 ②–⑥ + ⑦a built** on `feat/bold-modular-rest` (off `main`, 8 commits `c8d89d9`→`f348850`, **not merged**): ② route promotion · ③ quiet budget strip · ④ severity-hue next-steps chips · ⑤ global primitives (Card `rounded-3xl`, Button pill `shape`, pill QuickActions) · ⑥ theme-aware CARTO map tiles + ADR 0033 · ⑦a Home desktop right-rail. Every section spec+quality reviewed (0 Critical/Important); whole-branch gate @`f348850` green (tsc/eslint clean, full suite 2334). **⏸️ CHECKPOINT — paused** before the ~11 secondary-screen full-rebuilds + Plan/Summary/Calendar rails (⑦b): pure visual-layout, unverifiable in-sandbox (no `next dev`), already carried by the cascade. **Recommend Cam's local `npm run dev` visual pass** (font · coral hero · `rounded-3xl` cards · pill buttons · dark map tiles) before blind-building the rest. Session ended here; nothing merged; awaiting go.
- _2026-07-14_ — **Cam greenlit the full blind-build of the rest.** Running a sequential batch pipeline (research → plan → subagent-driven-dev → section-review) on `feat/bold-modular-rest`. **Batch 1 / ⑦b desktop rails DONE**: Summary budget-summary → `lg` right rail (`fb774b8`); Plan overview → `lg` right rail with `lg:order` mobile-top/desktop-right swap (`a9d73ea`); Calendar left as-is (rail already shipped). Both per-task-reviewed (sonnet) Approved, 0 Critical/Important; section gate green (tsc/eslint + 2334 tests). Next: Batches 2–5 (Wishlist·Day / Journal·Files·Checklists / Settings·Compare·Activity·Share / Home-phases·Globe), then final review + merge-gate STOP.
- _2026-07-14_ — **Batch 2 / Wishlist + Day DONE** (10 commits `8c63021`→`379d610`). Shared `categoryAccent` helper (hued dot/left-border classes) + 9 presentational component rebuilds. Per-task reviews: ItemCard & Timeline via reviewer subagent (Timeline had 1 Important — untimed day-row address dropped — fixed in `9099bdf` + regression test), the rest controller first-hand; all Approved. Section gate green: tsc/eslint clean, full suite **2341** (was 2334; +7 regression assertions). All behaviour/props/aria/`data-testid`/maps preserved. Not merged. Next: Batch 3 (Journal · Files · Checklists).
- _2026-07-14_ — **Batch 3 / Journal + Files + Checklists DONE** (8 commits `a8e3699`→`4caf77a`). Highlights: shared-component risk isolated (AttachmentList changes guarded behind `!compact` so 5 popover surfaces stay byte-identical; underline tabs via call-site overrides, `tabs.tsx` untouched); added additive `showUpload` prop so the Files page has one dropzone not many; humanized checklist due badges with UTC-consistent date parse. Per-task reviews: AttachmentList & Checklist via reviewer subagent, rest controller first-hand; one fidelity fix (Files multi-dropzone → `showUpload`). Section gate green: tsc/eslint clean, full suite **2344** (a transient `driving-estimates-panel` flake was verified — passes in isolation, clean on re-run). Not merged. Next: Batch 4 (Settings · Compare · Activity · Share/Print).
- _2026-07-15_ — **Batch 4 / Settings + Compare + Activity + Share/Print DONE** (6 commits `8f15945`→`1c686d3`). Settings: section-card restructure + merged danger zone + new public-share-link toggle switch (TDD, reviewer-approved, wired to existing create/revoke — no new action) + traveller rows. Compare: table reskin keeping the semantic `<table>` + per-stop route rows (reviewer-approved). Activity + Share/Print: idiom polish. **Deliberate skips:** shared `Input`/`Field`/`Card`/`tabs` primitive edits (app-wide cascade risk), print `@media` block + shadows, share not-found. Section gate green: tsc/eslint clean, full suite **2348**. Not merged. Next: Batch 5 (Home Travelling/Past phases · Globe), then final review + merge-gate STOP.
- _2026-07-15_ — **Batch 5 / Home Travelling+Past phases + Globe DONE** (6 commits `a36aedc`→`56b3d07`): amber next-departure countdown, emerald tonight's-stay, dark "That's a wrap" recap (fixed-dark, light+dark safe) + inline FINAL SPEND, Globe pill-search + category chips + country rail + desktop map/rail grid (Leaflet untouched). Reviewer-approved (2 via subagent + fixes: past-label `hasActual`, globe map double-box). **THEN: whole-program final review (opus, whole branch, 40 commits) = MERGE-READY** — 0 Critical/Important, zero behaviour/aria/testid regressions, all Minors safe-to-defer. Suite **2351** green, tsc/eslint clean. **⏸️ STOPPED at merge gate — feat/bold-modular-rest is NOT merged/pushed; awaiting Cam's explicit merge go-ahead.** Optional deferred tidy: dead `author` prop on JournalEditor; hoist compare-table `forkDotColors`.

---

## Overview
A full visual + structural redesign of **TEEPEE**, the collaborative trip-planning PWA. The
direction is **"Bold Modular"**: a grotesk display face, a solid coral countdown block, chunky
modular tiles, category-coloured chips, a quiet budget treatment, and an active-bubble mobile
tab bar / underline desktop nav. It covers every primary surface in mobile **and** desktop,
plus the Globe, Compare, the modal set, real Leaflet maps (incl. the missing dark tile style),
and a dark-mode sample.

This redesign was built against the real repository **`CameronWD/travelPlanner`** (Next.js +
Tailwind v4, token-driven). Tokens, category colours, and the app shell in the mocks were
matched to that codebase to keep the port mechanical.

## About the design files
The `.dc.html` files in this bundle are **design references** — HTML/CSS prototypes showing the
intended look, layout, and behaviour. They are **not** production code to paste in. The task is
to **recreate these designs inside the existing `travelPlanner` codebase** using its established
patterns: CSS custom properties in `app/globals.css`, the `@theme inline` Tailwind v4 mapping,
`class-variance-authority` variants, `cn()`, `lucide-react` icons, and the ~20 UI primitives that
~140 feature components consume. Because the app is heavily token-driven, most of the reskin is a
few token/font edits that cascade automatically; the rest is a focused set of component rebuilds.

## Fidelity
**High-fidelity.** Final colours, typography, spacing, radii, and layouts. Recreate pixel-close
using the codebase's primitives — do not hand-roll new CSS where a token/utility exists.

---

## Two-tier plan (do Tier 1 first)

### Tier 1 — Foundation (mechanical, cascades to ~140 components)
1. **Display font swap only.** Every colour/spacing/radius/shadow token already matches the mocks —
   leave `globals.css` token *values* unchanged. Change the display face from **Fraunces** to
   **Space Grotesk**:
   - Add it via `next/font` in `app/layout.tsx` (mirror how Fraunces is wired to
     `--font-display-google`).
   - `@theme inline` already maps `--font-display: var(--font-display-google), …` — so `h1`–`h4`,
     `.text-display`, and every card heading pick it up automatically.
   - Body/UI stays **Plus Jakarta Sans** (`--font-sans`).
2. No other Tier-1 changes are required. (Optional: nothing.)

### Tier 2 — Structure (real rebuilds, in order)
1. `components/trip/home/countdown-hero.tsx` → a **solid coral block** (`bg-primary text-primary-foreground`,
   `rounded-2xl`, big Space Grotesk number). Replaces the current bordered `bg-card` card.
2. `components/trip/home/phase-planning.tsx` → reorder the `order` array to
   `[hero, route, nextSteps, money, actions]` (route promoted above next-steps).
3. `components/trip/home/budget-glance.tsx` → the **quiet strip**: label "SPENT SO FAR" + thin
   success bar + `¥184k / ¥312k est`. Keep it estimated-vs-spent (there is **no** budget-cap concept
   in the data model — do not introduce "of ¥X budget / under budget").
4. `components/trip/home/next-steps-card.tsx` → category-square icon chips (rounded-xl, filled hue)
   instead of the bare warning/info glyph; keep the warning/info severity mapping.
5. Primitive tweaks (cascade widely): `Card` chunkier radius, `Button` pill quick-actions,
   `Badge`/`CategoryPill` unchanged palette. Mostly Tailwind class edits.
6. **Maps** — add the tile layers + marker HTML to your dynamic `createMapLoader` factory
   (see "Maps" below). This closes the brief's dark-tile gap.
7. **Desktop** — the shell already exists (`app/(app)/layout.tsx` sticky `h-14` bar, `max-w-5xl`).
   Add the Bold-Modular TripNav underline + the right-rail dashboards per the D-series mocks.

Work **one component at a time**, verifying against the matching mock, so the test suite and the
discreet-mode token contract stay intact.

---

## Design tokens (from `app/globals.css` — already correct, listed for reference)

HSL channel triplets (light / dark). Consumed via `hsl(var(--token))`.

| Token | Light | Dark |
|---|---|---|
| `--background` | `36 40% 97%` | `24 14% 9%` |
| `--foreground` | `24 14% 15%` | `36 30% 92%` |
| `--card` | `0 0% 100%` | `24 12% 13%` |
| `--muted` / `-foreground` | `32 26% 93%` / `28 8% 42%` | `24 10% 18%` / `30 10% 64%` |
| `--border` / `--input` | `30 20% 87%` | `24 10% 22%` |
| `--primary` (coral) | `12 84% 60%` | `12 84% 63%` |
| `--accent` (teal) | `174 60% 38%` | `174 52% 46%` |
| `--success` | `152 52% 40%` | `152 48% 50%` |
| `--warning` | `35 92% 52%` | `35 90% 60%` |
| `--over` (over-spend) | `350 78% 50%` | `350 80% 62%` |
| `--radius` | `1rem` | — |

**Category hues** (Tailwind named palette; map hex): Sightseeing `sky #0ea5e9` · Food `amber #f59e0b`
· Activity `emerald #10b981` · Nightlife `violet #8b5cf6` · Shopping `rose #f43f5e` · Other `stone #78716c`.
Pills: `bg-{hue}-100 text-{hue}-700 border-{hue}-200` (light) / `-950 / -300 / -800` (dark) — unchanged.

**Type:** display **Space Grotesk** (600/700) → `--font-display`; body **Plus Jakarta Sans** →
`--font-sans`, `line-height:1.6`. Heading scale unchanged from `globals.css`.

**Shape/elevation:** cards `rounded-2xl`; controls `rounded-md`; pills `rounded-full`.
`--shadow-soft` / `--shadow-soft-lg` unchanged (warm-tinted light, deep black dark).

---

## Screens / views

Each file below groups screens; open the file to see exact spacing. Copy in this document is the
exact copy used in the mocks (placeholder trip = "Kansai in Bloom", Kyoto·Osaka·Nara, Apr 3–14 2026, JPY).

### Mobile core — `TEEPEE - Bold Modular App.dc.html`
- **Trips** (`/trips`): app top bar (tent wordmark, ⌘K, Globe, avatar), "Your trips" + New pill,
  1-col cover cards (phase badge top-left, unread badge top-right coral, stop-count, monogram fallback).
- **Trip Home / Planning** (`/trips/[id]`): coral countdown block (26 DAYS TO GO + date/nights/stops
  pills) → full-width Route tile (3 stops + dashed) → Next steps card (3 rows, square hue chips) →
  quiet Budget strip → pill quick-actions (Add place / Add cost / Wishlist) → tab bar (Home active bubble).
- **Plan editor** (`/plan`): fork-switcher pill, Home-base bookend, chapter chip header, StopCards
  (colour left-border, things-to-do, drag dots), AccommodationCard (emerald), dashed TransportCard seam.
- **Calendar** (`/calendar`): Month/Agenda segmented, month grid (stop-coloured left borders, packed-day
  "Full" tag, item dots, transport/flight glyphs), wishlist rail (draggable pills).
- **Budget** (`/budget`): estimated-total hero (bar = spent/estimated, "59% paid" chip), Paid/To-pay/Per-day
  tiles, By-category rows (hue dot + bar), stale-rate warning.
- **Wishlist** (`/wishlist`): Globe-suggestions strip, grouped by stop, ItemCard with VoteControl
  (Must/Keen/Meh segmented + partner chip), Schedule button.
- **Day** (`/day/[date]`): Day N-of-M, weather/daylight gradient card, timeline (accommodation emerald,
  timed items time-gutter + hue pill, untimed dashed).
- **Globe** (`/globe`): stylised map + pins + popup, search + category filter chips, country-grouped list.

### Mobile — the rest — `TEEPEE - Bold Modular More.dc.html`
- **Home / Travelling ("Today")**: "Today · Day 7 · [chapter chip]", Where-you-are, Next-departure
  (amber countdown), Today's plan timeline, Tonight's stay.
- **Home / Past**: dark "That's a wrap" recap (stops/nights/spent), final-spend retro, route, CTAs.
- **Journal**: autosaving editor (char count /5000), date sections, entry card + photo grid + author/relative time.
- **Files**: dashed upload, grouped by entity (Trip/Accommodation/Journal), colour-coded mime icons, size, open/delete.
- **Checklists**: Pre-trip/Packing/Booking-parser tabs, progress bar, checkbox rows, due badges
  (overdue rose / soon amber), assignee avatar, inline add.
- **Settings**: Trip details, Travellers/invite, Public share-link toggle + copy, Danger zone (duplicate/delete).

### Desktop & overlays — `TEEPEE - Bold Modular Desktop.dc.html`
- **D1–D6**: Trips, Home, Plan, Calendar, Budget, Summary at desktop — sticky top bar, `max-w-5xl`
  content, TripNav underline tabs (Home·Plan·Calendar·Budget·Summary + More), right rail where the
  phone stacks (Home budget+quick-actions; Plan overview; Calendar wishlist; Summary cost-summary).
- **D7 Globe**: big map + filters + country-grouped rail (the full feature).
- **D8 Compare**: real-plan-vs-forks table, route diffs (green +add / rose −drop), delta badges, Promote.
- **D9 Modals**: ⌘K command palette (Do/Go-to groups), Stop FormDialog (Rough↔Scheduled segmented),
  Item FormDialog (category pills, cost fields), destructive ConfirmDialog.
- **D10**: dark-mode Trip Home (dark token set) + rebuild-notes panel.

### Desktop — the rest — `TEEPEE - Bold Modular Desktop 2.dc.html`
- **E1–E6**: Travelling, Past, Journal, Files (grouped table), Checklists, Settings (`max-w-2xl` cards).

### Real maps — `TEEPEE - Leaflet Maps.dc.html`
Live Leaflet. **Lift the tile URLs + marker/logic straight into `createMapLoader`.**

---

## Maps (closes the brief's dark-tile gap)

Tile layers (Leaflet, `subdomains: "abcd"`, attribution `© OpenStreetMap © CARTO`):
- **Light:** `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` (CARTO Positron)
- **Dark:** `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` (CARTO Dark Matter)

Markers are hand-built `L.divIcon` (matches the repo's existing approach): a 22–28px circle,
category hex fill, 3px white border, soft shadow, optional numeral/"H" label. Route/day routes are
dashed `L.polyline` (chapter colour, `dashArray:"8 8"`). Preserve `.leaflet-container{isolation:isolate}`
so maps stay below the z-50 dialog layer. Surfaces needing maps: Globe, Route (Summary/Home), Day, Wishlist.
Full working source (marker factory, popup markup, fitBounds, invalidateSize) is in the Leaflet file's
logic class — copy it.

---

## Interactions & behaviour
- **Nav:** mobile fixed bottom tab bar (Home/Plan/Calendar/Budget/More; active = coral bubble);
  desktop horizontal TripNav with primary underline + a More dropdown (Wishlist/Journal/Checklists/Files/Activity/Settings).
- **Forms:** `FormDialog` remounts on `recordId`; `Field` routes errors (`aria-invalid`); submit disabled while pending.
- **Destructive:** ConfirmDialog + `UndoToast` ("… deleted · Undo").
- **Calendar:** drag wishlist pill → drop on a day → `ScheduleItemDialog`.
- **Motion:** subtle, gated by `prefers-reduced-motion` (keep the existing `tp-*` keyframes/utilities).
- **Focus:** visible ring via `--ring`; keep WCAG AA.

## State management
No new global state — reuse the existing server actions / `useEntityForm` / `ActionResult` flow and
the derived trip **phase** (Sketching→Planning→Final-prep→Travelling→Past) that already drives which
Home dashboard renders. `?plan=<forkId>` still selects the active plan.

## Out of scope (parked, by request)
- **Discreet "workspace" reskin** — not redesigned. Keep every component **token-driven** (no hard-coded
  colours) so `.discreet` token remap keeps working when you re-enable it.

## Semantic rules to preserve
- Money right-aligned `tabular-nums`; under-budget = `success`, over-spend = `--over` (not `destructive`),
  caution = `warning`.
- Budget = estimated vs actual **spend** roll-up; there is **no** user-set budget target.
- Light **and** dark must both be designed (dark tokens already exist).

## Files in this bundle
- `TEEPEE - Overview.dc.html` — index of everything (open this first).
- `TEEPEE - Bold Modular App.dc.html` — mobile core (8 screens).
- `TEEPEE - Bold Modular More.dc.html` — mobile rest (6 screens).
- `TEEPEE - Bold Modular Desktop.dc.html` — desktop D1–D10 + modals + dark.
- `TEEPEE - Bold Modular Desktop 2.dc.html` — desktop E1–E6.
- `TEEPEE - Leaflet Maps.dc.html` — live Leaflet + CARTO tiles (copy the map code).
- `Trip Home - Directions.dc.html` — the original 3 explorations (Warm Refined / Editorial Calm / Bold Modular).
- `support.js`, `image-slot.js` — runtime deps so the HTML files render locally.

> The `.dc.html` files render best inside the design project. Opened standalone they need
> `support.js` (included) and a network connection for fonts + Leaflet CDN.
