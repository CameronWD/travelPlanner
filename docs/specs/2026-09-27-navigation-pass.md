# Spec — Navigation pass: sibling switches hold the page (2026-09-27)

**Status:** agreed, ready to build. **Branch:** `feat/soft-navigation-2026-09-27`.
**Decision record:** ADR 0063 (amends ADR 0006). **Deferred:** `NAV-01` in
`docs/open-follow-ups.md` (Cache Components migration). Terminology follows `CONTEXT.md`.

## The problem, as diagnosed

Cam: "a lot of pages fully reload when selecting between things … on the day selector, when
we click to the next date, the whole page looks like it's reloading." Audit of every
navigation control in `app/` and `components/` found **no real reloads** except the two
Leaflet popup anchors in `components/trips/travel-map.tsx`. Everything else is `<Link>` or
`router.push`. The reload *feel* has three causes, all app-wide:

1. **Full-page `loading.tsx` on 22 route segments.** Next creates a fresh Suspense boundary
   each time a slot's segment changes, with the parent folder's `loading.tsx` as fallback
   (`node_modules/next/dist/client/components/layout-router.js`, `LoadingBoundary` keyed by
   `stateKey`). Each Day date is its own segment, so an arrow press swaps header, strip and
   cards for `day/[date]/loading.tsx` and back.
2. **`app/(app)/trips/[tripId]/template.tsx`** remounts and fades every section switch in via
   `components/ui/page-transition.tsx` (Motion).
3. **No client cache** (`staleTimes.dynamic` defaults to 0) and pages that await everything.
   The Day page re-fetches the unread activity count, recent activity and members that
   `[tripId]/layout.tsx` already loaded; Home does the same.

## Target behaviour

- A sibling switch (day→day, section→section, rail destination→rail destination) **keeps the
  current page on screen until the next page is ready**, then swaps with a short native
  crossfade. Day→day slides directionally instead.
- The tapped control **is active immediately**. If the wait passes ~300ms a **thin progress
  bar** appears at the top of the content area. No centred spinners, no per-control spinners.
- Stepping back to a page seen in the last **30 seconds** is instant (client router cache).
- Anything slow *inside* a page streams behind its own `<Suspense>` (weather is the model).
- Reduced motion: plain cut everywhere (View Transitions honour `prefers-reduced-motion` via
  the stylesheet rule the Next guide gives).

## Workstreams

### WS-A · Day view (the proving ground)

- Delete `app/(app)/trips/[tripId]/day/[date]/loading.tsx`.
- **Dedupe fetches.** Wrap `getUnreadActivityCount` and `getRecentActivity`
  (`server/actions/activity.ts`) in React `cache()` and share the trip-name/members query
  between layout and page through one cached helper, so a cold load or `router.refresh()`
  does not read them twice. *(Corrected in the final review: on a client date change Next
  re-renders only the Day segment — the layout does not run — so the dedupe does not make a
  date change run only `getDay`; the page still reads its header's bell count, recent
  activity and members. Follow-up `NAV-03`.)* `lib/day-view-loader.ts`'s own query count is
  not in scope beyond removing obvious duplicates found while there.
- **Directional View Transition on the Day body only.** Header, arrows and strip sit outside
  it. Forward/back is tagged with `transitionTypes` (`day-forward` / `day-back`) by all four
  inputs: arrows (`day-header.tsx`), strip (`day-strip.tsx`, by comparing target date to
  current), keyboard (`day-keyboard-nav.tsx`), swipe (`day-swipe.tsx`). Remove the swipe's
  hand-rolled 150ms slide-out; the transition replaces it.
- **Days nav goes straight to the default day.** `[tripId]/layout.tsx` already knows the
  trip's dates; compute the default date there (same rule as `day/page.tsx`) and pass it to
  `TripNav` / `MobileTabBar` / `SidebarNav` so the "Days" href is `/day/<date>`. Keep
  `day/page.tsx` as the redirect for deep links and dateless trips.
- Pending state per WS-C on arrows and strip.

### WS-B · Trip sections

- Delete `[tripId]/template.tsx`, `components/ui/page-transition.tsx` and its test.
- Delete `[tripId]/loading.tsx` and the 14 section `loading.tsx` files (activity, budget,
  calendar, checklists, compare, files, help, journal, plan, print, settings, summary,
  wishlist — and `day/[date]` from WS-A).
- Wrap `{children}` in `[tripId]/layout.tsx` in a `<ViewTransition>` with the default
  crossfade. Nesting: React animates the innermost affected boundary, so the Day body's
  directional boundary (WS-A) wins for day→day and the layout's crossfade for section
  switches. The nav-audit (WS-H) checks both.
- Any section that relied on its skeleton to hide a genuinely slow widget gets an in-page
  `<Suspense>` around *that widget* (candidates found during planning by reading each page:
  Home route map / activity, Compare, Summary). The Day body cards are **not** wrapped —
  the whole point is that they hold.

### WS-C · One pending signal, two expressions

