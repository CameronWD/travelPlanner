import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthGrid } from "./month-grid";
import type { DayPlan } from "@/lib/itinerary";

function dayPlan(dateISO: string, itemCount: number): DayPlan {
  const stop = {
    id: "s1", name: "Paris", country: "France", timezone: "Europe/Paris",
    arriveDate: "2026-07-14", departDate: "2026-07-15", sortOrder: 0,
  };
  const timedItems = Array.from({ length: itemCount }, (_, i) => ({
    kind: "item" as const,
    item: { id: `i${i}`, title: `Item ${i}`, category: "sightseeing" },
  }));
  return { dateISO, stop, timedItems, untimedItems: [], transportEntries: [], accommodationEntries: [] };
}

describe("MonthGrid — location hero", () => {
  it("shows the stop name on every in-window day of the stop", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2), dayPlan("2026-07-15", 0)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-15"
      />,
    );
    expect(screen.getAllByText("Paris").length).toBeGreaterThanOrEqual(2);
  });

  it("collapses activities to a count instead of listing item titles", () => {
    render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[dayPlan("2026-07-14", 2)]}
        tripStart="2026-07-14"
        tripEnd="2026-07-14"
      />,
    );
    expect(screen.getByText(/2 things/)).toBeInTheDocument();
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
  });

  it("shows no location on a gap day", () => {
    render(
      <MonthGrid tripId="t1" monthAnchorISO="2026-07-01" days={[]} tripStart="2026-07-14" tripEnd="2026-07-14" />,
    );
    expect(screen.queryByText("Paris")).not.toBeInTheDocument();
  });
});

describe("MonthGrid — mobile containment (Step 1)", () => {
  it("day-grid element has min-w-[560px] class", () => {
    const { container } = render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[]}
        tripStart="2026-07-01"
        tripEnd="2026-07-31"
      />,
    );
    // The day-cells grid is the second grid-cols-7 element (after the weekday header)
    const grids = container.querySelectorAll(".grid-cols-7");
    const dayGrid = grids[1];
    expect(dayGrid).toBeTruthy();
    expect(dayGrid.classList.contains("min-w-[560px]")).toBe(true);
  });

  it("scroll wrapper has overflow-x-auto class", () => {
    const { container } = render(
      <MonthGrid
        tripId="t1"
        monthAnchorISO="2026-07-01"
        days={[]}
        tripStart="2026-07-01"
        tripEnd="2026-07-31"
      />,
    );
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).toBeTruthy();
  });
});
