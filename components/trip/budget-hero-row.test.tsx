import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BudgetHeroRow } from "./budget-hero-row";

describe("BudgetHeroRow", () => {
  const baseProps = {
    costTotalMinor: 312000,
    paidTotalMinor: 184000,
    homeCurrency: "JPY",
    tripNights: 10,
  };

  it("renders the COST TOTAL tile label and amount", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/cost total/i)).toBeInTheDocument();
    // ¥312,000 (JPY is zero-decimal)
    expect(screen.getAllByText(/312,000/).length).toBeGreaterThan(0);
  });

  it("renders the PAID tile with the paid amount", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/^paid$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/184,000/).length).toBeGreaterThan(0);
  });

  it("renders the STILL TO PAY tile with cost − paid", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/still to pay/i)).toBeInTheDocument();
    // 312000 - 184000 = 128000
    expect(screen.getAllByText(/128,000/).length).toBeGreaterThan(0);
  });

  it("renders the COST / DAY tile with a per-day cost", () => {
    render(<BudgetHeroRow {...baseProps} />);
    expect(screen.getByText(/cost\s*\/\s*day/i)).toBeInTheDocument();
    // 312000 / 10 = 31200
    expect(screen.getAllByText(/31,200/).length).toBeGreaterThan(0);
  });

  it("shows — for COST / DAY when tripNights is zero (no-dates guard)", () => {
    render(<BudgetHeroRow {...baseProps} tripNights={0} />);
    expect(screen.getByText(/cost\s*\/\s*day/i)).toBeInTheDocument();
    // Should show a dash/em-dash rather than a number
    expect(screen.getByTestId("est-per-day-value").textContent).toMatch(/^[—–-]$/);
  });

  it("shows — for COST / DAY when tripNights is undefined", () => {
    render(<BudgetHeroRow {...baseProps} tripNights={undefined} />);
    expect(screen.getByText(/cost\s*\/\s*day/i)).toBeInTheDocument();
    expect(screen.getByTestId("est-per-day-value").textContent).toMatch(/^[—–-]$/);
  });

  it("renders amounts with tabular-nums class", () => {
    const { container } = render(<BudgetHeroRow {...baseProps} />);
    const tabularEls = container.querySelectorAll(".tabular-nums");
    expect(tabularEls.length).toBeGreaterThan(0);
  });

  it("renders the paid/cost progress bar", () => {
    const { container } = render(<BudgetHeroRow {...baseProps} />);
    // Bar container should have bg-muted and inner bar bg-success
    expect(container.querySelector(".bg-success")).toBeInTheDocument();
    expect(container.querySelector(".bg-muted")).toBeInTheDocument();
  });

  describe("stat grid layout (LA-031 / LA-032)", () => {
    it("lays four stats out 2-up on phones/tablet and 4-up at lg, without a lone orphan card", () => {
      render(<BudgetHeroRow {...baseProps} />);
      const grid = screen.getByText("Cost / day").closest("[data-stat-grid]") as HTMLElement;
      expect(grid).not.toBeNull();
      expect(grid.className).toContain("grid-cols-2");
      expect(grid.className).toContain("lg:grid-cols-4");
      expect(grid.className).not.toContain("sm:grid-cols-4");
    });

    it("gives Cost / day a full-width row on phones/tablet instead of sitting alone", () => {
      render(<BudgetHeroRow {...baseProps} />);
      const dayTile = screen.getByTestId("est-per-day-value").closest("div") as HTMLElement;
      expect(dayTile.className).toContain("col-span-2");
      expect(dayTile.className).toContain("lg:col-span-1");
    });

    it("money values never split mid-number", () => {
      render(
        <BudgetHeroRow
          costTotalMinor={3000000}
          paidTotalMinor={1879563}
          homeCurrency="AUD"
          tripNights={10}
        />,
      );
      // 3,000,000 - 1,879,563 = 1,120,437 -> $11,204.37
      const paidValue = screen.getByText("$18,795.63");
      expect(paidValue.className).toContain("whitespace-nowrap");
      expect(paidValue.className).not.toContain("break-words");

      const costTotalValue = screen.getByText("$30,000.00");
      expect(costTotalValue.className).toContain("whitespace-nowrap");
      expect(costTotalValue.className).not.toContain("break-words");

      const stillToPayValue = screen.getByText("$11,204.37");
      expect(stillToPayValue.className).toContain("whitespace-nowrap");
      expect(stillToPayValue.className).not.toContain("break-words");

      const perDayValue = screen.getByTestId("est-per-day-value");
      expect(perDayValue.className).toContain("whitespace-nowrap");
      expect(perDayValue.className).not.toContain("break-words");
    });
  });

  // M-8: a six-figure amount at a fixed text-xl overflowed the ~126px Paid /
  // Still-to-pay tiles at 360. Each tile is a size container and the value
  // steps its font size with the tile's own width, so the narrow 2-up tiles
  // get a smaller size and the wide ones keep text-2xl.
  describe("six-figure values fit their tiles (M-8)", () => {
    it("sizes every money value by its tile's width, not the viewport", () => {
      render(
        <BudgetHeroRow
          costTotalMinor={98765432}
          paidTotalMinor={12345678}
          homeCurrency="AUD"
          tripNights={10}
        />,
      );
      const values = [
        screen.getByText("$987,654.32"),
        screen.getByText("$123,456.78"),
        screen.getByText("$864,197.54"),
        screen.getByTestId("est-per-day-value"),
      ];
      for (const value of values) {
        const tile = value.parentElement!;
        expect(tile.className).toMatch(/(^| )@container( |$)/);
        expect(tile.className).toContain("min-w-0");
        expect(value.className).toContain("text-lg");
        expect(value.className).toContain("@[9rem]:text-xl");
        expect(value.className).toContain("@[12rem]:text-2xl");
        // No viewport step left to override the container steps.
        expect(value.className).not.toContain("sm:text-2xl");
        expect(value.className).toContain("whitespace-nowrap");
      }
    });
  });

  describe("showPaid", () => {
    it("defaults to showing the Paid / Still-to-pay tiles and the paid progress bar", () => {
      const { container } = render(<BudgetHeroRow {...baseProps} />);
      expect(screen.getByText(/^paid$/i)).toBeInTheDocument();
      expect(screen.getByText(/still to pay/i)).toBeInTheDocument();
      expect(container.querySelector(".bg-success")).toBeInTheDocument();
    });

    it("hides the Paid / Still-to-pay tiles and the paid progress bar when showPaid is false", () => {
      const { container } = render(<BudgetHeroRow {...baseProps} showPaid={false} />);
      expect(screen.queryByText(/^paid$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/still to pay/i)).not.toBeInTheDocument();
      expect(container.querySelector(".bg-success")).not.toBeInTheDocument();
      expect(screen.queryByText(/paid so far/i)).not.toBeInTheDocument();
    });

    it("still renders the Cost total and Cost / day tiles when showPaid is false", () => {
      render(<BudgetHeroRow {...baseProps} showPaid={false} />);
      expect(screen.getByText(/cost total/i)).toBeInTheDocument();
      expect(screen.getAllByText(/312,000/).length).toBeGreaterThan(0);
      expect(screen.getByText(/cost\s*\/\s*day/i)).toBeInTheDocument();
      expect(screen.getAllByText(/31,200/).length).toBeGreaterThan(0);
    });
  });
});
