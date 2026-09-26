import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { cartoTiles } from "@/lib/map-tiles";
import { pinHtml } from "@/lib/map-pins";
import { stopHex } from "@/lib/stop-colours";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { RouteMap, routeFitPoints } from "./route-map";

const STOPS = [
  { id: "s1", name: "Tokyo", lat: 35.68, lng: 139.76, arriveDate: "2026-01-01", departDate: "2026-01-04", sortOrder: 0 },
  { id: "s2", name: "Kyoto", lat: 35.01, lng: 135.77, arriveDate: "2026-01-04", departDate: "2026-01-07", sortOrder: 1 },
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

describe("routeFitPoints (LA-042)", () => {
  it("fits the map to the stops, not the far-away home marker", () => {
    const stops = [{ lat: 48.1, lng: 11.5 }, { lat: 51.5, lng: -0.1 }];
    const home = { lat: -27.5, lng: 153.0 };
    expect(routeFitPoints(stops, home)).toEqual(stops);
  });

  it("includes home when there are fewer than two located stops", () => {
    const home = { lat: -27.5, lng: 153.0 };
    expect(routeFitPoints([{ lat: 48.1, lng: 11.5 }], home)).toHaveLength(2);
  });

  it("returns just home when there are no located stops at all", () => {
    const home = { lat: -27.5, lng: 153.0 };
    expect(routeFitPoints([], home)).toEqual([home]);
  });

  it("returns just the stops when there is no home", () => {
    const stops = [{ lat: 48.1, lng: 11.5 }, { lat: 51.5, lng: -0.1 }];
    expect(routeFitPoints(stops, null)).toEqual(stops);
  });
});

describe("RouteMap theme handling", () => {
  it("builds the map once with the light tiles", async () => {
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("builds the map with the dark tiles when mounted in dark mode", async () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(true).url);
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

  it("renders the text fallback, not a map, with fewer than two located stops", async () => {
    render(<RouteMap stops={[STOPS[0]]} />);

    expect(
      screen.getByText("Add coordinates to your stops to see the route map."),
    ).toBeInTheDocument();

    // Map construction happens inside `import("leaflet").then(...)`, so
    // `maps` reads 0 synchronously after ANY render — including one that IS
    // building a map, just asynchronously. Flush microtasks so a pending
    // `import(...).then(...)` chain would have had the chance to run and
    // push into `maps` by now. Without this, the assertion below can't tell
    // "no map was built" apart from "map not built yet".
    await new Promise((resolve) => setTimeout(resolve, 0));

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

describe("RouteMap kit frame", () => {
  it("draws its own kit frame (2px outline, hard shadow) — callers must not wrap it in a Card", async () => {
    render(<RouteMap stops={STOPS} />);
    // Let the async map build finish inside this test, so its pending
    // import("leaflet") can't resolve against the next test's fresh mock.
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const frame = screen.getByLabelText("Trip route map");
    expect(frame.className).toMatch(/\bborder-2\b/);
    expect(frame.className).toMatch(/\bshadow-hard-2\b/);
    expect(frame.className).not.toMatch(/\bshadow-soft\b/);
    expect(frame.className.split(/\s+/)).not.toContain("border");
    // .tp-map opts into the kit zoom control (globals.css), as the Globe does.
    expect(frame.className.split(/\s+/)).toContain("tp-map");
  });

  it("the no-coordinates fallback is a dashed kit frame", () => {
    const { container } = render(<RouteMap stops={[{ ...STOPS[0], lat: null, lng: null }]} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/\bborder-2\b/);
    expect(frame.className).toMatch(/\bborder-dashed\b/);
    expect(frame.className.split(/\s+/)).not.toContain("border");
  });
});

describe("RouteMap kit pins and popups", () => {
  const HEX = /#[0-9a-f]{3,8}\b/i;
  const EMOJI = /\p{Extended_Pictographic}/u;
  const iconHtml = (m: { options: Record<string, unknown> }) =>
    (m.options.icon as { html: string }).html;
  const popup = (m: { bindPopup: ReturnType<typeof vi.fn> }) =>
    m.bindPopup.mock.calls[0] as [string, { className?: string } | undefined];

  const CHAPTERED = [
    { ...STOPS[0], chapterName: "Japan" },
    STOPS[1],
  ];
  const HOME = { name: "Sydney", lat: -33.87, lng: 151.21 };

  it("uses the shared pinHtml stop pin, numbered, in the Stop's own colour (as the calendar)", async () => {
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    const [first, second] = hoisted.leaflet!.markers;
    expect(iconHtml(first)).toBe(pinHtml({ variant: "stop", fill: stopHex(0), label: "1", dark: false }));
    expect(iconHtml(second)).toBe(pinHtml({ variant: "stop", fill: stopHex(1), label: "2", dark: false }));
    expect(iconHtml(second)).not.toMatch(/221,\s*83%/);
  });

  it("uses the dark stop hex in dark mode", async () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    expect(iconHtml(hoisted.leaflet!.markers[0])).toBe(
      pinHtml({ variant: "stop", fill: stopHex(0, true), label: "1", dark: true }),
    );
  });

  it("colours each route line by its destination Stop", async () => {
    render(<RouteMap stops={CHAPTERED} />);
    await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThan(0));
    expect(String(hoisted.leaflet!.polylines[0].options.color)).toBe(stopHex(1));
  });

  it("the home pin is the pinHtml home variant — no emoji", async () => {
    render(<RouteMap stops={STOPS} home={HOME} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(3));
    const home = hoisted.leaflet!.markers[2];
    expect(iconHtml(home)).toBe(pinHtml({ variant: "home", label: "H", dark: false }));
    for (const m of hoisted.leaflet!.markers) expect(iconHtml(m)).not.toMatch(EMOJI);
  });

  it("recolours pins in place when the theme flips", async () => {
    const { rerender } = render(<RouteMap stops={CHAPTERED} home={HOME} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(3));
    hoisted.theme = "dark";
    rerender(<RouteMap stops={CHAPTERED} home={HOME} />);
    const [first, , home] = hoisted.leaflet!.markers;
    await waitFor(() =>
      expect(first.setIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          html: pinHtml({ variant: "stop", fill: stopHex(0, true), label: "1", dark: true }),
        }),
      ),
    );
    expect(home.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({ html: pinHtml({ variant: "home", label: "H", dark: true }) }),
    );
    expect(hoisted.leaflet!.maps).toHaveLength(1);
  });

  it("binds every popup to the kit shell with token classes, no hex", async () => {
    render(<RouteMap stops={CHAPTERED} home={HOME} />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(3));
    for (const m of hoisted.leaflet!.markers) {
      const [html, opts] = popup(m);
      expect(opts).toEqual({ className: "tp-map-popup" });
      expect(html).not.toMatch(HEX);
      expect(html).not.toMatch(/style=/);
      expect(html).not.toMatch(EMOJI);
    }
    expect(popup(hoisted.leaflet!.markers[0])[0]).toMatch(/text-muted-foreground/);
    expect(popup(hoisted.leaflet!.markers[2])[0]).toContain("Home base");
  });

  it("route lines carry no raw hex or old blue default", async () => {
    render(<RouteMap stops={CHAPTERED} home={HOME} showReturn />);
    await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThan(0));
    for (const pl of hoisted.leaflet!.polylines) {
      expect(String(pl.options.color)).not.toMatch(/374151|221,\s*83%/);
    }
  });
});
