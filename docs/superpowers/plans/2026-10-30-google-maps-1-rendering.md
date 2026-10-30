# Google Maps — Branch 1: Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every map in Teepee renders on Google Maps through `@vis.gl/react-google-maps`, with the same pins and behaviour as today, a fallback list whenever Google is unavailable, and Leaflet + CARTO gone.

**Architecture:** One shared client frame (`GoogleMapFrame`) owns the config check, API loading, failure detection (load error, `gm_authFailure`, render errors) and theme → `colorScheme`; it renders the caller's fallback or a vis.gl `<Map>`. Small shared pieces (`HtmlPin`, `MapPolyline`, `useFitBounds`) replace the Leaflet idioms. Each of the six map components is rewritten as a declarative shell over the unchanged pure layer (`lib/day-map.ts`, `lib/route-map.ts`, `lib/map/pins.ts`, `palette.ts`, `overlap.ts`, `lib/geo-cluster.ts`, `lib/home-map-stops.ts`).

**Tech Stack:** Next 16.4.2 (read `node_modules/next/dist/docs/` before touching routing/`next/dynamic`), React 19.3, `@vis.gl/react-google-maps` **1.10.1** (exact pin), Vitest + Testing Library (jsdom), Tailwind.

**Spec:** `docs/specs/2026-10-30-google-maps.md` — sections G and M1–M6. ADR 0076.

## Global Constraints

- **Nothing waits on Cam.** No Google key exists during this branch. Every test, the dev server and the audit scripts run keyless; keyless means every map renders its fallback.
- Env names, exactly: `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, `GOOGLE_MAPS_SERVER_KEY`. `NEXT_PUBLIC_*` must be read as literal `process.env.NEXT_PUBLIC_…` member expressions (Next inlines them at build).
- Pins look exactly as today: every marker's DOM is the existing `pinHtml(...)` / existing HTML string, mounted inside an Advanced Marker. No redesign.
- Theme: the map's `colorScheme` is read only when the map is created, so a theme flip remounts the map (`key`). Share pages keep their forced `theme` override (`RouteMapProps.theme`).
- A Google failure never breaks a page: missing config, `APILoadingStatus.FAILED` / `AUTH_FAILURE`, `window.gm_authFailure`, or a render error inside the map → the caller's fallback.
- Stable DOM hooks replace Leaflet's: the map root carries class `tp-map`, every marker's wrapper carries class `tp-map-pin`, every fallback root carries `data-map-fallback`.
- Fallback copy when Google is unavailable (exact): `The map isn't available right now.` Existing "not enough coordinates" copy is unchanged.
- Default controls match Leaflet's: the frame sets `disableDefaultUI` and turns `zoomControl` on; a caller opts back into others through `mapProps`.
- No CSP exists (`next.config.ts` deliberately sets none), so no header changes are needed for Google's origins. The React Compiler is on: an imperative component it breaks opts out with `"use no memo"`.
- **Never `git add -A` / `git add .`** — `docs/feedback/inbox.md` has an unrelated working-tree change. Stage explicit paths only.
- Zero comments unless the why is non-obvious; no JSDoc. Match surrounding style (double quotes, semicolons).
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Full suite + build only once at the end (Task 9).

## Review Focus

1. **Key present but refused** (wrong referrer on a preview host) — Google calls `gm_authFailure` and markers can throw on a dead library during client navigation; the frame must land on the fallback, not an error page. Pinned in Task 1 (`gm_authFailure` + boundary tests).
2. **Theme flip while a map is open** — the map must come back in the new scheme with pins recoloured, not stay on the old scheme. Pinned in Task 1 (remount key) and Task 2 (pins re-render dark).
3. **One located point** (a Trip with a single Stop, a day with one Item) — `fitBounds` on one point zooms to max; the map must sit at a sane zoom. Pinned in Task 1 (`useFitBounds` single-point case → `setCenter` + `setZoom(FIT_SINGLE_ZOOM)`).
4. **Keyboard on the Day view while focus is inside a map** — `day-keyboard-nav` must still ignore keys typed inside the map. Pinned in Task 3.
5. **Audit scripts keyless** — `audit:layout` / `audit:contrast` wait for `.leaflet-marker-icon` today; keyless they must wait for `.tp-map-pin, [data-map-fallback]` instead of timing out. Pinned in Task 8.

