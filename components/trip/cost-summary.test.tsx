import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CostSummary } from "./cost-summary";
import type { CostRow } from "@/server/actions/costs";

const baseCost: CostRow = {
  id: "c1",
  costMinor: 34000,
  paidMinor: null,
  currency: "GBP",
  rateToHome: null,
  paidAt: null,
  ownerType: "OTHER",
  ownerId: null,
  label: null,
  category: null,
};

describe("CostSummary", () => {
  it("shows the paid badge for a paid cost", () => {
    render(
      <CostSummary
        cost={{ ...baseCost, paidMinor: 34000, paidAt: new Date("2026-06-04") }}
        homeCurrency="GBP"
      />,
    );
    expect(screen.getByLabelText(/paid/i)).toBeInTheDocument();
  });

  it("shows no paid badge for an unpaid cost", () => {
    render(
      <CostSummary
        cost={{ ...baseCost, paidMinor: null, paidAt: null }}
        homeCurrency="GBP"
      />,
    );
    expect(screen.queryByLabelText(/paid/i)).not.toBeInTheDocument();
  });

  it("shows the paid badge for a legacy paid cost with no paid amount (pre-backfill row)", () => {
    render(
      <CostSummary
        cost={{ ...baseCost, paidMinor: null, paidAt: new Date("2026-06-04") }}
        homeCurrency="GBP"
      />,
    );
    expect(screen.getByLabelText(/paid/i)).toBeInTheDocument();
  });
});
