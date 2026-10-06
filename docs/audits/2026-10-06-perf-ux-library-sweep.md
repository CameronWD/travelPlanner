# Performance, UX and library sweep — 2026-10-06

Four read-only explorations of the codebase (server performance, client
performance and bundle, UX, libraries) compiled into one ranked list. Nothing
was profiled or built; every cost estimate comes from reading the code. The
first pass of this sweep produced ADR 0069 (typeahead → Photon) and
`docs/specs/2026-10-06-typeahead-photon.md`; this document is the rest of it.

Constraints respected: no paid or keyed services, no new data processors
without a `/privacy` line (ADR 0059, 0069), Postgres only, Vercel serverless,
Cache Components deferred (NAV-01 in `docs/open-follow-ups.md`).

## Tier 1 — do these (high impact, mostly < 1 day each)

| # | Finding | Where | Fix |
|---|---|---|---|
| P1 | **Offline warmer re-renders 10–70 full pages every time a trip opens**, with `cache: "no-store"`, including on mobile data. Each Day page is ~40 queries (P2). | `components/offline-warmer.tsx:25-63`, `lib/offline.ts:49-78` | Keep a per-trip "warmed at" timestamp; skip if warmed in the last N hours unless "Save again" was pressed. Skip on `saveData`/2G. Limit Day pages to a window around today. |
| P2 | **Day page runs ~40 queries, the trip-wide reads three times** (`getDay` for the date and both neighbours; not `cache()`d). | `app/(app)/trips/[tripId]/day/[date]/page.tsx:43-51`, `lib/day-view-loader.ts:126-311` | Split into a `cache()`d `loadDayTripData(tripId)` plus a per-date pure projection. Move `loadDayTitles` into the parallel batch. |
| P3 | **Pages query in series**: Plan (~9 round trips, `plan/page.tsx:87…502`), Trip Home (5 before the batch, `page.tsx:63-172`), app layout (4–5, `layout.tsx:69-101`), Checklists, Wishlist, Summary, Travelling Home, `/trips`. | see files | Collapse each into one or two `Promise.all` waves; share the membership read between layout and page via `cache()`; add `slug` to `TRIP_SHELL_SELECT`. |
| P4 | **Phone and desktop trees both render and both mount Leaflet maps**; the Plan renders every Stop twice with two `DndContext`s. | `trips/[tripId]/page.tsx:234,336,408`; `itinerary-manager.tsx:1950,2081` | A `useMediaQuery` hook (on `useSyncExternalStore`, like `dialog.tsx:19`); mount maps only when visible; render one Stop list after hydration. |
| P5 | **Silent failures**: deletes and re-dates that ignore `success:false`, one `cost-editor` call with no catch, calendar-feed and share-link actions with no error path. | `item-form-dialog.tsx:624`, `itinerary-manager.tsx:998,1058,1202`, `cost-editor.tsx:398`, `wishlist-board.tsx:142`, `globe-view.tsx:82`, `attachment-list.tsx:208`, `reminders-card.tsx:219`, `to-pay-panel.tsx:116`, `calendar-feed-panel.tsx:90-96`, `share-links-panel.tsx:182` | Route through `useServerAction`/`useDeleteWithConfirm` or add the `toastRejected()` branch `delete-stop-dialog.tsx:48-56` already uses. |
| P6 | **"Add" shortcuts navigate without opening the form**; Flags and Next steps all land on the top of `/plan` despite carrying a `targetId`. | `home/quick-actions.tsx:26-37`, `phase-sketching.tsx:70`, `command-palette-results.tsx:148`, `lib/next-steps.ts:55-67` | Use `/plan?add=stop` (already handled at `itinerary-manager.tsx:582`), add `?add=cost` and `?add=item`; emit `/plan?stop=<id>` for Flags. |
| P7 | **Summary shows departure dates in UTC** (`toLocaleDateString` with no `timeZone`, server-side). | `summary/page.tsx:661` | Use `transportTimeDisplay` (`lib/time-display.ts:38`). |
| P8 | **Cover images download at full size (≤2048px, ~1 MB) for 96px frames**; the loader is a passthrough so `sizes` does nothing; the cover route 302s with `no-store`. | `cover-photo-image.tsx:19`, `cover/route.ts:62-71` | Make a ~480w copy at upload (client already compresses); `?w=` on the route; cache the redirect `private, max-age=240` (presign expires at 300s). Same for attachment and avatar serve. |
| P9 | **React Compiler off; zero `React.memo`**; `ItineraryManager` holds ~40 `useState`s so any dialog open re-renders every Stop twice. | `next.config.ts`, `itinerary-manager.tsx:544-736,1292,1940` | `reactCompiler: true` + `babel-plugin-react-compiler` (stable in Next 16); hooks lint rules first; `compilationMode: "annotation"` to roll out per file. |
| P10 | **`router.refresh()` after actions that already `revalidatePath`** renders the page twice (19 call sites). | `itinerary-manager.tsx:1152-1176`, `unschedule-item-button.tsx`, `calendar-views.tsx:174`, `compare-table.tsx:318`, `notification-bell.tsx:60`, … | Remove where the action revalidates. Check first whether slug-vs-id paths are why they were added. |

