import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { pinHtml } from "@/lib/map/pins";
import { stopHex } from "@/lib/stop-colours";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { RouteMap, routeFitPoints, travelledLegCount } from "./route-map";

const STOPS = [
  { id: "s1", name: "Tokyo", lat: 35.68, lng: 139.76, arriveDate: "2026-01-01", departDate: "2026-01-04", sortOrder: 0 },
  { id: "s2", name: "Kyoto", lat: 35.01, lng: 135.77, arriveDate: "2026-01-04", departDate: "2026-01-07", sortOrder: 1 },
];

const THREE = [
  ...STOPS,
  { id: "s3", name: "Osaka", lat: 34.69, lng: 135.5, arriveDate: "2026-01-07", departDate: "2026-01-09", sortOrder: 2 },
];

const CHAPTERED = [{ ...STOPS[0], chapterName: "Japan" }, STOPS[1]];
const HOME = { name: "Sydney", lat: -33.87, lng: 151.21 };
const EMOJI = /\p{Extended_Pictographic}/u;

const pinHtmls = () => screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);
const lines = () => mock.recorded.polylines.map((p) => p.options);

beforeEach(() => {
  mock.reset();
  hoisted.theme = "light";
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
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

describe("RouteMap on Google", () => {
  it("shows the stop list under the unavailable copy when there is no maps config", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const { container } = render(<RouteMap stops={STOPS} />);
    expect(screen.getByText("The map isn't available right now.")).toBeInTheDocument();
    expect(container.querySelector("[data-map-fallback]")).not.toBeNull();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Kyoto")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).toBeNull();
  });

  it("renders the text fallback, not a map, with fewer than two located stops", () => {
    render(<RouteMap stops={[STOPS[0]]} />);
    const copy = screen.getByText("Add coordinates to your stops to see the route map.");
    expect(copy.closest("[data-map-fallback]")).not.toBeNull();
    expect(screen.queryByTestId("gmap")).toBeNull();
  });

  it("the no-coordinates fallback is a dashed kit frame", () => {
    const { container } = render(<RouteMap stops={[{ ...STOPS[0], lat: null, lng: null }]} />);
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/\bborder-2\b/);
    expect(frame.className).toMatch(/\bborder-dashed\b/);
  });

  it("draws one numbered pin per located stop", () => {
    render(<RouteMap stops={THREE} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
    expect(mock.recorded.markers.map((m) => m.position)).toEqual([
      { lat: 35.68, lng: 139.76 },
      { lat: 35.01, lng: 135.77 },
      { lat: 34.69, lng: 135.5 },
    ]);
  });

  it("uses the shared pinHtml stop pin, numbered, in the Stop's own colour", () => {
    render(<RouteMap stops={CHAPTERED} />);
    expect(pinHtmls()).toEqual([
      pinHtml({ variant: "stop", fill: stopHex(0), label: "1", dark: false }),
      pinHtml({ variant: "stop", fill: stopHex(1), label: "2", dark: false }),
    ]);
  });

  it("uses the dark stop hex in dark mode", () => {
    hoisted.theme = "dark";
    render(<RouteMap stops={CHAPTERED} />);
    expect(pinHtmls()[0]).toBe(pinHtml({ variant: "stop", fill: stopHex(0, true), label: "1", dark: true }));
    expect(mock.recorded.map.at(-1)).toMatchObject({ colorScheme: "DARK" });
  });

  it("re-renders pins dark and remounts the map when the theme flips", () => {
    const { rerender } = render(<RouteMap stops={CHAPTERED} home={HOME} />);
    expect(mock.recorded.mapMounts).toBe(1);
    hoisted.theme = "dark";
    rerender(<RouteMap stops={CHAPTERED} home={HOME} />);
    expect(mock.recorded.mapMounts).toBe(2);
    expect(pinHtmls()).toEqual([
      pinHtml({ variant: "stop", fill: stopHex(0, true), label: "1", dark: true }),
      pinHtml({ variant: "stop", fill: stopHex(1, true), label: "2", dark: true }),
      pinHtml({ variant: "home", label: "H", dark: true }),
    ]);
  });

  it("a theme=\"light\" override draws light even in dark mode, and holds when the app theme flips", () => {
    hoisted.theme = "dark";
    const { rerender } = render(<RouteMap stops={CHAPTERED} theme="light" />);
    expect(mock.recorded.map.at(-1)).toMatchObject({ colorScheme: "LIGHT" });
    expect(pinHtmls()[0]).toBe(pinHtml({ variant: "stop", fill: stopHex(0), label: "1", dark: false }));
    hoisted.theme = "light";
    rerender(<RouteMap stops={CHAPTERED} theme="light" />);
    hoisted.theme = "dark";
    rerender(<RouteMap stops={CHAPTERED} theme="light" />);
    expect(mock.recorded.mapMounts).toBe(1);
  });

  it("pops only a newly added stop's pin (MOTION.md P11)", () => {
    const { rerender } = render(<RouteMap stops={STOPS} />);
    expect(pinHtmls().join("")).not.toContain("tp-pop");
    const FLORENCE = { id: "s3", name: "Florence", lat: 43.77, lng: 11.25, arriveDate: "2026-01-07", departDate: "2026-01-09", sortOrder: 2 };
    rerender(<RouteMap stops={[...STOPS, FLORENCE]} />);
    const html = pinHtmls();
    expect(html[0]).not.toContain("tp-pop");
    expect(html[1]).not.toContain("tp-pop");
    expect(html[2]).toContain('class="tp-pop"');
  });

  it("fits the stops, not the far-away home", () => {
    render(<RouteMap stops={STOPS} home={HOME} />);
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);
    const bounds = mock.map.fitBounds.mock.calls[0][0] as { points: unknown[] };
    expect(bounds.points).toEqual([
      { lat: 35.68, lng: 139.76 },
      { lat: 35.01, lng: 135.77 },
    ]);
  });
});

