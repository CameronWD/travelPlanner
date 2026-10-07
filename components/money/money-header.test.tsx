import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/other-cost-editor", () => ({
  OtherCostFormDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="add-cost-dialog" /> : null),
}));
vi.mock("@/components/money/add-cost-from-url", () => ({
  AddCostFromUrl: ({ defaults }: { defaults?: { currency: string } }) => (
    <div data-testid="add-cost-from-url" data-currency={defaults?.currency ?? "none"} />
  ),
}));

import { MoneyHeader } from "./money-header";
import { AddCostButton } from "./add-cost-button";

const A = { id: "u1", name: "Cam", image: null };
const B = { id: "u2", name: "Sam", image: null };
const base = { tripId: "t1", slug: "eu", tripName: "Christmas in Europe", meta: "In AUD · 35 nights", members: [A, B], homeCurrency: "AUD", showAddCost: true };

describe("MoneyHeader (MONEY.md §2)", () => {
  it("eyebrow, h1 Money, meta, bell cluster", () => {
    render(<MoneyHeader {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByText("In AUD · 35 nights")).toBeInTheDocument();
    expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
  });

  it("Split with N links to the travellers and needs two people", () => {
    const { rerender } = render(<MoneyHeader {...base} />);
    expect(screen.getByRole("link", { name: "Split with 2" })).toHaveAttribute("href", "/trips/eu/settings#travellers");
    rerender(<MoneyHeader {...base} members={[A]} />);
    expect(screen.queryByRole("link", { name: /Split with/ })).toBeNull();
  });

  it("+ Add a cost is an ink pill at md+ and a round button on phones, hidden on a fork", () => {
    const { rerender } = render(<MoneyHeader {...base} />);
    const pill = within(document.querySelector("[data-slot='page-header-actions']") as HTMLElement).getByRole("button", { name: "Add a cost" });
    for (const c of ["h-11", "rounded-full", "bg-foreground", "text-background", "shadow-cta", "pressable"]) expect(pill.className.split(/\s+/)).toContain(c);
    const round = within(document.querySelector("[data-slot='page-header-mobile-action']") as HTMLElement).getByRole("button", { name: "Add a cost" });
    expect(round.className).toContain("size-11");
    rerender(<MoneyHeader {...base} showAddCost={false} />);
    expect(screen.queryAllByRole("button", { name: "Add a cost" })).toHaveLength(0);
  });

  it("mounts ?add=cost with the Phase defaults, only where a cost can be added (spec 2026-10-06 §F/§K)", () => {
    const { rerender } = render(<MoneyHeader {...base} costDefaults={{ currency: "EUR", settlement: "ON_TRIP", paidToday: true }} />);
    expect(screen.getByTestId("add-cost-from-url")).toHaveAttribute("data-currency", "EUR");
    rerender(<MoneyHeader {...base} showAddCost={false} />);
    expect(screen.queryByTestId("add-cost-from-url")).toBeNull();
  });
});

describe("AddCostButton", () => {
  it("opens the Other cost form", async () => {
    const user = userEvent.setup();
    render(<AddCostButton tripId="t1" homeCurrency="AUD" variant="pill" />);
    await user.click(screen.getByRole("button", { name: "Add a cost" }));
    expect(screen.getByTestId("add-cost-dialog")).toBeInTheDocument();
  });
});
