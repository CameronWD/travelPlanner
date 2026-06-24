import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCard } from "./trip-card";

describe("TripCard", () => {
  it("shows a phase badge when provided", () => {
    render(
      <TripCard
        id="t" name="Europe" startDate="2026-07-20" endDate="2026-07-30" stopCount={3}
        phase={{ phase: "planning", label: "Planning", countdown: "In 26 days" }}
      />,
    );
    expect(screen.getByText(/planning · in 26 days/i)).toBeInTheDocument();
  });

  it("shows only the countdown for travelling trips", () => {
    render(
      <TripCard
        id="t" name="Europe" startDate="2026-06-20" endDate="2026-06-30" stopCount={3}
        phase={{ phase: "travelling", label: "Travelling", countdown: "Day 5 of 11" }}
      />,
    );
    expect(screen.getByText("Day 5 of 11")).toBeInTheDocument();
  });
});
