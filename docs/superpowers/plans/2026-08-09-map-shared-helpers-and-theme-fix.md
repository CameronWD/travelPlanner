# Map Shared Helpers + Theme-Rebuild Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-duplicate three helpers copy-pasted across the four Leaflet map components, and stop a theme toggle from tearing down and rebuilding every map.

**Architecture:** Three pure helpers move out of the map components into `lib/` (joining the existing `lib/map-tiles.ts`), each with real unit tests. Then `isDark` is removed from each map's *init* effect dependency array so the existing `setUrl` effect — currently dead code, because the init effect's cleanup destroys the map first — becomes the actual theme-swap mechanism. A shared fake-Leaflet test double makes that behaviour assertable in jsdom for the first time.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19.2, Leaflet 1.9.4 (imperative, no `react-leaflet`), Vitest 4 + jsdom + Testing Library.

## Global Constraints

- Path alias: `@/` resolves to the repo root (configured in `vitest.config.ts` and `tsconfig.json`).
- **Never render real Leaflet in jsdom.** Either mock the `leaflet` module (`vi.mock("leaflet", …)`) or mock the component at its `*-map-loader` boundary. This is an existing, load-bearing convention.
- The four map components are: `components/trip/route-map.tsx`, `components/trip/day-map.tsx`, `components/trip/wishlist-map.tsx`, `components/globe/globe-map.tsx`.
- Behaviour must be **identical** after Tasks 1–3 (pure extraction, zero behaviour change). Only Tasks 4–5 change behaviour, and only for theme toggling.
- Existing `// eslint-disable-next-line react-hooks/exhaustive-deps` comments on the init effects stay — the derived-signature dependency pattern still requires them.
- Test files are colocated: `lib/foo.ts` → `lib/foo.test.ts`; `components/x/y.tsx` → `components/x/y.test.tsx`.
- Commit style: Conventional Commits (`refactor(maps): …`, `fix(maps): …`, `docs(maps): …`).
- Verification commands: `npm test` (full suite), `npx vitest run <path>` (single file), `npx tsc --noEmit` (types), `npm run lint`.
- Do **not** commit to or merge into `main`. All work stays on the current branch (`refactor/map-shared-helpers`).

---

### Task 1: Shared `escapeHtml`

The identical five-character escaper is copy-pasted into all four map components. Because Leaflet popups are built as raw HTML strings containing user-entered titles and place names, a fifth map whose author forgets to copy it is an XSS hole. One export, four call sites.

**Files:**
- Create: `lib/escape-html.ts`
- Create: `lib/escape-html.test.ts`
- Modify: `components/trip/route-map.tsx:53-55` (delete local function, add import)
- Modify: `components/trip/day-map.tsx:35-41` (delete local function, add import)
- Modify: `components/trip/wishlist-map.tsx:62-68` (delete local function, add import)
- Modify: `components/globe/globe-map.tsx:38-43` (delete local function, add import)

**Interfaces:**
- Consumes: nothing.
- Produces: `escapeHtml(s: string): string` from `@/lib/escape-html`.

- [ ] **Step 1: Write the failing test**

Create `lib/escape-html.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-broken", () => {
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("neutralises a script tag in a user-supplied title", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("neutralises an attribute-breakout payload", () => {
    expect(escapeHtml(`" onerror="alert(1)`)).toBe(
      "&quot; onerror=&quot;alert(1)",
    );
  });

  it("leaves safe text untouched", () => {
    expect(escapeHtml("Tokyo Tower")).toBe("Tokyo Tower");
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/escape-html.test.ts`
Expected: FAIL — `Failed to resolve import "./escape-html"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/escape-html.ts`:

```ts
/**
 * Escape HTML-significant characters in user-controlled text.
 *
 * Leaflet popups are built as raw HTML strings (see the map components in
 * `components/trip/*-map.tsx` and `components/globe/globe-map.tsx`), so every
 * user-entered value interpolated into one MUST pass through here. This lived
 * as four identical private copies before; keep it as the single source.
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/escape-html.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Replace the four local copies**

In each of the four map components, **delete** the local `function escapeHtml(...) {...}` block (and the `/** Escape user-controlled strings... */` doc comment directly above it, where present), then add the import alongside the other `@/lib` imports.

`components/trip/route-map.tsx` — delete lines 50-55 (the comment + function), add:

```tsx
import { escapeHtml } from "@/lib/escape-html";
```

`components/trip/day-map.tsx` — delete lines 34-41, add the same import.

`components/trip/wishlist-map.tsx` — delete lines 61-68, add the same import.

`components/globe/globe-map.tsx` — delete lines 38-43, add the same import.

Do not change any call site — the function name and signature are unchanged.

- [ ] **Step 6: Verify no local copies remain**

Run: `grep -rn "function escapeHtml" components/ lib/`
Expected: exactly one hit — `lib/escape-html.ts`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/escape-html.ts lib/escape-html.test.ts \
  components/trip/route-map.tsx components/trip/day-map.tsx \
  components/trip/wishlist-map.tsx components/globe/globe-map.tsx
git commit -m "refactor(maps): extract shared escapeHtml helper

Popup HTML is hand-built, so a map component that forgets to copy the
escaper is an XSS hole. One export, four call sites."
```