## Tier 2 — worth a batch (medium impact)

| # | Finding | Where | Fix |
|---|---|---|---|
| P11 | Logging a spend while Travelling takes ~7 interactions (defaults: Home currency, BEFORE, unpaid). | `other-cost-editor.tsx:78-83` | Phase-aware defaults: today's Stop currency, ON_TRIP, paid today. |
| P12 | Editing a Stop is weaker than adding one: plain text place, free-text country, 400-entry timezone select; renaming keeps old coordinates. | `stop-form-dialog.tsx:229-247` vs `add-stop-sheet.tsx` | Reuse `PlaceCombobox`, derive timezone, one set of mode labels. |
| P13 | Big form dialogs close on a stray backdrop tap and lose input. | `FormDialog` (only Feedback blocks outside taps, `feedback-launcher.tsx:603`) | Dirty check → "Discard changes?" on `onInteractOutside`/Escape. |
| P14 | Changing nights needs a dialog; `setStopNights` exists but only Make it fit uses it. | `server/actions/stops.ts:1233` | Inline −/+ Stepper on the Stop header and phone sheet, with the existing ripple + Undo. |
| P15 | No Share in the trip header or Search; `navigator.share` never used. | Settings only | Header + Search "Share" → OS share sheet on phones. |
| P16 | Plan page imports all ten dialogs eagerly (Transport 927 lines, Item 901, …). | `itinerary-manager.tsx:16-47` | `next/dynamic(() => import(...), { ssr: false })`. |
| P17 | Full `motion` in the shared bundle (33 files, ~30 KB gz). | `motion-provider.tsx`, `dialog.tsx:6` | `LazyMotion features={domAnimation}` + `m.*`. Mechanical codemod. |
| P18 | zod reaches the browser via `lib/enums.ts` (`z.enum` at module load). | `vote-control.tsx:11`, `cost-editor.tsx:20`, form dialogs | Zod-free `lib/enum-values.ts`; `zod/mini` for client checks. |
| P19 | Journal/item/cover `<img>` tags with no `loading="lazy"`, `decoding="async"` or dimensions; `blur-md` on a second full-size cover copy. | `journal-entry-view.tsx:61`, `todays-journal.tsx:58`, `item-photo-thumb.tsx:79`, `cover-photo.tsx:80-95` | Add attributes; serve the small copy from P8. |
| P20 | Service-worker cache grows unbounded: caches `?_rsc=` navigations and prefetches; old chunks kept until `CACHE_VERSION` is bumped by hand. | `public/sw.js:116,236` | Skip requests with `RSC`/`Next-Router-Prefetch` headers; split stores with limits; version static assets by build id. |
| P21 | Geocode and FX fetches have no cross-instance cache (`Map` per lambda; Frankfurter fetched per trip). | `lib/geocode.ts:136`, `lib/fx.ts:58` | `fetch(..., { next: { revalidate } })` (geocode ~30d, FX ~12h). `use cache` needs `cacheComponents`, so not that. |
| P22 | Pool capped at pg's default 10 connections; Day page fans out ~36 queries. | `lib/db.ts:22` | After P2, set `max` to suit Neon's pooler. |
| P23 | Indexes: Stop/Transport/Item filter `tripId + forkId IS NULL ORDER BY sortOrder` on single-column indexes; Reminder `tripId + date`; AccessRequest counted by `resolvedAt IS NULL` with only `status` indexed. | `schema.prisma:349,427,504,670,1012` | Composite indexes. One migration. |
| P24 | Only two `useOptimistic` uses; votes, checklist ticks and calendar drag wait for the round trip. | `calendar-views.tsx:163`, checklist, vote-control | `useOptimistic`. |
| P25 | Loading states: only `trips/loading.tsx` exists, so `/trips/x/plan` from Globe shows the trips-list skeleton. **Tension:** blanket `loading.tsx` was removed on purpose (NAV-01). | `app/(app)/trips/` | A trip-shaped skeleton under `[tripId]` only, or Suspense around side panels. Decide against NAV-01's reasoning. |

## Tier 3 — bigger bets (need a spec)

