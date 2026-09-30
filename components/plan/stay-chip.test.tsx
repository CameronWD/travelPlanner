import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StayChip, StayDialog } from "./stay-chip";

const COVERED = { kind: "covered" as const, name: "Hôtel Grands Boulevards", totalNights: 5, coveredNights: 5, extra: 0, checkInTime: "15:00" };

describe("StayChip (PLAN.md §4.1)", () => {
  it("covered: teal, name, ✓ All 5 nights · in 15:00, opens the stay", async () => {
    const onOpen = vi.fn();
    render(<StayChip stay={COVERED} onOpen={onOpen} onAdd={vi.fn()} />);
    const chip = screen.getByRole("button", { name: /Hôtel Grands Boulevards/ });
    expect(chip.className).toContain("bg-teal/15");
    expect(chip.className).toContain("tap-target");
    expect(screen.getByText(/All 5 nights · in 15:00/).className).toContain("text-teal-text");
    await userEvent.click(chip);
    expect(onOpen).toHaveBeenCalled();
  });
  it("+1 more when there are several", () => {
    render(<StayChip stay={{ ...COVERED, extra: 1 }} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });
  it("partial: 3 of 5 nights · Add another place in coral", () => {
    render(<StayChip stay={{ ...COVERED, kind: "partial", coveredNights: 3 }} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("3 of 5 nights · Add another place").className).toContain("text-coral-text");
  });
  it("none: a dashed coral chip that adds a stay", async () => {
    const onAdd = vi.fn();
    render(<StayChip stay={{ ...COVERED, kind: "none", name: null, coveredNights: 0 }} onOpen={vi.fn()} onAdd={onAdd} />);
    const chip = screen.getByRole("button", { name: /No bed yet · \+ Add a stay/ });
    expect(chip.className).toMatch(/border-dashed/);
    expect(chip.className).toContain("tap-target");
    await userEvent.click(chip);
    expect(onAdd).toHaveBeenCalled();
  });
  it("rough: Needs dates first, not interactive", () => {
    render(<StayChip stay={null} rough onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("Needs dates first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("StayDialog", () => {
  it("hosts the accommodation rows and + Add a stay", async () => {
    const onAdd = vi.fn();
    render(<StayDialog open onOpenChange={vi.fn()} stopName="Paris" rows={<div>row</div>} onAdd={onAdd} />);
    expect(screen.getByRole("dialog", { name: "Staying in Paris" })).toBeInTheDocument();
    expect(screen.getByText("row")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Add a stay" }));
    expect(onAdd).toHaveBeenCalled();
  });
});
