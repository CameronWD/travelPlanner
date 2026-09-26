import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";

import { CostEditor } from "./cost-editor";
import type { CostRow } from "@/server/actions/costs";

const baseProps = {
  tripId: "trip-1",
  ownerType: "TRANSPORT" as const,
  ownerId: "owner-1",
  costs: [] as CostRow[],
  homeCurrency: "AUD",
  defaultCurrency: "AUD",
};

const sampleCost: CostRow = {
  id: "cost-1",
  costMinor: 5000,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "TRANSPORT",
  ownerId: "owner-1",
  label: null,
  category: null,
  dueDate: null,
  settlement: "BEFORE",
};

const labeledCost: CostRow = {
  id: "cost-2",
  costMinor: 3500,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "TRANSPORT",
  ownerId: "owner-1",
  label: "Train ticket",
  category: null,
  dueDate: null,
  settlement: "BEFORE",
};

describe("CostEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("add flow: cost only -> createCost called with costMinor: 1250 and paidMinor: undefined", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    // Open the add dialog
    await user.click(screen.getByRole("button", { name: /add cost/i }));

    // Type in the cost amount field
    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "12.50");

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 1250,
        paidMinor: undefined,
        currency: "AUD",
      }),
      undefined,
    );
  });

  it("add flow: choosing Paid on the trip sends settlement ON_TRIP; the default is BEFORE", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.type(screen.getByLabelText("Cost amount"), "12.50");
    expect(screen.getByRole("radio", { name: "Paid before you go" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Paid on the trip" }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250, settlement: "ON_TRIP" }),
      undefined,
    );
  });

  it("edit flow: an On the trip cost opens as On the trip and keeps it on save", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[{ ...sampleCost, settlement: "ON_TRIP" }]} />);
    await user.click(screen.getByRole("button", { name: /edit cost/i }));
    expect(screen.getByRole("radio", { name: "Paid on the trip" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ settlement: "ON_TRIP" }));
  });

  it("typing both cost and paid amounts produces both as minor units in createCost payload", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "50.00");

    // The paid amount field is hidden until Paid is ticked (ADR 0037).
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    const actualInput = screen.getByLabelText("You paid amount");
    await user.clear(actualInput);
    await user.type(actualInput, "48.75");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 5000,
        paidMinor: 4875,
      }),
      undefined,
    );
  });

  it("deleting a cost shows a dialog with the cost label and calls deleteCost on confirm", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[labeledCost]} />);

    await user.click(screen.getByRole("button", { name: /delete cost/i }));

    // Dialog appears with the cost label
    expect(await screen.findByText(/Train ticket/)).toBeInTheDocument();

    // Click the Delete button
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    expect(deleteCost).toHaveBeenCalledWith("cost-2");
  });

  it("editing an existing cost opens a prefilled edit dialog and calls updateCost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[sampleCost]} />);

    // Click the edit (pencil) button on the existing cost row
    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    // The cost field should be prefilled from sampleCost.costMinor = 5000 -> "50.00"
    const estimatedInput = screen.getByLabelText("Cost amount");
    expect(estimatedInput).toHaveValue("50.00");

    // Submit without changes
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        costMinor: 5000,
        currency: "AUD",
      }),
    );
  });

  it("a blank cost amount surfaces a field error without ever calling createCost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
    const estimatedInput = screen.getByLabelText("Cost amount");
    expect(estimatedInput).toHaveAttribute("aria-invalid", "true");
    // The blank amount must never reach the server as a coerced 0.
    expect(createCost).not.toHaveBeenCalled();
  });

  it("an unparseable cost amount ($150.00) surfaces a field error without calling createCost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.type(estimatedInput, "$150.00");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
    expect(createCost).not.toHaveBeenCalled();
  });

  it("a _form error appears with role=alert via FormError", async () => {
    (createCost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Server error"] },
    });

    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const estimatedInput = screen.getByLabelText("Cost amount");
    await user.clear(estimatedInput);
    await user.type(estimatedInput, "10.00");

    await user.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });

  it("shows a Due date input while editing an unpaid cost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[sampleCost]} />);

    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
  });

  it("does not show a Due date input while editing a paid cost", async () => {
    const paidCost: CostRow = {
      ...sampleCost,
      paidMinor: 5000,
      paidAt: new Date("2026-06-04"),
    };
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[paidCost]} />);

    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });

  it("saves a due date entered on an unpaid cost", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[sampleCost]} />);

    await user.click(screen.getByRole("button", { name: /edit cost/i }));

    const dueDateInput = screen.getByLabelText(/due date/i);
    await user.type(dueDateInput, "2026-11-20");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({ dueDate: "2026-11-20" }),
    );
  });

  it("files a new cost on the active variant when forkId is supplied", async () => {
    // AB-01: createCost's third argument is the Plan the cost belongs to.
    // Without it, a cost added while a variant is active lands on the real
    // plan, pointing at a fork-owned entity.
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} forkId="fork-9" />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.type(screen.getByLabelText("Cost amount"), "12.50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250 }),
      "fork-9",
    );
  });

  it("files a new cost on the real plan when no forkId is supplied", async () => {
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.type(screen.getByLabelText("Cost amount"), "12.50");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250 }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // LA-037: the edit/delete icon buttons get an invisible 44px coarse-pointer
  // tap target.
  // -------------------------------------------------------------------------
  it("gives the edit and delete cost buttons a 44px tap target", () => {
    render(<CostEditor {...baseProps} costs={[labeledCost]} />);
    expect(screen.getByRole("button", { name: /edit cost/i }).className).toContain("tap-target");
    expect(screen.getByRole("button", { name: /delete cost/i }).className).toContain("tap-target");
  });

  it("ticking Paid on a cost with a stored due date clears it — updateCost is called with no dueDate key", async () => {
    // Regression: parseFormToInput omits `dueDate` whenever form.paid is
    // true, and updateCost writes `dueDate: data.dueDate ?? null`
    // unconditionally — so ticking Paid and saving must clear a previously
    // stored due date, never carry it forward.
    const costWithDueDate: CostRow = { ...sampleCost, dueDate: "2026-11-20" };
    const user = userEvent.setup();
    render(<CostEditor {...baseProps} costs={[costWithDueDate]} />);

    await user.click(screen.getByRole("button", { name: /edit cost/i }));
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalled();
    const call = (updateCost as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(call).not.toHaveProperty("dueDate");
  });
});
