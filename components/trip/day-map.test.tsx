import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildDayMapModel, type DayMapModel } from "@/lib/day-map";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { DayMap } from "./day-map";

const MODEL: DayMapModel = {
  points: [
    { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
    { kind: "item", id: "i2", lat: 35.66, lng: 139.75, label: "Shibuya", order: 2 },
    { kind: "accommodation", id: "a1", lat: 35.69, lng: 139.7, label: "Hotel" },
    { kind: "transport-dep", id: "t1", lat: 35.55, lng: 139.6, label: "Station" },
  ],
  routePoints: [
    { kind: "accommodation", id: "a1", lat: 35.69, lng: 139.7, label: "Hotel" },
    { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
  ],
  perItemPrev: {
    i2: { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
  },
};

const pinHtmls = () => screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);

beforeEach(() => {
  mock.reset();
  hoisted.theme = "light";
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
});

describe("DayMap pins", () => {
  it("draws one pin per point with the item, accommodation and transport fills", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    const html = pinHtmls();
    expect(html).toHaveLength(4);
    expect(html[0]).toContain("#8AD6F5");
    expect(html[0]).toContain(">1<");
    expect(html[1]).toContain(">2<");
    expect(html[2]).toContain("#1D1D1B");
    expect(html[2]).toContain("#FFFBF3");
    expect(html[2]).toContain(">H<");
    expect(html[3]).toContain("#C7A2FF");
    expect(html[3]).toContain(">T<");
  });

  it("recolours the pins and remounts the map when the theme flips", () => {
    const { rerender } = render(<DayMap tripId="t1" model={MODEL} />);
    expect(mock.recorded.mapMounts).toBe(1);
    hoisted.theme = "dark";
    rerender(<DayMap tripId="t1" model={MODEL} />);
    const html = pinHtmls();
    expect(html[0]).toContain("#8CC0D6");
    expect(html[2]).toContain("#EDE6D8");
    expect(html[3]).toContain("#B5A0E2");
    expect(mock.recorded.mapMounts).toBe(2);
  });

  it("draws the route as one dashed line through the route points", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    expect(mock.recorded.polylines).toHaveLength(1);
    expect(mock.recorded.polylines[0].options.path).toEqual([
      { lat: 35.69, lng: 139.7 },
      { lat: 35.65, lng: 139.74 },
    ]);
  });

  it("draws no line with fewer than two route points", () => {
    render(<DayMap tripId="t1" model={{ ...MODEL, routePoints: [MODEL.routePoints[0]] }} />);
    expect(mock.recorded.polylines).toHaveLength(0);
  });

  it("fits the map to every point", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    expect(mock.map.fitBounds).toHaveBeenCalled();
  });

  it("renders nothing without points", () => {
    const { container } = render(<DayMap tripId="t1" model={{ points: [], routePoints: [], perItemPrev: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the route buttons when there are two route points", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    expect(screen.getByText("Open today’s route in")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Maps" })).toBeInTheDocument();
  });

  it("labels and sizes the frame itself", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    const frame = screen.getByRole("region", { name: "Day route map for trip t1" });
    expect(frame).toContainElement(screen.getByTestId("gmap"));
    expect(frame.style.height).toBe("360px");
  });
});

describe("DayMap popups", () => {
  it("opens a pin's popup with Open in Maps and Directions from previous", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByTestId("marker")[1]);
    const popup = screen.getByRole("dialog");
    expect(popup).toHaveTextContent("Shibuya");
    expect(popup.querySelectorAll("a[href*='google']").length).toBeGreaterThan(0);
    expect(popup).toHaveTextContent("Google Maps");
    expect(popup).toHaveTextContent("Apple Maps");
    expect(popup).toHaveTextContent("Directions from previous");
  });

  it("Directions from previous leave from where the previous thing ends", () => {
    const walk = { id: "w", title: "River walk", lat: 51.5055, lng: -0.0754, endLat: 51.5008, endLng: -0.122, startTime: "10:00", sortOrder: 0 };
    const lunch = { id: "l", title: "Lunch", lat: 51.5007, lng: -0.1246, startTime: "12:00", sortOrder: 1 };
    render(<DayMap tripId="t1" model={buildDayMapModel({ date: "2026-01-02", items: [walk, lunch], transports: [] })} />);
    fireEvent.click(screen.getAllByTestId("marker").at(-1)!);
    const hrefs = [...screen.getByRole("dialog").querySelectorAll("a")].map((a) => a.getAttribute("href")!).filter((h) => h.includes("/dir/"));
    expect(hrefs.map((h) => new URL(h).searchParams.get("origin"))).toEqual(["51.5008,-0.122"]);
  });

  it("omits Directions from previous on a point with no previous item", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    fireEvent.click(screen.getAllByTestId("marker")[0]);
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Directions from previous");
  });
});