describe("RouteMap sizing and frame", () => {
  const frame = () => screen.getByTestId("gmap").parentElement as HTMLElement;

  it("renders a 16/9 aspect ratio instead of a fixed height when aspect is given", () => {
    render(<RouteMap stops={STOPS} aspect="16/9" />);
    expect(frame().style.aspectRatio).toBe("16 / 9");
    expect(frame().style.height).toBe("");
  });

  it("renders a 4/3 aspect ratio instead of a fixed height when aspect is given", () => {
    render(<RouteMap stops={STOPS} aspect="4/3" />);
    expect(frame().style.aspectRatio).toBe("4 / 3");
  });

  it("renders a fixed height when aspect is not given", () => {
    render(<RouteMap stops={STOPS} height={200} />);
    expect(frame().style.height).toBe("200px");
    expect(frame().style.aspectRatio).toBe("");
  });

  it("defaults to 360px tall", () => {
    render(<RouteMap stops={STOPS} />);
    expect(frame().style.height).toBe("360px");
  });

  it("draws its own kit frame (2px outline, hard shadow)", () => {
    render(<RouteMap stops={STOPS} />);
    expect(frame().className).toMatch(/\bborder-2\b/);
    expect(frame().className).toMatch(/\bshadow-hard-2\b/);
    expect(frame().className.split(/\s+/)).not.toContain("border");
    expect(screen.getByTestId("gmap").className.split(/\s+/)).toContain("tp-map");
    expect(screen.getByRole("region", { name: "Trip route map" })).toBe(frame());
  });

  it("the element carrying frameClassName is the labelled region that contains the map, so a caller's flex-1 sizes it", () => {
    render(
      <div className="flex flex-col" data-testid="parent">
        <RouteMap stops={STOPS} frameClassName="min-h-[240px] flex-1 rounded-lg" />
      </div>,
    );
    const region = screen.getByRole("region", { name: "Trip route map" });
    expect(region.className).toMatch(/\bflex-1\b/);
    expect(region.className).toMatch(/min-h-\[240px\]/);
    expect(region.parentElement).toBe(screen.getByTestId("parent"));
    expect(region).toContainElement(screen.getByTestId("gmap"));
    expect(screen.getByTestId("gmap").parentElement).toBe(region);
  });

  it("frameClassName replaces the default frame and the fixed height", () => {
    render(<RouteMap stops={STOPS} frameClassName="h-[200px] lg:h-[400px] rounded-3xl shadow-hard-4" />);
    expect(frame().className).toMatch(/rounded-3xl/);
    expect(frame().className).not.toMatch(/rounded-lg|shadow-hard-2|shadow-soft/);
    expect(frame().getAttribute("style") ?? "").not.toMatch(/height/);
  });
});

