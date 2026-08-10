# Tier 2 ⑥ — Maps: CARTO theme-aware tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the four maps' plain OSM tiles with CARTO Positron (light) / Dark Matter (dark), theme-aware and live-swapping on theme toggle — closing the brief's dark-tile gap.

**Architecture:** A shared `lib/map-tiles.ts` returns the CARTO tile config for light/dark. Each map component (`route-map`, `globe-map`, `day-map`, `wishlist-map`) reads the reactive `useTheme()` to pick the right tiles at build, keeps a ref to the tile layer, and swaps its URL in a small effect when the theme flips. Markers are already `divIcon` circles per the intended approach — unchanged. An ADR records the tile-provider decision.

**Tech Stack:** Leaflet (dynamic-imported, client-only), the app's custom `useTheme` (light/dark via `useSyncExternalStore`), Vitest.

## Global Constraints
- **Reference:** `design_handoff/README.md` ⑥ + "Maps" section. Tile URLs (subdomains `abcd`): light `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` (Positron), dark `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` (Dark Matter). Attribution must credit **both** OpenStreetMap and CARTO.
- **Theme:** `useTheme()` from `@/components/ui/theme-provider` returns `{ theme: "light" | "dark", ... }` and is reactive (re-renders on toggle). `isDark = theme === "dark"`.
- **Scope:** ⑥ is the TILES. Do NOT restyle markers/popups/polylines (already `divIcon` circles matching the approach), and do NOT touch `globals.css` (the `.leaflet-container { isolation: isolate }` rule must remain — we're not editing it). Preserve each map's existing behavior (fitBounds, markers, cleanup, double-init guard).
- **Four maps:** `components/trip/route-map.tsx` (tileLayer ~L152), `components/globe/globe-map.tsx` (~L114), `components/trip/day-map.tsx` (~L191), `components/trip/wishlist-map.tsx` (~L128).
- **Environment (sandbox):** Node ≥22 for vitest (nvm use if it errors). `next build`/`next dev` FAIL — do NOT run; the maps' real rendering is Cam's local pass. Gates: `npx tsc --noEmit`, `npx eslint <files>`, `npx vitest run <focused>` then full.
- **Branch:** `feat/bold-modular-rest`. Never main/push/merge/deploy; never `git add` under `.superpowers/`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
- `lib/map-tiles.ts` — **create** (tile config + `cartoTiles`).
- `lib/map-tiles.test.ts` — **create**.
- `docs/adr/0033-carto-map-tiles.md` — **create** (decision record).
- `components/trip/route-map.tsx`, `components/globe/globe-map.tsx`, `components/trip/day-map.tsx`, `components/trip/wishlist-map.tsx` — **modify** (CARTO + theme-aware).

---

### Task 1: Shared CARTO tile helper + ADR

**Files:** Create `lib/map-tiles.ts`, `lib/map-tiles.test.ts`, `docs/adr/0033-carto-map-tiles.md`.

- [ ] **Step 1: Write the failing test** `lib/map-tiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cartoTiles, CARTO_TILES } from "./map-tiles";

describe("cartoTiles", () => {
  it("returns the Positron (light) tiles when not dark", () => {
    expect(cartoTiles(false).url).toContain("light_all");
    expect(cartoTiles(false).subdomains).toBe("abcd");
  });
  it("returns the Dark Matter tiles when dark", () => {
    expect(cartoTiles(true).url).toContain("dark_all");
  });
  it("credits both OpenStreetMap and CARTO", () => {
    expect(CARTO_TILES.light.attribution).toMatch(/OpenStreetMap/);
    expect(CARTO_TILES.light.attribution).toMatch(/CARTO/);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run lib/map-tiles.test.ts`): module doesn't exist.

- [ ] **Step 3: Create `lib/map-tiles.ts`:**

```ts
/**
 * CARTO basemap tiles — Positron (light) / Dark Matter (dark). Closes the
 * brief's dark-tile gap. See ADR 0033. Attribution credits OpenStreetMap
 * (data) and CARTO (tiles), as CARTO's usage policy requires.
 */
export interface TileConfig {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';

export const CARTO_TILES: { light: TileConfig; dark: TileConfig } = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
};

/** Pick the CARTO tile config for the active theme. */
export function cartoTiles(isDark: boolean): TileConfig {
  return isDark ? CARTO_TILES.dark : CARTO_TILES.light;
}
```

- [ ] **Step 4: Run → PASS.** Then `npx tsc --noEmit`, `npx eslint lib/map-tiles.ts lib/map-tiles.test.ts`.

- [ ] **Step 5: Create the ADR** `docs/adr/0033-carto-map-tiles.md` (match the format of existing ADRs in that folder — a short Status / Context / Decision / Consequences record). Content to capture:
  - **Status:** Accepted.
  - **Context:** All maps used OSM raster tiles, which have no dark variant — a gap flagged in the design brief; dark mode is first-class.
  - **Decision:** Use CARTO Positron (light) + Dark Matter (dark) tiles, selected by the active theme, via the shared `lib/map-tiles.ts` helper. Attribution credits OpenStreetMap + CARTO per CARTO's policy.
  - **Consequences:** Free tier, no API key; must keep the dual attribution; a third-party tile dependency (mitigated by the shared helper — one place to change). Supersedes the plain-OSM choice; complements ADR 0024 (maps are flat Leaflet, not 3D).

