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
