import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DayMapModel } from "@/lib/day-map";

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

  it("links Open today's route when there are two route points", () => {
    render(<DayMap tripId="t1" model={MODEL} />);
    expect(screen.getByText(/Open today's route/)).toBeInTheDocument();
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
    expect(screen.getByText("The map isn't available right now.")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Tokyo Tower");
    expect(items[2]).toHaveTextContent("Hotel");
    expect(items[0].querySelector("a[href]")).not.toBeNull();
  });
});
