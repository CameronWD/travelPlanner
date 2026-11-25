import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  recordRefund: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ success: true })),
  markRefundReceived: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ success: true })),
  clearRefund: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ success: true })),
}));
vi.mock("@/server/actions/costs", () => actions);
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), todayLocalISO: () => "2026-11-25" }));

import { RefundDialog } from "./refund-dialog";

const paid = { id: "c1", currency: "AUD", paidMinor: 20000 };

beforeEach(() => vi.clearAllMocks());

describe("RefundDialog", () => {
  it("opens pre-filled with the paid amount, and records an Expected refund", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RefundDialog cost={paid} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Refund" })).toBeInTheDocument();
    expect(screen.getByLabelText("Refund amount")).toHaveValue("200.00");
    expect(screen.getByRole("radio", { name: "Expected" })).toBeChecked();
    expect(screen.queryByLabelText("Date received")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove refund" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 20000, null);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Received asks for the date, defaulting to today", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={paid} onClose={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Received" }));
    expect(screen.getByLabelText("Date received")).toHaveValue("2026-11-25");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 20000, "2026-11-25");
  });

  it("shows the rule message and stays open so Save can be retried", async () => {
    actions.recordRefund.mockResolvedValueOnce({ success: false, errors: { _: ["A refund can’t be more than what was paid."] } });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RefundDialog cost={paid} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A refund can’t be more than what was paid.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("offers Remove refund only when one exists, and clears it", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000 }} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Refund amount")).toHaveValue("50.00");
    await user.click(screen.getByRole("button", { name: "Remove refund" }));
    expect(actions.clearRefund).toHaveBeenCalledWith("c1");
  });

  it("opened on Received for an expected refund, marks it received", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000 }} receiving onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Received" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.markRefundReceived).toHaveBeenCalledWith("c1", "2026-11-25");
  });

  it("opened on Received, switched to Expected and saved, records Expected and does not mark it received", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000 }} receiving onClose={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Expected" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 5000, null);
    expect(actions.markRefundReceived).not.toHaveBeenCalled();
  });

  it("opened on Received with the amount changed, records the new amount as received", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000 }} receiving onClose={vi.fn()} />);
    await user.clear(screen.getByLabelText("Refund amount"));
    await user.type(screen.getByLabelText("Refund amount"), "40");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 4000, "2026-11-25");
    expect(actions.markRefundReceived).not.toHaveBeenCalled();
  });

  it("editing a received refund without touching the date sends the same date back", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000, refundedAt: new Date("2026-11-10") }} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Date received")).toHaveValue("2026-11-10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 5000, "2026-11-10");
  });

  it("switching a received refund to Expected sends null", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={{ ...paid, refundMinor: 5000, refundedAt: new Date("2026-11-10") }} onClose={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Expected" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.recordRefund).toHaveBeenCalledWith("c1", 5000, null);
  });

  it("says a zero refund is too small, and a blank one needs an amount", async () => {
    const user = userEvent.setup();
    render(<RefundDialog cost={paid} onClose={vi.fn()} />);
    await user.clear(screen.getByLabelText("Refund amount"));
    await user.type(screen.getByLabelText("Refund amount"), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A refund must be more than zero.");
    await user.clear(screen.getByLabelText("Refund amount"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the refund amount");
    expect(actions.recordRefund).not.toHaveBeenCalled();
  });
});
