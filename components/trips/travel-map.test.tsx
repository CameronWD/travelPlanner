import { describe, expect, it, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { hueHex } from "@/lib/map/palette";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));
vi.mock("@/components/ui/theme-provider", () => ({ useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/trips", useSearchParams: () => new URLSearchParams() }));

import { TravelMap, type TravelMapTrip } from "./travel-map";

const europe: TravelMapTrip = { id: "t1", name: "Europe", hue: "coral", when: "upcoming", points: [{ lat: 51.5, lng: -0.12, name: "London" }, { lat: 41.9, lng: 12.5, name: "Rome" }] };
const nz: TravelMapTrip = { id: "t2", name: "NZ", hue: "leaf", when: "past", points: [{ lat: -45, lng: 168.7, name: "Queenstown" }] };

const pinHtmls = () => screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);

beforeEach(() => {
  mock.reset();
  hoisted.theme = "light";
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
});

describe("TravelMap", () => {
  it("draws a 20px pin per point in the trip colour and a dashed ink geodesic line per trip", () => {
    render(<TravelMap trips={[europe, nz]} filterTripId={null} variant="desktop" />);
    const html = pinHtmls();
    expect(html).toHaveLength(3);
    expect(html[0]).toContain(hueHex("coral"));
    expect(html[0]).toContain("width:20px");
    expect(html[0]).toContain("2px 2px 0");
    expect(html[2]).toContain(hueHex("leaf"));
    expect(mock.recorded.polylines).toHaveLength(1);
    const line = mock.recorded.polylines[0];
    const options = line.setOptions.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(options).toMatchObject({ geodesic: true, strokeWeight: 1.5, strokeOpacity: 0 });
    expect(options.icons).toHaveLength(1);
    expect(options.path).toEqual([{ lat: 51.5, lng: -0.12 }, { lat: 41.9, lng: 12.5 }]);
  });

  it("fits bounds to the filtered trip only, with 40px padding", () => {
    render(<TravelMap trips={[europe, nz]} filterTripId="t1" variant="desktop" />);
    const [bounds, padding] = mock.map.fitBounds.mock.calls.at(-1)!;
    expect(padding).toBe(40);
    expect(JSON.stringify(bounds)).toContain("12.5");
    expect(JSON.stringify(bounds)).not.toContain("168.7");
  });

  it("a single filtered point sits at a sane zoom", () => {
    render(<TravelMap trips={[europe, nz]} filterTripId="t2" variant="desktop" />);
    expect(mock.map.setCenter).toHaveBeenCalledWith({ lat: -45, lng: 168.7 });
    expect(mock.map.setZoom).toHaveBeenCalledWith(12);
  });

  it("keeps the zoom control and drops scroll-wheel hijack", () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" />);
    expect(mock.recorded.map.at(-1)).toMatchObject({ disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", minZoom: 1 });
  });

  it("labels the map region", () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" />);
    expect(screen.getByRole("region", { name: "Your travels map" })).toBeInTheDocument();
  });

  it("mobile uses 14px pins with no shadow", () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="mobile" />);
    const html = pinHtmls();
    expect(html).toHaveLength(2);
    expect(html[0]).toContain("width:14px");
    expect(html[0]).toContain("box-shadow:none");
  });

  it("with no trips shows the world", () => {
    render(<TravelMap trips={[]} filterTripId={null} variant="desktop" />);
    expect(mock.map.setCenter).toHaveBeenCalledWith({ lat: 20, lng: 0 });
    expect(mock.map.setZoom).toHaveBeenCalledWith(1);
  });

  it("a theme flip remounts the map and recolours pins but does not re-fit twice for the same data", () => {
    const { rerender } = render(<TravelMap trips={[europe, nz]} filterTripId={null} variant="desktop" />);
    expect(mock.recorded.mapMounts).toBe(1);
    hoisted.theme = "dark";
    rerender(<TravelMap trips={[europe, nz]} filterTripId={null} variant="desktop" />);
    expect(mock.recorded.mapMounts).toBe(2);
    expect(pinHtmls()[0]).toContain(hueHex("coral", true));
  });

  it("survives Strict Mode without onFail", () => {
    const onFail = vi.fn();
    render(
      <React.StrictMode>
        <TravelMap trips={[europe]} filterTripId={null} variant="desktop" onFail={onFail} />
      </React.StrictMode>,
    );
    expect(onFail).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });

  it("calls onFail when Google refuses the key", () => {
    mock.status.current = "AUTH_FAILURE";
    const onFail = vi.fn();
    render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" onFail={onFail} />);
    expect(onFail).toHaveBeenCalled();
  });

  it("calls onFail and renders nothing when there is no key", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    const onFail = vi.fn();
    const { container } = render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" onFail={onFail} />);
    expect(onFail).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