- [ ] **Step 6: Commit**

```bash
git add lib/map-tiles.ts lib/map-tiles.test.ts docs/adr/0033-carto-map-tiles.md
git commit -m "feat(maps): CARTO tile config helper + ADR 0033 (Tier 2 ⑥)"
```

---

### Task 2: Theme-aware CARTO tiles in all four maps

**Files:** Modify `components/trip/route-map.tsx`, `components/globe/globe-map.tsx`, `components/trip/day-map.tsx`, `components/trip/wishlist-map.tsx`.

**Interfaces:** consumes `cartoTiles` (Task 1) + `useTheme` (`@/components/ui/theme-provider`).

**The pattern (apply to each map — read each file's effect and adapt, since they differ slightly, e.g. `L` vs `lf`, ref names):**
1. Add imports: `import { useTheme } from "@/components/ui/theme-provider";` and `import { cartoTiles } from "@/lib/map-tiles";`.
2. In the component body: `const { theme } = useTheme();` and `const isDark = theme === "dark";`.
3. Add a tile-layer ref beside the existing map ref (mirror its `// eslint-disable-next-line @typescript-eslint/no-explicit-any` style): `const tileLayerRef = useRef<any>(null);`.
4. Replace the OSM `tileLayer(...)` block with CARTO, storing the layer in the ref.
5. Add a small effect that swaps the tile URL on theme change.
6. If `react-hooks/exhaustive-deps` flags `isDark` on the map-build effect, add `isDark` to its dependency array — this is SAFE because the effect early-returns on the existing double-init guard (`if (mapRef.current) return;`), so the map is not rebuilt; only the swap effect changes tiles.

**Worked example — `components/trip/route-map.tsx`:** replace the OSM block (currently):

```tsx
      // OSM tile layer
      lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(mapInstance);
```

with:

```tsx
      // CARTO basemap tiles (Positron / Dark Matter), theme-aware.
      const tiles = cartoTiles(isDark);
      tileLayerRef.current = lf
        .tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
        })
        .addTo(mapInstance);
```

and add this effect after the map-build `useEffect` (adjust the ref name per file):

```tsx
  // Swap basemap tiles when the theme flips, without rebuilding the map.
  useEffect(() => {
    tileLayerRef.current?.setUrl(cartoTiles(isDark).url);
  }, [isDark]);
```

Apply the same three-part change (imports+isDark, ref, tile block + swap effect) to `globe-map.tsx` (tileLayer ~L114), `day-map.tsx` (~L191), `wishlist-map.tsx` (~L128). Each uses its own map-instance variable — keep it. Do not change markers, polylines, popups, fitBounds, or cleanup.

- [ ] **Step 1: Apply the pattern to all four map components** (per above).

- [ ] **Step 2: Gates.**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/trip/route-map.tsx components/globe/globe-map.tsx components/trip/day-map.tsx components/trip/wishlist-map.tsx` → clean (resolve any exhaustive-deps per point 6).
Run: `npx vitest run` → full suite green (existing `day-map-panel.test.tsx` and any map tests still pass; they don't assert the tile URL).

- [ ] **Step 3: Confirm the swap-out.**

Run: `grep -rn "tile.openstreetmap.org" components/` → **no matches** (all four switched to CARTO).

- [ ] **Step 4: Commit**

```bash
git add components/trip/route-map.tsx components/globe/globe-map.tsx components/trip/day-map.tsx components/trip/wishlist-map.tsx
git commit -m "feat(maps): theme-aware CARTO tiles across all maps (Tier 2 ⑥)"
```

---

## Verification (Definition of Done)
- `npx tsc --noEmit` clean; `npx eslint` clean; `npx vitest run` green.
- `lib/map-tiles.ts` returns Positron/Dark Matter by theme; dual OSM+CARTO attribution.
- All four maps use CARTO, pick tiles by `useTheme`, and swap on toggle; no `tile.openstreetmap.org` left in `components/`.
- ADR 0033 written. Markers/`globals.css` untouched.
- Visual pass (Cam, local dev): light + dark tiles on Globe / Route / Day / Wishlist; toggle swaps live. Tick ⑥ in the tracker.

## Self-Review Notes
- Markers are already `divIcon` circles per the brief's approach — intentionally unchanged; ⑥ is the tile/dark-mode gap only.
- Live-swap via `setUrl` avoids a full map rebuild on toggle. A sub-second race (theme toggled mid dynamic-import) may leave initial tiles one step behind until the next toggle — acceptable, documented.
- One helper (`lib/map-tiles.ts`) is the single place to change providers later (see ADR 0033).
