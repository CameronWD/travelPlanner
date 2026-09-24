import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayNav } from "./day-nav";

describe("DayNav", () => {
  it("gives the previous-day control a 44px-minimum tap target", () => {
    render(<DayNav tripId="t1" currentDate="2026-07-03" startDate="2026-07-01" endDate="2026-07-10" />);
    const prev = screen.getByRole("link", { name: /go to 2026-07-02/i });
    expect(prev.className).toMatch(/min-h-11/);
    expect(prev.className).toMatch(/min-w-11/);
  });

  it("names both day controls and marks the current day with aria-current=\"date\"", () => {
    render(<DayNav tripId="t1" currentDate="2026-07-03" startDate="2026-07-01" endDate="2026-07-10" />);
    expect(screen.getByRole("link", { name: /go to 2026-07-02/i })).toHaveAttribute("href", "/trips/t1/day/2026-07-02");
    expect(screen.getByRole("link", { name: /go to 2026-07-04/i })).toHaveAttribute("href", "/trips/t1/day/2026-07-04");
    const current = screen.getByText("Day 3 of 10");
    expect(current).toHaveAttribute("aria-current", "date");
  });

  it("renders prev/next in the kit IconButton shape (2px outline, hard shadow), not the old 1px rounded-xl", () => {
    render(<DayNav tripId="t1" currentDate="2026-07-03" startDate="2026-07-01" endDate="2026-07-10" />);
    for (const name of [/go to 2026-07-02/i, /go to 2026-07-04/i]) {
      const cls = screen.getByRole("link", { name }).className.split(/\s+/);
      expect(cls).toContain("border-2");
      expect(cls).toContain("shadow-hard-1");
      expect(cls).not.toContain("border");
      expect(cls).not.toContain("rounded-xl");
    }
  });

  it("drops the previous link on the first day and the next link on the last", () => {
    const { rerender } = render(<DayNav tripId="t1" currentDate="2026-07-01" startDate="2026-07-01" endDate="2026-07-10" />);
    expect(screen.queryByRole("link", { name: /go to 2026-06-30/i })).toBeNull();
    rerender(<DayNav tripId="t1" currentDate="2026-07-10" startDate="2026-07-01" endDate="2026-07-10" />);
    expect(screen.queryByRole("link", { name: /go to 2026-07-11/i })).toBeNull();
  });

  it("keeps the back-to-calendar link, with a coarse-pointer hit area", () => {
    render(<DayNav tripId="t1" currentDate="2026-07-03" startDate="2026-07-01" endDate="2026-07-10" />);
    const link = screen.getByRole("link", { name: "Days" });
    expect(link).toHaveAttribute("href", "/trips/t1/calendar");
    expect(link.className).toMatch(/pointer-coarse:after:absolute/);
  });
});
