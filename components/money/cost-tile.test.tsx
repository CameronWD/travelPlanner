import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CostTile } from "./cost-tile";

const totals = {
  costTotalMinor: 1482040,
  paidTotalMinor: 934000,
  beforeTotalMinor: 1120000,
  onTripTotalMinor: 362040,
  beforePaidMinor: 934000,
  onTripPaidMinor: 0,
};
const base = { tripId: "t1", homeCurrency: "AUD", totals, paidSoFarMinor: 934000, nights: 35, memberCount: 2, showPaid: true };

describe("CostTile (MONEY.md §3)", () => {
  it("shows the total split into dollars and cents, with the full amount for screen readers", () => {
    render(<CostTile {...base} />);
    const tile = screen.getByRole("region", { name: "Trip cost" });
    expect(within(tile).getByText("$14,820")).toBeInTheDocument();
    expect(within(tile).getByText(".40")).toBeInTheDocument();
    expect(within(tile).getByText("$14,820.40")).toHaveClass("sr-only");
    expect(within(tile).getByText("Trip cost")).toBeInTheDocument();
  });

  it("reads per night and per person", () => {
    render(<CostTile {...base} />);
    expect(screen.getByText("$423 a night · $7,410 each")).toBeInTheDocument();
  });

  it("drops 'each' for one traveller and the whole line with no nights", () => {
    const { rerender } = render(<CostTile {...base} memberCount={1} />);
    expect(screen.getByText("$423 a night")).toBeInTheDocument();
    rerender(<CostTile {...base} nights={0} />);
    expect(screen.queryByText(/a night/)).toBeNull();
  });

  it("the settlement box: Before you go with what's paid, On the trip as spend money until something is", () => {
    const { rerender } = render(<CostTile {...base} />);
    const box = screen.getByTestId("settlement-box");
    expect(within(box).getByText("Before you go")).toBeInTheDocument();
    expect(within(box).getByText("$11,200")).toBeInTheDocument();
    expect(within(box).getByText("$9,340 paid")).toHaveClass("text-teal-text");
    expect(within(box).getByText("Spend money")).toBeInTheDocument();
    rerender(<CostTile {...base} totals={{ ...totals, onTripPaidMinor: 5000 }} />);
    expect(within(screen.getByTestId("settlement-box")).getByText("$50 paid")).toBeInTheDocument();
  });

  it("the paid bar is a labelled progressbar with paid · % and what's to go", () => {
    render(<CostTile {...base} />);
    const bar = screen.getByRole("progressbar", { name: "Paid so far" });
    expect(bar).toHaveAttribute("aria-valuenow", "63");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar.className).toContain("bg-unpaid-stripe");
    expect(screen.getByText("$5,480 to go")).toBeInTheDocument();
    expect(screen.getByText(/· 63%/)).toHaveClass("hidden", "md:inline");
  });

  it("everything paid reads All paid", () => {
    render(<CostTile {...base} paidSoFarMinor={1482040} />);
    expect(screen.getByText("All paid")).toBeInTheDocument();
    expect(screen.queryByText(/to go/)).toBeNull();
  });

  it("on a fork: no bar, no paid lines, and the variant sentence", () => {
    render(<CostTile {...base} showPaid={false} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/paid$/)).toBeNull();
    expect(screen.queryByText("Spend money")).toBeNull();
    expect(screen.getByText(/Paid tracking lives on the real plan/)).toBeInTheDocument();
  });

  it("a JPY trip shows no cents span", () => {
    render(<CostTile {...base} homeCurrency="JPY" totals={{ ...totals, costTotalMinor: 184000 }} />);
    expect(screen.getByText("¥184,000")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-tile-fraction")).toBeNull();
  });

  it("is teal with hard, token-only styling", () => {
    const { container } = render(<CostTile {...base} />);
    const tile = screen.getByRole("region", { name: "Trip cost" });
    for (const c of ["bg-teal", "text-on-accent", "border-2", "rounded-xl", "shadow-hard-3"]) expect(tile.className.split(/\s+/)).toContain(c);
    expect(tile.className).not.toContain("island");
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70|rounded-2xl|rounded-3xl/);
  });
});
