import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";
import type { DayMapModel } from "@/lib/day-map";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

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
  // The component dynamically import()s "leaflet" inside its effect. Vitest
  // caches a module's resolution after the first import within a test file,
  // so a hoisted `vi.mock` factory would only ever run once for this whole
  // file — every test after the first would silently resolve the FIRST
  // test's mock instance instead of its own. `vi.doMock` re-registers the
  // factory before each test so the next dynamic import picks up the
  // current `hoisted.leaflet`.
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
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

  it("still rebuilds when the plotted points actually change", async () => {
    const { rerender } = render(<DayMap tripId="t1" model={MODEL} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));

    // Same point count as MODEL.points (2) — only a coordinate changes. This
    // isolates the `points.map(...).join("|")` signature dependency: if that
    // dependency were dropped and only `points.length` remained, this
    // rerender would not re-trigger the init effect and `maps` would stay at
    // length 1.
    const movedModel: DayMapModel = {
      ...MODEL,
      points: [
        MODEL.points[0],
        { ...MODEL.points[1], lat: 35.7 },
      ],
    };
    rerender(<DayMap tripId="t1" model={movedModel} />);

    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));
  });
});
