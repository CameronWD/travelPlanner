import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountdownHero } from "./countdown-hero";

describe("CountdownHero", () => {
  it("shows the label, countdown and date range", () => {
    render(
      <CountdownHero
        description={{ phase: "planning", label: "Planning", countdown: "In 26 days" }}
        startDate="2026-07-20"
        endDate="2026-07-30"
      />,
    );
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("In 26 days")).toBeInTheDocument();
    expect(screen.getByText("20–30 Jul 2026")).toBeInTheDocument();
  });
});
