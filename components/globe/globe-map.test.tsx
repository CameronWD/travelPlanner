import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { MarkerView } from "@/components/globe/types";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { GlobeMap } from "./globe-map";

const MARKERS = [
  { id: "m1", title: "Tokyo Tower", category: "SIGHTSEEING", lat: 35.65, lng: 139.74 },
  { id: "m2", title: "Ramen", category: "FOOD", lat: 35.69, lng: 139.7 },
] as unknown as MarkerView[];

const pinHtmls = () => screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);
const lastMapProps = () => mock.recorded.map.at(-1)!;

interface Handlers {
  onSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

function globeElement(selectedId: string | null = null, h: Handlers = {}, extra: Partial<React.ComponentProps<typeof GlobeMap>> = {}) {
  return (
    <GlobeMap
      markers={MARKERS}
      selectedId={selectedId}
      onSelect={h.onSelect ?? vi.fn()}
      onEdit={h.onEdit ?? vi.fn()}
      onDelete={h.onDelete ?? vi.fn()}
      onMapClick={h.onMapClick ?? vi.fn()}
      {...extra}
    />
  );
}

beforeEach(() => {
  mock.reset();
  hoisted.theme = "light";
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
});

describe("GlobeMap pins and theme", () => {
  it("draws one category pin per located marker", () => {
    render(globeElement());
    const html = pinHtmls();
    expect(html).toHaveLength(2);
    expect(html[0]).toContain("#8AD6F5");
    expect(html[1]).toContain("#FFD166");
  });

  it("gives the selected marker the lift+ring variant and a higher zIndex", () => {
    render(globeElement("m1"));
    const html = pinHtmls();
    expect(html[0]).toContain("scale(1.15)");
    expect(html[1]).not.toContain("scale(1.15)");
    expect(mock.recorded.markers.find((m) => m.title === "Tokyo Tower")!.zIndex).toBe(1000);
  });

  it("recolours the pins and remounts the map when the theme flips, keeping the selected lift", () => {
    const { rerender } = render(globeElement("m1"));
    expect(mock.recorded.mapMounts).toBe(1);
    hoisted.theme = "dark";
    rerender(globeElement("m1"));
    const html = pinHtmls();
    expect(html[0]).toContain("#8CC0D6");
    expect(html[0]).toContain("scale(1.15)");
    expect(html[1]).toContain("#E6C57A");
    expect(mock.recorded.mapMounts).toBe(2);
    expect(lastMapProps().colorScheme).toBe("DARK");
  });

  it("falls back to the unavailable notice without a key", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    const { container } = render(globeElement());
    expect(container.querySelector("[data-map-fallback]")).toHaveTextContent("The map isn't available right now.");
    expect(screen.queryByTestId("gmap")).toBeNull();
  });
});

describe("GlobeMap kit chrome", () => {
  it("frames the map with the kit 2px outline, not the old 1px/rounded-2xl shape", () => {
    render(globeElement());
    const frame = screen.getByLabelText("Globe map");
    expect(frame).toHaveClass("border-2", "border-border", "rounded-lg");
    expect(frame).not.toHaveClass("rounded-2xl");
  });

  it("fills the viewport height beside the marker list from lg (ruling R3, LA-156)", () => {
    render(globeElement());
    const frame = screen.getByLabelText("Globe map");
    expect(frame).toHaveClass("lg:h-[calc(100dvh-4.5rem)]", "lg:min-h-[460px]");
    expect(frame).not.toHaveClass("lg:h-[460px]");
    expect(frame).toHaveClass("h-[260px]");
  });
});

