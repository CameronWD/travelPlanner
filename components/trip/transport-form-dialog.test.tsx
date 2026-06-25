import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/transport", () => ({
  createTransport: vi.fn().mockResolvedValue({ success: true }),
  updateTransport: vi.fn().mockResolvedValue({ success: true }),
}));
import { createTransport, updateTransport } from "@/server/actions/transport";

import { TransportFormDialog } from "./transport-form-dialog";
import type { TransportCardTransport } from "./transport-card";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseProps = {
  tripId: "trip-1",
  stops: [
    { id: "stop-a", name: "London" },
    { id: "stop-b", name: "Paris" },
  ],
  open: true,
  onOpenChange: vi.fn(),
};

const existingTransport: TransportCardTransport = {
  id: "transport-99",
  mode: "TRAIN",
  fromStopId: "stop-a",
  toStopId: "stop-b",
  depPlace: "St Pancras",
  arrPlace: "Gare du Nord",
  depAt: new Date("2026-07-10T09:00:00"),
  arrAt: new Date("2026-07-10T12:15:00"),
  reference: "TGV-123",
  notes: "Book seats in advance",
  sortOrder: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransportFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Case 1: no client-side gate — empty submit still calls the action.
  // The component ships all fields as undefined when empty (trimmed "" →
  // undefined), so createTransport is called immediately and server validation
  // rejects it. We assert the action IS called and the server-returned error
  // renders.
  // -------------------------------------------------------------------------
  it("submitting with no fields filled calls createTransport and renders the server-returned mode error", async () => {
    (createTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { mode: ["Mode is required"] },
    });

    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    // Submit immediately — mode defaults to FLIGHT so it still fires
    await user.click(screen.getByRole("button", { name: /add transport/i }));

    // No client-side guard — action IS called
    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ mode: "FLIGHT" }),
    );

    // Server-returned field error is rendered
    expect(await screen.findByText("Mode is required")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2: valid create — correct payload shape
  // -------------------------------------------------------------------------
  it("submitting with departure + arrival places and times calls createTransport with the expected payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    // Fill departure place
    const depPlaceInput = screen.getByPlaceholderText(/heathrow t5/i);
    await user.type(depPlaceInput, "Heathrow T5");

    // Fill arrival place
    const arrPlaceInput = screen.getByPlaceholderText(/cdg terminal 2/i);
    await user.type(arrPlaceInput, "CDG Terminal 2");

    // Fill departure time (datetime-local input)
    const depAtInput = screen.getByLabelText(/departure time/i);
    await user.type(depAtInput, "2026-07-10T09:00");

    // Fill arrival time
    const arrAtInput = screen.getByLabelText(/arrival time/i);
    await user.type(arrAtInput, "2026-07-10T11:30");

    // Fill booking reference
    const refInput = screen.getByPlaceholderText(/ba0123/i);
    await user.type(refInput, "BA0123");

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        mode: "FLIGHT", // default
        depPlace: "Heathrow T5",
        arrPlace: "CDG Terminal 2",
        depAt: "2026-07-10T09:00",
        arrAt: "2026-07-10T11:30",
        reference: "BA0123",
        fromStopId: undefined,
        toStopId: undefined,
      }),
    );
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 3: edit mode — updateTransport is called, not createTransport
  // -------------------------------------------------------------------------
  it("in edit mode submitting calls updateTransport with the transport id and updated payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} transport={existingTransport} />);

    // Dialog title should say "Edit transport"
    expect(
      screen.getByRole("heading", { name: /edit transport/i }),
    ).toBeInTheDocument();

    // Update the departure place
    const depPlaceInput = screen.getByDisplayValue("St Pancras");
    await user.clear(depPlaceInput);
    await user.type(depPlaceInput, "St Pancras International");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({
        mode: "TRAIN",
        depPlace: "St Pancras International",
        arrPlace: "Gare du Nord",
        reference: "TGV-123",
      }),
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 4: server-returned _form error is displayed
  // -------------------------------------------------------------------------
  it("renders a server-returned _form error after submit", async () => {
    (createTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong, please try again"] },
    });

    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(
      await screen.findByText("Something went wrong, please try again"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 5: server-returned field error (depAt) is rendered in the right place
  // -------------------------------------------------------------------------
  it("renders a server-returned depAt field error after submit", async () => {
    (createTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { depAt: ["Departure time must be before arrival time"] },
    });

    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    // Fill just enough to trigger a real submit
    const depPlaceInput = screen.getByPlaceholderText(/heathrow t5/i);
    await user.type(depPlaceInput, "Heathrow T5");

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(
      await screen.findByText("Departure time must be before arrival time"),
    ).toBeInTheDocument();
  });
});
