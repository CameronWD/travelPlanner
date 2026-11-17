import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayMapPanel } from "./day-map-panel";
import type { DayMapModel } from "@/lib/day-map";

// Mock the map child so jsdom never tries to render a real map.
vi.mock("./day-map", () => ({
  DayMap: () => <div data-testid="day-map" />,
}));

const emptyModel: DayMapModel = {
  points: [],
  routePoints: [],
  perItemPrev: {},
};

const nonEmptyModel: DayMapModel = {
  points: [
    {
      kind: "item",
      id: "item-1",
      lat: 35.6762,
      lng: 139.6503,
      label: "Tokyo Tower",
      order: 1,
    },
  ],
  routePoints: [
    {
      kind: "item",
      id: "item-1",
      lat: 35.6762,
      lng: 139.6503,
      label: "Tokyo Tower",
      order: 1,
    },
  ],
  perItemPrev: { "item-1": undefined },
};

describe("DayMapPanel (desktop Travelling Home tile, spec D)", () => {
  it("is always expanded — the map mounted, no toggle — under an h2 'Day map'", () => {
    const { container } = render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} />);
    expect(screen.getByRole("heading", { level: 2, name: "Day map" })).toBeInTheDocument();
    expect(screen.getByTestId("day-map")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bh-full\b/);
  });

  it("offers an Open link to the Day view with the dialog open", () => {
    render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} openHref={"/trips/t/day/2026-01-05?map=1" as never} />);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/trips/t/day/2026-01-05?map=1");
  });

  it("keeps its cell with a quiet line when there is nothing to map today", () => {
    render(<DayMapPanel tripId="trip-1" model={emptyModel} />);
    expect(screen.getByRole("heading", { level: 2, name: "Day map" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to map today")).toBeInTheDocument();
    expect(screen.queryByTestId("day-map")).toBeNull();
  });

  it('tile with mountWhen="desktop" keeps its heading but no map below lg (spec 2026-10-06 §D)', async () => {
    const { setMatchMedia } = await import("@/test/setup");
    setMatchMedia(false);
    try {
      render(<DayMapPanel tripId="t1" model={nonEmptyModel} mountWhen="desktop" />);
      expect(screen.getByRole("heading", { name: "Day map" })).toBeInTheDocument();
      expect(screen.queryByTestId("day-map")).toBeNull();
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });

  it('tile with mountWhen="desktop" mounts the map at lg+', async () => {
    const { setMatchMedia } = await import("@/test/setup");
    setMatchMedia((q) => q === "(min-width: 1024px)");
    try {
      render(<DayMapPanel tripId="t1" model={nonEmptyModel} mountWhen="desktop" />);
      expect(screen.getByTestId("day-map")).toBeInTheDocument();
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });
});
