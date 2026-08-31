# CARTO Tile API Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a CARTO API key with basemap tile requests so the deployed maps stop rendering the "API KEY REQUIRED" watermark, while leaving unconfigured local development working exactly as it does today.

**Architecture:** `lib/map-tiles.ts` is the single place every map gets its tile URL from (ADR 0033 designed it that way). It gains a module-level read of `NEXT_PUBLIC_CARTO_API_KEY` and appends `?key=…` to both the light and dark URLs when that variable is set. When it is unset the URLs are byte-identical to today's. All four map components (`globe-map`, `route-map`, `day-map`, `wishlist-map`) call `cartoTiles()` and their tests assert against `cartoTiles(x).url`, so they follow automatically with no component changes.

**Tech Stack:** Next.js App Router (`NEXT_PUBLIC_*` values are inlined at build time), Leaflet raster tile layers, vitest.

## Background — why this change exists

In late August 2026 CARTO began requiring an API key for its raster basemap endpoint (`basemaps.cartocdn.com`). Unauthenticated tile requests are served with an "API KEY REQUIRED / carto.com/basemaps/apikey" watermark baked into the PNG. This was confirmed by fetching a tile that missed CARTO's Fastly cache (`age: 0`, `x-cache: MISS, MISS`) and viewing the image. Nothing is blocked — the map still pans, zooms and renders markers — but every freshly-fetched tile carries the watermark, and it spreads as cached tiles expire.

Keys are free within CARTO's fair-use limit (5M tile requests/month) from <https://carto.com/basemaps/apikey>.

## Global Constraints

- Never commit to `main`; work on the current branch `fix/carto-tile-api-key`.
- Never deploy, never `git push`.
- No new npm dependencies.
- **The variable MUST be named `NEXT_PUBLIC_CARTO_API_KEY`.** Leaflet fetches tiles from the browser, so the key has to reach client code; a non-`NEXT_PUBLIC_` name would be `undefined` at runtime and silently do nothing.
- **Unset key must be a no-op.** With no key configured, `cartoTiles(...).url` must equal today's string exactly — no trailing `?`, no `?key=`. Local development must keep working with zero setup.
- Do not change `attribution` or `subdomains`. ADR 0033 requires the dual OpenStreetMap + CARTO attribution; removing either violates CARTO's terms.
- Do not touch the four map components. They already route through `cartoTiles()`.
- Tests are colocated (`foo.ts` → `foo.test.ts`). Run one file with `npx vitest run <path>`; the whole suite with `npm test`.
- Existing assertions in `lib/map-tiles.test.ts` use `toContain("light_all")` / `toContain("dark_all")` and must keep passing.

---

### Task 1: `lib/map-tiles.ts` — append the key when configured

**Files:**
- Modify: `lib/map-tiles.ts`
- Test: `lib/map-tiles.test.ts` (exists — extend it, keep its three current tests)

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_CARTO_API_KEY`.
- Produces: no signature changes. `cartoTiles(isDark): TileConfig` and `CARTO_TILES` keep their exact current shapes; only the `url` strings change, and only when the env var is set.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `lib/map-tiles.test.ts` with this. The first three tests are the existing ones, unchanged:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { cartoTiles, CARTO_TILES } from "./map-tiles";

/**
 * The key is read at module scope (Next inlines NEXT_PUBLIC_* at build time),
 * so the env has to be stubbed BEFORE the module is imported. resetModules +
 * dynamic import gives each case a fresh evaluation.
 */
async function loadWith(key: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", key ?? "");
  return import("./map-tiles");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

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

describe("cartoTiles — CARTO API key", () => {
  it("appends the key to both light and dark URLs when configured", async () => {
    const m = await loadWith("abc123");
    expect(m.cartoTiles(false).url).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=abc123",
    );
    expect(m.cartoTiles(true).url).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=abc123",
    );
  });

  it("leaves the URLs bare when the key is unset — unconfigured dev still works", async () => {
    const m = await loadWith(undefined);
    expect(m.cartoTiles(false).url).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    );
    expect(m.cartoTiles(true).url).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    );
    expect(m.cartoTiles(false).url).not.toContain("?");
  });

  it("treats a whitespace-only key as unset", async () => {
    const m = await loadWith("   ");
    expect(m.cartoTiles(false).url).not.toContain("key=");
  });

  it("url-encodes the key", async () => {
    const m = await loadWith("a b&c");
    expect(m.cartoTiles(false).url).toContain("?key=a%20b%26c");
  });

  it("keeps the Leaflet placeholders and the retina marker before the query", async () => {
    const m = await loadWith("abc123");
    // Leaflet substitutes {s}/{z}/{x}/{y}/{r}; the query string must sit after .png
    expect(m.cartoTiles(true).url).toMatch(/\{s\}.+\{z\}\/\{x\}\/\{y\}\{r\}\.png\?key=/);
  });

  it("does not disturb attribution or subdomains when keyed", async () => {
    const m = await loadWith("abc123");
    expect(m.cartoTiles(false).subdomains).toBe("abcd");
    expect(m.CARTO_TILES.dark.attribution).toMatch(/CARTO/);
    expect(m.CARTO_TILES.dark.maxZoom).toBe(20);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/map-tiles.test.ts` → the six new tests in the second describe FAIL (the key is never appended); the three original tests still PASS.

