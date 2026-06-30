import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/accommodation", () => ({
  createAccommodation: vi.fn().mockResolvedValue({ success: true }),
  updateAccommodation: vi.fn().mockResolvedValue({ success: true }),
}));
import {
  createAccommodation,
  updateAccommodation,
} from "@/server/actions/accommodation";

import { AccommodationFormDialog } from "./accommodation-form-dialog";
import type { AccommodationCardAccommodation } from "./accommodation-card";

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
});