---

### Task 1: The shared Google map foundation

**Files:**
- Modify: `package.json` (add `"@vis.gl/react-google-maps": "1.10.1"` to dependencies; `npm install`)
- Create: `lib/map/google-config.ts`, `lib/map/google-config.test.ts`
- Create: `components/map/google-map-frame.tsx`, `components/map/google-map-frame.test.tsx`
- Create: `components/map/html-pin.tsx`, `components/map/map-polyline.tsx`, `components/map/use-fit-bounds.ts`
- Create: `components/map/map-unavailable.tsx`
- Create: `test/google-maps-mock.tsx`

**Interfaces:**
- Produces:
  - `type MapsConfig = { apiKey: string; mapId: string }`; `mapsConfig(): MapsConfig | null` — both `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` non-empty, else `null`.
  - `GoogleMapFrame(props: { fallback: React.ReactNode; dark: boolean; className?: string; style?: React.CSSProperties; mapProps?: Omit<MapProps, "mapId" | "colorScheme">; onFail?: () => void; children?: React.ReactNode })` — renders `fallback` when `mapsConfig()` is null or after any failure (calling `onFail` once); otherwise `<APIProvider apiKey onError>` → `<Map key={dark ? "dark" : "light"} mapId colorScheme={dark ? ColorScheme.DARK : ColorScheme.LIGHT} className="tp-map …" disableDefaultUI zoomControl clickableIcons={false} {...mapProps}>{children}</Map>`, wrapped in an error boundary that stays mounted when failure flips (hometracker's `property-map.tsx` pattern), plus a `FailureWatch` child using `useApiLoadingStatus()` and a `window.gm_authFailure` hook that chains any previous handler and restores it on unmount.
  - `HtmlPin(props: { position: google.maps.LatLngLiteral; html: string; title?: string; onClick?: () => void; zIndex?: number; open?: boolean; onClose?: () => void; children?: React.ReactNode })` — an `AdvancedMarker` whose **only** child is `<div className="tp-map-pin" dangerouslySetInnerHTML={{ __html: html }} />`, **anchored at its centre** (Leaflet's `iconAnchor: [s/2, s/2]`; Advanced Markers default to bottom-centre — use 1.10.1's anchor-point prop, confirm its exact name in `index.d.ts`). The marker comes from `useAdvancedMarkerRef()`; `children` render in an `InfoWindow` that is a **sibling** of the marker with `anchor={marker}`, shown while `open`. (AdvancedMarker children become the pin itself, so a nested popup would draw inside the pin.)
  - `MapPolyline(props: { path: google.maps.LatLngLiteral[]; color: string; weight: number; opacity?: number; dashed?: boolean; geodesic?: boolean; zIndex?: number })` — imperative `google.maps.Polyline` bound to `useMap()`, `setMap(null)` on unmount, options updated in place on prop change. `dashed` = `strokeOpacity: 0` plus a repeating `icons` symbol (`path: "M 0,-1 0,1"`, `strokeOpacity: opacity ?? 1`, `scale: weight`, `repeat: "10px"`).
  - `useFitBounds(points: google.maps.LatLngLiteral[], opts?: { padding?: number; maxZoom?: number }): void` — on the map from `useMap()`: 0 points → nothing; 1 point → `setCenter` + `setZoom(opts.maxZoom ?? FIT_SINGLE_ZOOM)`; ≥2 → `fitBounds(bounds, padding ?? 40)`, then if `maxZoom` and zoom exceeds it, `setZoom(maxZoom)`. Re-runs when the points' joined `lat,lng` signature changes. `export const FIT_SINGLE_ZOOM = 12`.
  - `MapUnavailable({ children?: React.ReactNode })` — `<div data-map-fallback …>` with the line `The map isn't available right now.` above `children` (the map's own list). Styled like the Route map's existing dashed fallback box.
  - `test/google-maps-mock.tsx` exports `createGoogleMapsMock()` returning `{ module, map, status }`: `module` is a stand-in for `@vis.gl/react-google-maps` (APIProvider renders children; `Map` renders `<div data-testid="gmap" className={className}>{children}</div>` and records its props; `AdvancedMarker` renders `<div data-testid="marker" title onClick>{children}</div>` and records its props (incl. the anchor prop); `useAdvancedMarkerRef()` returns `[refCallback, markerStub]`; `InfoWindow` renders `<div role="dialog">` and records its `anchor` prop; `useMap()` returns `map` (a recorder with `fitBounds`, `setCenter`, `setZoom`, `getZoom`, `panTo`, `addListener`); `useApiLoadingStatus()` returns `status.current`; `ColorScheme`, `APILoadingStatus` enums). It also installs a minimal `globalThis.google.maps` (`LatLngBounds` with `extend`, `Polyline` recording `setMap`/`setOptions`, `SymbolPath`). Tests `vi.mock("@vis.gl/react-google-maps", () => mock.module)`.

- [ ] **Step 1: Write the failing tests**

`lib/map/google-config.test.ts`:
- `returns null when the browser key is missing` (`vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "")`)
- `returns null when the map id is missing`
- `returns both when set` → `{ apiKey: "k", mapId: "m" }`

`components/map/google-map-frame.test.tsx` (with the mock):
- `renders the fallback when there is no config` → fallback text visible, no `gmap`.
- `renders the map with the map id and a light colour scheme` → `gmap` has class `tp-map`; recorded props `mapId === "m"`, `colorScheme === ColorScheme.LIGHT`.
- `remounts the map in the dark scheme when dark flips` → rerender with `dark` → recorded `colorScheme === ColorScheme.DARK` and Map mounted twice.
- `falls back and calls onFail when the API fails to load` → `status.current = APILoadingStatus.FAILED` → fallback shown, `onFail` called once.
- `falls back when Google calls gm_authFailure` → `act(() => window.gm_authFailure!())` → fallback shown.
- `restores a previous gm_authFailure on unmount`.
- `falls back when a child throws` → a child component that throws → fallback shown, page not crashed.

`HtmlPin` (same file):
- `anchors the pin at its centre` → recorded AdvancedMarker anchor prop is the centre value.
- `renders the popup beside the marker, anchored to it` → when `open`, the dialog is **not** inside `data-testid="marker"` and the recorded InfoWindow `anchor` is the marker stub.

`use-fit-bounds` (in the same test file, via a probe child):
- `centres on a single point at FIT_SINGLE_ZOOM` → `setCenter({lat,lng})`, `setZoom(12)`.
- `fits two points with padding 40` → `fitBounds` called with bounds, `40`.
- `does nothing with no points`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/map/google-config.test.ts components/map/google-map-frame.test.tsx`
Expected: FAIL (modules not found)

- [ ] **Step 3: Install and implement** the interfaces above. Read `node_modules/@vis.gl/react-google-maps/dist/index.d.ts` for the exact `MapProps`, `AdvancedMarker`, `InfoWindow`, `useApiLoadingStatus` signatures before writing.

- [ ] **Step 4: Run to verify they pass** — same command, Expected: PASS.

- [ ] **Step 5: Task-done checks** — `npx vitest related --run lib/map/google-config.ts components/map/*.tsx components/map/*.ts` + `npx tsc --noEmit` + `npx eslint lib/map/google-config.ts components/map test/google-maps-mock.tsx`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/map/google-config.* components/map test/google-maps-mock.tsx
git commit -m "feat(maps): the Google map frame, pins, lines and fit — fallback whenever Google is unavailable"
```

---

### Task 2: Route map on Google

**Files:**
- Modify: `components/trip/route-map.tsx`, `components/trip/route-map.test.tsx`
- Modify (tests only if they assert Leaflet internals): `components/plan/plan-mini-map.test.tsx`, `app/(app)/trips/[tripId]/summary/page.test.tsx`, `app/share/[token]/page.test.tsx`, `components/trip/home/phase-past.test.tsx`, `components/trip/home/phase-planning.test.tsx`

**Interfaces:**
- Consumes: Task 1's `GoogleMapFrame`, `HtmlPin`, `MapPolyline`, `useFitBounds`, `MapUnavailable`, `createGoogleMapsMock`.
- Produces: `RouteMap` with an unchanged `RouteMapProps` and unchanged exports `routeFitPoints`, `travelledLegCount`, `RouteProgress`, `RouteMapStop`.

Keep every current behaviour: numbered stop pins via the existing `stopIcon`/`hereIcon`/`homeIcon` HTML (lift each to return the HTML string instead of `L.divIcon`), chapter colours, `progress` (travelled legs styled as today, "here" pin), home bookend pin + outbound/return legs (`showReturn`), `onStopClick`, `height`/`aspect`/`frameClassName`, fit to `routeFitPoints(...)`, forced `theme`. All Stop-to-Stop and home legs are `geodesic`. The existing "fewer than two located stops" `MapFallback` stays as is; when Google is unavailable the frame's fallback is `<MapUnavailable>` wrapping the same ordered stop list (extract the `<ol>` from `MapFallback` into `RouteStopList` and reuse it in both).

- [ ] **Step 1: Rewrite `route-map.test.tsx` against the mock** keeping each existing behavioural case (pin count and numbering, chapter colours via `pinHtml`, home pin + legs present only with `home`, return leg only with `showReturn`, travelled leg styling under `progress`, `onStopClick` fires on marker click, dark theme recolours pins, `theme` prop overrides). Add:
  - `shows the stop list under "The map isn't available right now." when there is no maps config`
  - `draws every leg geodesic` → each recorded `Polyline` has `geodesic: true`.
  Drop assertions about `cartoTiles` / tile URLs.
- [ ] **Step 2:** `npx vitest run components/trip/route-map.test.tsx` → FAIL.
- [ ] **Step 3: Rewrite `route-map.tsx`** on the frame. Remove the Leaflet import, `leaflet.css` import, `cartoTiles`, all refs/lifecycle code.
- [ ] **Step 4:** same command → PASS. Then run the five consumer test files listed above; fix any that reached into Leaflet.
- [ ] **Step 5: Task-done checks** (tier 2) on the changed files.
- [ ] **Step 6: Commit** — `feat(maps): the Route map draws on Google`

---

### Task 3: Day map on Google

**Files:**
- Modify: `components/trip/day-map.tsx`, `components/trip/day-map.test.tsx`, `components/trip/day-map-panel.tsx` (only if it touches Leaflet)
- Modify: `components/trip/day/day-keyboard-nav.tsx`, its test (`components/trip/day/day-nav-islands.test.tsx` or the nav test that covers it)

**Interfaces:**
- Consumes: Task 1.
- Produces: `DayMap({ tripId, model, … })` with unchanged props.

Keep: numbered Item pins in time order, `H` accommodation pin, `T` transport pins, the route polyline (straight, as today — route lines come in Branch 3), per-pin popup (now an `InfoWindow` via `HtmlPin` children) with "Open in Maps" and "Directions from previous", the "Open today's route" deep link, fit to all points. Fallback when unavailable: `<MapUnavailable>` wrapping a numbered list of the model's points, each with its "Open in Maps" link (`lib/map/maps.ts` builders).

`day-keyboard-nav.tsx`: replace `.leaflet-container` in the ignore selector with `.tp-map`.

- [ ] **Step 1: Rewrite `day-map.test.tsx`** against the mock keeping its behavioural cases. Add:
  - `opens a pin's popup with Open in Maps and Directions from previous`
  - `lists the day's points with Open in Maps links when the map is unavailable`
  - In the keyboard-nav test: `ignores arrow keys typed inside the map` (a focused element inside `.tp-map`).
- [ ] **Step 2:** run those files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Task-done checks.**
- [ ] **Step 6: Commit** — `feat(maps): the Day map draws on Google`

---

### Task 4: Wishlist map on Google

**Files:**
- Modify: `components/trip/wishlist-map.tsx`, `components/trip/wishlist-map.test.tsx`, `components/trip/wishlist-board.test.tsx` (only Leaflet reach-ins)

Keep: category-coloured pins (`pinHtml` with `pinHex(category, dark)`), click → `onSelect(id)`, fit to all items, selected-item behaviour as today. Unavailable fallback: `<MapUnavailable />` with no list (the board already lists every item beside the map).

- [ ] **Step 1: Rewrite the test** against the mock; add `shows the unavailable notice without a maps config`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** task-done checks.
- [ ] **Step 6: Commit** — `feat(maps): the Wishlist map draws on Google`

---

### Task 5: Globe on Google

**Files:**
- Modify: `components/globe/globe-map.tsx`, `components/globe/globe-map.test.tsx`, `components/globe/globe-view.test.tsx` (only Leaflet reach-ins)

Keep: category pins and the selected pin variant, `onSelect` on click, popup per marker with title/notes/attachment count and **Edit** / **Delete** buttons calling `onEdit(id)` / `onDelete(id)` (now plain React buttons inside the `InfoWindow` — drop the `popupopen` DOM wiring), selecting a marker pans to it and opens its popup, `onMapClick(lat, lng)` from the map's click event (`mapProps.onClick` → `e.detail.latLng`), arrival pins and their fit (`maxZoom: 8`; reduced motion irrelevant now — one `fitBounds`), initial fit to located markers, world view with `restriction: { latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: false }` and `minZoom: 2` replacing `maxBounds`/`noWrap`. Unavailable fallback: `<MapUnavailable />` (the Globe view's own list stays beside it).

- [ ] **Step 1: Rewrite the test** against the mock; keep every existing case; add:
  - `Edit and Delete in the popup call onEdit and onDelete with the marker id`
  - `a map click reports its lat and lng to onMapClick`
- [ ] **Steps 2–5** as above.
- [ ] **Step 6: Commit** — `feat(maps): the Globe draws on Google`

---

### Task 6: Trips "Your travels" map and the desktop Home route tile on Google

**Files:**
- Modify: `components/trips/travel-map.tsx`, `components/trips/travel-map.test.tsx`, `components/trips/travels-map-card.test.tsx` (reach-ins only)
- Modify: `components/trip/home/desktop/route-map-tile-canvas.tsx`, `components/trip/home/desktop/route-map-tile.test.tsx`

Travel map — keep: per-trip hue pins (desktop/mobile sizes), dashed per-trip lines (`MapPolyline dashed geodesic`), `filterTripId`, fit, and `onFail` — pass it straight to `GoogleMapFrame.onFail` so the card shows its existing failure panel. Frame `fallback` is `null` (the card owns the failure UI).

Route tile canvas — keep: `view` (`route` / `cluster` / `whole`), the casing + line pair, numbered stop pins, cluster pins recomputed on zoom (`map.addListener("zoom_changed", …)` replacing `zoomend`; remove the listener on unmount), cluster click fits to its members, `focus` pans to a stop, `onPinClick`. The tile's existing `MapErrorBoundary` stays; frame `fallback` reuses whatever that boundary renders.

- [ ] **Step 1: Rewrite both tests** against the mock keeping existing cases; add `the travel map calls onFail when Google refuses the key` and `cluster pins recompute when the zoom changes`.
- [ ] **Steps 2–5** as above.
- [ ] **Step 6: Commit** — `feat(maps): Your travels and the Home route tile draw on Google`

---

### Task 7: Remove Leaflet and CARTO

**Files:**
- Modify: `package.json` / lockfile (remove `leaflet`, `@types/leaflet`)
- Delete: `lib/map/tiles.ts`, `lib/map/tiles.test.ts`, `lib/map/icons.ts`, `lib/map/icons.test.ts`, `public/leaflet/`, `test/leaflet-mock.ts`
- Modify: `app/globals.css` — replace the `.leaflet-*` block with the equivalent `.tp-map` rules: InfoWindow (`.tp-map .gm-style-iw-c`, `.gm-style-iw-tc::after`, `.gm-style-iw-d`) themed with `--card` / `--foreground` / `--border` like `.tp-map-popup` today, and the close button using `--muted-foreground` / `--ring` on focus.
- Modify: `components/ui/map-loader.tsx` comment only if it names Leaflet; the loader factory and `*-map-loader.tsx` files **stay** (they code-split the maps bundle).
- Modify: `.env.example` — drop `NEXT_PUBLIC_CARTO_API_KEY`, add the three Google names with one comment line each.

- [ ] **Step 1:** `grep -rn "leaflet\|cartoTiles\|CARTO" app components lib test scripts --include=*.ts --include=*.tsx --include=*.css` — expect only `scripts/` hits (Task 8) and nothing else after this task.
- [ ] **Step 2:** remove/replace per the list.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx vitest related --run app/globals.css components/ui/map-loader.tsx` + `npx eslint` on touched files → clean.
- [ ] **Step 4: Commit** — `chore(maps): Leaflet and CARTO are gone`

---

### Task 8: Audit scripts keyless

**Files:**
- Modify: `scripts/lib/audit-browser.ts` (`revealMap`: wait for `.tp-map-pin, [data-map-fallback]`; count `.tp-map-pin`), `scripts/layout-audit.ts` (doc comment), `scripts/layout-audit/collector.ts` (`.leaflet-container` → `.tp-map`; rename `inLeaflet` → `inMap` and its readers), `scripts/contrast-audit.ts` (drop the Leaflet zoom-control exemptions and their doc block; exempt descendants of `.gm-style`, Google's own map UI, with a one-line reason).

- [ ] **Step 1:** make the edits.
- [ ] **Step 2:** `npx tsc --noEmit` + `npx eslint scripts/lib/audit-browser.ts scripts/layout-audit.ts scripts/layout-audit/collector.ts scripts/contrast-audit.ts` + `npx vitest related --run` on them → clean.
- [ ] **Step 3: Commit** — `chore(audit): the audits find Google pins or the map fallback`

---

### Task 9: Docs, runbook and branch verification

**Files:**
- Modify: `docs/DEPLOY.md` — new section **"Google Maps Platform"** (next free section number), the runbook from spec G2 + M6: create project `teepee` on the existing billing account; enable Maps JavaScript API, Places API (New), Geocoding API, Routes API; browser key (HTTP referrers `https://teepeeapp.com/*`, `https://beta.teepeeapp.com/*`, the Vercel preview pattern, `http://localhost:3000/*`; APIs: Maps JavaScript, Places (New)); server key (APIs: Routes, Geocoding, Places (New)); one Map ID (JavaScript, vector) with light and dark styles; per-day quotas — every API at half its free monthly allowance ÷ 30 (state the rule and a table with today's numbers: Dynamic Maps 150, Geocoding 165, Routes Compute Routes Essentials 165, Place Details Essentials 165, Place Details Enterprise 15, Autocomplete per the current SKU table); budget alert at $1 and $5 on the billing account; env vars on Vercel (Production + Preview) and `.env.local`; a redeploy note (`NEXT_PUBLIC_*` inline at build). Remove the CARTO rows/paragraph from §4/§5.
- Modify: `README.md`, `docs/HANDOFF.md` — CARTO rows → Google rows.
- Rewrite: `docs/maps-overview.md` for the new stack (packages, services, the frame, pins, lines, fallback, testing with `createGoogleMapsMock`). Nominatim/Photon sections stay until Branch 2, marked "replaced in Branch 2".
- Modify: `docs/adr/0033-carto-map-tiles.md` Status → `Superseded by ADR 0076 (2026-10-30)`; `docs/adr/0024-globe-renders-as-flat-leaflet-map-not-3d.md` — an Amendment: the flat map is now Google (ADR 0076).
- Modify: `app/privacy/page.tsx` — name Google Maps as the map provider (map display); keep Nominatim/Photon wording until Branch 2.

- [ ] **Step 1:** write the docs.
- [ ] **Step 2: Branch verification (tier 3):** `npm test` + `npm run build` + `npm run test:integration` (if the local DB is up). Expected: all pass (known node-22 Intl failures excepted — see memory). Fix anything red before reporting.
- [ ] **Step 3: Commit** — `docs(maps): Google Maps runbook, overview and ADR status`

## After all three branches merge (main session, not a task)

Once Cam's keys are in `.env.local` (his end-of-flow step), the main session runs the layout audit harness keyed and asserts **a pin count > 0** (`.tp-map-pin`) on Route (Trip page, Summary, Share), Day, Wishlist, Globe, Your travels and the desktop Home tile, in **both themes**, before the push. This is the only integration check of the real Google path; Cam's step stays "paste the keys".
