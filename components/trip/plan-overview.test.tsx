import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanOverview } from "./plan-overview";
import type { PlanSummary } from "@/lib/plan-overview";

vi.mock("./hard-end-date-control", () => ({
  HardEndDateControl: () => <div data-testid="hard-end-control" />,
}));

const base: PlanSummary = {
  stopCount: 5, roughCount: 2, scheduledNights: 16, projectedNights: 23,
  spanStart: "2026-07-01", scheduledEnd: "2026-07-10", projectedEnd: "2026-07-17",
  hardEndDate: "2026-07-15", hardEndState: "over", hardEndSlackNights: -2,
};

describe("PlanOverview", () => {
  it("renders stop/rough counts and the nights split", () => {
    const { container } = render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(container.textContent).toMatch(/5 stops/i);
    expect(container.textContent).toMatch(/2 rough/i);
    expect(container.textContent).toMatch(/16/);
    expect(container.textContent).toMatch(/23/);
  });

  it("marks an over-budget hard end status", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(screen.getByRole("status")).toHaveTextContent(/2 nights over/i);
  });

  it("renders the inline hard-end control", () => {
    render(<PlanOverview tripId="t1" summary={base} startDate="2026-07-01" />);
    expect(screen.getByTestId("hard-end-control")).toBeInTheDocument();
  });
});
