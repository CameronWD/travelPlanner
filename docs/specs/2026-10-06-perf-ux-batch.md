# Spec — Performance and UX batch (2026-10-06)

**Status:** agreed with Cam 2026-10-06; not yet built.
**Branch:** `chore/codebase-audit-2026-10-06`. Target `main`.
**Source:** `docs/audits/2026-10-06-perf-ux-library-sweep.md` (Tier 1 + Tier 2 + chosen library items). Companion spec on the same branch: `docs/specs/2026-10-06-typeahead-photon.md` (built in the same plan).
Terminology follows `CONTEXT.md` (no changes). New ADRs: **0069** (Photon), **0070** (stay on the Auth.js beta; Better Auth next).

**Decided out of scope:** loading skeletons under the trip (ADR 0063 forbids them; the audit's P25 is withdrawn); a pool-size change (`lib/db.ts`) unless measured after §B; Cache Components (NAV-01); every Tier 3 bigger bet; maplibre, vaul, sonner, cmdk, nuqs, Temporal.

**Ground rules for every part.** No behaviour change unless the part says so. Each part keeps `npx vitest run`, `npx tsc --noEmit` and `npm run lint` green. Tests follow the existing pattern (unit with `vi.mock("@/lib/db")`; integration where a part says so).

---

## A · The offline warmer warms once per few hours

- `lib/offline-status.ts` gains `warmedAt: number | null` per Trip, persisted in `localStorage` (try/catch, degrade to in-memory).
- `components/offline-warmer.tsx`: skip the **page** paths when `warmedAt` is within 6 hours, unless the run was triggered by "Save again" (`requestId` changed). Attachments and cover keep their existing already-cached check. Skip the whole run when `navigator.connection?.saveData` is true or `effectiveType` is `slow-2g`/`2g`.
- Day pages: warm only days within 7 days either side of today when the Trip is Travelling; all days (capped at 60) otherwise. Pure helper in `lib/offline.ts` with a `today` argument; unit-tested.
- Settings "Saved for offline" row shows "Saved {relative time}" from `warmedAt`.

## B · The Day page reads the Trip once

- `lib/day-view-loader.ts`: split `getDay` into a `cache()`d `loadDayTripData(tripId, scope)` holding every trip-wide read (stops, dated items, transports, wishlist, attachments, costs, chapters, groupBy) and a pure `projectDay(data, date)` for the per-date view. `getDay(tripId, date)` becomes `projectDay(await loadDayTripData(...), date)`.
- `loadDayTitles` and the things-to-do query join the parallel batch, selected by `stop: { tripId }`.
- `app/(app)/trips/[tripId]/day/[date]/page.tsx` keeps its three calls; they now share one set of reads. Tests: the three-neighbour page issues each trip-wide query once.

## C · Pages query in parallel

Collapse serial awaits into at most two waves (gate, then one `Promise.all`), with no change to what is selected:

- `app/(app)/trips/[tripId]/plan/page.tsx` — attachments, notes, item costs (select by `ownerType: "ITEM"` + plan scope), day titles (by `stop: { tripId, …scope }`), reminders, slug join the main batch.
- `app/(app)/trips/[tripId]/page.tsx` — trip, cover stops, my trips, reminders in one batch; the membership read becomes a `cache()`d helper (`lib/trip-shell-reads.ts` or a new `lib/membership-reads.ts`) shared with `app/(app)/layout.tsx`.
- `app/(app)/layout.tsx` — user read and `reconcilePendingInvites` (which runs its two queries in parallel) start together; admin count runs beside memberships.
- `app/(app)/trips/[tripId]/layout.tsx` — `slug` joins `TRIP_SHELL_SELECT`; the attachment warm list selects `{ url, size, createdAt }` newest-first with `take: 200`.
- Checklists, Wishlist, Summary pages and `lib/travelling-home-loader.ts`, `lib/desktop-home-loader.ts`, `lib/next-steps-loader.ts`, `lib/trips/trips-page-loader.ts` — same treatment; the projection becomes a pure `computeProjection({ trip, stops, transports })` over rows already loaded; the duplicate stop reads collapse to one.
- `app/api/fx/route.ts` — `resolveRateForTrip` returns `source`; the second read goes.
- Tests: for each loader, a query-count assertion on the mocked db (one `findMany` per model).

## D · One tree per breakpoint; maps mount when visible

- New `components/ui/use-media-query.ts` on `useSyncExternalStore` (server snapshot: `null`).
- `createMapLoader` (`components/ui/map-loader.tsx`) accepts `mountWhen?: boolean`; every map (`day-map`, `route-map`, `wishlist-map`, `globe-map`, `travel-map`, `RouteMapTile`, `DayMapPanel tile`) passes the breakpoint it is shown at. A hidden map renders its placeholder and never imports Leaflet.
- `components/trip/itinerary-manager.tsx`: after hydration render only the mobile **or** desktop Stop list (one `DndContext`). Server render keeps today's both-trees markup so there is no hydration mismatch; the unused tree unmounts on the first client render. `stops.indexOf` per row becomes an index parameter.
- Trip Home (`page.tsx:234/336/408`) keeps both trees (they share `cache()`d data) but the maps inside obey `mountWhen`.

## E · No silent failures

- Every call site below routes through `useServerAction` / `useDeleteWithConfirm`, or adds the `toastRejected()` + `firstErrorMessage` branch from `delete-stop-dialog.tsx:48-56`: `item-form-dialog.tsx:624`, `itinerary-manager.tsx:998,1058,1202`, `cost-editor.tsx:398` (also gains a `catch`), `wishlist-board.tsx:142`, `globe/globe-view.tsx:82`, `attachment-list.tsx:208`, `reminders-card.tsx:219`, `money/to-pay-panel.tsx:116`, `settings/calendar-feed-panel.tsx:90-96`, `settings/share-links-panel.tsx:182`.
- The dialog stays open and usable on failure; the toast carries the action's `failureMessage` (offline wording included).
- Tests: each site has a "shows a toast and keeps the form on `success:false`" case.

## F · Add shortcuts open the form; Flags land on their Stop

- `/plan?add=stop` from `home/quick-actions.tsx`, `phase-sketching.tsx`, `command-palette-results.tsx` "Add Stop".
- New handlers: `/budget?add=cost` opens `OtherCostFormDialog`; `/wishlist?add=item` opens the Item form. Search "Add Item" and Quick action "Add a cost" use them.
- `lib/next-steps.ts` `flagHref`: STOP / TRANSPORT / ACCOMMODATION Flags emit `/plan?stop=<targetId>` (editor already handles `?stop=`); "Add outbound flight" / "Book transport" nudges emit `/plan?add=transport&from=<stopId>&to=<stopId>` using `addTransportDefaults`.
- The `?add=`/`?stop=` params are stripped from the URL after opening (`router.replace`), as the existing `?add=stop` handler does.

## G · Summary departure dates in the leg's timezone

- `summary/page.tsx:661` uses `transportTimeDisplay` (`lib/time-display.ts`). Test: a 06:00 Sydney departure renders its own calendar day.

## H · Covers at the size they are shown

- Upload (`lib/image-compress.ts` + cover upload action): produce a second ~480w WebP ("small") beside the 2048 one; store under `<key>-sm`. Existing covers without a small copy fall back to the large one (no backfill script in this batch; add one to follow-ups).
- `app/api/trips/[tripId]/cover/route.ts`: `?w=` ≤ 600 serves the small key when present. Redirect response gets `Cache-Control: private, max-age=240` (presign expiry 300s). Same header on `lib/attachment-serve.ts` and `lib/avatar-serve.ts`.
- `components/trips/cover-photo-image.tsx`: loader appends `&w=`; `sizes` now does something. Drop the `opacity-0` until load for images already cached (`img.complete`).
- `cover-photo.tsx` blurred backdrop uses the small copy.

## I · React Compiler

- `next.config.ts`: `reactCompiler: true`; add `babel-plugin-react-compiler` and `eslint-plugin-react-hooks` compiler rules. Fix every lint finding the rules raise (expected: a handful in `itinerary-manager.tsx`). Whole-app mode; if any component misbehaves in tests, mark it `"use no memo"` and list it in the commit.
- `itinerary-manager.tsx`: during drag, `handleDragOver` updates `localStops` only when the target container changes.

## J · No double render after an action

- Remove `router.refresh()` at the 19 call sites whose action already calls `revalidatePath` for the current page. **First** verify that the action's `revalidatePath` matches the slug URL (ADR 0064): where it revalidates `/trips/<id>` but the page is `/trips/<slug>`, fix the action to revalidate the slug path (helper `tripPath`). Sites whose action does not revalidate keep their refresh.
- Tests: an action-revalidates-slug assertion per touched action.

## K · A spend while Travelling is three taps

- The Other-cost form's defaults depend on the Trip's **Phase**: Travelling → currency of today's Stop (`lib/currency-for-country.ts`; Home currency if today has no Stop or no country), **Settlement** On the trip, and paid: `paidMinor = costMinor`, `paidAt = now`. Every other Phase keeps today's defaults (Home currency, Before you go, unpaid). Every default stays editable in the form. With §F the quick action opens the form directly.
- The §A glossary amendment for **Saved for offline** is applied to CONTEXT.md on this branch.

## L · Editing a Stop is as good as adding one

- `stop-form-dialog.tsx` uses `PlaceCombobox` for the place; a pick sets name, country, coordinates and (via the existing timezone-for-coordinates path) the timezone. Typing without picking keeps today's behaviour: the save re-geocodes name + country best-effort (`server/actions/stops.ts:369,427`). Mode labels unify on the add sheet's "Exact dates / Roughly".

## M · Dirty forms ask before closing

- `components/ui/form-dialog.tsx` (or wherever `FormDialog` lives) accepts `isDirty`; when true, `onInteractOutside` and `onEscapeKeyDown` open an inline "Discard changes?" confirm instead of closing. Item, Transport, Accommodation, Stop and Chapter dialogs pass a dirty flag from their form state (the new-trip flow's `isDirty` is the model).

## N · Nights inline

- Desktop Stop header and the phone stop sheet meta line get a −/+ `Stepper` bound to `setStopNights` (rough: writes nights; scheduled: moves depart and ripples, as today), with the existing ripple result and Undo toast via `applyReorderResult`. Min 0 nights. A **Pinned** Stop is not disabled: the Traveller changing its own nights is their choice; only ripple never moves a pin (CONTEXT.md **Pinned**).

## O · Share from the header

- A "Share" action in the Trip header overflow and in Search's Do group opens a small chooser listing the Trip's existing **Share links** by label, plus "New Share link…" which goes to Settings. Picking a link hands its URL to `navigator.share` on phones, else copies it with the existing toast. Nothing is created implicitly; a Share link is always made for one audience in Settings (CONTEXT.md **Share link**). With no links the chooser shows only the "New Share link…" row.

## P · Lazy dialogs on the Plan

- The ten dialogs imported at `itinerary-manager.tsx:16-47` load via `next/dynamic(() => import(...), { ssr: false })`. Behaviour unchanged; a test asserts none of their modules are in the initial import graph (import the manager with the dialogs mocked).

## Q · LazyMotion

- `components/ui/motion-provider.tsx` wraps in `<LazyMotion features={domAnimation} strict>`; every `motion.*` becomes `m.*` (33 files). Components needing layout animation import `domMax` locally. `strict` makes any missed `motion.*` throw in dev.

## R · Zod stays on the server

- `lib/enum-values.ts` holds the plain arrays and `isOnTrip`; `lib/enums.ts` re-exports them and keeps the schemas. Client files import from `enum-values`. `lib/validations/*` imported by client components (`add-reminder-dialog.tsx`, `accommodation-row.tsx`) move to `zod/mini` or a plain check.

## S · Images

- `loading="lazy" decoding="async"` and width/height on `journal-entry-view.tsx:61`, `todays-journal.tsx:58`, `journal-editor.tsx:125,469`, `item-photo-thumb.tsx:79`, `share/[token]/journal-polaroids.tsx:174`. Above-the-fold hero/first card keep eager.

## T · Service-worker cache bounds

- `public/sw.js` (and `lib/offline.ts`, source of truth): never cache requests carrying `RSC` or `Next-Router-Prefetch` headers; three stores (`static`, `pages`, `files`) with per-store entry caps (static 300, pages 400, files unbounded within ADR 0043's byte cap); static store keyed by Next build id (`NEXT_PUBLIC_BUILD_ID` injected at build), so old chunks go on the next activate.
- Unit tests in `lib/offline.test.ts` for the classification; the SW keeps mirroring it.

## U · External fetches cached across instances

- `lib/geocode.ts` Nominatim and Photon fetches: `next: { revalidate: 60*60*24*30 }`. `lib/fx.ts` Frankfurter: `next: { revalidate: 60*60*12 }`. The in-memory maps stay as a first level. Not `use cache` (needs `cacheComponents`).

## V · Indexes

- One additive migration: `Stop`, `Transport`, `Item` `@@index([tripId, forkId, sortOrder])`; `Reminder` `@@index([tripId, date])`; `AccessRequest` `@@index([resolvedAt])`. Written on the branch; Cam applies it to production before deploy (`docs/open-follow-ups.md` migration state gains the entry).

## W · Optimistic updates

- `useOptimistic` on `vote-control.tsx`, checklist ticks (`checklist.tsx`) and the calendar drag (`calendar-views.tsx:163`), reverting with the existing failure toast on `success:false` (§E pattern).

## X · Libraries and platform

- `server-only` installed and imported first in `lib/db.ts`, `lib/storage.ts`, `lib/auth.ts`, `lib/ai.ts`, `lib/push.ts`, `lib/mail.ts`.
- `@vercel/speed-insights` mounted beside `VercelAnalytics` in `app/layout.tsx`; `/privacy` "Analytics" section gains a sentence naming Speed Insights (page-timing only, no Trip content); its test updated.
- `typedRoutes: true` in `next.config.ts`; fix every href it rejects.
- `lib/tz.ts` `TIMEZONES` comes from `Intl.supportedValuesOf("timeZone")` with the hard-coded list as fallback.
- `@aws-sdk/client-s3` pinned to the presigner's exact version; `lib/storage.ts` S3 driver lazy-imports the SDK inside its methods (pattern: `lib/ai.ts:53`).
- `knip` run once as a dev dependency; dead exports it finds are removed in a separate commit (reviewable); false positives configured in `knip.json`.
- Playwright as a real devDependency with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` documented; `scripts/types/playwright-shim.d.ts` deleted; `scripts/lib/audit-browser.ts` imports the package. No new E2E tests in this batch.
- Real-Postgres integration tier: `vitest.integration.config.ts` runs against the docker-compose DB; add one integration test for §B's loader as the seed. CI wiring is a follow-up.

## Y · Docs

- ADR 0070 (written). ADR 0028 marked amended by 0069. `docs/open-follow-ups.md`: new entries for the cover backfill script and integration-tier CI; migration state updated. Release notes entry for the batch (`lib/release-notes.ts`), worded to Travellers.
