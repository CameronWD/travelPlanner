import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PickDaySheet } from "./pick-day-sheet";
import { daySlots } from "@/lib/plan/day-density";

const STOP = { arriveDate: "2026-12-10", departDate: "2026-12-14" };
const SLOTS = daySlots(STOP, [
  ...[1, 2].map((i) => ({ id: `a${i}`, date: "2026-12-10", category: "FOOD" })),
  ...[1, 2, 3, 4, 5].map((i) => ({ id: `b${i}`, date: "2026-12-12", category: "FOOD" })),
], { "2026-12-12": { title: "Versailles day" } });

describe("PickDaySheet (PLAN.md §7.3)", () => {
  it("heads with the idea, one row per day with its load", () => {
    render(<PickDaySheet open onOpenChange={vi.fn()} title="Musée d'Orsay" slots={SLOTS} stop={STOP} onPick={vi.fn()} />);
    expect(screen.getByText("Pick a day for")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Musée d'Orsay" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Thu 10.*Arrive · 2 plans/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sat 12.*Versailles day · full/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sun 13.*Free day/ })).toBeInTheDocument();
  });
  it("selecting a row fills it teal and the CTA adds to that day", async () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    render(<PickDaySheet open onOpenChange={onOpenChange} title="Musée d'Orsay" slots={SLOTS} stop={STOP} onPick={onPick} />);
    expect(screen.getByRole("button", { name: /^Add to/ })).toBeDisabled();
    const sun = screen.getByRole("radio", { name: /Sun 13/ });
    await userEvent.click(sun);
    expect(sun).toHaveAttribute("aria-checked", "true");
    expect(sun.className).toContain("bg-teal");
    await userEvent.click(screen.getByRole("button", { name: "Add to Sun 13" }));
    expect(onPick).toHaveBeenCalledWith("2026-12-13");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("uses no banned soft classes", () => {
    render(<PickDaySheet open onOpenChange={vi.fn()} title="Musée d'Orsay" slots={SLOTS} stop={STOP} onPick={vi.fn()} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