---

### Task 2: Shared category pin colours

`CATEGORY_HEX` + `pinHex` are duplicated verbatim between `globe-map.tsx` and `wishlist-map.tsx`. The six hex values are the Tailwind-500 shades of the `color` names already declared in `lib/categories.ts` (sky/amber/emerald/violet/rose/stone), so the duplicate will drift from the domain source of truth eventually.

**Files:**
- Create: `lib/map-pins.ts`
- Create: `lib/map-pins.test.ts`
- Modify: `components/globe/globe-map.tsx:28-36` (delete the const + helper, add import)
- Modify: `components/trip/wishlist-map.tsx:45-55` (delete the const + helper, add import)

**Interfaces:**
- Consumes: `CATEGORIES` from `@/lib/categories` (existing: array of `{ value, label, color }`).
- Produces: `CATEGORY_PIN_HEX: Record<string, string>` and `pinHex(category: string): string` from `@/lib/map-pins`.

- [ ] **Step 1: Write the failing test**

Create `lib/map-pins.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { CATEGORY_PIN_HEX, pinHex } from "./map-pins";

describe("pinHex", () => {
  it("returns the sky hex for SIGHTSEEING", () => {
    expect(pinHex("SIGHTSEEING")).toBe("#0ea5e9");
  });

  it("returns the amber hex for FOOD", () => {
    expect(pinHex("FOOD")).toBe("#f59e0b");
  });

  it("falls back to the OTHER hex for an unknown category", () => {
    expect(pinHex("NOT_A_CATEGORY")).toBe(CATEGORY_PIN_HEX.OTHER);
  });

  it("falls back to the OTHER hex for an empty string", () => {
    expect(pinHex("")).toBe(CATEGORY_PIN_HEX.OTHER);
  });
});

describe("CATEGORY_PIN_HEX", () => {
  it("covers every known category, so no pin ever silently falls back", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_PIN_HEX[c.value]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has no entries beyond the known categories", () => {
    const known = new Set<string>(CATEGORIES.map((c) => c.value));
    for (const key of Object.keys(CATEGORY_PIN_HEX)) {
      expect(known.has(key)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/map-pins.test.ts`
Expected: FAIL — `Failed to resolve import "./map-pins"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/map-pins.ts`:

```ts
/**
 * Map-pin colours for item/marker categories.
 *
 * These are the Tailwind-500 shades of the `color` names declared on each
 * category in `lib/categories.ts`, resolved to literal hex because Leaflet
 * `divIcon` markers are inline-styled HTML strings and cannot use Tailwind
 * utility classes. Shared by the Globe and Wishlist maps.
 */
export const CATEGORY_PIN_HEX: Record<string, string> = {
  SIGHTSEEING: "#0ea5e9", // sky-500
  FOOD: "#f59e0b", // amber-500
  ACTIVITY: "#10b981", // emerald-500
  NIGHTLIFE: "#8b5cf6", // violet-500
  SHOPPING: "#f43f5e", // rose-500
  OTHER: "#78716c", // stone-500
};

/** Pin colour for a category, falling back to the OTHER colour when unknown. */
export function pinHex(category: string): string {
  return CATEGORY_PIN_HEX[category] ?? CATEGORY_PIN_HEX.OTHER;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/map-pins.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Replace the two local copies**

`components/globe/globe-map.tsx` — delete lines 28-36 (the `CATEGORY_HEX` const and the `pinHex` arrow function), add:

```tsx
import { pinHex } from "@/lib/map-pins";
```

`components/trip/wishlist-map.tsx` — delete lines 41-55 (the `// Category colours` banner comment, the `CATEGORY_HEX` const, and the `pinHex` arrow function), add the same import.

Call sites are unchanged — both files already call `pinHex(category)`.

- [ ] **Step 6: Verify no local copies remain**

Run: `grep -rn "CATEGORY_HEX" components/ lib/`
Expected: no hits (the shared const is named `CATEGORY_PIN_HEX` and lives in `lib/map-pins.ts`).

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/map-pins.ts lib/map-pins.test.ts \
  components/globe/globe-map.tsx components/trip/wishlist-map.tsx
git commit -m "refactor(maps): extract shared category pin colours

