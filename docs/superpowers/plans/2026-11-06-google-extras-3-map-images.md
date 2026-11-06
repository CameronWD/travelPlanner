# Google extras — Branch 3: Map images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The trip's route appears as a Google Static Maps image in three places: the Share link preview, the top of Print, and the public Share page. The Share page swaps the image for the live Route map when "Explore map" is tapped.

**Architecture:** One pure URL builder, `lib/map/static-map.ts`, is shared by every surface.
- **Share link preview:** the server fetches the image with the server key, counts it against `dailyCap("static-maps")`, and inlines it as a data URL into the existing Satori card.
- **Print and the Share page:** plain `<img>` elements using the browser key. These are referrer-restricted and not counted by the app; the console quota holds them.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/` before framework APIs; `next/og` ImageResponse/Satori), TypeScript, Vitest.

**Spec:** `docs/specs/2026-11-06-google-extras.md` §C (amended by this plan's Task 0: no edge cache).

## Global Constraints

- **Static Maps base URL:** `https://maps.googleapis.com/maps/api/staticmap`. Parameters used:
  - `size=WxH` (each side ≤ 640)
  - `scale=2`
  - `map_id=<NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID>`
  - `markers=` (one per Stop: `color:0xRRGGBB|label:N|lat,lng`)
  - `path=` (`color:0x1D1D1BFF|weight:3|...` or `enc:<polyline>`)
  - `key=`
- **URL length:** ≤ 8,192 characters. When over, drop encoded leg paths for straight segments, then drop the Home base. Never drop Stops.
- **Pins:**
  - Colour: `stopHex(sortOrder, false)` (light scheme) from `lib/stop-colours.ts`.
  - Label: the Stop's 1-based number among *located* Stops while it is ≤ 9; no label from 10 on (Static Maps labels are one character).
  - Home: the ink `0x1D1D1B` with label `H`.
- **Lines:** straight segments in ink `0x1D1D1B`, weight 3. A leg that has an encoded driving path in `legPaths` (`Record<"fromId>toId", encoded>` from `loadRouteLegPaths`) uses `enc:` instead.
- **Light scheme only.** Print and Share are always light.
- **Keys:**
  - Share link preview: server key (`serverKey()` from `lib/google-fetch.ts`), counted by `takeGoogleQuota("static-maps", dailyCap("static-maps"))`.
  - Print and Share page `<img>`: browser key (`mapsConfig()` from `lib/map/google-config.ts`).
  - Any missing key, Map ID or located Stop → no image, and the surface renders exactly as before.
- The Share link preview stays `dynamic = "force-dynamic"`, so a revoked link must stop previewing at once.
- **Copy:** button "Explore map"; image `alt` "Route map of {trip name}".
- Verification tiers per `CLAUDE.md` (as branch 2). Zero comments unless the WHY is non-obvious. No JSDoc. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `docs/feedback/inbox.md` or `AGENTS.md`.

## Review Focus

1. **A trip with more than 9 Stops, or long encoded drives.** The URL stays ≤ 8,192 characters and every Stop still has a pin. Pinned in Task 1.
2. **A Share link with no located Stops, no keys, or over the daily cap.** The preview renders the existing sketch card, never a broken image. Pinned in Task 2.
3. **A revoked link.** It still previews the default card, with no map fetch. Pinned in Task 2.
4. **The public Share page before a tap.** No Maps JavaScript loads (no Dynamic Maps charge) until "Explore map" is tapped. Pinned in Task 3.
5. **Surprise.** Images draw only the Stops the surface already shows: Share uses `scheduledShareStops`; Print uses the masked plan rows. Pinned by reusing each surface's existing Stop list (Tasks 2–4).

---

### Task 0 (controller)
- [ ] `git switch -c feat/google-extras-3-map-images` from `main` (after branch 2 merges).
- [ ] Amend spec §C2: the link preview is fetched server-side, counted against the Static Maps daily cap, and **not** edge-cached, because the route stays `force-dynamic` so revoked links stop previewing. Rulings: Print gets the top route map only; per-Stop maps are deferred because each would be a billed load per print view.
- [ ] Commit the spec edit, this plan, and the ADR 0076 wording ("cached at the edge for a day" → "counted against the daily cap; never edge-cached").

### Task 1: Static map URL builder (pure)

**Files:** create `lib/map/static-map.ts` and `lib/map/static-map.test.ts`.

**Interfaces produced:**
```ts
export type StaticMapStop = { id: string; lat: number | null; lng: number | null; sortOrder: number };
export type StaticMapInput = {
  key: string; mapId: string; width: number; height: number;
  stops: StaticMapStop[]; home: { lat: number; lng: number } | null;
  legPaths?: Record<string, string>;
};
export function staticMapUrl(input: StaticMapInput): string | null;
```
- Returns null when no Stop is located.
- Stops are taken in the given order. Unlocated Stops are skipped for pins and lines.
- A leg runs between consecutive located Stops. A Home leg runs from Home to the first and from the last back to Home only when `home` is given.

