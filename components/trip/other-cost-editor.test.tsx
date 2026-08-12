import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost, deleteCost } from "@/server/actions/costs";

import { OtherCostEditor } from "./other-cost-editor";
import type { CostRow } from "@/server/actions/costs";

const baseProps = {
  tripId: "trip-1",
  costs: [] as CostRow[],
  homeCurrency: "AUD",
  defaultCurrency: "AUD",
};

const sampleCost: CostRow = {
  id: "cost-1",
  costMinor: 1250,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  ownerType: "OTHER",
  ownerId: null,
  label: "Travel insurance",
  category: "Insurance",
};

function renderEditor(props: Partial<typeof baseProps> = {}) {
  return render(<OtherCostEditor {...baseProps} {...props} />);
}

describe("OtherCostEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the paid amount until Paid is ticked", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add (other )?cost/i }));

    expect(screen.getByLabelText(/cost amount/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/cost amount/i), "42.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("42.00");
  });

  it("add flow: cost only -> createCost called with costMinor: 1250 and paidMinor: undefined", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Open the add dialog
    await user.click(screen.getByRole("button", { name: /add cost/i }));

    // Fill in description (required)
    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    // Type in the cost amount field
    const costInput = screen.getByLabelText(/cost amount/i);
    await user.clear(costInput);
    await user.type(costInput, "12.50");

    // Leave Paid unticked.

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 1250,
        paidMinor: undefined,
        paidAt: undefined,
        currency: "AUD",
        ownerType: "OTHER",
      }),
    );
  });

  it("ticking Paid pre-fills the paid amount from the cost, and both parse to minor units in createCost payload", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    const costInput = screen.getByLabelText(/cost amount/i);
    await user.clear(costInput);
    await user.type(costInput, "50.00");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    // Pre-filled from the cost amount (ADR 0037 — one tick for "cost what I thought").
    const paidInput = screen.getByLabelText(/you paid amount/i);
    expect(paidInput).toHaveValue("50.00");
    await user.clear(paidInput);
    await user.type(paidInput, "48.75");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 5000,
        paidMinor: 4875,
        currency: "AUD",
      }),
    );
  });

  // ---------------------------------------------------------------------
  // Trap: gate on parse validity, never string presence (lib/money.ts —
  // parseAmountToMinor returns null for non-empty-but-unparseable input).
  // ---------------------------------------------------------------------
  it("an unparseable paid amount (pasted currency symbol) does not submit a paidAt with a null/undefined paidMinor", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    const costInput = screen.getByLabelText(/cost amount/i);
    await user.clear(costInput);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "$150.00");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: undefined,
      }),
    );
  });

  // ---------------------------------------------------------------------
  // Trap: zero is a legal paid amount — must not be dropped as falsy.
  // ---------------------------------------------------------------------
  it("a genuine 0 paid amount is sent as 0, not dropped as falsy", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /add cost/i }));

    const labelInput = screen.getByPlaceholderText(/travel insurance/i);
    await user.clear(labelInput);
    await user.type(labelInput, "Test cost");

    const costInput = screen.getByLabelText(/cost amount/i);
    await user.clear(costInput);
    await user.type(costInput, "10.00");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "0");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: 0,
      }),
    );
  });

  it("editing an existing cost prefills from costMinor (1250 -> '12.50') and calls updateCost", async () => {
    const user = userEvent.setup();
    renderEditor({ costs: [sampleCost] });

    // Click the edit (pencil) button on the existing cost row
    await user.click(
      screen.getByRole("button", { name: /edit travel insurance/i }),
    );

    // The cost field should be prefilled from sampleCost.costMinor = 1250 -> "12.50"
    const costInput = screen.getByLabelText(/cost amount/i);
    expect(costInput).toHaveValue("12.50");

    // Submit without changes
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        costMinor: 1250,
        currency: "AUD",
        ownerType: "OTHER",
      }),
    );
  });

  // ---------------------------------------------------------------------
  // Trap: a legacy row with a paid amount but no paid date must open with
  // Paid already ticked, and resaving untouched must not invent a date.
  // ---------------------------------------------------------------------
  it("editing a legacy cost (paid amount, no paid date) opens with Paid ticked and resaving does not invent a date", async () => {
    const user = userEvent.setup();
    const legacyCost: CostRow = {
      ...sampleCost,
      paidMinor: 1250,
      paidAt: null,
    };
    renderEditor({ costs: [legacyCost] });

    await user.click(screen.getByRole("button", { name: /edit travel insurance/i }));

    const paidCheckbox = screen.getByRole("checkbox", { name: /paid/i });
    expect(paidCheckbox).toBeChecked();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("12.50");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({
        costMinor: 1250,
        paidMinor: 1250,
        paidAt: undefined,
      }),
    );
  });

  it("deleting a cost calls deleteCost with the cost id after confirming the dialog", async () => {
    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} costs={[sampleCost]} />);

    await user.click(
      screen.getByRole("button", { name: /delete travel insurance/i }),
    );

    // Dialog appears — click the Delete button
    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    expect(deleteCost).toHaveBeenCalledWith("cost-1");
  });

  it("delete dialog shows the cost label in the title", async () => {
    const user = userEvent.setup();
    render(<OtherCostEditor {...baseProps} costs={[sampleCost]} />);

    await user.click(
      screen.getByRole("button", { name: /delete travel insurance/i }),
    );

    // Dialog title (h2) should contain the cost label in quotes
    expect(await screen.findByText(/Delete "Travel insurance"\?/)).toBeInTheDocument();
  });

  it("home-currency equivalent uses convertMinor scaling for JPY->AUD (not raw multiply)", () => {
    // ¥100,000 at rate 0.011 should display as A$1,100.00 (convertMinor result: 110000 minor AUD),
    // NOT A$11.00 (the wrong raw-multiply result: Math.round(100000 * 0.011) = 1100 minor AUD).
    const jpyCost: CostRow = {
      id: "cost-jpy",
      costMinor: 100000,
      paidMinor: null,
      currency: "JPY",
      rateToHome: 0.011,
      paidAt: null,
      ownerType: "OTHER",
      ownerId: null,
      label: "Shinkansen ticket",
      category: null,
    };

    render(
      <OtherCostEditor
        {...baseProps}
        homeCurrency="AUD"
        costs={[jpyCost]}
      />,
    );

    // The correct converted display must be A$1,100.00, not A$11.00
    expect(screen.getByText(/1,100\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/≈.*11\.00/)).not.toBeInTheDocument();
  });

  it("renders the Add cost button above the cost list", () => {
    render(<OtherCostEditor {...baseProps} costs={[sampleCost]} />);

    const btn = screen.getByRole("button", { name: /add cost/i });
    const list = screen.getByTestId("other-cost-list");

    // Button should appear before the list in document order
    expect(btn.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
