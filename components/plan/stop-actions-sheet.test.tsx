import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StopActionsSheet } from "./stop-actions-sheet";

const groups = [
  [{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }, { key: "adjust-dates", label: "Adjust dates", hint: "moves later stops", onSelect: vi.fn() }],
  [{ key: "notes", label: "Notes (2)", onSelect: vi.fn() }],
  [{ key: "delete", label: "Delete Rome", hint: "owner only", destructive: true, onSelect: vi.fn() }],
];

describe("StopActionsSheet (PLAN.md §7.6)", () => {
  it("renders one card per group with 48px rows, hints on the right, delete in coral", () => {
    render(<StopActionsSheet open onOpenChange={vi.fn()} number={3} hue="coral" rough={false} name="Rome" meta="15–22 Dec · 7 nights" groups={groups} />);
    const cards = screen.getAllByRole("group");
    expect(cards).toHaveLength(3);
    const adjust = within(cards[0]).getByRole("button", { name: /Adjust dates/ });
    expect(adjust.className).toContain("min-h-12");
    expect(within(adjust).getByText("moves later stops")).toBeInTheDocument();
    expect(within(cards[2]).getByRole("button", { name: /Delete Rome/ }).className).toContain("text-coral-text");
    expect(screen.getByText("Rome")).toBeInTheDocument();
  });

  it("closes the sheet, then runs the item", async () => {
    const onOpenChange = vi.fn();
    render(<StopActionsSheet open onOpenChange={onOpenChange} number={3} hue="coral" rough={false} name="Rome" meta="" groups={groups} />);
    await userEvent.click(screen.getByRole("button", { name: /Notes \(2\)/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(groups[1][0].onSelect).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    render(<StopActionsSheet open onOpenChange={vi.fn()} number={1} hue="sun" rough name="Munich" meta="" groups={groups} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
