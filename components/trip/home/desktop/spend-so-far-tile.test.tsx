import type { Route } from "next";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpendSoFarTile } from "./spend-so-far-tile";

type Props = Parameters<typeof SpendSoFarTile>[0];

function renderTile(overrides: Partial<Props> = {}) {
  return render(
    <SpendSoFarTile
      href={"/trips/t1/budget" as Route}
      currency="AUD"
      paidSoFarMinor={420_000}
      costTotalMinor={1_110_000}
      varianceMinor={-12_550}
      tripElapsedPct={14}
      {...overrides}
    />,
  );
}

describe("SpendSoFarTile", () => {
  it("is a sun tile with a 'Spend so far' h2, the paid figure and the cost it is against", () => {
    const { container } = renderTile();
    expect(screen.getByRole("heading", { level: 2, name: /spend so far/i })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-sun");
    expect(screen.getByText("$4.2k")).toBeInTheDocument();
    expect(screen.getByText("of $11.1k cost")).toBeInTheDocument();
  });

  it("shows the variance with 2 decimals below 1,000 and the trip elapsed", () => {
    renderTile();
    expect(screen.getByText("$125.50 under")).toBeInTheDocument();
    expect(screen.getByText("≈14% of the trip elapsed")).toBeInTheDocument();
  });

  it("reads 'over' when paid runs past the estimates", () => {
    renderTile({ varianceMinor: 30_000 });
    expect(screen.getByText("$300.00 over")).toBeInTheDocument();
  });

  it("stretches one link to Money with the paid figure in its name", () => {
    renderTile();
    expect(screen.getByRole("link", { name: "Spend so far: $4.2k paid. Open Money" })).toHaveAttribute(
      "href",
      "/trips/t1/budget",
    );
  });

  it("shows $0 and 'Add your first cost' when nothing is costed", () => {
    renderTile({ paidSoFarMinor: 0, costTotalMinor: 0, varianceMinor: 0, tripElapsedPct: null });
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first cost" })).toHaveAttribute("href", "/trips/t1/budget");
    expect(screen.queryByText(/under|over/)).toBeNull();
  });

  it("is a shared pot — never per person", () => {
    const { container } = renderTile();
    expect(container.textContent).not.toMatch(/per person|each/i);
  });
});
