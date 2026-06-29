import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayFeasibility } from "./day-feasibility";

describe("DayFeasibility", () => {
  it("renders one row per entry with the message", () => {
    render(
      <DayFeasibility
        entries={[
          { severity: "warning", message: "Only 5 min but 27 min to walk." },
          { severity: "info", message: "Cutting it close: 20 min gap, ~12 min travel." },
        ]}
      />,
    );
    expect(screen.getByText("Only 5 min but 27 min to walk.")).toBeInTheDocument();
    expect(
      screen.getByText("Cutting it close: 20 min gap, ~12 min travel."),
    ).toBeInTheDocument();
  });

  it("renders nothing when entries is empty", () => {
    const { container } = render(<DayFeasibility entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