- **B1 Attach files while creating**, not after saving; five forms say "Save first, then reopen" (`item-form-dialog.tsx:652,844`, `transport-form-dialog.tsx:884`, `accommodation-form-dialog.tsx:409`, `stop-form-dialog.tsx:364`, `marker-form.tsx:329`). Hold files client-side and upload after `create` returns, or switch the dialog to edit mode in place.
- **B2 Fast route entry**: "Add & next" keeping the add-stop sheet open and chaining "Goes after"; or a "Where to?" step in New Trip reusing `StepWherePast`.
- **B3 Phone keyboard and sheets**: `interactiveWidget: "resizes-content"`, `visualViewport` padding, drag-to-dismiss handle on `Sheet` built with `motion`'s `drag="y"` (vaul is unmaintained; Base UI Drawer is the library option). Needs a real iPhone.
- **B4 Partner edits**: refresh on `visibilitychange`; poll the unread-Activity count the bell already uses and show "X changed 3 things — refresh" in the editor.
- **B5 "Split with 2" doesn't split**: either rename the pill or add `paidById` + a Settle-up card (new CONTEXT.md term).
- **B6 Travel features**: "Show the driver" (tonight's address in large type), per-Day share, flight-number → status link, non-AI `.ics`/PDF booking drop.
- **B7 Bulk writes one row at a time** inside transactions (reorder, restore, fork creation). `UPDATE … FROM (VALUES …)` or `createManyAndReturn`.

## Libraries and platform

**Adopt**
- **React Compiler** (P9). `babel-plugin-react-compiler`, MIT. Also `eslint-plugin-react-hooks` v6 compiler rules first.
- **`server-only`** in `lib/db.ts`, `lib/storage.ts`, `lib/auth.ts`, `lib/ai.ts`, `lib/push.ts`, `lib/mail.ts`. Zero risk; turns a future leak into a build error.
- **Playwright as a real devDependency** (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on normal installs) replacing the global install + `scripts/types/playwright-shim.d.ts`. Unblocks AB-14, HG-08, AB-16, NAV-01's verification.
- **Real-Postgres integration tier** against the docker-compose DB (`vitest.integration.config.ts` exists with 2 tests); `@testcontainers/postgresql` optional for CI. Unblocks CP-22.
- **knip** for dead exports/deps after a run of extract-and-replace refactors. ISC.
- **`@next/bundle-analyzer`** once, to confirm P16–P18.
- **`typedRoutes: true`** (stable in Next 16): compile-time check of the slug-based hrefs `audit:nav` hunts for.
- **`Intl.supportedValuesOf("timeZone")`** instead of the hard-coded `TIMEZONES` list in `lib/tz.ts`.

**Decide**
- **`@vercel/speed-insights`**: there is no real-user Web Vitals data; the "slow on iPhone" reports behind ADR 0063/0065 were diagnosed without numbers. Vercel is already a processor, so probably one line on `/privacy`. Your call under ADR 0059.
- **next-auth 5.0.0-beta.32**: v5 never went stable; Auth.js is in security-patch-only mode under Better Auth. Don't migrate now (magic link, Google, allowlist, ADR 0057 door). Record an ADR: "migrate to Better Auth when auth is next touched", and watch advisories.
- **AWS SDK pins**: presigner pinned exactly (`3.1073.0`), client-s3 caret (`^3.700.0`); pin both. `aws4fetch` (3 kB) could replace the SDK for R2 presigning; optional. Lazy-import the S3 driver like `lib/ai.ts:53`.

**Considered and rejected**: maplibre-gl (220 kB + WebGL + tile processor; wait for Leaflet 2), vaul (unmaintained), sonner (working Radix toasts), cmdk (palette is 115 lines), nuqs (only if Back-button bugs appear), Temporal polyfill / date-fns-tz (`lib/tz.ts` is correct and tested; Safari lacks Temporal), react-hook-form, dinero.js, Biome, Storybook, MSW, embla, tRPC/React Query, Sentry, Prisma Accelerate, Vercel Blob, Cache Components now (NAV-01), next/image optimiser for covers (member-gated).

## Already done well (don't re-propose)

`cache()` on guards, shell reads and home loaders; JWT sessions; lazy Anthropic/web-push/image-compression; Leaflet behind one client loader; help guide as a server component; weather with revalidate + TTL + stale fallback in Suspense; FX DB read-through; `staleTimes.dynamic: 30`; reduced-motion everywhere; 44px tap floor; safe areas; Undo on reorder/re-date/unschedule; full ARIA on the place combobox; error panels never show raw messages; CONTEXT.md wording holds in the UI.
