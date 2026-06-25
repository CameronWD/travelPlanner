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
});
