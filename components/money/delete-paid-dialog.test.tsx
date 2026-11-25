import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useDeletePaid, type PaidCostForDelete, type DeletePaidResult } from "./delete-paid-dialog";
import { todayLocalISO } from "@/lib/dates";

const one: PaidCostForDelete[] = [{ id: "c1", label: "Hotel", paidMinor: 23521, currency: "AUD" }];
const two: PaidCostForDelete[] = [
  { id: "c1", label: "Room", paidMinor: 10000, currency: "AUD" },
  { id: "c2", label: "Breakfast", paidMinor: 2500, currency: "AUD" },
];

function Harness({ costs, onResult }: { costs: PaidCostForDelete[]; onResult: (r: DeletePaidResult) => void }) {
  const { ask, dialog } = useDeletePaid();
  return (
    <div>
      <button onClick={async () => onResult(await ask({ title: "Delete “Hotel”?", costs }))}>open</button>
      {dialog}
    </div>
  );
}

async function open(costs = one) {
  const onResult = vi.fn();
  render(<Harness costs={costs} onResult={onResult} />);
  await userEvent.click(screen.getByText("open"));
  await screen.findByText("Delete “Hotel”?");
  return onResult;
}

describe("useDeletePaid", () => {
  it("asks about the paid total with Not refunded selected, and confirms with no refunds", async () => {
    const onResult = await open();
    expect(screen.getByText(/You’ve paid \$235\.21 for this\. What happened to the money\?/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Not refunded/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ confirmed: true, refunds: undefined }));
  });

  it("Refunded shows the prefilled amount and a date, and resolves a received refund", async () => {
    const onResult = await open();
    await userEvent.click(screen.getByRole("radio", { name: /^Refunded/ }));
    expect(screen.getByLabelText("Refund amount")).toHaveValue("235.21");
    expect(screen.getByLabelText("Date received")).toHaveValue(todayLocalISO());
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        confirmed: true,
        refunds: [{ costId: "c1", refundMinor: 23521, refundedAt: todayLocalISO() }],
      }),
    );
  });

  it("Refund expected resolves with no date", async () => {
    const onResult = await open();
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    expect(screen.queryByLabelText("Date received")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        confirmed: true,
        refunds: [{ costId: "c1", refundMinor: 23521, refundedAt: null }],
      }),
    );
  });

  it("an amount over what was paid shows the message and disables Delete", async () => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: /^Refunded/ }));
    const input = screen.getByLabelText("Refund amount");
    await userEvent.clear(input);
    await userEvent.type(input, "300");
    expect(screen.getByRole("alert")).toHaveTextContent("A refund can’t be more than what was paid.");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("Cancel resolves unconfirmed", async () => {
    const onResult = await open();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ confirmed: false }));
  });

  it("two paid Costs get two labelled amount inputs", async () => {
    await open(two);
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    expect(screen.getByLabelText(/Refund amount: Room/)).toHaveValue("100.00");
    expect(screen.getByLabelText(/Refund amount: Breakfast/)).toHaveValue("25.00");
  });

  it("with several Costs, an empty amount leaves that Cost out", async () => {
    const onResult = await open(two);
    await userEvent.click(screen.getByRole("radio", { name: /^Refunded/ }));
    expect(screen.getByText("Leave an amount empty if nothing came back on it.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Refund amount: Breakfast/));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        confirmed: true,
        refunds: [{ costId: "c1", refundMinor: 10000, refundedAt: todayLocalISO() }],
      }),
    );
  });

  it("with several Costs, all amounts empty blocks Delete", async () => {
    await open(two);
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    await userEvent.clear(screen.getByLabelText(/Refund amount: Room/));
    await userEvent.type(screen.getByLabelText(/Refund amount: Breakfast/), "{Control>}a{/Control}0");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the refund amount");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("with several Costs, one over its paid amount blocks Delete", async () => {
    await open(two);
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    const input = screen.getByLabelText(/Refund amount: Breakfast/);
    await userEvent.clear(input);
    await userEvent.type(input, "30");
    expect(screen.getByRole("alert")).toHaveTextContent("A refund can’t be more than what was paid.");
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("with one Cost, an empty amount still blocks Delete", async () => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    await userEvent.clear(screen.getByLabelText("Refund amount"));
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("mixed currencies list each Cost with its own amount and no total", async () => {
    await open([
      { id: "c1", label: "Room", paidMinor: 10000, currency: "AUD" },
      { id: "c2", label: "Tour", paidMinor: 5000, currency: "JPY" },
    ]);
    expect(screen.getByText("You’ve paid for this. What happened to the money?")).toBeInTheDocument();
    expect(screen.getByText(/Room: \$100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Tour: .*5,000/)).toBeInTheDocument();
  });

  it("a zero-decimal currency sends the typed amount as is", async () => {
    const onResult = await open([{ id: "c1", label: "Tour", paidMinor: 8000, currency: "JPY" }]);
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    const input = screen.getByLabelText("Refund amount");
    await userEvent.clear(input);
    await userEvent.type(input, "5000");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        confirmed: true,
        refunds: [{ costId: "c1", refundMinor: 5000, refundedAt: null }],
      }),
    );
  });

  it("reads a trailing comma as the decimal point in a two-decimal currency", async () => {
    const onResult = await open();
    await userEvent.click(screen.getByRole("radio", { name: /Refund expected/ }));
    const input = screen.getByLabelText("Refund amount");
    await userEvent.clear(input);
    await userEvent.type(input, "12,50");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        confirmed: true,
        refunds: [{ costId: "c1", refundMinor: 1250, refundedAt: null }],
      }),
    );
  });
});
