import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plane } from "lucide-react";
import { LegPill, LegRow } from "./leg-pill";

const FLIGHT = { icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false, accessibleName: "Flight from Paris to Rome, Tuesday 15 December 10:05. Edit." };
const MISSING = { icon: null, label: "How are you getting to Florence?", sub: "Add", missing: true, accessibleName: "Add transport from Rome to Florence" };

describe("LegRow / LegPill (PLAN.md §2)", () => {
  it("a solid connector for legs, dashed otherwise; 52px desktop, 40px compact", () => {
    const { container, rerender } = render(<LegRow kind="legs" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute("data-leg-kind", "legs");
    expect(row.className).toContain("min-h-[52px]");
    expect(row.querySelector("[data-connector]")!.className).not.toMatch(/border-dashed/);
    rerender(<LegRow kind="line" compact />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-10");
    expect(container.querySelector("[data-connector]")!.className).toMatch(/border-dashed/);
  });

  it("a transport pill: icon, label, sub, spoken name, click", async () => {
    const onClick = vi.fn();
    render(<LegPill label={FLIGHT} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill.className).toContain("h-[34px]");
    expect(pill.className).toContain("bg-card");
    expect(pill.className).toContain("whitespace-nowrap");
    expect(screen.getByText("Tue 15 Dec 10:05").className).toContain("tabular-nums");
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalled();
  });

  it("the missing pill is dashed on paper with a coral Add", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toMatch(/border-dashed/);
    expect(pill.className).toContain("bg-background");
    expect(screen.getByText("Add").className).toContain("text-coral-text");
  });

  it("compact: 28px, text-xs; the missing one reads + Add transport", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} compact />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toContain("h-7");
    expect(pill).toHaveTextContent("Add transport");
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
