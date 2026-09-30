import type * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileStopRow, type MobileStopRowProps } from "./mobile-stop-row";

const DATED = {
  id: "par", name: "Paris", country: "France", timezone: "Europe/Paris",
  arriveDate: "2026-12-10", departDate: "2026-12-15",
  nights: null, pinned: false, chapterId: null, sortOrder: 0, notes: null, lat: null, lng: null,
};
const ROUGH = { ...DATED, id: "mun", name: "Munich", arriveDate: null, departDate: null, nights: 5, timezone: null };
const COVERED = { kind: "covered" as const, name: "The Hoxton", totalNights: 5, coveredNights: 5, extra: 0, checkInTime: null };
const NONE = { kind: "none" as const, name: null, totalNights: 5, coveredNights: 0, extra: 0, checkInTime: null };

function renderRow(p: Partial<MobileStopRowProps> = {}) {
  const props: MobileStopRowProps = {
    stop: DATED, number: 1, stay: COVERED, plansCount: 9, onOpen: vi.fn(), ...p,
  };
  return { props, ...render(<MobileStopRow {...props} />) };
}

describe("MobileStopRow (PLAN.md §7.1)", () => {
  it("a dated row: whole-row tap target, tile, name, stay summary, dates and nights pill", () => {
    const { container } = renderRow();
    const row = screen.getByRole("button", { name: "Open Paris" });
    expect(row).toHaveAttribute("id", "m-stop-par");
    expect(row).toHaveAttribute("data-mobile-stop-id", "par");
    expect(row.className).toMatch(/min-h-16/);
    expect(row.className).toMatch(/rounded-\[18px\]/);
    expect(row.className).toMatch(/border-2/);
    expect(row.className).toMatch(/shadow-hard-3/);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Paris").className).toMatch(/text-\[19px\]/);
    expect(screen.getByText(/The Hoxton · 9 plans/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("10–15 Dec")).toBeInTheDocument();
    expect(screen.getByText("5n")).toBeInTheDocument();
  });

  it("stay.kind === 'none': coral 'No bed yet · n plans'", () => {
    renderRow({ stay: NONE, plansCount: 4 });
    const summary = screen.getByText("No bed yet · 4 plans");
    expect(summary.className).toMatch(/text-coral-text/);
  });

  it("says 1 plan, not 1 plans", () => {
    renderRow({ stay: NONE, plansCount: 1 });
    expect(screen.getByText("No bed yet · 1 plan")).toBeInTheDocument();
  });

  it("a rough row: dashed, no card background/shadow, 'Drag to reorder', Rough + ~5n, dragProps spread", () => {
    const { container } = renderRow({
      stop: ROUGH,
      stay: null,
      plansCount: 0,
      dragProps: { "aria-roledescription": "sortable" } as React.HTMLAttributes<HTMLButtonElement>,
    });
    const row = screen.getByRole("button", { name: "Open Munich" });
    expect(row.className).toMatch(/border-dashed/);
    expect(row.className).toContain("bg-background");
    expect(row.className).not.toMatch(/shadow-hard-3/);
    expect(row).toHaveAttribute("aria-roledescription", "sortable");
    expect(screen.getByText("Drag to reorder")).toBeInTheDocument();
    expect(screen.getByText("Rough")).toBeInTheDocument();
    expect(screen.getByText("~5n")).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it("clicking the row calls onOpen", async () => {
    const onOpen = vi.fn();
    renderRow({ onOpen });
    await userEvent.click(screen.getByRole("button", { name: "Open Paris" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("uses no banned soft classes", () => {
    const { container } = renderRow();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