describe("DayMap when Google is unavailable", () => {
  it("lists the day's points with Open in Maps links when the map is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const { container } = render(<DayMap tripId="t1" model={MODEL} />);
    expect(screen.queryByTestId("gmap")).toBeNull();
    expect(container.querySelector("[data-map-fallback]")).not.toBeNull();
    expect(screen.getByText("The map isn’t available right now.")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Tokyo Tower");
    expect(items[2]).toHaveTextContent("Hotel");
    expect(items[0].querySelector("a[href]")).not.toBeNull();
  });
});

describe("DayMap route hops", () => {
  const withHops = (hops: NonNullable<DayMapModel["hops"]>): DayMapModel => ({
    ...MODEL,
    routePoints: [
      { kind: "accommodation", id: "a1", lat: 35.69, lng: 139.7, label: "Hotel" },
      { kind: "item", id: "i1", lat: 35.65, lng: 139.74, label: "Tokyo Tower", order: 1 },
      { kind: "item", id: "i2", lat: 35.66, lng: 139.75, label: "Shibuya", order: 2 },
      { kind: "item", id: "i3", lat: 35.67, lng: 139.76, label: "Ueno", order: 3 },
    ],
    hops,
  });
  const ENCODED = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

  it("draws solid decoded lines for real hops and dashed straight for the rest, bed segment dashed", () => {
    render(<DayMap tripId="t1" model={withHops([
      { fromId: "i1", toId: "i2", polyline: ENCODED, estimated: false },
      { fromId: "i2", toId: "i3", polyline: null, estimated: true },
    ])} />);
    const opts = mock.recorded.polylines.map((p) => p.options);
    expect(opts).toHaveLength(3);
    expect(opts[0].strokeOpacity).toBe(0);
    expect(opts[0].path).toEqual([{ lat: 35.69, lng: 139.7 }, { lat: 35.65, lng: 139.74 }]);
    expect(opts[1].path).toHaveLength(3);
    expect(opts[1].strokeOpacity).toBeGreaterThan(0);
    expect(opts[1].icons).toEqual([]);
    expect(opts[2].strokeOpacity).toBe(0);
    expect(opts[2].path).toEqual([{ lat: 35.66, lng: 139.75 }, { lat: 35.67, lng: 139.76 }]);
  });
});

describe("DayMap fill", () => {
  it("puts the route buttons under the map instead of above it", () => {
    const withRoute = { ...MODEL, routePoints: MODEL.points.slice(0, 2) };
    const { container, rerender } = render(<DayMap tripId="t1" model={withRoute} />);
    const links = () => screen.getByText("Open today’s route in");
    const map = () => screen.getByRole("region");
    expect(links().compareDocumentPosition(map()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<DayMap tripId="t1" model={withRoute} fill />);
    expect(map().compareDocumentPosition(links()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.firstElementChild?.className).toMatch(/flex-1/);
  });
});

describe("DayMap Ends at", () => {
  const WALK = { kind: "item" as const, id: "w", lat: 35.65, lng: 139.74, label: "River walk", order: 1, category: "ACTIVITY", end: { lat: 35.67, lng: 139.76 } };
  const NEXT = { kind: "item" as const, id: "n", lat: 35.7, lng: 139.8, label: "Dinner", order: 2 };
  const model = (walk: typeof WALK & { routePolyline?: string | null }): DayMapModel => ({
    points: [walk, NEXT],
    routePoints: [walk, NEXT],
    perItemPrev: {},
    hops: [{ fromId: "w", toId: "n", polyline: null, estimated: true }],
  });

  it("draws a smaller second pin at the end", () => {
    render(<DayMap tripId="t1" model={model(WALK)} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
  });

  it("draws the walk as a thick solid line in the Category colour along its stored route", () => {
    render(<DayMap tripId="t1" model={model({ ...WALK, routePolyline: "_p~iF~ps|U_ulLnnqC" })} />);
    const walk = mock.recorded.polylines.map((p) => p.options).find((o) => o.strokeWeight === 6)!;
    expect(walk.strokeColor).toBe("#A6D96A");
    expect(walk.strokeOpacity).toBe(0.95);
    expect(walk.icons).toEqual([]);
    expect((walk.path as unknown[]).length).toBe(2);
  });

  it("stands in a straight dashed segment until the route arrives", () => {
    render(<DayMap tripId="t1" model={model(WALK)} />);
    const walk = mock.recorded.polylines.map((p) => p.options).find((o) => o.strokeWeight === 6)!;
    expect(walk.path).toEqual([{ lat: 35.65, lng: 139.74 }, { lat: 35.67, lng: 139.76 }]);
    expect(walk.strokeOpacity).toBe(0);
  });

  it("starts the straight hop out of it at the end pin", () => {
    render(<DayMap tripId="t1" model={model(WALK)} />);
    const hop = mock.recorded.polylines.map((p) => p.options).find((o) => o.strokeWeight === 3)!;
    expect(hop.path).toEqual([{ lat: 35.67, lng: 139.76 }, { lat: 35.7, lng: 139.8 }]);
  });

  it("draws no second pin or walk for an Item with no end", () => {
    render(<DayMap tripId="t1" model={model({ ...WALK, end: null } as never)} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(mock.recorded.polylines.map((p) => p.options).some((o) => o.strokeWeight === 6)).toBe(false);
  });
});