describe("RouteMap onStopClick", () => {
  it("calls onStopClick with the stop id when its pin is clicked", () => {
    const onStopClick = vi.fn();
    render(<RouteMap stops={STOPS} onStopClick={onStopClick} />);
    fireEvent.click(screen.getAllByTestId("marker")[0]);
    expect(onStopClick).toHaveBeenCalledWith("s1");
  });

  it("opens the stop's popup with its name, chapter and dates", () => {
    render(<RouteMap stops={CHAPTERED} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByTestId("marker")[0]);
    const popup = screen.getByRole("dialog");
    expect(popup).toHaveTextContent("Tokyo");
    expect(popup).toHaveTextContent("Japan");
  });
});

describe("RouteMap kit pins and legs", () => {
  it("colours each route line by its destination Stop", () => {
    render(<RouteMap stops={CHAPTERED} />);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].strokeColor).toBe(stopHex(1));
  });

  it("draws every leg geodesic", () => {
    render(<RouteMap stops={THREE} home={HOME} showReturn />);
    expect(mock.recorded.polylines.length).toBeGreaterThan(0);
    for (const p of mock.recorded.polylines) expect(p.options.geodesic).toBe(true);
  });

  it("draws the home pin and its legs only with home", () => {
    const { unmount } = render(<RouteMap stops={STOPS} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(lines()).toHaveLength(1);
    unmount();
    mock.reset();
    render(<RouteMap stops={STOPS} home={HOME} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
    expect(pinHtmls()[2]).toBe(pinHtml({ variant: "home", label: "H", dark: false }));
    for (const h of pinHtmls()) expect(h).not.toMatch(EMOJI);
    expect(lines()).toHaveLength(2);
  });

  it("adds the return leg only with showReturn", () => {
    render(<RouteMap stops={STOPS} home={HOME} showReturn />);
    expect(lines()).toHaveLength(3);
    const last = lines()[2].path as { lat: number; lng: number }[];
    expect(last[0]).toEqual({ lat: 35.01, lng: 135.77 });
    expect(last[1]).toEqual({ lat: HOME.lat, lng: HOME.lng });
  });

  it("route lines carry no raw hex or old blue default", () => {
    render(<RouteMap stops={CHAPTERED} home={HOME} showReturn />);
    for (const l of lines()) expect(String(l.strokeColor)).not.toMatch(/374151|221,\s*83%/);
  });
});

