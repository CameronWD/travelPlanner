# Feedback Batch 23 Nov: Route Snapshot and Phone Tidy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close seven Feedback notes from Cam's phone: a Google map snapshot replaces the route sketch as the generated Trip cover, the page behind a sheet stays still, and five phone layouts are tidied, followed by a phone consistency sweep.

**Architecture:** The cover's generated art becomes an `<img>` served by a new member-gated route that proxies Google Static Maps; the page decides which pins go in the URL, so Surprise masking is inherited and the service worker can keep the picture like it keeps a cover photo. Everything else is a contained change to one component each.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before writing route or layout code), React, Tailwind, Radix Dialog, Vitest, Google Static Maps.

**Spec:** `docs/superpowers/specs/2026-11-23-feedback-batch-route-snapshot-and-phone-tidy.md`

## Global Constraints

- No new dependencies. No migration.
- Verification per task: `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Inner loop: `npx vitest run <test file>`. Bare vitest needs `TZ=UTC`. Never run `npm test` or `npm run build` per task.
- Commit with path-scoped `git add <files>`; several agents share this checkout. Never `git stash`, `git restore`, `git reset`, or `git checkout -- <path>`.
- The commit that does a note's work ends with the trailer named in its task (`Resolves-Feedback: <id>`), then `Co-Authored-By`.
- Never call `mcp__teepee__*` tools. Never run `npm run feedback:*`. Never read `.env.production.local`. Never click "Standard Review" or "Deep Review" in a browser.
- Screenshots and browser checks use the demo trip only. The real trip's Frankfurt Stop is a Surprise: never open it.
- Comments only where the why is not obvious. No docstrings.
- Phone means below Tailwind `md`. Tablet and desktop renderings must not change unless a task says so.
- Vocabulary: Stop, Transport, Item, Reminder, Flags, Traveller, route snapshot, passport stamp (CONTEXT.md).

## Review Focus

1. A Stop hidden from the viewer (Surprise) must never reach a snapshot URL: pins come only from the stops the page already passes to the cover. Pinned by Task 1's test and Task 2's "no DB read of stops".
2. The snapshot image fails before React hydrates (offline, 503): the passport stamp must still appear. Task 3.
3. A Trip with more than nine Stops, or pins numbered above 9: no label on those pins, no crash, URL under 8192 characters. Task 1.
4. A sheet opened from a sheet: closing the inner one must not unlock the page while the outer is open, and the page returns to its scroll position when the last one closes. Task 5.
5. A malformed or oversized `p` on the snapshot route returns 400 without calling Google. Task 2.

## Lanes

Tasks in different lanes touch disjoint files and may run at the same time. Within a lane, run in order.

- Lane 1: Task 1 → Task 2 → Task 3
- Lane 2: Task 4 → Task 5
- Lane 3: Task 6
- Lane 4: Task 7
- Lane 5: Task 8
- Lane 6: Task 9
- Last, alone: Task 10

---

### Task 1: Route snapshot model and numbered static-map pins

**Files:**
- Create: `lib/trips/route-snapshot.ts`, `lib/trips/route-snapshot.test.ts`
- Modify: `lib/trips/route-sketch.ts` (`SketchStop` gains `sortOrder: number`; export `allWithin` and `SAME_CITY_KM`), `lib/map/static-map.ts` + its test, `lib/trips/trips-page-loader.ts`, `app/(app)/trips/[tripId]/page.tsx`, `app/share/[token]/page.tsx` (fill `sortOrder` where `SketchStop`s are built), any test fixture that builds a `SketchStop`

**Interfaces:**
- Produces:

```ts
// lib/trips/route-snapshot.ts
export interface RouteSnapshotPin { lat: number; lng: number; sortOrder: number; number: number }
export interface RouteSnapshotModel { pins: RouteSnapshotPin[]; caption: string; chip: string | null }
export type SnapshotShape = "tall" | "square" | "band";
export const SNAPSHOT_SIZE: Record<SnapshotShape, { width: number; height: number }>;
// tall 480x640, square 400x400, band 640x360
export const MAX_SNAPSHOT_PINS = 30;
export function routeSnapshotModel(stops: SketchStop[]): RouteSnapshotModel | null;
export function encodeSnapshotPins(pins: RouteSnapshotPin[]): string;
export function decodeSnapshotPins(raw: string | null): RouteSnapshotPin[] | null;
export function routeSnapshotPath(tripId: string, model: RouteSnapshotModel, shape: SnapshotShape): string;
```

```ts
// lib/map/static-map.ts
export type StaticMapStop = { id: string; lat: number | null; lng: number | null; sortOrder: number; number?: number };
```

- [ ] **Step 1: Write failing tests in `lib/trips/route-snapshot.test.ts`**

  - `routeSnapshotModel` returns `null` for no stops, one stop, and stops all within 5 km (same rule as `sketchModel`).
  - For stops `[Denpasar, Munich, Strasbourg, Frankfurt]` (Denpasar far away): `pins` are the three European stops in order with `number` 2, 3, 4 (position in the input list, 1-based), `caption` is `"Munich → Frankfurt"`, `chip` is `"+ Denpasar"`. Two off-frame stops give `"+ <first> +1"`.
  - Every pin's coordinates come from an input stop (no stop absent from the input appears).
  - `decodeSnapshotPins(encodeSnapshotPins(pins))` equals `pins` with lat/lng rounded to 4 decimal places.
  - `decodeSnapshotPins` returns `null` for: `null`, `""`, a non-numeric field, lat outside ±90, lng outside ±180, a negative or fractional `sortOrder`/`number`, and more than `MAX_SNAPSHOT_PINS` pins.
  - `routeSnapshotPath("t1", model, "band")` is `/api/trips/t1/route-snapshot?shape=band&p=<encodeURIComponent(encoded)>`.

- [ ] **Step 2: Run** `TZ=UTC npx vitest run lib/trips/route-snapshot.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** Encoding: pins joined by `;`, each `lat,lng,sortOrder,number`. `routeSnapshotModel` reuses `pickMainCluster` and the same-city rule from `lib/trips/route-sketch.ts`; chip text follows `sketchModel`'s rule exactly. Leave `sketchModel` and `projectToBox` in place: `lib/share/og.ts` still uses them and is out of scope.

