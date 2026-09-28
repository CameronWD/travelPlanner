import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createLeafletMock } from "@/test/leaflet-mock";
import { hueHex } from "@/lib/map-palette";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  theme: "light" as "light" | "dark",
}));
vi.mock("@/components/ui/theme-provider", () => ({ useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/trips", useSearchParams: () => new URLSearchParams() }));

import { TravelMap, type TravelMapTrip } from "./travel-map";

const europe: TravelMapTrip = { id: "t1", name: "Europe", hue: "coral", when: "upcoming", points: [{ lat: 51.5, lng: -0.12, name: "London" }, { lat: 41.9, lng: 12.5, name: "Rome" }] };
const nz: TravelMapTrip = { id: "t2", name: "NZ", hue: "leaf", when: "past", points: [{ lat: -45, lng: 168.7, name: "Queenstown" }] };

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.theme = "light";
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
});

describe("TravelMap", () => {
  it("draws a 20px pin per point in the trip colour and a dashed ink line per trip, at full opacity for done trips", async () => {
    render(<TravelMap trips={[europe, nz]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(3));
    const html = String((hoisted.leaflet!.markers[0].options.icon as { html: string }).html);
    expect(html).toContain(hueHex("coral"));
    expect(html).toContain("width:20px");
    expect(hoisted.leaflet!.polylines).toHaveLength(1);
    expect(hoisted.leaflet!.polylines[0].options).toMatchObject({ dashArray: "6 5", weight: 1.5, opacity: 1 });
    expect(String((hoisted.leaflet!.markers[2].options.icon as { html: string }).html)).toContain(hueHex("leaf"));
  });
  it("fits bounds to the filtered trip only, with 40px padding", async () => {
    render(<TravelMap trips={[europe, nz]} filterTripId="t2" variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps[0].fitBounds).toHaveBeenCalled());
    const [bounds, opts] = hoisted.leaflet!.maps[0].fitBounds.mock.calls.at(-1)!;
    expect(opts).toEqual({ padding: [40, 40] });
    expect(JSON.stringify(bounds)).toContain("168.7");
    expect(JSON.stringify(bounds)).not.toContain("12.5");
  });
  it("has no zoom control and no scroll-wheel zoom", async () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].options).toMatchObject({ zoomControl: false, scrollWheelZoom: false, dragging: true, attributionControl: false });
  });
  it("mobile uses 14px pins", async () => {
    render(<TravelMap trips={[europe]} filterTripId={null} variant="mobile" />);
    await waitFor(() => expect(hoisted.leaflet!.markers).toHaveLength(2));
    expect(String((hoisted.leaflet!.markers[0].options.icon as { html: string }).html)).toContain("width:14px");
  });
  it("with no trips shows the world", async () => {
    render(<TravelMap trips={[]} filterTripId={null} variant="desktop" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    expect(hoisted.leaflet!.maps[0].setView).toHaveBeenCalledWith([20, 0], 1);
  });
});