- A shared navigation-pending context fed by (a) a thin `AppLink` around `next/link` whose
  inner child reports `useLinkStatus().pending`, and (b) a `useAppRouter()` wrapper whose
  `push`/`replace` run inside `useTransition` and report the same way. Every nav control
  (Dock, TabBar, SidebarNav, AppRail, trip switcher, phone top bar, Day arrows/strip,
  keyboard, swipe, command palette) goes through one of these.
- **Active-immediately:** each control renders its selected style from "is this the pending
  target" as well as "is this the current pathname".
- **`NavigationProgress`**: one component in `app/(app)/layout.tsx`, a 2px bar at the top of
  the content column, mounted after a 300ms delay while pending, completing on settle.
  `aria-busy` on the content region while pending.
  *(As built: the bar sits at the top of the viewport, not the content column, and
  `aria-busy` was replaced by an sr-only live status line inside `NavigationProgress` —
  "Loading the next page", shown once the bar is — which gives screen readers the same
  "still loading" cue.)*
- **Settling (as built, final review):** a navigation can end without the URL changing (a
  server `redirect()` back to the page shown; a tap on the current page superseding one in
  flight). So the pending state clears on `useLinkStatus()` / the `useAppRouter` transition
  going idle (`settle(href)`), on a same-URL `begin()`, on any URL change, or after a 15s
  backstop. `aria-current` stays on the real pathname; the tapped control is lit and carries
  `data-pending="true"` until its page lands.

### WS-D · Client cache

- `next.config.ts`: `experimental.staleTimes = { dynamic: 30 }` (static stays default).
  Confirm in planning that every mutation path still ends in `revalidatePath`/`router.refresh`
  (audit counted 152 + 14); nothing new is needed if so.

### WS-E · Rail destinations

- Delete `loading.tsx` under `account`, `admin`, `globe`, `help`, `whats-new`, `trips/new`.
  **Keep `app/(app)/trips/loading.tsx`** (the one whitelisted boundary, ADR 0063).
- Wrap the content slot in `app/(app)/layout.tsx` in the same default `<ViewTransition>`.

### WS-F · The only real reloads

- `components/trips/travel-map.tsx:70-71`: the Leaflet popup's `<a href>` strings become
  elements with a delegated click handler that calls `useAppRouter().push`.

### WS-G · Verification

- **Convention test** (Vitest): walks `app/(app)/`, fails if any `loading.tsx` exists other
  than `app/(app)/trips/loading.tsx`, or any `template.tsx` exists. Message cites ADR 0063.
- **Unit tests:** pending context + `AppLink` + `useAppRouter`, `NavigationProgress` delay,
  Day transition-type tagging for each input, `cache()`-wrapped activity helpers called once
  per request, Days href computation.
- **`npm run audit:nav`** — `scripts/nav-audit.ts` on the `scripts/lib/audit-browser.ts`
  pattern (global Playwright via `NODE_PATH=/usr/local/lib/node_modules`, refuses non-local
  `BASE_URL`, refuses a non-`next dev` server, dev-login bootstrap). Against the deep trip:
  for each of day arrows / strip / keyboard / swipe / every section / trip switcher / rail
  destinations / browser back, asserts (1) the header node identity survives the switch,
  (2) no `[role=status][aria-label^="Loading"]` skeleton ever appears, (3) with network
  throttled the tapped control is active before the URL changes and the progress bar shows,
  (4) without throttling the progress bar never shows. Exit code non-zero on any failure.
- **Beta checklist** (the acceptance test Cam runs after deploy, since prefetch and the
  client cache only behave fully in production): one line per switch above plus "step back
  within 30s is instant" and "reduced motion gives a cut". Written at the end of this spec.

### WS-H · Docs

- ADR 0063 written; ADR 0006 amended (done in grilling).
- `docs/open-follow-ups.md`: add `NAV-02` — the 14 `revalidatePath(…, "layout")` calls
  (three of them `revalidatePath("/", "layout")`, `server/actions/profile.ts:42,100,121`)
  rebuild the whole tree after a save; out of scope here, worth narrowing later.
- `DESIGN-BRIEF.md:153`: drop `PageTransition` from the component list.

## Out of scope

Cache Components / partial prefetching (`NAV-01`). Narrowing post-mutation revalidation
(`NAV-02`). Query-count work inside `lib/day-view-loader.ts`. Fork switcher `?plan=`
navigation (already holds correctly once WS-B lands).

## Beta checklist

- [ ] Day → next / previous via arrow: header and strip never blank; body slides the right way.
- [ ] Day via strip tap, keyboard ←/→, swipe: same.
- [ ] Days tab from Plan: lands directly on the default day, one hop, no skeleton.
- [ ] Home ↔ Plan ↔ Calendar ↔ Money ↔ Wishlist ↔ More: old page holds, crossfade on arrival,
      tapped item active at once.
- [ ] Trip switcher to another trip: trips-level skeleton is acceptable here (place change).
- [ ] Account, Globe, Help, What's new from the rail: hold + crossfade.
- [ ] Browser back to a page seen <30s ago: instant, no server wait.
- [ ] Throttle to Slow 4G in devtools: progress bar appears after ~300ms; on fast network it
      never appears.
- [ ] Trips list → route-map popup link: no full reload.
- [ ] OS reduced motion on: every switch is a plain cut.