- [ ] **Step 3: Implement** — replace the top of `lib/map-tiles.ts` (the docblock through the `CARTO_TILES` declaration) with:

```ts
/**
 * CARTO basemap tiles — Positron (light) / Dark Matter (dark). Closes the
 * brief's dark-tile gap. See ADR 0033. Attribution credits OpenStreetMap
 * (data) and CARTO (tiles), as CARTO's usage policy requires.
 *
 * CARTO began requiring an API key for the raster basemap endpoint in late
 * August 2026 — unauthenticated tiles come back with an "API KEY REQUIRED"
 * watermark baked into the PNG. Keys are free within CARTO's fair-use limit
 * (https://carto.com/basemaps/apikey).
 *
 * The variable is NEXT_PUBLIC_ by necessity: Leaflet fetches tiles from the
 * browser, so the key cannot be kept server-side. Restrict it by domain in the
 * CARTO dashboard. Note that NEXT_PUBLIC_* values are inlined at BUILD time —
 * setting it in a hosting dashboard does nothing until the app is rebuilt.
 *
 * When the key is unset the URLs are left bare: maps still work, watermarked,
 * so local development needs no configuration.
 */
export interface TileConfig {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';

const API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() || null;

/** `?key=…` when a key is configured, otherwise the empty string. */
const KEY_QUERY = API_KEY ? `?key=${encodeURIComponent(API_KEY)}` : "";

export const CARTO_TILES: { light: TileConfig; dark: TileConfig } = {
  light: {
    url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${KEY_QUERY}`,
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
  dark: {
    url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${KEY_QUERY}`,
    attribution: ATTRIBUTION,
    subdomains: "abcd",
    maxZoom: 20,
  },
};
```

Leave `cartoTiles()` and its doc comment exactly as they are.

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/map-tiles.test.ts` → all 9 PASS.

- [ ] **Step 5: Confirm the four map components still pass unchanged** — they compare against `cartoTiles(x).url`, so they should need no edits:

`npx vitest run components/globe/globe-map.test.tsx components/trip/route-map.test.tsx components/trip/day-map.test.tsx components/trip/wishlist-map.test.tsx` → PASS.

If any of them fail, do NOT edit the component — report it, because it would mean something hardcodes the URL instead of using the helper.

- [ ] **Step 6: Commit**

```bash
git add lib/map-tiles.ts lib/map-tiles.test.ts
git commit -m "$(cat <<'EOF'
fix(maps): send the CARTO API key with basemap tile requests

CARTO began requiring an API key for its raster basemap endpoint in late
August 2026; unauthenticated tiles come back with an "API KEY REQUIRED"
watermark baked into the image, which is what the deployed maps have been
showing. Keys are free within CARTO's fair-use limit.

lib/map-tiles.ts now appends ?key= from NEXT_PUBLIC_CARTO_API_KEY when it
is set, and leaves the URL untouched when it is not — so unconfigured local
development keeps working exactly as before, watermark and all. All four
map components route through cartoTiles(), so none of them changed.

NEXT_PUBLIC_ is forced by the architecture: Leaflet fetches tiles from the
browser. Restrict the key by domain in the CARTO dashboard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: document the variable and correct the stale docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/HANDOFF.md` (§5 Maps, and the §9 environment variable table)
- Modify: `docs/adr/0033-carto-map-tiles.md` (append an amendment)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_CARTO_API_KEY` from Task 1.
- Produces: nothing code-facing.

**Why the docs are wrong right now:** `docs/HANDOFF.md` §5 says maps are "Powered by Leaflet with OpenStreetMap tiles … No API key is required for either service." Both halves are false — ADR 0033 moved tiles to CARTO, and CARTO now needs a key. ADR 0033's own Consequences section states "**Free tier, no API key required.**", which is the specific line this amendment corrects.

- [ ] **Step 1: `.env.example`** — insert this block immediately BEFORE the existing `# Web Push (VAPID)` comment block:

```
# ---------------------------------------------------------------------------
# Map tiles (CARTO) — optional but recommended. Without a key the maps still
# work, but every tile carries an "API KEY REQUIRED" watermark. Free within
# CARTO's fair-use limit: https://carto.com/basemaps/apikey
#
# NEXT_PUBLIC_ because Leaflet fetches tiles in the browser — the key is
# public by necessity, so restrict it by domain in the CARTO dashboard.
# NEXT_PUBLIC_* values are inlined at BUILD time: rebuild after changing it.
# ---------------------------------------------------------------------------
NEXT_PUBLIC_CARTO_API_KEY=""
```

- [ ] **Step 2: `docs/HANDOFF.md` §5** — replace the whole of section 5 (the `## 5. Maps` heading and its single paragraph, currently around line 232-234) with:

```markdown
## 5. Maps

Powered by [Leaflet](https://leafletjs.com/) with [CARTO](https://carto.com/) basemap tiles — Positron for light mode, Dark Matter for dark (see ADR 0033) — and [Nominatim](https://nominatim.org/) for geocoding.

### CARTO tiles need an API key

Since late August 2026 CARTO's raster basemap endpoint watermarks unauthenticated tiles with "API KEY REQUIRED". Get a free key (fair-use limit) at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey) and set:

```
NEXT_PUBLIC_CARTO_API_KEY="<your carto key>"
```

The key reaches the browser by necessity — Leaflet fetches tiles client-side — so restrict it by domain in the CARTO dashboard. **`NEXT_PUBLIC_*` values are inlined at build time**, so setting the variable in your host's dashboard does nothing until you redeploy.

Without the key the maps still pan, zoom and render markers; the tiles are just watermarked.

### Nominatim needs a contact, not a key

Geocoding requires no API key, but Nominatim's usage policy requires a real contact (email or app URL) in the User-Agent and returns **HTTP 403** for a missing or placeholder one. Set `NOMINATIM_CONTACT` in every environment where place search must work — without it, search fails and the UI shows "Place search is temporarily unavailable".
```

- [ ] **Step 3: `docs/HANDOFF.md` §9 table** — add these two rows to the environment variable table, immediately after the `NEXT_PUBLIC_APP_NAME` row:

```markdown
| `NEXT_PUBLIC_CARTO_API_KEY` | No (tiles watermarked without it) | CARTO basemap tile key | [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey) |
| `NOMINATIM_CONTACT` | No (place search breaks without it) | Real contact for Nominatim's User-Agent | An email you control, or your app's public URL |
```

- [ ] **Step 4: `docs/adr/0033-carto-map-tiles.md`** — append this to the end of the file:

```markdown

## Amendment — 2026-08-31: CARTO now requires an API key

The "**Free tier, no API key required**" consequence above no longer holds. In late August 2026 CARTO began requiring an API key for the raster basemap endpoint (`basemaps.cartocdn.com`); unauthenticated tiles are returned with an "API KEY REQUIRED" watermark baked into the image. Nothing is blocked — the map still functions — but the watermark appears on every tile fetched after the change, spreading as cached tiles expire.

**The decision stands.** CARTO Positron and Dark Matter remain the basemaps, and `lib/map-tiles.ts` remains the single swap point that made this a one-file change. The helper now appends `?key=` from `NEXT_PUBLIC_CARTO_API_KEY` when that variable is set, and leaves the URL bare when it is not — so local development works unconfigured, at the cost of the watermark.

Two further consequences:

- **The key is necessarily public.** Leaflet fetches tiles from the browser, so it must be a `NEXT_PUBLIC_` variable and will appear in the client bundle. Restrict it by domain in the CARTO dashboard. It is also inlined at build time, so changing it requires a rebuild.
- **Raster basemaps are slated for retirement** in favour of vector tiles. This amendment buys time; migrating to vector (and to MapLibre in place of Leaflet's raster layer) would supersede this ADR rather than amend it.
```

- [ ] **Step 5: Full verification sweep**

```bash
npm test
npm run lint
npm run build
```

Expected: all three green. Task 1 changed one small module and Task 2 changed only markdown, so nothing should break. If `npm run build` fails for a reason unrelated to this change, report it rather than working around it.

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/HANDOFF.md docs/adr/0033-carto-map-tiles.md
git commit -m "$(cat <<'EOF'
docs(maps): document NEXT_PUBLIC_CARTO_API_KEY, amend ADR 0033

ADR 0033 recorded "no API key required" as a consequence of choosing CARTO.
That is no longer true, so the ADR gets an amendment rather than a
replacement — the decision itself (Positron/Dark Matter via one shared
helper) held up, and it is precisely the "one place to swap" the ADR
promised that made the fix a single file.

HANDOFF's Maps section was doubly stale: it still described OpenStreetMap
raster tiles from before ADR 0033, and claimed no key was needed. It now
covers the CARTO key and the build-time inlining catch, and documents
NOMINATIM_CONTACT — which is absent from the deployed environment, so
place search currently 403s in production.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Out of scope (explicitly)

- Obtaining the CARTO key and setting it in Vercel — the user does that, then redeploys.
- Fixing `NOMINATIM_CONTACT` in the deployed environment — documented here, but setting it is a hosting-dashboard change the user makes.
- Migrating to CARTO vector basemaps / MapLibre. Noted in the ADR amendment as the eventual successor; not attempted now.
- Any change to the four map components — they already route through `cartoTiles()`.
- Merge, push or deploy — stop at a green branch; the user decides integration.