- [ ] Write failing tests:
  - Null with no located Stops.
  - Three Stops: three markers with labels 1–3 and colours from `stopHex`, plus one path with all three points.
  - A `legPaths` entry becomes `enc:`.
  - Twelve Stops: labels only on the first nine, and every Stop has a marker.
  - A trip whose encoded paths push the URL over 8,192: the result is ≤ 8,192, has no `enc:`, and still has every marker.
  - Home adds an `H` marker and its legs.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(map): one Static Maps URL builder`.

### Task 2: Share link preview carries the route map

**Files:**
- Create `lib/map/static-map-fetch.ts` (`import "server-only"`): `fetchStaticMapDataUrl(input: Omit<StaticMapInput, "key">): Promise<string | null>`.
  - Returns null without a server key or a URL.
  - Returns null when `takeGoogleQuota("static-maps", dailyCap("static-maps"))` refuses.
  - Fetches with `AbortSignal.timeout(GOOGLE_TIMEOUT_MS)` and returns null on a non-200 or a non-`image/*` content type.
  - Otherwise returns `data:image/png;base64,...`.
- `app/share/[token]/opengraph-image.tsx`:
  - Build the input from `scheduled` (lat/lng/sortOrder), `homeMapPoint(trip)` and `loadRouteLegPaths(...)`, the same as the Share page.
  - Request about 280×373 so it fits the polaroid's inner box.
  - Pass the result as `mapImage`.
  - The revoked or no-dates path returns `DefaultOgCard` before any map work.
- `lib/og-card.tsx`: `ShareOgCardProps` gains `mapImage: string | null`. When set, the polaroid's inner box shows `<img src={mapImage}>` filling the box (`objectFit: "cover"`) instead of the sketch. Otherwise it renders unchanged.

- [ ] Write failing tests:
  - `lib/map/static-map-fetch.test.ts` (mock `fetch`, `takeGoogleQuota` and `serverKey`): no key, quota refused, non-200 and a non-image content type all give null; success gives the data URL; the request URL includes `key=` (the server key) and `scale=2`.
  - `app/share/[token]/opengraph-image.test.tsx` (extend it):
    - A revoked link never calls `fetchStaticMapDataUrl`.
    - With a map, `ShareOgCard` receives `mapImage`.
    - Without one, the sketch path is unchanged.
  - `lib/og-card` test: `mapImage` renders an img; null keeps the sketch.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(share): link previews show the route map`.

### Task 3: Share page shows the map image until "Explore map"

**Files:**
- Create `components/trip/route-map-preview.tsx` (`"use client"`): `RouteMapPreview({ imageUrl, alt, children })`.
  - Renders `<img>` with `loading="lazy"`, the given `alt`, and the same frame classes as the live map section, plus a button "Explore map".
  - On tap it renders `children` (the live map) instead.
  - With `imageUrl` null it renders `children` immediately (today's behaviour).
- `app/share/[token]/page.tsx`, the "map" section (~l.590–603):
  - Compute the URL with `staticMapUrl({ key: mapsConfig().apiKey, mapId, width: 640, height: 320, stops: mapStops, home, legPaths })`. Null without config.
  - Wrap the existing `<RouteMap … />` in `RouteMapPreview`. `RouteMapLoader` already loads with `ssr:false`; confirm it isn't mounted (no Maps JS request) until the tap.

- [ ] Write failing tests:
  - `components/trip/route-map-preview.test.tsx`: with a URL, the img and button show and children are absent; clicking shows children and hides the img; with a null URL, children show at once.
  - The Share page test: the map section renders the preview img when config exists, and the live map otherwise. Use the existing page test's patterns.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(share): a map image until "Explore map"`.

### Task 4: Print has the route map at the top

**Files:**
- `app/(app)/trips/[tripId]/print/page.tsx`:
  - Between the Trip header (~l.270) and the Route section (~l.276), render `<img>` from `staticMapUrl({ key: browser key, mapId, width: 640, height: 360, stops: <the page's dated, masked Stops with lat/lng/sortOrder>, home: homeMapPoint(trip), legPaths: await loadRouteLegPaths(stops, transports, homeMapPoint(trip)) })`.
  - Full width, `alt` "Route map of {trip name}", with `print:` classes so it prints at full width and isn't cut across pages (`break-inside-avoid`).
  - Omitted when the URL is null.
- Confirm `PlanStopRow` carries lat/lng (`lib/plan-reads.ts`). If it doesn't, add them to that select.

- [ ] Write failing tests in the Print page test: with config and located Stops the img renders with that `alt` and a `maps.googleapis.com/maps/api/staticmap` src; without config there's no img.
- [ ] Run them and expect FAIL. Implement until they pass. Run the task-done verification.
- [ ] Commit: `feat(print): the route map at the top`.
