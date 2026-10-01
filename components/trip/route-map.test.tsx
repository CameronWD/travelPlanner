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

import { RouteMap, routeFitPoints, travelledLegCount } from "./route-map";

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

  it("a theme=\"light\" override builds with the light tiles even in dark mode (spec 2026-10-01 §A)", async () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={STOPS} theme="light" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].url).toBe(cartoTiles(false).url);
  });

  it("a theme=\"light\" override holds when the app theme flips while mounted (Review Focus 5)", async () => {
    const { rerender } = render(<RouteMap stops={STOPS} theme="light" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    hoisted.theme = "dark";
    rerender(<RouteMap stops={STOPS} theme="light" />);
    // Give the setUrl effect a tick to run if it were going to.
    await new Promise((r) => setTimeout(r, 0));
    expect(hoisted.leaflet!.tileLayers[0].setUrl).not.toHaveBeenCalledWith(cartoTiles(true).url);
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

  it("pops only a newly added stop's pin on the rebuild (MOTION.md P11)", async () => {
    const { rerender } = render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const html = (i: number) => (hoisted.leaflet!.markers[i].options.icon as { html: string }).html;
    // The first build is the page's own entrance, not an addition.
    expect(html(0)).not.toContain("tp-pop");
    expect(html(1)).not.toContain("tp-pop");

    const FLORENCE = { id: "s3", name: "Florence", lat: 43.77, lng: 11.25, arriveDate: "2026-01-07", departDate: "2026-01-09", sortOrder: 2 };
    rerender(<RouteMap stops={[...STOPS, FLORENCE]} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(2));
    // Popped on an inner wrapper: Leaflet positions the icon element itself with a transform.
    expect(html(2)).not.toContain("tp-pop");
    expect(html(3)).not.toContain("tp-pop");
    expect(html(4)).toContain('class="tp-pop"');
  });
});

describe("RouteMap bounded world (feedback cmuhsyae2000004l0d19tlzr2)", () => {
  it("bounds the map so a wide, zoomed-out tile can't repeat the world", async () => {
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].options).toMatchObject({
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      minZoom: 1,
    });
  });

  it("sets noWrap on the tile layer so tiles don't repeat horizontally", async () => {
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.tileLayers[0].options).toMatchObject({ noWrap: true });
  });

  it("clamps the zoom up to 1 when fitBounds leaves it below the minimum", async () => {
    hoisted.leaflet!.setNextMapZoom(0);
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].setZoom).toHaveBeenCalledWith(1);
  });

  it("leaves the zoom alone when fitBounds already leaves it at or above the minimum", async () => {
    render(<RouteMap stops={STOPS} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].setZoom).not.toHaveBeenCalled();
  });

  it("renders a 16/9 aspect ratio instead of a fixed height when aspect is given", async () => {
    render(<RouteMap stops={STOPS} aspect="16/9" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const frame = screen.getByLabelText("Trip route map");
    expect(frame.style.aspectRatio).toBe("16 / 9");
    expect(frame.style.height).toBe("");
  });

  it("renders a 4/3 aspect ratio instead of a fixed height when aspect is given", async () => {
    render(<RouteMap stops={STOPS} aspect="4/3" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const frame = screen.getByLabelText("Trip route map");
    expect(frame.style.aspectRatio).toBe("4 / 3");
    expect(frame.style.height).toBe("");
  });

  it("still renders a fixed height when aspect is not given", async () => {
    render(<RouteMap stops={STOPS} height={200} />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const frame = screen.getByLabelText("Trip route map");
    expect(frame.style.height).toBe("200px");
    expect(frame.style.aspectRatio).toBe("");
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

describe("RouteMap onStopClick (Task 15 — Jump list / mini map pin jumps)", () => {
  it("calls onStopClick with the stop id when its pin is clicked", async () => {
    const onStopClick = vi.fn();
    render(<RouteMap stops={STOPS} onStopClick={onStopClick} />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThan(0));
    const click = hoisted.leaflet!.markers[0].on.mock.calls.find((c: unknown[]) => c[0] === "click")![1] as () => void;
    click();
    expect(onStopClick).toHaveBeenCalledWith("s1");
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

describe("travelledLegCount (SHARE.md §5)", () => {
  const ids = ["a", "b", "c", "d"];
  it("before (or no progress): nothing travelled", () => {
    expect(travelledLegCount(ids, undefined)).toBe(0);
    expect(travelledLegCount(ids, { stage: "before" })).toBe(0);
  });
  it("during: legs into the current stop are travelled", () => {
    expect(travelledLegCount(ids, { stage: "during", currentStopId: "c" })).toBe(2);
    expect(travelledLegCount(ids, { stage: "during", currentStopId: null })).toBe(0);
  });
  it("after: every leg", () => {
    expect(travelledLegCount(ids, { stage: "after" })).toBe(3);
  });
});

const THREE = [
  ...STOPS,
  { id: "s3", name: "Osaka", lat: 34.69, lng: 135.5, arriveDate: "2026-01-07", departDate: "2026-01-09", sortOrder: 2 },
];

it("draws travelled legs solid and the rest dashed during the trip", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
  await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
  const [first, second] = hoisted.leaflet!.polylines;
  expect(first.options.dashArray).toBeUndefined();
  expect(second.options.dashArray).toBe("6 4");
});

it("marks the current stop with a bigger haloed pin and a They're here tag", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
  await waitFor(() => expect(hoisted.leaflet!.markers.length).toBe(3));
  const htmls = hoisted.leaflet!.L.divIcon.mock.calls.map((c) => (c[0] as { html: string }).html);
  expect(htmls.filter((h) => h.includes("They're here"))).toHaveLength(1);
  expect(htmls.find((h) => h.includes("They're here"))).toContain("shadow-[0_0_0_6px_hsl(var(--coral)/0.35)]");
});

describe("share motion (MOTION.md S5)", () => {
  const html = (h: string) => h.includes("They're here");
  const divIconHtmls = () => hoisted.leaflet!.L.divIcon.mock.calls.map((c) => (c[0] as { html: string }).html);

  it("during: travelled legs draw in; the rest stay dashed with no draw", async () => {
    render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
    const [first, second] = hoisted.leaflet!.polylines;
    expect(first.options.className).toBe("tp-leg-draw");
    expect(second.options.className).toBeUndefined();
  });

  it("after: legs are solid but don't draw in", async () => {
    render(<RouteMap stops={THREE} progress={{ stage: "after" }} />);
    await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
    expect(hoisted.leaflet!.polylines.every((p) => p.options.className === undefined)).toBe(true);
  });

  it("during: the here pin pops and its tag drops in after it", async () => {
    render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBe(3));
    const here = divIconHtmls().find(html)!;
    expect(here).toContain("tp-pin-pop");
    expect(here).toContain("tp-tag-drop");
  });

  it("a theme flip redraws the here pin without replaying its entrance", async () => {
    const { rerender } = render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBe(3));
    hoisted.theme = "dark";
    rerender(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    const here = hoisted.leaflet!.markers[1];
    await waitFor(() => expect(here.setIcon).toHaveBeenCalled());
    const redrawn = (here.setIcon.mock.calls.at(-1)![0] as { html: string }).html;
    expect(redrawn).toContain("They're here");
    expect(redrawn).not.toMatch(/tp-pin-pop|tp-tag-drop/);
  });
});

it("draws every leg solid after the trip, with no tag", async () => {
  render(<RouteMap stops={THREE} progress={{ stage: "after" }} />);
  await waitFor(() => expect(hoisted.leaflet!.polylines.length).toBeGreaterThanOrEqual(2));
  expect(hoisted.leaflet!.polylines.every((p) => p.options.dashArray === undefined)).toBe(true);
  const htmls = hoisted.leaflet!.L.divIcon.mock.calls.map((c) => (c[0] as { html: string }).html);
  expect(htmls.some((h) => h.includes("They're here"))).toBe(false);
});

it("frameClassName replaces the default frame and the fixed height", async () => {
  render(<RouteMap stops={STOPS} frameClassName="h-[200px] lg:h-[400px] rounded-3xl shadow-hard-4" />);
  const frame = await screen.findByLabelText("Trip route map");
  expect(frame.className).toMatch(/rounded-3xl/);
  expect(frame.className).not.toMatch(/rounded-lg|shadow-hard-2|shadow-soft/);
  expect(frame.getAttribute("style") ?? "").not.toMatch(/height/);
});
