import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLeafletMock } from "@/test/leaflet-mock";
import type { RouteMapTileStop } from "./route-map-tile";

const hoisted = vi.hoisted(() => ({
  leaflet: null as ReturnType<typeof import("@/test/leaflet-mock").createLeafletMock> | null,
  push: vi.fn(),
}));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hoisted.push }) }));

const { RouteMapTile } = await import("./route-map-tile");

const EUROPE: [string, number, number, string][] = [
  ["Paris", 48.8566, 2.3522, "fr"],
  ["Rome", 41.9028, 12.4964, "it"],
  ["Vienna", 48.2082, 16.3738, "at"],
  ["Berlin", 52.52, 13.405, "de"],
  ["Madrid", 40.4168, -3.7038, "es"],
  ["Amsterdam", 52.3676, 4.9041, "nl"],
  ["Prague", 50.0755, 14.4378, "cz"],
  ["Budapest", 47.4979, 19.0402, "hu"],
  ["Warsaw", 52.2297, 21.0122, "pl"],
  ["Lisbon", 38.7223, -9.1393, "pt"],
];

const STOPS: RouteMapTileStop[] = [
  { id: "bali", name: "Kuta, Bali", lat: -8.72, lng: 115.17, countryCode: "id", nights: 4, stopColour: "sky", number: 1, nextLine: "4 nights · then Paris" },
  ...EUROPE.map(([name, lat, lng, cc], i) => ({
    id: name.toLowerCase(),
    name,
    lat,
    lng,
    countryCode: cc,
    nights: 3,
    stopColour: "sun" as const,
    number: i + 2,
    nextLine: "3 nights",
  })),
];

beforeEach(() => {
  hoisted.leaflet = createLeafletMock();
  hoisted.push.mockReset();
  vi.doMock("leaflet", () => hoisted.leaflet!.module);
});

describe("RouteMapTile", () => {
  it("selects the main geographic cluster chip and shows the outlying Stop as an inset card", async () => {
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(screen.getByRole("button", { name: "Europe · 10 stops" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Route" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
    const insets = screen.getAllByRole("button", { name: /^Show .* on the map$/ });
    expect(insets).toHaveLength(1);
    expect(insets[0]).toHaveTextContent("Kuta, Bali");
    expect(insets[0]).toHaveTextContent("4 nights · then Paris");
    expect(screen.getByText("© OpenStreetMap · CARTO")).toBeInTheDocument();
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
  });

  it("builds the map without zoom control or scroll-wheel zoom, fitted to the main cluster", async () => {
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const map = hoisted.leaflet!.maps[0];
    expect(map.options).toMatchObject({ zoomControl: false, scrollWheelZoom: false, attributionControl: false });
    const fitted = map.fitBounds.mock.calls[0][0] as [number, number][];
    expect(fitted).toHaveLength(10);
    expect(fitted.some(([lat]) => lat < 0)).toBe(false);
  });

  it("fits every Stop on 'Whole trip' and draws the route line on 'Route'", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    const map = hoisted.leaflet!.maps[0];
    expect(hoisted.leaflet!.polylines).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Whole trip" }));
    const last = map.fitBounds.mock.calls.at(-1)![0] as unknown[];
    expect(last).toHaveLength(11);

    await user.click(screen.getByRole("button", { name: "Route" }));
    expect(hoisted.leaflet!.polylines.length).toBeGreaterThan(0);
  });

  it("pans to an outlying Stop when its inset card is clicked", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await waitFor(() => expect(hoisted.leaflet!.maps).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Show Kuta, Bali on the map" }));
    expect(hoisted.leaflet!.maps[0].setView).toHaveBeenCalledWith([-8.72, 115.17], expect.any(Number));
  });

  it("opens the Plan at a Stop when its pin is clicked", async () => {
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThan(0));
    const bali = hoisted.leaflet!.markers.find((m) => m.latlng[0] === -8.72)!;
    const onClick = bali.on.mock.calls.find(([ev]) => ev === "click")![1] as () => void;
    onClick();
    expect(hoisted.push).toHaveBeenCalledWith("/trips/t1/plan#stop-bali");
  });

  it("merges pins that would overlap into a count pin", async () => {
    const close: RouteMapTileStop[] = [
      { ...STOPS[1], id: "a", lat: 48.85, lng: 2.35, number: 1 },
      { ...STOPS[1], id: "b", lat: 48.86, lng: 2.36, number: 2 },
      { ...STOPS[1], id: "c", lat: 60, lng: 30, number: 3 },
    ];
    render(<RouteMapTile stops={close} tripId="t1" />);
    await waitFor(() => expect(hoisted.leaflet!.markers.length).toBeGreaterThan(0));
    expect(hoisted.leaflet!.markers).toHaveLength(2);
    const counts = hoisted.leaflet!.markers.map((m) => (m.options.icon as { html: string }).html);
    expect(counts.some((h) => h.includes(">2<"))).toBe(true);
  });

  it("shows the 'Add your first stop' empty state with no located Stops", () => {
    render(<RouteMapTile stops={[]} tripId="t1" />);
    expect(screen.getByText("Add your first stop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Add a stop" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
  });

  it("shows a compact error panel inside the tile when the map fails", async () => {
    hoisted.leaflet!.L.map.mockImplementation(() => {
      throw new Error("map failed");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(await screen.findByText("The map didn’t load", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "The map didn’t load" })).toBeInTheDocument();
    // Chips still render — the rest of the tile survives.
    expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
