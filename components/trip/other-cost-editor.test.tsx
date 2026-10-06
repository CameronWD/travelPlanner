import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));
import { createCost, updateCost } from "@/server/actions/costs";

import { OtherCostFormDialog } from "./other-cost-editor";
import type { CostRow } from "@/server/actions/costs";
import { todayLocalISO } from "@/lib/dates";

const baseProps = {
  tripId: "trip-1",
  homeCurrency: "AUD",
  open: true,
  onOpenChange: () => {},
};

const sampleCost: CostRow = {
  id: "cost-1",
  costMinor: 1250,
  paidMinor: null,
  currency: "AUD",
  rateToHome: 1,
  paidAt: null,
  dueDate: null,
  settlement: "BEFORE",
  ownerType: "OTHER",
  ownerId: null,
  label: "Travel insurance",
  category: "Insurance",
};

/** Create mode, or edit mode with `cost` — the form behaviour the old list's dialogs had. */
function renderForm(cost?: CostRow) {
  return render(<OtherCostFormDialog {...baseProps} cost={cost} />);
}

describe("OtherCostFormDialog form behaviour", () => {
  beforeEach(() => vi.clearAllMocks());


  it("hides the paid amount until Paid is ticked", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText(/cost amount/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/cost amount/i), "42.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("42.00");
  });

  it("add flow: choosing Paid on the trip creates the Other cost with settlement ON_TRIP", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "City tax");
    await user.type(screen.getByLabelText(/cost amount/i), "12.50");
    expect(screen.getByRole("radio", { name: "Paid before you go" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Paid on the trip" }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 1250, ownerType: "OTHER", settlement: "ON_TRIP" }),
    );
  });

  it("hides the Due date for an On the trip cost and sends none", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "City tax");
    await user.type(screen.getByLabelText(/cost amount/i), "12.50");
    await user.type(screen.getByLabelText(/due date/i), "2026-11-20");
    await user.click(screen.getByRole("radio", { name: "Paid on the trip" }));
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith("trip-1", expect.not.objectContaining({ dueDate: expect.anything() }));
  });

  it("add flow: cost only -> createCost called with costMinor: 1250 and paidMinor: undefined", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Test cost");
    await user.type(screen.getByLabelText(/cost amount/i), "12.50");
    // Leave Paid unticked.
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
    renderForm();

    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Test cost");
    await user.type(screen.getByLabelText(/cost amount/i), "50.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    // Pre-filled from the cost amount (ADR 0037 — one tick for "cost what I thought").
    const paidInput = screen.getByLabelText(/you paid amount/i);
    expect(paidInput).toHaveValue("50.00");
    await user.clear(paidInput);
    await user.type(paidInput, "48.75");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 5000, paidMinor: 4875, currency: "AUD" }),
    );
  });

  it("a blank cost amount is refused with a field error, never sent as 0", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Test cost");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
  });

  // Trap: gate on parse validity, never string presence (lib/money.ts —
  // parseAmountToMinor returns null for non-empty-but-unparseable input).
  it("an unparseable paid amount (pasted currency symbol) does not submit a paidAt with a null/undefined paidMinor", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Test cost");
    await user.type(screen.getByLabelText(/cost amount/i), "100");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "$150.00");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ paidMinor: undefined, paidAt: undefined }),
    );
  });

  // Trap: zero is a legal paid amount — must not be dropped as falsy.
  it("a genuine 0 paid amount is sent as 0, not dropped as falsy", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Test cost");
    await user.type(screen.getByLabelText(/cost amount/i), "10.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));

    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "0");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createCost).toHaveBeenCalledWith("trip-1", expect.objectContaining({ paidMinor: 0 }));
  });

  it("editing an existing cost prefills from costMinor (1250 -> '12.50') and calls updateCost", async () => {
    const user = userEvent.setup();
    renderForm(sampleCost);

    expect(screen.getByLabelText(/cost amount/i)).toHaveValue("12.50");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({ costMinor: 1250, currency: "AUD", ownerType: "OTHER" }),
    );
  });

  it("editing keeps an On the trip cost On the trip (the Settlement is not reset to BEFORE)", async () => {
    const user = userEvent.setup();
    renderForm({ ...sampleCost, settlement: "ON_TRIP" });
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ settlement: "ON_TRIP" }));
  });

  // Trap: a legacy row with a paid amount but no paid date must open with
  // Paid unticked, and resaving untouched must not invent a date.
  it("editing a legacy cost (paid amount, no paid date) opens with Paid unticked, and resaving leaves it unpaid without clearing the amount", async () => {
    // `paidAt` is the sole "is this paid" signal (CONTEXT.md "Paid").
    const user = userEvent.setup();
    renderForm({ ...sampleCost, paidMinor: 1250, paidAt: null });

    expect(screen.getByRole("checkbox", { name: /paid/i })).not.toBeChecked();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save/i }));

    // paidMinor is omitted (undefined), never resent or nulled, so the
    // existing amount survives as history for whenever Paid is ticked.
    expect(updateCost).toHaveBeenCalledWith(
      "cost-1",
      expect.objectContaining({ costMinor: 1250, paidMinor: undefined, paidAt: undefined }),
    );
  });

  it("shows a Due date input while editing an unpaid cost", () => {
    renderForm(sampleCost);
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
  });

  it("does not show a Due date input while editing a paid cost", () => {
    renderForm({ ...sampleCost, paidMinor: 1250, paidAt: new Date("2026-06-04") });
    expect(screen.queryByLabelText(/due date/i)).not.toBeInTheDocument();
  });

  it("saves a due date entered on an unpaid cost", async () => {
    const user = userEvent.setup();
    renderForm(sampleCost);

    await user.type(screen.getByLabelText(/due date/i), "2026-11-20");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(updateCost).toHaveBeenCalledWith("cost-1", expect.objectContaining({ dueDate: "2026-11-20" }));
  });
});

describe("OtherCostFormDialog Travelling defaults (spec 2026-10-06 §K)", () => {
  beforeEach(() => vi.clearAllMocks());
  const travelling = { currency: "EUR", settlement: "ON_TRIP" as const, paidToday: true };

  it("opens paid today, On the trip, in today's Stop currency — a spend is three taps", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Gelato");
    await user.type(screen.getByLabelText(/cost amount/i), "4.50");
    expect(screen.getByRole("radio", { name: "Paid on the trip" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("4.50");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 450, paidMinor: 450, currency: "EUR", paidAt: todayLocalISO(), settlement: "ON_TRIP" }),
    );
  });

  it("every default stays editable", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Museum pass");
    await user.type(screen.getByLabelText(/cost amount/i), "30.00");
    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("radio", { name: "Paid before you go" }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(createCost).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 3000, paidMinor: undefined, paidAt: undefined, settlement: "BEFORE" }),
    );
  });

  it("an edited paid amount stops following the cost", async () => {
    const user = userEvent.setup();
    render(<OtherCostFormDialog {...baseProps} defaults={travelling} />);
    await user.type(screen.getByPlaceholderText(/travel insurance/i), "Dinner");
    await user.type(screen.getByLabelText(/cost amount/i), "50");
    const paid = screen.getByLabelText(/you paid amount/i);
    await user.clear(paid);
    await user.type(paid, "45");
    await user.type(screen.getByLabelText(/cost amount/i), "0");
    expect(paid).toHaveValue("45");
  });
});
