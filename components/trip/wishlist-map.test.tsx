import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

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
  // The component dynamically import()s "leaflet" inside its effect. Vitest
  // caches a module's resolution after the first import within a test file,
  // so a hoisted `vi.mock` factory would only ever run once for this whole
  // file — every test after the first would silently resolve the FIRST
  // test's mock instance instead of its own. `vi.doMock` re-registers the
  // factory before each test so the next dynamic import picks up the
  // current `hoisted.leaflet`.
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
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

    // Same item count as ITEMS (2) — only a coordinate changes. This isolates
    // the `items.map(...).join("|")` signature dependency: if that dependency
    // were dropped and only `items.length` remained, this rerender would not
    // re-trigger the init effect and `maps` would stay at length 1.
    rerender(
      <WishlistMap
        items={[ITEMS[0], { ...ITEMS[1], lat: 35.7 }]}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));
  });
});