- [ ] **Step 4: Static-map numbering.** In `lib/map/static-map.test.ts` add: a stop with `number: 4` gets `label:4`; `number: 12` gets no label; a stop without `number` keeps today's index label. Then make `staticMapUrl` use `s.number ?? i + 1` and label only when it is 9 or less.

- [ ] **Step 5: Fill `sortOrder`** in the three places `SketchStop`s are built, from the Stop's own `sortOrder`. Fix fixtures until `npx tsc --noEmit` is clean.

- [ ] **Step 6: Verify** with the task-done tier on the changed files. Expected: all pass.

- [ ] **Step 7: Commit** `feat(cover): the route snapshot model, and static-map pins carry the Stop's own number`.

---

### Task 2: The snapshot route, and the service worker keeps it

**Files:**
- Create: `app/api/trips/[tripId]/route-snapshot/route.ts`, `app/api/trips/[tripId]/route-snapshot/route.test.ts`
- Modify: `lib/map/static-map-fetch.ts` + test, `lib/offline.ts` + test, `public/sw.js`, `public/sw.test.ts`

**Interfaces:**
- Consumes: `decodeSnapshotPins`, `SNAPSHOT_SIZE`, `SnapshotShape` (Task 1); `StaticMapStop.number` (Task 1).
- Produces: `GET /api/trips/:tripId/route-snapshot?shape=<tall|square|band>&p=<pins>` returning `image/png`; `fetchStaticMapBytes(input: Omit<StaticMapInput, "key">): Promise<Buffer | null>`.