describe("RouteMap leg draw-in (MOTION.md S5)", () => {
  const during = { stage: "during", currentStopId: "s3" } as const;
  const tip = (i: number) => (lines()[i].path as { lat: number; lng: number }[])[1];
  let raf: Array<(t: number) => void>;
  const frames = (t: number) => {
    const queued = raf;
    raf = [];
    act(() => queued.forEach((cb) => cb(t)));
  };

  beforeEach(() => {
    raf = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => raf.push(cb));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("grows a travelled leg from its start to its end over 700ms", () => {
    render(<RouteMap stops={THREE} progress={during} />);
    expect(tip(0)).toEqual({ lat: STOPS[0].lat, lng: STOPS[0].lng });
    frames(1000);
    frames(1350);
    const mid = tip(0);
    expect(mid.lng).toBeLessThan(STOPS[0].lng);
    expect(mid.lng).toBeGreaterThan(STOPS[1].lng);
    frames(1700);
    expect(tip(0)).toEqual({ lat: STOPS[1].lat, lng: STOPS[1].lng });
    expect(raf).toHaveLength(0);
  });

  it("draws the untravelled legs whole from the start", () => {
    render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    expect(tip(1)).toEqual({ lat: THREE[2].lat, lng: THREE[2].lng });
  });

  it("does not draw in after the trip", () => {
    render(<RouteMap stops={THREE} progress={{ stage: "after" }} />);
    expect(tip(0)).toEqual({ lat: STOPS[1].lat, lng: STOPS[1].lng });
    expect(raf).toHaveLength(0);
  });

  it("is full immediately under reduced motion", () => {
    setMatchMedia((q) => q.includes("prefers-reduced-motion"));
    render(<RouteMap stops={THREE} progress={during} />);
    expect(tip(0)).toEqual({ lat: STOPS[1].lat, lng: STOPS[1].lng });
    expect(raf).toHaveLength(0);
  });

  it("does not replay on a theme flip", () => {
    const { rerender } = render(<RouteMap stops={THREE} progress={during} />);
    frames(1000);
    frames(1800);
    hoisted.theme = "dark";
    rerender(<RouteMap stops={THREE} progress={during} />);
    expect(tip(0)).toEqual({ lat: STOPS[1].lat, lng: STOPS[1].lng });
  });
});

describe("RouteMap progress (SHARE.md §5)", () => {
  it("draws travelled legs solid and the rest dashed during the trip", () => {
    render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    const [first, second] = lines();
    expect(first.icons).toEqual([]);
    expect(second.icons).not.toEqual([]);
  });

  it("marks the current stop with a bigger haloed pin and a They're here tag", () => {
    render(<RouteMap stops={THREE} progress={{ stage: "during", currentStopId: "s2" }} />);
    const here = pinHtmls().filter((h) => h.includes("They're here"));
    expect(here).toHaveLength(1);
    expect(here[0]).toContain("shadow-[0_0_0_6px_hsl(var(--coral)/0.35)]");
    expect(here[0]).toContain("tp-pin-pop");
    expect(here[0]).toContain("tp-tag-drop");
  });

  it("entrances play once: a dark, light, dark flip never replays them, and a stop added later pops once", () => {
    const during = { stage: "during", currentStopId: "s2" } as const;
    const { rerender } = render(<RouteMap stops={THREE} progress={during} />);
    const entrance = /tp-pin-pop|tp-tag-drop|tp-pop/;
    expect(pinHtmls().find((h) => h.includes("They're here"))).toMatch(entrance);
    for (const theme of ["dark", "light", "dark"] as const) {
      hoisted.theme = theme;
      rerender(<RouteMap stops={THREE} progress={during} />);
      expect(pinHtmls().filter((h) => entrance.test(h))).toEqual([]);
    }
    const FLORENCE = { id: "s4", name: "Florence", lat: 43.77, lng: 11.25, arriveDate: "2026-01-09", departDate: "2026-01-11", sortOrder: 3 };
    rerender(<RouteMap stops={[...THREE, FLORENCE]} progress={during} />);
    expect(pinHtmls()[3]).toContain('class="tp-pop"');
    hoisted.theme = "light";
    rerender(<RouteMap stops={[...THREE, FLORENCE]} progress={during} />);
    expect(pinHtmls().filter((h) => entrance.test(h))).toEqual([]);
  });

  it("draws every leg solid after the trip, with no tag", () => {
    render(<RouteMap stops={THREE} progress={{ stage: "after" }} />);
    expect(lines().every((l) => (l.icons as unknown[]).length === 0)).toBe(true);
    expect(pinHtmls().some((h) => h.includes("They're here"))).toBe(false);
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

describe("RouteMap legPaths", () => {
  const ENCODED = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

  it("draws a leg with a path solid and in full, and keeps the other legs straight", () => {
    setMatchMedia(false);
    render(<RouteMap stops={THREE} legPaths={{ "s1>s2": ENCODED }} progress={{ stage: "during", currentStopId: "s2" }} />);
    const [road, straight] = lines();
    expect(lines()).toHaveLength(2);
    expect(road.path).toHaveLength(3);
    expect(road.strokeOpacity).toBeGreaterThan(0);
    expect(road.geodesic).toBe(false);
    expect(road.strokeColor).toBe(stopHex(1));
    expect(straight.path).toHaveLength(2);
    expect(straight.strokeOpacity).toBe(0);
    expect(straight.geodesic).toBe(true);
  });

  it("draws a road leg not yet travelled dashed, like a straight one", () => {
    render(<RouteMap stops={THREE} legPaths={{ "s2>s3": ENCODED }} progress={{ stage: "during", currentStopId: "s2" }} />);
    const [travelled, road] = lines();
    expect(travelled.icons).toEqual([]);
    expect(road.path).toHaveLength(3);
    expect(road.strokeOpacity).toBe(0);
    expect(road.icons).not.toEqual([]);
  });

  it("ignores paths for legs it does not draw", () => {
    render(<RouteMap stops={STOPS} legPaths={{ "s2>s1": ENCODED }} />);
    expect(lines()[0].path).toHaveLength(2);
  });
});