describe("GlobeMap popup", () => {
  it("builds the popup from token classes (no raw hex, no emoji) with the file count", () => {
    render(globeElement("m1", {}, { attachmentsByMarkerId: { m1: [{ id: "a1" }, { id: "a2" }] } }));
    const popup = screen.getByRole("dialog");
    expect(popup).toHaveTextContent("Tokyo Tower");
    expect(popup).toHaveTextContent("2 files");
    expect(popup.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(popup.innerHTML).not.toContain("📎");
    expect(popup.innerHTML).toContain("border-2");
  });

  it("Edit and Delete in the popup call onEdit and onDelete with the marker id", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(globeElement("m1", { onEdit, onDelete }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("m1");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("m1");
  });

  it("opens only the selected marker's popup, and a pin click selects and opens it", () => {
    const onSelect = vi.fn();
    render(globeElement(null, { onSelect }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByTestId("marker")[1]);
    expect(onSelect).toHaveBeenCalledWith("m2");
    expect(screen.getByRole("dialog")).toHaveTextContent("Ramen");
  });

  it("closing the popup leaves it closed until the pin is clicked again", () => {
    render(globeElement("m1"));
    act(() => (mock.recorded.infoWindows.at(-1)!.onClose as () => void)());
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getAllByTestId("marker")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("GlobeMap selection from outside", () => {
  it("pans to the marker, lifts the zoom to 9 and opens its popup", () => {
    mock.map.getZoom.mockReturnValue(4);
    const { rerender } = render(globeElement());
    expect(mock.map.panTo).not.toHaveBeenCalled();
    rerender(globeElement("m2"));
    expect(mock.map.panTo).toHaveBeenCalledWith({ lat: 35.69, lng: 139.7 });
    expect(mock.map.setZoom).toHaveBeenCalledWith(9);
    expect(screen.getByRole("dialog")).toHaveTextContent("Ramen");
  });

  it("keeps a closer zoom as it is", () => {
    mock.map.getZoom.mockReturnValue(12);
    const { rerender } = render(globeElement());
    rerender(globeElement("m1"));
    expect(mock.map.panTo).toHaveBeenCalled();
    expect(mock.map.setZoom).not.toHaveBeenCalledWith(9);
  });

  it("re-selecting moves the popup to the new marker only", () => {
    const { rerender } = render(globeElement("m1"));
    rerender(globeElement("m2"));
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent("Ramen");
  });
});

describe("GlobeMap map clicks and world view", () => {
  it("a map click reports its lat and lng to onMapClick", () => {
    const onMapClick = vi.fn();
    render(globeElement(null, { onMapClick }));
    (lastMapProps().onClick as (e: unknown) => void)({ detail: { latLng: { lat: 10.5, lng: -20.25 } } });
    expect(onMapClick).toHaveBeenCalledWith(10.5, -20.25);
  });

  it("ignores a click with no coordinates", () => {
    const onMapClick = vi.fn();
    render(globeElement(null, { onMapClick }));
    (lastMapProps().onClick as (e: unknown) => void)({ detail: { latLng: null } });
    expect(onMapClick).not.toHaveBeenCalled();
  });

  it("restricts the map to one world with a minimum zoom of 2", () => {
    render(globeElement());
    expect(lastMapProps()).toMatchObject({
      minZoom: 2,
      restriction: { latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: false },
    });
  });

  it("fits the located markers once, and shows the whole world when there are none", () => {
    const { rerender } = render(globeElement());
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);
    rerender(globeElement(null, {}, { markers: [...MARKERS, { id: "m3", title: "Kyoto", category: "FOOD", lat: 35, lng: 135 } as unknown as MarkerView] }));
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);

    mock.reset();
    render(globeElement(null, {}, { markers: [] }));
    expect(mock.map.fitBounds).not.toHaveBeenCalled();
    expect(lastMapProps()).toMatchObject({ defaultCenter: { lat: 20, lng: 0 }, defaultZoom: 2 });
  });
});

describe("GlobeMap arrival (?added=)", () => {
  const PINS = [
    { id: "s1", name: "Kyoto", lat: 35.01, lng: 135.77 },
    { id: "s2", name: "Nara", lat: 34.68, lng: 135.8 },
  ];

  it("draws numbered pins that pop in after the fly, 60ms apart, and fits them with maxZoom 8", () => {
    render(globeElement(null, {}, { markers: [], arrivalPins: PINS }));
    const pins = screen.getAllByTestId("marker");
    expect(pins.map((m) => m.getAttribute("title"))).toEqual(["Kyoto", "Nara"]);
    const html = pins.map((m) => m.querySelector(".tp-map-pin")!.innerHTML);
    expect(html[0]).toMatch(/tp-pin-pop/);
    expect(html[0]).toMatch(/animation-delay:800ms/);
    expect(html[1]).toMatch(/animation-delay:860ms/);
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);
    const bounds = mock.map.fitBounds.mock.calls[0][0] as { points: unknown[] };
    expect(bounds.points).toEqual([{ lat: 35.01, lng: 135.77 }, { lat: 34.68, lng: 135.8 }]);
    expect(mock.map.addListener).toHaveBeenCalledWith("idle", expect.any(Function));
  });

  it("without arrival pins draws nothing extra", () => {
    render(globeElement(null, {}, { markers: [] }));
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
    expect(mock.map.fitBounds).not.toHaveBeenCalled();
  });
});
