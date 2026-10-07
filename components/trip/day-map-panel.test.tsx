import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayMapPanel } from "./day-map-panel";
import type { DayMapModel } from "@/lib/day-map";

// Mock the Leaflet child so jsdom never tries to render a real map.
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

describe("DayMapPanel", () => {
  it("renders nothing when model.points is empty", () => {
    const { container } = render(
      <DayMapPanel tripId="trip-1" model={emptyModel} />,
    );
    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("renders the toggle button when model has points", () => {
    render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the map when the toggle button is clicked", async () => {
    const user = userEvent.setup();
    render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} />);

    expect(screen.queryByTestId("day-map")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button"));

    expect(screen.getByTestId("day-map")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("hides the map when clicked again", async () => {
    const user = userEvent.setup();
    render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByTestId("day-map")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.queryByTestId("day-map")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("DayMapPanel Playground kit restyle (Task 10b)", () => {
  it("sits in a kit Card with a ≥44px toggle", () => {
    const { container } = render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
    expect(screen.getByRole("button", { name: "Show day map" }).className).toMatch(/\bmin-h-11\b/);
  });
});

describe("DayMapPanel tile variant (desktop Travelling Home, spec D)", () => {
  it("is always expanded — the map mounted, no toggle — under an h2 'Day map'", () => {
    const { container } = render(<DayMapPanel tripId="trip-1" model={nonEmptyModel} variant="tile" />);
    expect(screen.getByRole("heading", { level: 2, name: "Day map" })).toBeInTheDocument();
    expect(screen.getByTestId("day-map")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bh-full\b/);
  });

  it("keeps its cell with a quiet line when there is nothing to map today", () => {
    render(<DayMapPanel tripId="trip-1" model={emptyModel} variant="tile" />);
    expect(screen.getByRole("heading", { level: 2, name: "Day map" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to map today")).toBeInTheDocument();
    expect(screen.queryByTestId("day-map")).toBeNull();
  });

  it('tile with mountWhen="desktop" keeps its heading but no map below lg (spec 2026-10-06 §D)', async () => {
    const { setMatchMedia } = await import("@/test/setup");
    setMatchMedia(false);
    try {
      render(<DayMapPanel tripId="t1" model={nonEmptyModel} variant="tile" mountWhen="desktop" />);
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
      render(<DayMapPanel tripId="t1" model={nonEmptyModel} variant="tile" mountWhen="desktop" />);
      expect(screen.getByTestId("day-map")).toBeInTheDocument();
    } finally {
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });
});
