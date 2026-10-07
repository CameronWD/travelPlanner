import type { Route } from "next";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharedPotTile } from "./shared-pot-tile";

type Props = Parameters<typeof SharedPotTile>[0];

function renderTile(overrides: Partial<Props> = {}) {
  return render(
    <SharedPotTile
      href={"/trips/t1/budget" as Route}
      hasCover
      costTotalMinor={1_110_000}
      paidTotalMinor={400_000}
      currency="AUD"
      nextPayment={{ amountMinor: 11_520, currency: "AUD", label: "Kuta pool villa", dueDate: "2026-12-01" }}
      {...overrides}
    />,
  );
}

describe("SharedPotTile", () => {
  it("has a Shared pot h2, the abbreviated total and the paid progress bar", () => {
    renderTile();
    expect(screen.getByRole("heading", { level: 2, name: /shared pot/i })).toBeInTheDocument();
    expect(screen.getByText("$11.1k")).toBeInTheDocument();
    expect(screen.getByText("planned so far")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Paid" });
    expect(bar).toHaveAttribute("aria-valuenow", "36");
    expect(screen.getByText(/paid · 36%/)).toBeInTheDocument();
  });

  it("shows the next payment with 2 decimals and a day-label due date", () => {
    renderTile();
    expect(screen.getByText(/\$115\.20/)).toBeInTheDocument();
    expect(screen.getByText(/Kuta pool villa/)).toBeInTheDocument();
    expect(screen.getByText("Due Tue 1 Dec")).toBeInTheDocument();
  });

  it("uses the same content in the no-photo (two-column) layout", () => {
    renderTile({ hasCover: false });
    expect(screen.getByText("$115.20")).toBeInTheDocument();
    expect(screen.getByText("Kuta pool villa")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Paid" })).toBeInTheDocument();
  });

  it("shows $0 and an 'Add your first cost' link, with no bar, when nothing is costed", () => {
    renderTile({ costTotalMinor: 0, paidTotalMinor: 0, nextPayment: null });
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first cost" })).toHaveAttribute("href", "/trips/t1/budget");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/paid ·/)).toBeNull();
  });

  it("shows totals under 1,000 in full with 2 decimals", () => {
    renderTile({ costTotalMinor: 95_050, paidTotalMinor: 11_520 });
    expect(screen.getByText("$950.50")).toBeInTheDocument();
    expect(screen.getByText(/\$115\.20 paid/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\$950\.50 planned/ })).toBeInTheDocument();
  });

  it("uses the narrow symbol for the next payment, like the total", () => {
    renderTile({ currency: "EUR", nextPayment: { amountMinor: 11_520, currency: "EUR", label: "Villa", dueDate: "2026-12-01" } });
    expect(screen.getByText(/€115\.20 · Villa/)).toBeInTheDocument();
  });

  it("says 'Nothing due' when there is no upcoming payment", () => {
    renderTile({ nextPayment: null });
    expect(screen.getByText("Nothing due")).toBeInTheDocument();
  });

  it("links the whole tile to Money", () => {
    renderTile();
    expect(screen.getByRole("link", { name: /open money/i })).toHaveAttribute("href", "/trips/t1/budget");
  });
});
