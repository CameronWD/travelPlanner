import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";
import type { MarkerView } from "@/components/globe/types";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { GlobeMap } from "./globe-map";

/** The mock's `divIcon` returns its options verbatim, untyped; narrow just the `html` we assert on. */
function iconHtml(marker: { options: Record<string, unknown> }): string {
  return (marker.options.icon as { html: string }).html;
}

const MARKERS = [
  { id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING", lat: 35.65, lng: 139.74 },
  { id: "m2", title: "Ramen", category: "FOOD", lat: 35.69, lng: 139.7 },
] as unknown as MarkerView[];

function globeElement(selectedId: string | null = null) {
  return (
    <GlobeMap
      markers={MARKERS}
      selectedId={selectedId}
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMapClick={vi.fn()}
    />
  );
}

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

describe("GlobeMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("builds the map with the dark tiles when mounted in dark mode", async () => {
    hoisted.theme = "dark";
    render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(true).url);
  });

  it("does NOT destroy and rebuild the map when the theme flips", async () => {
    // Rerender the SAME instance rather than calling render() again — a
    // second render() would mount a second instance, which legitimately
    // builds a second map and would make this assertion meaningless.
    const { rerender } = render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const mapInstance = hoisted.leaflet!.maps[0];

    hoisted.theme = "dark";
    rerender(globeElement());

    await waitFor(() =>
      expect(hoisted.leaflet!.tileLayers[0].setUrl).toHaveBeenCalledWith(
        cartoTiles(true).url,
      ),
    );
    expect(mapInstance.remove).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.maps).toHaveLength(1);
  });

  it("still plots its pins after init (the ready-flag path)", async () => {
    render(globeElement());
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
  });

  it("recolours markers in place (setIcon) when the theme flips, preserving the selected marker's lift+ring", async () => {
    const { rerender } = render(globeElement("m1"));
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    const mapInstance = hoisted.leaflet!.maps[0];
    const [selectedMarker, plainMarker] = hoisted.leaflet!.markers;

    // Light-mode fills baked in at creation time (sky/sun hues), and m1's
    // selected lift+ring (pinHtml's `selected: true` styling).
    expect(iconHtml(selectedMarker)).toContain("#8AD6F5");
    expect(iconHtml(selectedMarker)).toContain("scale(1.15)");
    expect(iconHtml(plainMarker)).toContain("#FFD166");
    expect(iconHtml(plainMarker)).not.toContain("scale(1.15)");

    hoisted.theme = "dark";
    rerender(globeElement("m1"));

    await waitFor(() => expect(selectedMarker.setIcon).toHaveBeenCalled());
    await waitFor(() => expect(plainMarker.setIcon).toHaveBeenCalled());

    // Dark-mode fills, and the selected marker's lift+ring survives the
    // recolour -- a naive setIcon could drop it back to the plain icon.
    expect(selectedMarker.setIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("#8CC0D6"),
      }),
    );
    expect(selectedMarker.setIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("scale(1.15)"),
      }),
    );
    expect(plainMarker.setIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({ html: expect.stringContaining("#E6C57A") }),
    );

    // Recoloured in place: no map rebuild, no new markers created, no popup
    // silently closed by a remove-and-recreate.
    expect(mapInstance.remove).not.toHaveBeenCalled();
    expect(hoisted.leaflet!.markers).toHaveLength(2);
    expect(selectedMarker.remove).not.toHaveBeenCalled();
    expect(plainMarker.remove).not.toHaveBeenCalled();
  });
});