- [ ] **Step 1: Write failing route tests** (follow the mocking style of the cover route's neighbours):
  - not signed in or not a member: the guards' behaviour, and `fetchStaticMapBytes` is not called;
  - unknown `shape`, or `p` that `decodeSnapshotPins` rejects: 400, `Cache-Control: no-store`, no Google call;
  - `fetchStaticMapBytes` returns `null`: 503, `Cache-Control: no-store`;
  - success: 200, `Content-Type: image/png`, `Cache-Control: private, max-age=31536000, immutable`, and the call carried `home: null`, `showReturn: false`, the shape's width and height, and one stop per pin with its `sortOrder` and `number`;
  - the route never reads Stops from the database.

- [ ] **Step 2: Run** the route test. Expected: FAIL.

- [ ] **Step 3: Implement.** Guards in the cover route's order (`requireUser`, then `requireTripAccess(tripId)`). `mapId` from `staticMapId()`; no map id is a 503. Refactor `fetchStaticMapDataUrl` to sit on a new `fetchStaticMapBytes` (same key, quota take and timeout) so both share one fetch.

- [ ] **Step 4: Offline rules.** `isCoverRoute` in `lib/offline.ts` and its mirror in `public/sw.js` also match `/api/trips/<id>/route-snapshot`, so the snapshot gets the cover's network-first strategy and the `files` store. Tests in both test files: the snapshot URL is a cover route, is network-first, lands in `files`, and two URLs differing only in `p` are different cache keys.

- [ ] **Step 5: Verify** with the task-done tier. Expected: all pass.

- [ ] **Step 6: Commit** `feat(cover): a member-gated route serves the route snapshot, and the phone keeps it for offline`.

---

### Task 3: The cover shows the route snapshot; the sketch is deleted

**Files:**
- Create: `components/trips/cover-route-snapshot.tsx`, `components/trips/cover-route-snapshot.test.tsx`
- Modify: `components/trips/trip-cover.tsx` + test, `app/share/[token]/share-hero.tsx`, `app/api/trips/[tripId]/cover/route.ts` (comment wording only), `docs/maps-overview.md`
- Delete: `components/trips/cover-route-sketch.tsx`, `components/trips/cover-route-sketch.test.tsx`

**Interfaces:**
- Consumes: `routeSnapshotModel`, `routeSnapshotPath`, `SNAPSHOT_SIZE` (Task 1); the route (Task 2); `staticMapUrl`, `mapsConfig`, `staticMapId` (existing).
- Produces:

```ts
// client component
export function CoverRouteSnapshot(props: { src: string; chip: string | null; size: "hero" | "small"; fallback: React.ReactNode }): JSX.Element;
// CoverArt: `sketchSolid` is removed; new optional prop
snapshot?: "api" | "direct"; // default "api"
```

- [ ] **Step 1: Write failing tests.**
  - `CoverRouteSnapshot`: renders an `img` with the given `src` and empty `alt` over a `bg-map-fill` ground; shows the chip text when `chip` is set and `size` is `"hero"`; on the image's `error` event the image is gone and `fallback` is rendered; an image that already failed before mount (`complete` with `naturalWidth` 0) also yields `fallback` (mirror how `cover-photo-image.tsx` handles this).
  - `CoverArt`: with no photo and a drawable trip, the `img` src is `routeSnapshotPath(tripId, model, shape)` where `box` `"band"` maps to `band`, `"1:1"` to `square`, otherwise `tall`; with `snapshot="direct"` the src starts with `https://maps.googleapis.com/maps/api/staticmap` and carries only the main-cluster pins; with `snapshot="direct"` and no maps config, the stamp renders; with too few located Stops the stamp renders and there is no `img`; with a photo, no snapshot `img` is rendered beneath it (the stamp is the layer under a photo, so a photo-covered Trip makes no map request).
  - `TripCover`: the hero polaroid caption is the model's caption.

- [ ] **Step 2: Run** both test files. Expected: FAIL.

- [ ] **Step 3: Implement.** Copy the chip's classes from the sketch before deleting it. The band no longer letterboxes a 3:4 drawing or draws the faint grid: the snapshot fills the band with `object-cover`. Delete the sketch component, its test, and every `sketchSolid` use. `share-hero.tsx` passes `snapshot="direct"`.

- [ ] **Step 4: Docs.** In `docs/maps-overview.md` replace the route sketch description with the route snapshot (served by `/api/trips/<id>/route-snapshot`, pins chosen by the page, stamp as fallback). Reword the cover route's "route sketch/passport stamp" comment.

- [ ] **Step 5: Verify** with the task-done tier, and `grep -rn "CoverRouteSketch\|sketchSolid" app components lib` returns nothing.

- [ ] **Step 6: Commit** `feat(cover): a Trip without a photo shows the route snapshot, and the route sketch is gone`. No trailer here: note `cmwsfnhr5000008jofthb122n` also needs Task 5, which carries it.

---

### Task 4: Feedback panel, Pictures and Send on one row

**Files:**
- Modify: `components/feedback/feedback-pictures.tsx` + test, `components/feedback/feedback-launcher.tsx` + test

**Interfaces:**
- Produces: `FeedbackPicturePicker` gains `trailing?: React.ReactNode`, rendered at the right end of the Pictures button's row.

- [ ] **Step 1: Write failing tests.** In the picker: the thumbnails list comes before the button row in the DOM; `trailing` renders in the same row element as the Pictures button; the offline line stays last. In the launcher: Send is inside the picker's button row; the character-count status element is still always mounted and Send does not move when the count appears (the count sits between Pictures and Send with Send pushed right by `ml-auto`).

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** Row order: Pictures, count, Send. Thumbnails above the row.

- [ ] **Step 4: Verify** with the task-done tier.

- [ ] **Step 5: Commit** `fix(feedback): Pictures and Send share one row`, trailer `Resolves-Feedback: cmwsfnxf3000108jof4iqs2r8`.

---

### Task 5: The page behind a phone sheet stays still

**Files:**
- Create: `components/ui/use-page-scroll-lock.ts`, `components/ui/use-page-scroll-lock.test.ts`
- Modify: `components/ui/sheet.tsx` + test, `components/ui/dialog.tsx` + test, `docs/mobile-pwa-checklist.md` (add the phone check below)

**Interfaces:**
- Produces: `usePageScrollLock(active: boolean): void`.

What is wrong today (Cam's iPhone, iOS Safari, Feedback panel with the keyboard up): the Trip home shows through a strip between the sheet's bottom edge and the keyboard, and the page behind can be dragged. Radix's modal dialog blocks touch scrolling outside the sheet, but iOS still pans the document while the keyboard is open, and the sheet sits at the keyboard's top edge with nothing behind the translucent keyboard but the page.

- [ ] **Step 1: Write failing hook tests.**
  - activating sets `document.body.style.position` to `fixed`, `top` to minus the scroll position, `width` to `100%`, and `overscroll-behavior` to `none` on the root element;
  - deactivating restores the previous inline styles and calls `window.scrollTo(0, <previous position>)`;
  - two active users: releasing one keeps the lock; releasing the last restores (a counter, not a boolean);
  - unmounting while active releases.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement the hook**, and use it from `SheetFrame` and the dialog's phone sheet, active only when the sheet is modal and the viewport is below `md`. The md+ docked Feedback card and desktop dialogs must not lock.

- [ ] **Step 4: Back the keyboard.** While `data-keyboard="open"`, render a card-coloured backing in the same portal that fills from the sheet's bottom edge to the bottom of the layout viewport, under the sheet and above the overlay, so nothing of the page shows between the sheet and the keyboard. The sheet frame clips its overflow, so the backing is a sibling, not a pseudo-element of the frame. Tests in `sheet.test.tsx` and `dialog.test.tsx`: the backing is present only while the keyboard is open, is `aria-hidden`, and is absent for `right`/`left` sheets and the md+ docked card.

- [ ] **Step 5: Look at it.** Run the app locally and, in Playwright WebKit at 402x874 on the demo trip, open the Feedback panel and one Edit Item sheet; confirm the page behind does not move on a drag over the overlay and existing sheet tests still pass. WebKit on a Mac has no on-screen keyboard, so add to `docs/mobile-pwa-checklist.md`: "Keyboard up in a sheet: the page behind does not move, and nothing shows between the sheet and the keyboard."

- [ ] **Step 6: Verify** with the task-done tier.

- [ ] **Step 7: Commit** `fix(sheets): the page behind a phone sheet is locked, and the keyboard has the sheet behind it`, trailers `Resolves-Feedback: cmwsfnhr5000008jofthb122n` and `Resolves-Feedback: cmwsfo6wr000208johd9jfkui`.

---

### Task 6: Phone Day view loses the trip switcher row; the bell moves to the top bar

**Files:**
- Create: `components/trip/day/top-bar-bell.tsx`, `components/trip/day/top-bar-bell.test.tsx`
- Modify: `app/(app)/layout.tsx`, `components/trip/day/day-header.tsx` + test, `components/trip/day/day-slot.tsx`, `components/trip/day/day-chrome-registry.tsx`, `app/(app)/trips/[tripId]/day/page.tsx`, and their tests

**Interfaces:**
- Produces: an element `#top-bar-trip-slot` in the phone top bar, between the Globe link and the account avatar, present only below `md`; `TopBarBell({ tripId, unreadCount, recent })`, a client component that portals a `NotificationBell` into that slot.

- [ ] **Step 1: Write failing tests.**
  - `DayHeader`: the `data-slot="day-trip-switcher"` row carries `max-md:hidden` on every day, whatever the phase; it still renders the pill, Share and the bell for md to lg; the `slimOnPhone` prop no longer exists.
  - `TopBarBell`: with a `#top-bar-trip-slot` in the document it renders the bell inside it; with no slot it renders nothing; unmounting removes the bell.
  - Day page: exactly one `TopBarBell` is rendered for the page, not one per day in the carousel.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** Remove `slimOnPhone` and its plumbing through `day-slot.tsx`, `day-chrome-registry.tsx` and the day page. Mount `TopBarBell` once at the Day page level, outside the carousel's sliding track, so the bell and its badge stay still while days swipe (ADR 0065). Share is not rendered anywhere on the phone Day view. Update the comment above the switcher row in `day-header.tsx` to say the row starts at `md`.

- [ ] **Step 4: Verify** with the task-done tier.

- [ ] **Step 5: Commit** `fix(day): the phone Day view drops the trip switcher row, and its bell sits in the top bar`, trailer `Resolves-Feedback: cmwsfp865000007id5ytcu5bc`.

---

### Task 7: Attachments on day rows sit closer

**Files:**
- Modify: `components/trip/attachment-links.tsx`
- Create or modify: `components/trip/attachment-links.test.tsx`

- [ ] **Step 1: Write the failing test.** With two attachments: the wrapper is a column with no gap (`flex-col`, no `gap-*`); each link has `pointer-coarse:min-h-8` and `w-full`, and has neither `pointer-coarse:min-h-11` nor `pointer-coarse:min-w-11`; with none, nothing renders.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** One link per line, 32 points tall on touch screens, full line wide.

- [ ] **Step 4: Verify** with the task-done tier (this pulls in `timeline` tests through `vitest related`).

- [ ] **Step 5: Commit** `fix(day): attachments on a day row sit one per line, 32 points apart`, trailer `Resolves-Feedback: cmwsfpzmc000107id1m2rwcd7`.

---

### Task 8: Summary uses the app's shared pieces

**Files:**
- Modify: `app/(app)/trips/[tripId]/summary/page.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx`

**Interfaces:**
- Consumes: `StatTile` (`components/trip/home/stat-tile.tsx`); the Stop colour rule in `lib/stop-colours`; the numbered Stop badge and the Transport mode tile the Plan editor and Day view already render (find them in `components/plan/` and `components/trip/timeline.tsx`; if either is not exported, export it from where it lives rather than copying it).

Layout, section order, content and the number font for money and dates do not change.

- [ ] **Step 1: Write failing tests.**
  - The four stat tiles are `StatTile`s (`data-stat-tile` present four times) and the page-local `StatCard` function is gone.
  - The Flags tile contains no `⚠` or `ℹ` characters; with 11 warnings and 26 notes it shows `11` and `26` each beside an `aria-hidden` icon, with screen-reader text `11 warnings, 26 notes`; with no Flags it reads `None`.
  - No `⚠` remains anywhere in the page's output (the missing-rates line uses an icon too).
  - Each Stop card (dated and rough) renders the shared Stop badge with the Stop's number, and a colour band element (`data-stop-band`) whose colour is the Stop's own.
  - A Stop's outgoing Transport row renders the shared mode tile and no longer has the `bg-muted/30` pill ground.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** The colour band is a 6px band across the top of the card, inside its border. Stat tile tones: all `white`.

- [ ] **Step 4: Look at it.** Demo trip, 402x874 and 1440x900, light theme: tiles line up at one height, bands and badges match the Plan editor's colours for the same Stops.

- [ ] **Step 5: Verify** with the task-done tier.

- [ ] **Step 6: Commit** `fix(summary): Stops carry their colour, Transport uses the mode tile, and the tiles are Home's`, trailer `Resolves-Feedback: cmwsfrd36000207idtevik3tk`.

---

### Task 9: Reminders give their text the full width on a phone

**Files:**
- Modify: `components/trip/reminders-card.tsx` + its test

- [ ] **Step 1: Write failing tests** on `ReminderRow` (through the card):
  - each Reminder still has exactly one "Got it" button and one Edit button in the DOM;
  - DOM order within a row: title, then a footer element (`data-reminder-foot`) holding the about chip, the when line, the pencil and Got it, then notes;
  - the title element is no longer in the same flex row as the buttons below `md` (the row is a column below `md` and today's side-by-side row from `md`);
  - a Reminder with no about chip and one with a 200-character unbroken title both render the footer with the buttons right-aligned.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement** with one set of buttons and responsive classes (grid areas or `md:` variants), not two copies. From `md` the row must look as it does today.

- [ ] **Step 4: Look at it.** Demo trip at 402x874, Checklists and Trip home; and at 1440x900 to confirm desktop is unchanged.

- [ ] **Step 5: Verify** with the task-done tier.

- [ ] **Step 6: Commit** `fix(reminders): on a phone a Reminder's text is full width, with its buttons on the date line`, trailer `Resolves-Feedback: cmwsfs69u000307idsn5nc3qy`.

---

### Task 10: Phone consistency sweep

Runs alone, after Tasks 1 to 9 are merged into the branch.

**Files:**
- Create: `docs/audits/2026-11-23-consistency-sweep.md`
- Modify: only files where a looks-only swap to a shared piece is made

- [ ] **Step 1: Screenshot** every trip page of the demo trip plus the Trips list at 402x874, light theme (Home, Plan, a Stop page, Day view, Money and its sub-pages, Checklists, Summary, Reviews, Settings, Files, Help, Wishlist, Trips list). See the memory note on running the nav audit locally for the Playwright and database setup.

- [ ] **Step 2: Check each against five rules:** a Stop shows its own colour wherever it is named with a number or badge; Transport shows the mode tile; icons are the app's, never emoji; stat tiles and cards are `StatTile` / `Card`; the page uses `PageHeader` with the trip name eyebrow and the shared trailing cluster.

- [ ] **Step 3: Fix** each breach that is a swap to a shared piece and changes looks only, one commit per page, with that page's tests updated. Verify each with the task-done tier.

- [ ] **Step 4: List, do not build,** every breach that would change layout, wording or what a page shows. Write `docs/audits/2026-11-23-consistency-sweep.md`: a table of what was fixed (page, rule, commit) and a table "For Cam to decide" (page, what is inconsistent, the recommended change, the other way).

- [ ] **Step 5: Commit** the audit file: `docs(audit): phone consistency sweep, what was fixed and what waits on Cam`.

---

## After the last task

- Whole-branch review on the most capable model, then one fix wave and one re-review.
- Once: `npm test`, `npm run build` (stop the dev server first), `npm run test:integration` when the local database is up.
