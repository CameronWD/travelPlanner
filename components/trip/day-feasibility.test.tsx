import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/hop-modes", () => ({ setHopMode: vi.fn() }));

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

  it("renders as the kit sun 'heads up' card (DDays.jsx), not the old 1px card", () => {
    const { container } = render(
      <DayFeasibility entries={[{ severity: "warning", message: "Only 5 min but 27 min to walk." }]} />,
    );
    const card = container.firstChild as HTMLElement;
    const cls = card.className.split(/\s+/);
    expect(cls).toContain("bg-sun");
    expect(cls).toContain("island");
    expect(cls).toContain("border-2");
    expect(cls).not.toContain("rounded-2xl");
    // A sun fill under sun-text would collapse — text on the island is plain ink.
    expect(container.innerHTML).not.toMatch(/text-sun-text/);
    expect(screen.getByRole("heading", { name: "Getting around" })).toBeInTheDocument();
  });

  it("offers a Hop mode chooser only on a row that carries a hop", () => {
    render(
      <DayFeasibility
        entries={[
          { severity: "warning", message: "With a hop.", hop: { fromItemId: "a", toItemId: "b", mode: "WALK", modeSetByHand: true } },
          { severity: "info", message: "Without." },
        ]}
      />,
    );
    expect(screen.getAllByRole("button", { name: /How this hop is travelled/ })).toHaveLength(1);
  });
});
