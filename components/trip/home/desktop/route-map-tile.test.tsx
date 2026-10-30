import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RouteMapTileStop } from "./route-map-tile";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hoisted.push }) }));

const { RouteMapTile } = await import("./route-map-tile");
const { resetMapsAuthForTests } = await import("@/components/map/maps-auth");

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
  mock.reset();
  resetMapsAuthForTests();
  hoisted.push.mockReset();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
});

const fittedPoints = (call: number | "last" = 0) => {
  const calls = mock.map.fitBounds.mock.calls;
  const bounds = (call === "last" ? calls.at(-1)! : calls[call])[0] as { points: google.maps.LatLngLiteral[] };
  return bounds.points;
};
const pinTitles = () => screen.getAllByTestId("marker").map((m) => m.getAttribute("title"));
const zoomListener = () => (mock.map.addListener.mock.calls as unknown as [string, () => void][]).find(([ev]) => ev === "zoom_changed")![1];

describe("RouteMapTile", () => {
  it("selects the main geographic cluster chip and shows the outlying Stop as an inset card", () => {
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(screen.getByRole("button", { name: "Europe · 10 stops" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Route" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
    const insets = screen.getAllByRole("button", { name: /^Show .* on the map$/ });
    expect(insets).toHaveLength(1);
    expect(insets[0]).toHaveTextContent("Kuta, Bali");
    expect(insets[0]).toHaveTextContent("4 nights · then Paris");
    expect(screen.getByRole("region", { name: "Trip route map" })).toBeInTheDocument();
  });

  it("builds the map with the zoom control and no scroll-wheel hijack, fitted to the main cluster", () => {
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(mock.recorded.map.at(-1)).toMatchObject({ disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative" });
    const fitted = fittedPoints();
    expect(fitted).toHaveLength(10);
    expect(fitted.some(({ lat }) => lat < 0)).toBe(false);
    expect(mock.map.fitBounds.mock.calls[0][1]).toBe(48);
  });

  it("fits every Stop on 'Whole trip' and draws the route line on 'Route'", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(mock.recorded.polylines).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Whole trip" }));
    expect(fittedPoints("last")).toHaveLength(11);

    await user.click(screen.getByRole("button", { name: "Route" }));
    expect(mock.recorded.polylines.length).toBeGreaterThan(0);
  });

  it("draws the route as a casing and a line over the same path, casing under", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await user.click(screen.getByRole("button", { name: "Route" }));
    expect(mock.recorded.polylines).toHaveLength(2);
    const [casing, line] = mock.recorded.polylines.map((p) => p.setOptions.mock.calls.at(-1)![0] as Record<string, unknown>);
    expect(casing.path).toBe(line.path);
    expect(casing.strokeWeight).toBe(7);
    expect(line.strokeWeight).toBe(3.5);
    expect(casing.zIndex as number).toBeLessThan(line.zIndex as number);
  });

  it("pans to an outlying Stop when its inset card is clicked", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await user.click(screen.getByRole("button", { name: "Show Kuta, Bali on the map" }));
    expect(mock.map.setCenter).toHaveBeenLastCalledWith({ lat: -8.72, lng: 115.17 });
    expect(mock.map.setZoom).toHaveBeenLastCalledWith(7);
  });

  it("opens the Plan at a Stop when its pin is clicked", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    await user.click(screen.getByTitle("1. Kuta, Bali"));
    expect(hoisted.push).toHaveBeenCalledWith("/trips/t1/plan#stop-bali", undefined);
  });

  const close: RouteMapTileStop[] = [
    { ...STOPS[1], id: "a", name: "A", lat: 48.85, lng: 2.35, number: 1 },
    { ...STOPS[1], id: "b", name: "B", lat: 48.86, lng: 2.36, number: 2 },
    { ...STOPS[1], id: "c", name: "C", lat: 60, lng: 30, number: 3 },
  ];

  it("merges pins that would overlap into a count pin", () => {
    render(<RouteMapTile stops={close} tripId="t1" />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(pinTitles()).toContain("2 stops: A, B");
    const html = screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);
    expect(html.some((h) => h.includes(">2<"))).toBe(true);
  });

  it("clicking a count pin fits the map to its members", async () => {
    const user = userEvent.setup();
    render(<RouteMapTile stops={close} tripId="t1" />);
    mock.map.fitBounds.mockClear();
    await user.click(screen.getByTitle("2 stops: A, B"));
    expect(fittedPoints()).toEqual([{ lat: 48.85, lng: 2.35 }, { lat: 48.86, lng: 2.36 }]);
  });

  it("cluster pins recompute when the zoom changes", () => {
    render(<RouteMapTile stops={close} tripId="t1" />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    mock.map.getZoom.mockReturnValue(14);
    act(() => zoomListener()());
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
    expect(pinTitles()).toEqual(expect.arrayContaining(["1. A", "2. B", "3. C"]));
  });

  it("removes its zoom listener on unmount", () => {
    const remove = vi.fn();
    mock.map.addListener.mockReturnValue({ remove });
    const { unmount } = render(<RouteMapTile stops={close} tripId="t1" />);
    unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("shows the 'Add your first stop' empty state with no located Stops", () => {
    render(<RouteMapTile stops={[]} tripId="t1" />);
    expect(screen.getByText("Add your first stop")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Add a stop" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
  });

  it("shows a compact error panel inside the tile when Google refuses the key", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    act(() => window.gm_authFailure!());
    expect(await screen.findByRole("heading", { level: 3, name: "The map didn’t load" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("shows the same error panel, not a blank box, when there is no key", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouteMapTile stops={STOPS} tripId="t1" />);
    expect(await screen.findByText("The map didn’t load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('mountWhen="desktop" below lg keeps the tile but never builds a map (spec 2026-10-06 §D)', async () => {
    const { setMatchMedia } = await import("@/test/setup");
    setMatchMedia(false);
    try {
      render(<RouteMapTile stops={STOPS} tripId="t1" mountWhen="desktop" />);
      expect(screen.getByRole("button", { name: "Whole trip" })).toBeInTheDocument();
      await new Promise((r) => setTimeout(r, 0));
      expect(mock.recorded.mapMounts).toBe(0);
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });

  it('mountWhen="desktop" at lg+ builds the map', async () => {
    const { setMatchMedia } = await import("@/test/setup");
    setMatchMedia((q) => q === "(min-width: 1024px)");
    try {
      render(<RouteMapTile stops={STOPS} tripId="t1" mountWhen="desktop" />);
      expect(mock.recorded.mapMounts).toBe(1);
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });
});
