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

import { RouteMap } from "./route-map";

const STOPS = [
  { id: "s1", name: "Tokyo", lat: 35.68, lng: 139.76, arriveDate: "2026-01-01", departDate: "2026-01-04" },
  { id: "s2", name: "Kyoto", lat: 35.01, lng: 135.77, arriveDate: "2026-01-04", departDate: "2026-01-07" },
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

  it("still rebuilds when a stop's coordinates actually change", async () => {
    const { rerender } = render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));

    // Same stop count as STOPS (2) — only a coordinate changes. This isolates
    // the derived stops-signature dependency: if that dependency were
    // dropped, this rerender would not re-trigger the init effect and `maps`
    // would stay at length 1.
    rerender(
      <RouteMap stops={[STOPS[0], { ...STOPS[1], lat: 35.5 }]} />,
    );

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));
  });
});
