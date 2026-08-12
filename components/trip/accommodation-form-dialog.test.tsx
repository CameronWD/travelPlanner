import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/accommodation", () => ({
  createAccommodation: vi.fn().mockResolvedValue({ success: true }),
  updateAccommodation: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
import {
  createAccommodation,
  updateAccommodation,
} from "@/server/actions/accommodation";

import { AccommodationFormDialog } from "./accommodation-form-dialog";
import type { AccommodationCardAccommodation } from "./accommodation-card";
import type { CostRow } from "@/server/actions/costs";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const stopDateRange = { arriveDate: "2026-07-10", departDate: "2026-07-15" };

const baseProps = {
  stopId: "stop-1",
  stopDateRange,
  open: true,
  onOpenChange: vi.fn(),
};

const existingAccommodation: AccommodationCardAccommodation = {
  id: "acc-1",
  stopId: "stop-1",
  name: "Hilton Garden Inn",
  address: "123 Main St",
  checkIn: "2026-07-10",
  checkOut: "2026-07-13",
  confirmation: "HGI-ABC",
  notes: "Breakfast included",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AccommodationFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Case 1: basic render in add mode
  // -------------------------------------------------------------------------
  it("renders in add mode with the correct heading", () => {
    render(<AccommodationFormDialog {...baseProps} />);
    expect(
      screen.getByRole("heading", { name: /add accommodation/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2: edit mode heading
  // -------------------------------------------------------------------------
  it("renders in edit mode with the accommodation name in the heading", () => {
    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /edit hilton garden inn/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 3: valid create — submit calls createAccommodation
  // -------------------------------------------------------------------------
  it("submitting a filled form calls createAccommodation with the expected payload", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(createAccommodation).toHaveBeenCalledWith(
      expect.objectContaining({
        stopId: "stop-1",
        name: "My Hotel",
        checkIn: stopDateRange.arriveDate,
        checkOut: stopDateRange.departDate,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 4: edit mode — updateAccommodation is called, not createAccommodation
  // -------------------------------------------------------------------------
  it("in edit mode submitting calls updateAccommodation with the accommodation id", async () => {
    const user = userEvent.setup();
    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    expect(updateAccommodation).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ name: "Hilton Garden Inn" }),
    );
    expect(createAccommodation).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 5: server-returned _form error is displayed
  // -------------------------------------------------------------------------
  it("renders a server-returned _form error after submit", async () => {
    (createAccommodation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong"] },
    });

    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(
      await screen.findByText("Something went wrong"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 6: soft date-order warning — check-out <= check-in shows warning,
  //          submit stays enabled
  // -------------------------------------------------------------------------
  it("shows a check-out date-order warning when check-out is on or before check-in, but submit stays enabled", async () => {
    const user = userEvent.setup();
    // Use a stopDateRange where both dates are the same so defaults won't
    // trigger the warning — set check-out < check-in manually via the inputs
    const sameRange = { arriveDate: "2026-07-12", departDate: "2026-07-12" };
    render(
      <AccommodationFormDialog
        {...baseProps}
        stopDateRange={sameRange}
      />,
    );

    // Find the check-in and check-out inputs by label
    const checkInInput = screen.getByLabelText(/check-in/i);
    const checkOutInput = screen.getByLabelText(/check-out/i);

    // Set check-out BEFORE check-in (inverted)
    await user.clear(checkInInput);
    await user.type(checkInInput, "2026-07-15");
    await user.clear(checkOutInput);
    await user.type(checkOutInput, "2026-07-10");

    // Warning should appear
    expect(
      screen.getByText(/check-out is on or before check-in/i),
    ).toBeInTheDocument();

    // Submit button must remain enabled
    expect(
      screen.getByRole("button", { name: /add accommodation/i }),
    ).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Case 7: date-order warning disappears when one field is cleared
  // -------------------------------------------------------------------------
  it("hides the check-out date-order warning when one of the date fields is cleared", async () => {
    const user = userEvent.setup();
    const sameRange = { arriveDate: "2026-07-12", departDate: "2026-07-12" };
    render(
      <AccommodationFormDialog
        {...baseProps}
        stopDateRange={sameRange}
      />,
    );

    const checkInInput = screen.getByLabelText(/check-in/i);
    const checkOutInput = screen.getByLabelText(/check-out/i);

    // Set inverted order
    await user.clear(checkInInput);
    await user.type(checkInInput, "2026-07-15");
    await user.clear(checkOutInput);
    await user.type(checkOutInput, "2026-07-10");

    // Warning present
    expect(
      screen.getByText(/check-out is on or before check-in/i),
    ).toBeInTheDocument();

    // Clear check-out — warning should disappear
    await user.clear(checkOutInput);

    expect(
      screen.queryByText(/check-out is on or before check-in/i),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 8: no date-order warning when order is valid
  // -------------------------------------------------------------------------
  it("does not show a date-order warning when check-out is after check-in", async () => {
    render(<AccommodationFormDialog {...baseProps} />);

    // Defaults: checkIn = 2026-07-10, checkOut = 2026-07-15 (valid order)
    expect(
      screen.queryByText(/check-out is on or before check-in/i),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 9: field error wires aria-invalid to the name control via Field slot
  // -------------------------------------------------------------------------
  it("a name field error renders via Field error slot and sets aria-invalid on the control", async () => {
    (createAccommodation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Accommodation name is required"] },
    });

    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} />);

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(await screen.findByText("Accommodation name is required")).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
  });

  // -------------------------------------------------------------------------
  // Case 10: _form error appears with role=alert via FormError
  // -------------------------------------------------------------------------
  it("_form error renders with role=alert", async () => {
    (createAccommodation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Server error"] },
    });

    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });

  // -------------------------------------------------------------------------
  // Case 11: cost fields render when no costs prop
  // -------------------------------------------------------------------------
  it("renders a cost input when no costs are passed (add mode)", () => {
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);
    expect(
      screen.getByRole("textbox", { name: /^cost amount$/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 12: Paid checkbox appears after entering a cost amount; ticking it
  // reveals the "you paid" amount and date-paid fields
  // -------------------------------------------------------------------------
  it("shows a Paid checkbox after a cost amount is entered, and ticking it reveals paid amount and date paid fields", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);

    const costInput = screen.getByRole("textbox", { name: /^cost amount$/i });
    await user.type(costInput, "100");

    const paidCheckbox = screen.getByRole("checkbox", { name: /paid/i });
    expect(paidCheckbox).not.toBeChecked();
    expect(
      screen.queryByRole("textbox", { name: /you paid amount/i }),
    ).not.toBeInTheDocument();

    await user.click(paidCheckbox);

    expect(
      screen.getByRole("textbox", { name: /you paid amount/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/date paid/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 13: cost fields hidden when >1 costs (CostEditor authoritative)
  // -------------------------------------------------------------------------
  it("hides the cost field when >1 costs are passed (CostEditor authoritative)", () => {
    const multipleCosts: CostRow[] = [
      {
        id: "c-1",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 5000,
        paidMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        label: null,
        category: null,
      },
      {
        id: "c-2",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 3000,
        paidMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        label: null,
        category: null,
      },
    ];

    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
        costs={multipleCosts}
        homeCurrency="AUD"
      />,
    );

    expect(
      screen.queryByRole("textbox", { name: /^cost amount$/i }),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 14: single existing cost prefills the cost field
  // -------------------------------------------------------------------------
  it("prefills the cost from a single existing cost in edit mode", () => {
    const singleCost: CostRow[] = [
      {
        id: "c-1",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 25000,
        paidMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        label: null,
        category: null,
      },
    ];

    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
        costs={singleCost}
        homeCurrency="AUD"
      />,
    );

    const costInput = screen.getByRole("textbox", { name: /^cost amount$/i });
    // 25000 minor units in EUR = 250.00
    expect(costInput).toHaveValue("250.00");
  });

  // -------------------------------------------------------------------------
  // Case 14b: editing a cost that's already paid opens with the box ticked
  // -------------------------------------------------------------------------
  it("opens with the Paid box ticked when editing a cost that has already been paid", () => {
    const paidCost: CostRow[] = [
      {
        id: "c-1",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 25000,
        paidMinor: 25000,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: new Date("2026-07-02"),
        label: null,
        category: null,
      },
    ];

    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
        costs={paidCost}
        homeCurrency="AUD"
      />,
    );

    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    const paidInput = screen.getByRole("textbox", { name: /you paid amount/i });
    expect(paidInput).toHaveValue("250.00");
  });

  // -------------------------------------------------------------------------
  // Case 15: submitting with a cost passes costMinor + currency to the action
  // -------------------------------------------------------------------------
  it("submitting with a cost includes costMinor and currency in the payload", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    const costInput = screen.getByRole("textbox", { name: /^cost amount$/i });
    await user.type(costInput, "150.00");

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(createAccommodation).toHaveBeenCalledWith(
      expect.objectContaining({
        costMinor: 15000,
        currency: "AUD",
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 15b: un-ticking Paid on an already-paid cost clears the payment
  // -------------------------------------------------------------------------
  it("un-ticking Paid clears paidMinor and paidAt in the submitted payload", async () => {
    const user = userEvent.setup();
    const paidCost: CostRow[] = [
      {
        id: "c-1",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 25000,
        paidMinor: 25000,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: new Date("2026-07-02"),
        label: null,
        category: null,
      },
    ];

    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
        costs={paidCost}
        homeCurrency="AUD"
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateAccommodation).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        paidMinor: null,
        paidAt: null,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 15c: ticking Paid then clearing the amount must not submit a date
  // with no amount (review finding — was previously gated on the checkbox
  // alone, not on the amount actually being present)
  // -------------------------------------------------------------------------
  it("clearing the paid amount after ticking Paid does not submit a paidAt with a null paidMinor", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    const costInput = screen.getByRole("textbox", { name: /^cost amount$/i });
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidInput = screen.getByRole("textbox", { name: /you paid amount/i });
    await user.clear(paidInput);

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(createAccommodation).toHaveBeenCalledWith(
      expect.objectContaining({
        paidMinor: null,
        paidAt: null,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 15d: clearing the paid date while an amount remains defaults the
  // date to today rather than submitting a null date paired with an amount
  // (review finding — keeps amount/date paired in both directions)
  // -------------------------------------------------------------------------
  it("clearing the paid date while a paid amount remains defaults the date instead of sending null", async () => {
    const user = userEvent.setup();
    render(<AccommodationFormDialog {...baseProps} homeCurrency="AUD" />);

    const nameInput = screen.getByPlaceholderText(/hilton garden inn/i);
    await user.type(nameInput, "My Hotel");

    const costInput = screen.getByRole("textbox", { name: /^cost amount$/i });
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const dateInput = screen.getByLabelText(/date paid/i);
    await user.clear(dateInput);

    await user.click(
      screen.getByRole("button", { name: /add accommodation/i }),
    );

    expect(createAccommodation).toHaveBeenCalledWith(
      expect.objectContaining({
        paidMinor: 10000,
        paidAt: expect.any(String),
      }),
      undefined,
    );
    const [payload] = (createAccommodation as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.paidAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 14c: a legacy cost with a paid amount but no paid date still opens
  // with the box ticked (review finding — seed must not require paidAt alone)
  // -------------------------------------------------------------------------
  it("opens with the Paid box ticked when editing a legacy cost that has an amount but no paid date", () => {
    const legacyPaidCost: CostRow[] = [
      {
        id: "c-1",
        ownerType: "ACCOMMODATION",
        ownerId: "acc-1",
        costMinor: 25000,
        paidMinor: 25000,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        label: null,
        category: null,
      },
    ];

    render(
      <AccommodationFormDialog
        {...baseProps}
        accommodation={existingAccommodation}
        costs={legacyPaidCost}
        homeCurrency="AUD"
      />,
    );

    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    expect(screen.getByRole("textbox", { name: /you paid amount/i })).toHaveValue("250.00");
  });

  // -------------------------------------------------------------------------
  // Case 16: currency defaults to homeCurrency prop
  // -------------------------------------------------------------------------
  it("currency defaults to the homeCurrency prop when no existing cost", () => {
    render(<AccommodationFormDialog {...baseProps} homeCurrency="GBP" />);
    // The currency select should show GBP as the selected value
    expect(screen.getByRole("combobox", { name: /currency/i })).toHaveTextContent("GBP");
  });
});
