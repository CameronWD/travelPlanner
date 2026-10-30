import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

const hoisted = vi.hoisted(() => ({ theme: "light" as "light" | "dark" }));

vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: hoisted.theme, setTheme: vi.fn(), toggleTheme: vi.fn() }),
}));

import { WishlistMap } from "./wishlist-map";

const ITEMS = [
  { id: "a", title: "Tokyo Tower", category: "SIGHTSEEING", lat: 35.65, lng: 139.74 },
  { id: "b", title: "Ramen", category: "FOOD", lat: 35.69, lng: 139.7 },
];

const pinHtmls = () => screen.getAllByTestId("marker").map((m) => m.querySelector(".tp-map-pin")!.innerHTML);

beforeEach(() => {
  mock.reset();
  hoisted.theme = "light";
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  return () => vi.unstubAllEnvs();
});

describe("WishlistMap pins", () => {
  it("draws one category-coloured pin per item", () => {
    render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    const html = pinHtmls();
    expect(html).toHaveLength(2);
    expect(html[0]).toContain("#8AD6F5");
    expect(html[1]).toContain("#FFD166");
  });

  it("recolours the pins and remounts the map when the theme flips", () => {
    const { rerender } = render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    expect(mock.recorded.mapMounts).toBe(1);
    hoisted.theme = "dark";
    rerender(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    const html = pinHtmls();
    expect(html[0]).toContain("#8CC0D6");
    expect(html[1]).toContain("#E6C57A");
    expect(mock.recorded.mapMounts).toBe(2);
  });

  it("fits the map to every item", () => {
    render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    expect(mock.map.fitBounds).toHaveBeenCalled();
  });
});

describe("WishlistMap selection", () => {
  it("calls onSelect with the item id and opens its title popup", () => {
    const onSelect = vi.fn();
    render(<WishlistMap items={ITEMS} onSelect={onSelect} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("marker")[1]);
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(screen.getByRole("dialog")).toHaveTextContent("Ramen");
  });
});

describe("WishlistMap frame", () => {
  it("is a labelled, sized, kit-styled frame", () => {
    render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    const frame = screen.getByLabelText("Wishlist map");
    expect(frame).toHaveClass("h-52", "border-2", "border-border", "rounded-lg");
  });

  it("shows the unavailable notice without a maps config", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const { container } = render(<WishlistMap items={ITEMS} onSelect={vi.fn()} />);
    expect(screen.getByText("The map isn't available right now.")).toBeInTheDocument();
    expect(container.querySelector("[data-map-fallback]")).not.toBeNull();
    expect(screen.queryByTestId("marker")).not.toBeInTheDocument();
  });

  it("keeps the empty state when there are no items", () => {
    render(<WishlistMap items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No map locations yet.")).toBeInTheDocument();
  });
});
