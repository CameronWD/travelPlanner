import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({ recordRefund: vi.fn(), markRefundReceived: vi.fn(), clearRefund: vi.fn() }));

import { RefundsWaitingCard } from "./refunds-waiting-card";
import type { ToPayRow } from "@/lib/money/to-pay";
import type { CostRow } from "@/lib/money/cost-row";

function row(id: string, over: Partial<ToPayRow> = {}): ToPayRow {
  return {
    id, label: `Thing ${id}`, ownerType: "OTHER", paid: true, legacy: false, costMinor: 20000, paidMinor: 20000, currency: "AUD",
    foreign: false, originalMinor: 20000, homeMinor: 20000, refund: { minor: 5000, homeMinor: 5000, state: "expected", on: null },
    dueLine: "", dueTone: "paid", unpaidDueLine: "", unpaidDueTone: "none", ...over,
  };
}
const costs = ["a", "b"].map((id) => ({ id, currency: "AUD", paidMinor: 20000, refundMinor: 5000, refundedAt: null })) as unknown as CostRow[];

describe("RefundsWaitingCard", () => {
  it("lists one line per expected refund under the heading", () => {
    render(<RefundsWaitingCard rows={[row("a"), row("b")]} costs={costs} homeCurrency="AUD" />);
    expect(screen.getByRole("heading", { name: "Refunds you’re waiting on" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Received/ })).toHaveLength(2);
  });

  it("shows the Cost's currency beside the Home amount when they differ", () => {
    render(
      <RefundsWaitingCard
        rows={[row("a", { currency: "EUR", foreign: true, refund: { minor: 4000, homeMinor: 6500, state: "expected", on: null } })]}
        costs={costs}
        homeCurrency="AUD"
      />,
    );
    expect(screen.getByRole("listitem")).toHaveTextContent(/40/);
    expect(screen.getByRole("listitem")).toHaveTextContent(/65/);
  });

  it("renders nothing with no rows", () => {
    const { container } = render(<RefundsWaitingCard rows={[]} costs={costs} homeCurrency="AUD" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Received opens the refund dialog on Received", async () => {
    const user = userEvent.setup();
    render(<RefundsWaitingCard rows={[row("a")]} costs={costs} homeCurrency="AUD" />);
    await user.click(screen.getByRole("button", { name: /^Received/ }));
    expect(await screen.findByRole("radio", { name: "Received" })).toBeChecked();
  });
});