Duplicated verbatim between the Globe and Wishlist maps, and drifting
from the colour names in lib/categories.ts."
```

---

### Task 3: Shared Leaflet default-icon fix

The six-line `_getIconUrl` / `mergeOptions` incantation that repoints Leaflet's default marker images at `/public/leaflet/` is copy-pasted into all four maps. It is pure configuration and takes the Leaflet namespace as an argument, so it can live in `lib/` and be unit-tested with a stub — no real Leaflet, no DOM.

**Files:**
- Create: `lib/map-icons.ts`
- Create: `lib/map-icons.test.ts`
- Modify: `components/trip/route-map.tsx:141-147` (replace block with call)
- Modify: `components/trip/day-map.tsx:180-187` (replace block with call)
- Modify: `components/trip/wishlist-map.tsx:118-125` (replace block with call)
- Modify: `components/globe/globe-map.tsx:109-115` (replace block with call)

**Interfaces:**
- Consumes: nothing at runtime. Types only: `typeof import("leaflet")` (erased at compile time, so `lib/` gains no runtime Leaflet dependency).
- Produces: `applyLeafletIconDefaults(L: typeof import("leaflet")): void` from `@/lib/map-icons`.

- [ ] **Step 1: Write the failing test**

Create `lib/map-icons.test.ts`. The stub mimics only the shape the function touches; the `as unknown as typeof import("leaflet")` cast is deliberate and confined to the test.

```ts
import { describe, expect, it, vi } from "vitest";
import { applyLeafletIconDefaults, LEAFLET_ICON_PATHS } from "./map-icons";

function stubLeaflet() {
  const mergeOptions = vi.fn();
  const prototype: Record<string, unknown> = { _getIconUrl: () => "broken" };
  const L = { Icon: { Default: { prototype, mergeOptions } } };
  return { L, prototype, mergeOptions };
}

