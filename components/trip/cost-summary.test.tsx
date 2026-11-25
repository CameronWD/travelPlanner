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
  dueDate: null,
  settlement: "BEFORE",
  ownerType: "OTHER",
  ownerId: null,
  label: null,
  category: null,
  refundMinor: null,
  refundedAt: null,
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

  it("shows only the cost amount while unpaid, even if a stale paidMinor exists", () => {
    render(
      <CostSummary
        cost={{ ...baseCost, costMinor: 12000, paidMinor: 11800, paidAt: null }}
      />,
    );
    expect(screen.getByText(/120\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/118\.00/)).not.toBeInTheDocument();
  });

  it("shows only the paid amount once paid", () => {
    render(
      <CostSummary
        cost={{ ...baseCost, costMinor: 12000, paidMinor: 11800, paidAt: new Date() }}
      />,
    );
    expect(screen.getByText(/118\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/120\.00/)).not.toBeInTheDocument();
    expect(screen.getByText(/paid/i)).toBeInTheDocument();
  });

  it("shows the net as the one number, with a Refunded tag, once a Refund is received", () => {
    const { container } = render(
      <CostSummary
        cost={{ ...baseCost, costMinor: 20000, paidMinor: 20000, paidAt: new Date(), refundMinor: 5000, refundedAt: new Date() }}
      />,
    );
    expect(screen.getByText(/150\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/200\.00/)).not.toBeInTheDocument();
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/^Refunded .*50\.00$/);
  });

  it("keeps the full paid amount while the Refund is only expected", () => {
    const { container } = render(
      <CostSummary
        cost={{ ...baseCost, costMinor: 20000, paidMinor: 20000, paidAt: new Date(), refundMinor: 5000, refundedAt: null }}
      />,
    );
    expect(screen.getByText(/200\.00/)).toBeInTheDocument();
    expect(container.querySelector("[data-refund-tag]")).toHaveTextContent(/50\.00 refund expected$/);
  });
});
