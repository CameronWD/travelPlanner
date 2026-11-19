import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaySlotSkeleton } from "./day-slot-skeleton";

describe("DaySlotSkeleton", () => {
  it("is one status named Loading day with two shapes", () => {
    render(<DaySlotSkeleton />);
    const status = screen.getByRole("status", { name: "Loading day" });
    expect(status.children).toHaveLength(2);
  });
  it("the weather shape leads on a phone and is taller from md", () => {
    render(<DaySlotSkeleton />);
    const weather = screen.getByRole("status").children[1];
    expect(weather.className).toContain("order-first");
    expect(weather.className).toContain("h-[140px]");
    expect(weather.className).toContain("md:h-[236px]");
  });
  it("the plan shape takes the larger radius from md", () => {
    render(<DaySlotSkeleton />);
    expect(screen.getByRole("status").children[0].className).toContain("md:rounded-3xl");
  });
});