describe("applyLeafletIconDefaults", () => {
  it("deletes the bundler-broken _getIconUrl resolver", () => {
    const { L, prototype } = stubLeaflet();
    applyLeafletIconDefaults(L as unknown as typeof import("leaflet"));
    expect("_getIconUrl" in prototype).toBe(false);
  });

  it("repoints all three icon URLs at the self-hosted copies", () => {
    const { L, mergeOptions } = stubLeaflet();
    applyLeafletIconDefaults(L as unknown as typeof import("leaflet"));
    expect(mergeOptions).toHaveBeenCalledWith({
      iconRetinaUrl: "/leaflet/marker-icon-2x.png",
      iconUrl: "/leaflet/marker-icon.png",
      shadowUrl: "/leaflet/marker-shadow.png",
    });
  });

  it("exposes the paths so they can be asserted against public/leaflet", () => {
    expect(LEAFLET_ICON_PATHS.iconUrl).toBe("/leaflet/marker-icon.png");
    expect(LEAFLET_ICON_PATHS.iconRetinaUrl).toBe("/leaflet/marker-icon-2x.png");
    expect(LEAFLET_ICON_PATHS.shadowUrl).toBe("/leaflet/marker-shadow.png");
  });

  it("is safe to call twice (maps re-init on data change)", () => {
    const { L, mergeOptions } = stubLeaflet();
    const typed = L as unknown as typeof import("leaflet");
    applyLeafletIconDefaults(typed);
    expect(() => applyLeafletIconDefaults(typed)).not.toThrow();
    expect(mergeOptions).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/map-icons.test.ts`
Expected: FAIL — `Failed to resolve import "./map-icons"`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/map-icons.ts`:

```ts
/**
 * Leaflet's default marker icon URLs are derived from the CSS file's own path
 * and break under every JS bundler. The fix is to delete the resolver and point
 * at self-hosted copies in `public/leaflet/` (sourced from
 * `node_modules/leaflet/dist/images/`).
 *
 * All real pins are `divIcon`s, so in practice this stops a broken-image icon
 * ever appearing rather than being load-bearing — but it is two lines and it
 * removes a whole class of bug. Call once per map init, after the dynamic
 * `import("leaflet")` resolves.
 *
 * The Leaflet import here is a TYPE-only reference, erased at compile time, so
 * this module adds no runtime Leaflet dependency to `lib/`.
 */
export const LEAFLET_ICON_PATHS = {
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
} as const;

export function applyLeafletIconDefaults(L: typeof import("leaflet")): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({ ...LEAFLET_ICON_PATHS });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/map-icons.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Replace the four inline blocks**

In each map component, inside the `import("leaflet").then((leaflet) => { ... })` callback, delete the comment + `delete (L.Icon.Default.prototype as any)._getIconUrl;` + `L.Icon.Default.mergeOptions({...});` block (including its `// eslint-disable-next-line @typescript-eslint/no-explicit-any` line) and replace with a single call. Add the import at the top of each file.

Import to add to all four:

```tsx
import { applyLeafletIconDefaults } from "@/lib/map-icons";
```

Replacement inside each `.then()` callback:

```tsx
applyLeafletIconDefaults(L);
```

In `route-map.tsx`, `day-map.tsx` and `wishlist-map.tsx` the local variable is `L` (assigned from `leaflet.default ?? leaflet`); in `globe-map.tsx` it is also `L`. No rename needed in any file.

- [ ] **Step 6: Verify no inline copies remain**

Run: `grep -rn "_getIconUrl" components/ lib/`
Expected: exactly one hit — `lib/map-icons.ts`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, no type errors, no new lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/map-icons.ts lib/map-icons.test.ts \
  components/trip/route-map.tsx components/trip/day-map.tsx \
  components/trip/wishlist-map.tsx components/globe/globe-map.tsx
git commit -m "refactor(maps): extract Leaflet default-icon fix

Same six-line incantation in all four map components."
```

---

### Task 4: Fake-Leaflet test double + theme fix for Wishlist and Day maps

**The bug:** all four maps have `isDark` in their *init* effect's dependency array **and** a separate `setUrl` effect. React runs an effect's cleanup before re-running it on a dependency change, and the init cleanup calls `map.remove()` and nulls the ref — so flipping the theme destroys and rebuilds the whole map. The user loses pan/zoom and the bounds re-fit. The `setUrl` effect meanwhile fires against the old, detached tile layer and does nothing.

**The fix:** remove `isDark` from the init dependency array. The init effect still reads `isDark` for the first tile URL; the `setUrl` effect then becomes the real theme-swap mechanism. Nothing else in init is theme-dependent — all marker colours are literal hex.

This task builds the shared fake-Leaflet double (no such thing exists yet) and applies the fix to the two structurally simplest maps.

**Files:**
- Create: `test/leaflet-mock.ts`
- Create: `components/trip/wishlist-map.test.tsx`
- Create: `components/trip/day-map.test.tsx`
- Modify: `components/trip/wishlist-map.tsx` — the init effect dependency array (currently `[isDark, items.length, items.map(…).join("|")]`)
- Modify: `components/trip/day-map.tsx` — the init effect dependency array (currently `[isDark, points.length, points.map(…).join("|")]`)

**Interfaces:**
- Consumes: `cartoTiles` from `@/lib/map-tiles` (existing).
- Produces: `createLeafletMock(): LeafletMock` from `@/test/leaflet-mock`, where

  ```ts
  interface LeafletMock {
    module: { default: unknown };        // pass to vi.mock("leaflet", () => mock.module)
    L: Record<string, ReturnType<typeof vi.fn>>;
    maps: FakeMap[];                     // one entry per L.map() call
    tileLayers: FakeTileLayer[];         // one entry per L.tileLayer() call
    markers: FakeMarker[];               // one entry per L.marker() call
  }
  ```

  Task 5 reuses this unchanged.

- [ ] **Step 1: Write the fake-Leaflet double**

Create `test/leaflet-mock.ts`. It covers the full surface all four map components touch, so Task 5 needs no additions.

```ts
import { vi } from "vitest";

/**
 * Hand-rolled Leaflet test double.
 *
 * Leaflet must never run for real in jsdom (it reaches for layout APIs jsdom
 * does not implement). This records every call the map components make, so
 * tests can assert on lifecycle — in particular that a theme change does NOT
 * destroy and rebuild the map.
 *
 * Usage:
 *   const leaflet = createLeafletMock();
 *   vi.mock("leaflet", () => leaflet.module);   // must be hoisted via vi.hoisted
 */
export interface FakeTileLayer {
  url: string;
  options: Record<string, unknown>;
  setUrl: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
}

export interface FakeMarker {
  latlng: [number, number];
  options: Record<string, unknown>;
  addTo: ReturnType<typeof vi.fn>;
  bindPopup: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setIcon: ReturnType<typeof vi.fn>;
  setZIndexOffset: ReturnType<typeof vi.fn>;
  openPopup: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export interface FakeMap {
  remove: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

export function createLeafletMock() {
  const maps: FakeMap[] = [];
  const tileLayers: FakeTileLayer[] = [];
  const markers: FakeMarker[] = [];

  const map = vi.fn(() => {
    const instance: FakeMap = {
      remove: vi.fn(),
      fitBounds: vi.fn(),
      setView: vi.fn(),
      flyTo: vi.fn(),
      getZoom: vi.fn(() => 5),
      on: vi.fn(),
      off: vi.fn(),
    };
    maps.push(instance);
    return instance;
  });

  const tileLayer = vi.fn((url: string, options: Record<string, unknown>) => {
    const layer = {} as FakeTileLayer;
    layer.url = url;
    layer.options = options;
    layer.setUrl = vi.fn((next: string) => {
      layer.url = next;
    });
    layer.addTo = vi.fn(() => layer);
    tileLayers.push(layer);
    return layer;
  });

  const marker = vi.fn((latlng: [number, number], options: Record<string, unknown>) => {
    const instance = {} as FakeMarker;
    instance.latlng = latlng;
    instance.options = options;
    instance.addTo = vi.fn(() => instance);
    instance.bindPopup = vi.fn(() => instance);
    instance.on = vi.fn(() => instance);
    instance.setIcon = vi.fn();
    instance.setZIndexOffset = vi.fn();
    instance.openPopup = vi.fn();
    instance.remove = vi.fn();
    markers.push(instance);
    return instance;
  });

  const polyline = vi.fn(() => ({ addTo: vi.fn() }));
  const divIcon = vi.fn((opts: unknown) => opts);
  const latLngBounds = vi.fn((coords: unknown) => coords);

  const L = {
    map,
    tileLayer,
    marker,
    polyline,
    divIcon,
    latLngBounds,
    Icon: { Default: { prototype: { _getIconUrl: () => "" }, mergeOptions: vi.fn() } },
  };

  return { module: { default: L }, L, maps, tileLayers, markers };
}
```

- [ ] **Step 2: Write the failing regression test for the Wishlist map**

Create `components/trip/wishlist-map.test.tsx`. `vi.hoisted` is required — `vi.mock` factories are hoisted above imports, so the mock objects must be created in a hoisted block to be referenceable inside them.

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("leaflet", () => hoisted.leaflet!.module);
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { WishlistMap } from "./wishlist-map";

const ITEMS = [
  { id: "a", title: "Tokyo Tower", category: "SIGHTSEEING", lat: 35.65, lng: 139.74 },
  { id: "b", title: "Ramen", category: "FOOD", lat: 35.69, lng: 139.7 },
];

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.clearAllMocks();
});

describe("WishlistMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("does NOT destroy and rebuild the map when the theme flips", async () => {
    const { rerender } = render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const mapInstance = hoisted.leaflet!.maps[0];

    hoisted.theme = "dark";
    rerender(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(hoisted.leaflet!.tileLayers[0].setUrl).toHaveBeenCalledWith(
        cartoTiles(true).url,
      ),
    );
    expect(mapInstance.remove).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.maps).toHaveLength(1);
  });

  it("still rebuilds when the plotted items actually change", async () => {
    const { rerender } = render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));

    rerender(
      <WishlistMap
        items={[...ITEMS, { id: "c", title: "Shibuya", category: "OTHER", lat: 35.66, lng: 139.7 }]}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));
  });
});
```

- [ ] **Step 3: Run test to verify the middle case fails**

Run: `npx vitest run components/trip/wishlist-map.test.tsx`
Expected: `"does NOT destroy and rebuild the map when the theme flips"` **FAILS** — `mapInstance.remove` has been called, and `maps` has length 2. The other two tests pass. This failure is the bug reproduced.

- [ ] **Step 4: Fix the Wishlist map**

In `components/trip/wishlist-map.tsx`, remove `isDark` from the **init** effect's dependency array (the one ending around line 174-179). Leave the separate `setUrl` effect untouched.

Before:

```tsx
  }, [
    isDark,
    items.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    items.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);
```

After — note the added comment, because a future reader will otherwise "helpfully" put `isDark` back:

```tsx
    // `isDark` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so depending on the theme would rebuild it (losing pan/zoom) on
    // every toggle. The separate setUrl effect below swaps tiles in place.
  }, [
    items.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    items.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/trip/wishlist-map.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 6: Write the failing regression test for the Day map**

Create `components/trip/day-map.test.tsx`. Same shape; `DayMap` takes a `DayMapModel` rather than a flat item array.

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";
import type { DayMapModel } from "@/lib/day-map";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("leaflet", () => hoisted.leaflet!.module);
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { DayMap } from "./day-map";

const MODEL: DayMapModel = {
  points: [
    { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
    { kind: "accommodation", id: "a1", lat: 35.69, lng: 139.7, label: "Hotel" },
  ],
  routePoints: [
    { kind: "accommodation", id: "a1", lat: 35.69, lng: 139.7, label: "Hotel" },
    { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
  ],
  perItemPrev: {},
};

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.clearAllMocks();
});

describe("DayMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("does NOT destroy and rebuild the map when the theme flips", async () => {
    const { rerender } = render(<DayMap tripId="t1" model={MODEL} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const mapInstance = hoisted.leaflet!.maps[0];

    hoisted.theme = "dark";
    rerender(<DayMap tripId="t1" model={MODEL} />);

    await waitFor(() =>
      expect(hoisted.leaflet!.tileLayers[0].setUrl).toHaveBeenCalledWith(
        cartoTiles(true).url,
      ),
    );
    expect(mapInstance.remove).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.maps).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Run test to verify the second case fails**

Run: `npx vitest run components/trip/day-map.test.tsx`
Expected: `"does NOT destroy and rebuild the map when the theme flips"` FAILS for the same reason.

- [ ] **Step 8: Fix the Day map**

In `components/trip/day-map.tsx`, remove `isDark` from the init effect's dependency array (around lines 250-255) and add the same explanatory comment:

```tsx
    // `isDark` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so depending on the theme would rebuild it (losing pan/zoom) on
    // every toggle. The separate setUrl effect below swaps tiles in place.
  }, [
    points.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    points.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|"),
  ]);
```

- [ ] **Step 9: Run both tests, the full suite, and typecheck**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, no type errors, no new lint errors.

- [ ] **Step 10: Commit**

```bash
git add test/leaflet-mock.ts \
  components/trip/wishlist-map.tsx components/trip/wishlist-map.test.tsx \
  components/trip/day-map.tsx components/trip/day-map.test.tsx
git commit -m "fix(maps): stop theme toggle rebuilding wishlist and day maps

isDark sat in the init effect's deps, whose cleanup calls map.remove() —
so flipping the theme destroyed the map, lost pan/zoom, and re-fit bounds,
while the setUrl effect fired against a detached layer. Adds a fake-Leaflet
double so this is assertable in jsdom."
```

---

### Task 5: Theme fix for Route and Globe maps

Same fix, but these two have extra structure a reviewer should gate separately: `route-map` has home-base bookends and a `hasEnoughCoords` guard in its deps; `globe-map` has a `ready` state flag whose cleanup calls `setReady(false)`, and its init deps are literally `[isDark]` — which becomes `[]`.

**Files:**
- Create: `components/trip/route-map.test.tsx`
- Create: `components/globe/globe-map.test.tsx`
- Modify: `components/trip/route-map.tsx:297` (dependency array)
- Modify: `components/globe/globe-map.tsx:154` (dependency array)

**Interfaces:**
- Consumes: `createLeafletMock()` from `@/test/leaflet-mock` (Task 4), unchanged.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing regression test for the Route map**

Create `components/trip/route-map.test.tsx`. `RouteMap` needs ≥2 stops with coordinates or it renders the text fallback instead of a map.

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("leaflet", () => hoisted.leaflet!.module);
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { RouteMap } from "./route-map";

const STOPS = [
  { id: "s1", name: "Tokyo", lat: 35.68, lng: 139.76, arriveDate: "2026-01-01", departDate: "2026-01-04" },
  { id: "s2", name: "Kyoto", lat: 35.01, lng: 135.77, arriveDate: "2026-01-04", departDate: "2026-01-07" },
];

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.clearAllMocks();
});

describe("RouteMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("does NOT destroy and rebuild the map when the theme flips", async () => {
    const { rerender } = render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const mapInstance = hoisted.leaflet!.maps[0];

    hoisted.theme = "dark";
    rerender(<RouteMap stops={STOPS} />);

    await waitFor(() =>
      expect(hoisted.leaflet!.tileLayers[0].setUrl).toHaveBeenCalledWith(
        cartoTiles(true).url,
      ),
    );
    expect(mapInstance.remove).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.maps).toHaveLength(1);
  });

  it("renders the text fallback, not a map, with fewer than two located stops", () => {
    render(<RouteMap stops={[STOPS[0]]} />);
    expect(hoisted.leaflet!.maps).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify the second case fails**

Run: `npx vitest run components/trip/route-map.test.tsx`
Expected: `"does NOT destroy and rebuild the map when the theme flips"` FAILS.

- [ ] **Step 3: Fix the Route map**

In `components/trip/route-map.tsx`, remove `isDark` from the init effect's dependency array at line 297. Keep every other dependency exactly as-is, and extend the existing explanatory comment above it.

Before:

```tsx
  // The effect re-runs only when the set of plotted coords/colours actually
  // changes; we depend on a derived signature string rather than the `stops`
  // array identity, which exhaustive-deps can't verify — hence the disable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughCoords, isDark, stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.chapterColour ?? ""}:${s.chapterName ?? ""}`).join("|"), home?.lat, home?.lng, home?.name, showReturn]);
```

After:

```tsx
  // The effect re-runs only when the set of plotted coords/colours actually
  // changes; we depend on a derived signature string rather than the `stops`
  // array identity, which exhaustive-deps can't verify — hence the disable.
  // `isDark` is deliberately absent: this effect's cleanup destroys the map, so
  // depending on the theme would rebuild it (losing pan/zoom) on every toggle.
  // The separate setUrl effect below swaps tiles in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEnoughCoords, stops.map((s) => `${s.id}:${s.lat},${s.lng}:${s.chapterColour ?? ""}:${s.chapterName ?? ""}`).join("|"), home?.lat, home?.lng, home?.name, showReturn]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/trip/route-map.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the failing regression test for the Globe map**

Create `components/globe/globe-map.test.tsx`. `GlobeMap` takes `MarkerView[]`; only `id`, `title`, `category`, `lat`, `lng` matter here.

```tsx
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";
import type { MarkerView } from "@/components/globe/types";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("leaflet", () => hoisted.leaflet!.module);
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { GlobeMap } from "./globe-map";

const MARKERS = [
  { id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING", lat: 35.65, lng: 139.74 },
  { id: "m2", title: "Ramen", category: "FOOD", lat: 35.69, lng: 139.7 },
] as unknown as MarkerView[];

function renderGlobe() {
  return render(
    <GlobeMap
      markers={MARKERS}
      selectedId={null}
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMapClick={vi.fn()}
    />,
  );
}

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.clearAllMocks();
});

describe("GlobeMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    renderGlobe();
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("does NOT destroy and rebuild the map when the theme flips", async () => {
    renderGlobe();
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const mapInstance = hoisted.leaflet!.maps[0];

    hoisted.theme = "dark";
    renderGlobe();

    await waitFor(() =>
      expect(hoisted.leaflet!.tileLayers[0].setUrl).toHaveBeenCalledWith(
        cartoTiles(true).url,
      ),
    );
    expect(mapInstance.remove).not.toHaveBeenCalled();
  });

  it("still plots its pins after init (the ready-flag path)", async () => {
    renderGlobe();
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThanOrEqual(2));
  });
});
```

Note: the second test re-renders via a second `render()` call rather than `rerender` because `renderGlobe` builds the element internally; if the implementer prefers, refactor `renderGlobe` to accept and return `rerender` — either is acceptable so long as the same component instance is updated, not remounted. **If a second `render()` remounts and produces a second map, switch to `rerender` — a remount legitimately rebuilds the map and would make the assertion meaningless.**

- [ ] **Step 6: Run test to verify the second case fails**

Run: `npx vitest run components/globe/globe-map.test.tsx`
Expected: `"does NOT destroy and rebuild the map when the theme flips"` FAILS.

- [ ] **Step 7: Fix the Globe map**

In `components/globe/globe-map.tsx`, change the init effect's dependency array at line 154 from `[isDark]` to `[]`, and add the explanatory comment. The `ready` flag and its `setReady(false)` cleanup stay exactly as they are — with `[]` deps the effect now runs once per mount, which is what the flag already assumes.

Before:

```tsx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);
```

After:

```tsx
    // `isDark` is deliberately NOT a dependency: this effect's cleanup destroys
    // the map, so depending on the theme would rebuild it (losing pan/zoom) on
    // every toggle. The separate setUrl effect below swaps tiles in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run components/globe/globe-map.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 9: Verify no init effect still depends on the theme**

Run: `grep -n "isDark" components/trip/route-map.tsx components/trip/day-map.tsx components/trip/wishlist-map.tsx components/globe/globe-map.tsx`
Expected: in each file, `isDark` appears only in (a) the `const isDark = theme === "dark"` assignment, (b) the initial `cartoTiles(isDark)` call inside init, and (c) the `setUrl` effect and its `[isDark]` deps. **No init-effect dependency array contains it.**

- [ ] **Step 10: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, no type errors, no new lint errors.

- [ ] **Step 11: Commit**

```bash
git add components/trip/route-map.tsx components/trip/route-map.test.tsx \
  components/globe/globe-map.tsx components/globe/globe-map.test.tsx
git commit -m "fix(maps): stop theme toggle rebuilding route and globe maps

Completes the fix across all four maps. Globe's init deps become [], which
its existing ready-flag already assumed."
```

---

### Task 6: Update the documentation

Three docs describe patterns this plan changes. `docs/maps-overview.md` §5.4 currently claims tiles swap "without rebuilding the map" — true only after Tasks 4–5. `COMPONENTS.md` has a shared-helper table and an "Add a Leaflet map" recipe that should point at the new helpers so the next map doesn't re-copy them.

**Files:**
- Modify: `docs/maps-overview.md` (§5.3, §5.4, §5.5, §11)
- Modify: `COMPONENTS.md` (helper table ~line 30, "Add a Leaflet map" recipe ~line 152)

**Interfaces:**
- Consumes: `escapeHtml`, `pinHex`, `applyLeafletIconDefaults` (Tasks 1-3); the theme-deps rule (Tasks 4-5).
- Produces: nothing.

- [ ] **Step 1: Update the `docs/maps-overview.md` icon section (§5.3)**

Replace the inline code block under **"5.3 Self-host the marker icons"** with a reference to the shared helper:

```tsx
// lib/map-icons.ts — call once per map init, after import("leaflet") resolves
applyLeafletIconDefaults(L);
```

Keep the surrounding prose about *why* (bundler-broken URLs, PNGs copied into `public/leaflet/`).

- [ ] **Step 2: Update the theme section (§5.4)**

The section title and code stay correct. Add this note directly beneath the `setUrl` effect code block:

```markdown
**The dependency arrays are the load-bearing part.** `isDark` must NOT appear in
the *init* effect's deps. React runs an effect's cleanup before re-running it,
and the init cleanup calls `map.remove()` — so depending on the theme there
destroys and rebuilds the map on every toggle (losing pan/zoom, re-fitting
bounds) while the `setUrl` effect fires uselessly against a detached layer.
Each map carries a comment saying so, because it looks like an omission.
```

- [ ] **Step 3: Update the popup/pin section (§5.5)**

Replace the inline `escapeHtml` implementation block with:

```tsx
import { escapeHtml } from "@/lib/escape-html";   // shared — never re-implement
import { pinHex } from "@/lib/map-pins";          // category → pin colour
```

Keep the prose warning that every interpolated value must pass through it.

- [ ] **Step 4: Update the porting checklist (§11)**

Change step 4 from copying `lib/map-tiles.ts` alone to copying the four-file map helper set. Replace that bullet with:

```markdown
4. Copy the `lib/` map helpers: `map-tiles.ts` (tile config), `map-icons.ts`
   (default-icon fix), `map-pins.ts` (category → hex), `escape-html.ts` (popup
   escaping). All four are dependency-free and copy verbatim.
```

- [ ] **Step 5: Update the `COMPONENTS.md` helper table**

Add three rows immediately after the existing `createMapLoader<P>` row (~line 30):

```markdown
| `escapeHtml(s)` | `lib/escape-html.ts` | Escapes `&<>"'`. MANDATORY for any user value interpolated into Leaflet popup HTML. |
| `pinHex(category)` | `lib/map-pins.ts` | Category → map-pin hex (Tailwind-500 shade), falling back to OTHER. |
| `applyLeafletIconDefaults(L)` | `lib/map-icons.ts` | Repoints Leaflet's bundler-broken default marker URLs at `public/leaflet/`. Call once per map init. |
```

- [ ] **Step 6: Extend the "Add a Leaflet map" recipe**

Append to that section (~line 173), after the "Then use `<RouteMapLoader …/>`" paragraph:

```markdown
Inside the map component itself, four rules are non-negotiable:

1. `import("leaflet")` **inside** the effect, and `leaflet.default ?? leaflet` —
   the interop differs between the Next bundler and Vitest.
2. Call `applyLeafletIconDefaults(L)` once, right after that import resolves.
3. Every user-controlled value in popup HTML goes through `escapeHtml`.
4. **Never put `isDark` in the init effect's dependency array** — its cleanup
   destroys the map. Swap tiles with a separate `tileLayerRef.current?.setUrl()`
   effect keyed on `[isDark]`.

Test it by mocking the `leaflet` module with `createLeafletMock()` from
`test/leaflet-mock.ts`, never by rendering real Leaflet in jsdom.
```

- [ ] **Step 7: Verify the docs match reality**

Run: `grep -n "escapeHtml\|pinHex\|applyLeafletIconDefaults" COMPONENTS.md docs/maps-overview.md`
Expected: each helper appears in both files. Then re-read §5.4 of `docs/maps-overview.md` and confirm the claim it makes is now true of the code.

- [ ] **Step 8: Commit**

```bash
git add docs/maps-overview.md COMPONENTS.md
git commit -m "docs(maps): record shared helpers and the theme-deps rule"
```

---

## Self-Review

**1. Spec coverage.** The three agreed items map to tasks as follows: item 1 (theme rebuild) → Tasks 4 and 5, covering all four components; item 2 (`escapeHtml`) → Task 1, all four call sites; item 3 (icon fix + `CATEGORY_HEX`) → Tasks 3 and 2 respectively. Task 6 covers the documentation debt the changes create, including the known-inaccurate §5.4 claim. No agreed item is unaddressed.

**2. Placeholder scan.** Every code step contains complete, runnable code — no "TBD", no "similar to Task N", no "add error handling". The one judgement call flagged to the implementer (Globe's `render` vs `rerender` in Task 5 Step 5) states the decision rule and the failure mode explicitly rather than leaving it open.

**3. Type consistency.** Names used across tasks: `escapeHtml` (Task 1 → used in 5.5 docs), `CATEGORY_PIN_HEX` / `pinHex` (Task 2 → docs), `applyLeafletIconDefaults` / `LEAFLET_ICON_PATHS` (Task 3 → Task 6 docs and COMPONENTS.md), `createLeafletMock` with `{ module, L, maps, tileLayers, markers }` (Task 4 → reused unchanged in Task 5). The shared const is deliberately renamed `CATEGORY_HEX` → `CATEGORY_PIN_HEX`, and Task 2 Step 6's grep asserts the old name is fully gone.

**Known risk.** Tasks 4–5 depend on `vi.mock("leaflet", …)` intercepting a *dynamic* `import("leaflet")` inside an effect. This is standard Vitest behaviour but is not yet used anywhere in this repo. If Step 3 of Task 4 fails to even construct a map (rather than failing the specific theme assertion), the mock wiring is wrong, not the component — debug the double before touching any component code.
