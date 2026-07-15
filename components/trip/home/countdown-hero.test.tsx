import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountdownHero } from "./countdown-hero";
import type { PhaseDescription } from "@/lib/trip-phase";

const planning: PhaseDescription = {
  phase: "planning",
  label: "Planning",
  countdown: "In 26 days",
  countdownValue: "26",
  countdownUnit: "DAYS TO GO",
};

describe("CountdownHero", () => {
  it("renders the big value, date range and nights/stops/currency pills", () => {
    render(
      <CountdownHero
        description={planning}
        startDate="2026-07-20"
        endDate="2026-07-30"
        nights={11}
        stopCount={3}
        homeCurrency="JPY"
      />,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("20–30 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("11 nights")).toBeInTheDocument();
    expect(screen.getByText("3 stops")).toBeInTheDocument();
    expect(screen.getByText("JPY ¥")).toBeInTheDocument();
    // number + unit exposed as one accessible phrase
    expect(screen.getByLabelText("26 days to go")).toBeInTheDocument();
  });

  it("escalates the eyebrow to the warning colour when urgent (final-prep)", () => {
    render(
      <CountdownHero
        description={{ ...planning, phase: "final-prep", label: "Final prep" }}
        startDate="2026-07-20"
        endDate="2026-07-30"
        nights={11}
        stopCount={3}
        homeCurrency="JPY"
        urgent
      />,
    );
    expect(screen.getByText("Final prep").className).toContain("bg-warning");
  });

  it("uses singular pill copy for a one-night, one-stop trip", () => {
    render(
      <CountdownHero
        description={planning}
        startDate="2026-07-20"
        endDate="2026-07-21"
        nights={1}
        stopCount={1}
        homeCurrency="JPY"
      />,
    );
    expect(screen.getByText("1 night")).toBeInTheDocument();
    expect(screen.getByText("1 stop")).toBeInTheDocument();
  });

  it("applies lg:text-7xl to the countdown number on desktop", () => {
    render(
      <CountdownHero
        description={planning}
        startDate="2026-07-20"
        endDate="2026-07-30"
        nights={11}
        stopCount={3}
        homeCurrency="JPY"
      />,
    );
    const numberElement = screen.getByLabelText("26 days to go").querySelector("span");
    expect(numberElement?.className).toContain("lg:text-7xl");
  });
});
