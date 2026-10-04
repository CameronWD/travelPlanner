import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/transport", () => ({
  createTransport: vi.fn().mockResolvedValue({ success: true }),
  updateTransport: vi.fn().mockResolvedValue({ success: true }),
  searchPlacesAction: vi.fn().mockResolvedValue({ status: "ok", candidates: [] }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/trip/ai-booking-parser", () => ({
  AiBookingParser: () => <div data-testid="ai-booking-parser" />,
}));
const motionPref = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motionPref.reduced,
}));
import { createTransport, updateTransport } from "@/server/actions/transport";
import { deleteAttachment } from "@/server/actions/attachments";

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
// Helper: open a LocationCombobox by its aria-label prefix and click an option
// ---------------------------------------------------------------------------

async function openComboboxAndSelectStop(
  user: ReturnType<typeof userEvent.setup>,
  labelPrefix: string,
  optionText: string | RegExp,
) {
  // The combobox trigger button has aria-label like "From: — none —" or "To: — none —"
  const trigger = screen.getByRole("button", { name: new RegExp(labelPrefix, "i") });
  await user.click(trigger);
  const option = await screen.findByRole("button", { name: optionText });
  await user.click(option);
}

async function openComboboxAndTypePlace(
  user: ReturnType<typeof userEvent.setup>,
  labelPrefix: string,
  placeName: string,
) {
  // Open the popover
  const trigger = screen.getByRole("button", { name: new RegExp(labelPrefix, "i") });
  await user.click(trigger);
  // The search input inside the popover
  const searchInput = await screen.findByPlaceholderText(/type to filter or search/i);
  await user.type(searchInput, placeName);
  // Use the "place" option that's typed in: click "Use …" button which appears
  // when user types but no candidates (handled via the search candidates list).
  // In our combobox, we need to search first then select a candidate.
  // Mock returns empty candidates, so we rely on the "Use typed text" approach.
  // Actually, the combobox doesn't have a "use typed text" button by default.
  // We need to trigger the search and have the mock return a candidate.
  // Re-mock searchPlacesAction to return a candidate for this search.
  const { searchPlacesAction } = await import("@/server/actions/transport");
  (searchPlacesAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    status: "ok",
    candidates: [{ name: placeName, lat: 0, lon: 0 }],
  });
  // Click the search button
  const searchBtn = screen.getByRole("button", { name: new RegExp(`search.*${placeName}`, "i") });
  await user.click(searchBtn);
  // Click the candidate result
  const candidate = await screen.findByRole("button", { name: placeName });
  await user.click(candidate);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransportFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps Leaves and Arrives paired in the same grid, in create mode", () => {
    render(<TransportFormDialog {...baseProps} />);
    const leaves = screen.getByLabelText(/leaves/i);
    const arrives = screen.getByLabelText(/arrives/i);
    const pair = leaves.closest("div.grid");
    expect(pair).not.toBeNull();
    expect(pair).toContainElement(arrives);
  });

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
    await user.click(screen.getByRole("button", { name: "Add flight" }));

    // No client-side guard — action IS called
    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ mode: "FLIGHT" }),
      undefined,
    );

    // Server-returned field error is rendered
    expect(await screen.findByText("Mode is required")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2: valid create — From stop + To place via combobox
  // -------------------------------------------------------------------------
  it("picking a From stop and a To place via combobox submits with fromStopId set and arrPlace set", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    // Pick a stop for From
    await openComboboxAndSelectStop(user, "^From:", "London");

    // Pick a place for To via search
    await openComboboxAndTypePlace(user, "^To:", "CDG Terminal 2");

    // Fill departure time
    const depAtInput = screen.getByLabelText("Leaves London");
    await user.type(depAtInput, "2026-07-10T09:00");

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        mode: "FLIGHT",
        fromStopId: "stop-a",
        depIsHome: false,
        depPlace: undefined,
        toStopId: undefined,
        arrIsHome: false,
        arrPlace: "CDG Terminal 2",
      }),
      undefined,
    );
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 3: edit mode — updateTransport is called, not createTransport
  // -------------------------------------------------------------------------
  it("in edit mode submitting calls updateTransport with the transport id and updated payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} transport={existingTransport} />);

    // Dialog title should say "Train to Paris" (modeLabel + the to-stop's name)
    expect(screen.getByRole("dialog", { name: "Train to Paris" })).toBeInTheDocument();

    // In edit mode the form prefills from existingTransport.
    // existingTransport has fromStopId="stop-a" (London) and depPlace="St Pancras"
    // Per the derivation logic: edit + fromStopId → {kind:"stop"} so depPlace is ignored in initial state.
    // toStopId="stop-b" (Paris) → {kind:"stop"}, arrPlace ignored.
    // Just submit directly to verify the payload is correct.
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({
        mode: "TRAIN",
        fromStopId: "stop-a",
        toStopId: "stop-b",
        depIsHome: false,
        arrIsHome: false,
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

    await user.click(screen.getByRole("button", { name: "Add flight" }));

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

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(
      await screen.findByText("Departure time must be before arrival time"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 6: soft date-order warning — inverted times shows warning, submit enabled
  // -------------------------------------------------------------------------
  it("shows a date-order warning when departure is on or after arrival, but submit stays enabled", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    const depAtInput = screen.getByLabelText(/leaves/i);
    const arrAtInput = screen.getByLabelText(/arrives/i);

    // Set departure AFTER arrival (inverted)
    await user.type(depAtInput, "2026-07-10T14:00");
    await user.type(arrAtInput, "2026-07-10T09:00");

    // Warning should appear
    expect(
      screen.getByText(/departure is on or after arrival/i),
    ).toBeInTheDocument();

    // Submit button must remain enabled
    expect(
      screen.getByRole("button", { name: "Add flight" }),
    ).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Case 7: soft date-order warning disappears when one field is cleared
  // -------------------------------------------------------------------------
  it("hides the date-order warning when one of the datetime fields is cleared", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    const depAtInput = screen.getByLabelText(/leaves/i);
    const arrAtInput = screen.getByLabelText(/arrives/i);

    // Set inverted order
    await user.type(depAtInput, "2026-07-10T14:00");
    await user.type(arrAtInput, "2026-07-10T09:00");

    // Warning present
    expect(
      screen.getByText(/departure is on or after arrival/i),
    ).toBeInTheDocument();

    // Clear arrival — warning should disappear
    await user.clear(arrAtInput);

    expect(
      screen.queryByText(/departure is on or after arrival/i),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 8: no warning shown when dates are in valid order
  // -------------------------------------------------------------------------
  it("does not show a date-order warning when departure is before arrival", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    const depAtInput = screen.getByLabelText(/leaves/i);
    const arrAtInput = screen.getByLabelText(/arrives/i);

    await user.type(depAtInput, "2026-07-10T09:00");
    await user.type(arrAtInput, "2026-07-10T14:00");

    expect(
      screen.queryByText(/departure is on or after arrival/i),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 8b: edit mode renders the stored instant in the from-stop's timezone
  // (P0-1 client) — not the device's local timezone.
  // -------------------------------------------------------------------------
  it("shows the stored time in the from-stop's timezone when editing", () => {
    render(
      <TransportFormDialog
        {...baseProps}
        stops={[{ id: "s1", name: "Paris", timezone: "Europe/Paris" }]}
        transport={{
          ...existingTransport,
          fromStopId: "s1",
          toStopId: undefined,
          depAt: new Date("2026-07-01T06:00:00Z"),
        }}
      />,
    );
    expect(screen.getByLabelText("Leaves Paris")).toHaveValue("2026-07-01T08:00");
  });

  // -------------------------------------------------------------------------
  // Case 8c: the soft warning compares instants in each endpoint's own
  // timezone, not the raw datetime-local strings (P0-1 client) — a real
  // cross-zone flight that lands "earlier" by wall clock must not warn.
  // -------------------------------------------------------------------------
  it("does not warn on a cross-zone leg that lands at an earlier wall-clock time", () => {
    render(
      <TransportFormDialog
        {...baseProps}
        stops={[
          { id: "syd", name: "Sydney", timezone: "Australia/Sydney" },
          { id: "lax", name: "LA", timezone: "America/Los_Angeles" },
        ]}
        defaultFromStopId="syd"
        defaultToStopId="lax"
      />,
    );
    // Dep 10:00 Sydney = 00:00Z; arr 06:05 LA same date = 13:05Z — a real flight.
    fireEvent.change(screen.getByLabelText("Leaves Sydney"), { target: { value: "2026-07-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Arrives LA"), { target: { value: "2026-07-01T06:05" } });
    expect(screen.queryByText(/double-check these times/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 9: field-level error wires aria-invalid to the right control
  // -------------------------------------------------------------------------
  it("a depAt field error sets aria-invalid on the departure time input", async () => {
    (createTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { depAt: ["Departure time is required"] },
    });

    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(await screen.findByText("Departure time is required")).toBeInTheDocument();
    const depAtInput = screen.getByLabelText(/leaves/i);
    expect(depAtInput).toHaveAttribute("aria-invalid", "true");
  });

  // -------------------------------------------------------------------------
  // Case 10: _form error appears with role=alert via FormError
  // -------------------------------------------------------------------------
  it("_form error renders with role=alert", async () => {
    (createTransport as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Server error"] },
    });

    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });

  // -------------------------------------------------------------------------
  // Case 11: Cost is collapsed behind "+ Add cost"
  // -------------------------------------------------------------------------
  it("renders a Cost field once + Add cost is clicked", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);
    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    expect(screen.getByLabelText(/^cost amount$/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 12: filling the cost amount sends it in the payload
  // -------------------------------------------------------------------------
  it("submitting with a cost amount sends costMinor and currency in the payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    const amountInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(amountInput, "120.50");

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        costMinor: 12050,
        currency: "AUD",
      }),
      undefined,
    );
  });

  it("sends the chosen Settlement with the inline cost", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);
    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    await user.type(screen.getByLabelText(/^cost amount$/i), "30.00");
    await user.click(screen.getByRole("radio", { name: "Paid on the trip" }));
    await user.click(screen.getByRole("button", { name: "Add flight" }));
    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 3000, settlement: "ON_TRIP" }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 13: no costMinor when amount field is empty
  // -------------------------------------------------------------------------
  it("does NOT include costMinor in the payload when the amount field is empty", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.not.objectContaining({ costMinor: expect.anything() }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 14: edit mode prefills cost fields from single existing cost
  // (a single cost means Cost is pre-expanded — no "+ Add cost" click needed)
  // -------------------------------------------------------------------------
  it("in edit mode, prefills the cost amount from the single existing cost", () => {
    const costs = [
      {
        id: "cost-1",
        costMinor: 9900,
        paidMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    // 9900 minor EUR = 99.00
    expect(screen.getByLabelText(/^cost amount$/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 14b: editing a cost that's already paid opens with the box ticked
  // -------------------------------------------------------------------------
  it("opens with the Paid box ticked when editing a cost that has already been paid", () => {
    const costs = [
      {
        id: "cost-1",
        costMinor: 9900,
        paidMinor: 9900,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: new Date("2026-07-02"),
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 14c: un-ticking Paid clears the paid date but must NEVER clear the
  // paid amount — it survives as history (CONTEXT.md "Paid").
  // -------------------------------------------------------------------------
  it("un-ticking Paid clears the paid date but preserves the paid amount", async () => {
    const user = userEvent.setup();
    const costs = [
      {
        id: "cost-1",
        costMinor: 9900,
        paidMinor: 9900,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: new Date("2026-07-02"),
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 14d: ticking Paid then clearing the amount must not submit a date
  // with no amount (review finding — was previously gated on the checkbox
  // alone, not on the amount actually being present)
  // -------------------------------------------------------------------------
  it("clearing the paid amount after ticking Paid does not submit a paidAt with a null paidMinor", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 14e: clearing the paid date while an amount remains sends
  // `paidAt: null` rather than fabricating a date — the invariant is
  // one-directional (a date requires an amount; an amount with no date is a
  // legal, honest, incomplete record) (review round 2 — reverses round 1's
  // "keep pairing strict" fix, which invented dates the user never saw)
  // -------------------------------------------------------------------------
  it("clearing the paid date while a paid amount remains sends paidAt: null instead of fabricating a date", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const dateInput = screen.getByLabelText(/date paid/i);
    await user.clear(dateInput);

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: 10000,
        paidAt: null,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 14g: an unparseable-but-non-empty paid amount (e.g. pasted with a
  // currency symbol) must not leak a paidAt through with a null paidMinor
  // (review round 2 — the guard must check the amount actually *parses*,
  // not just that the text field is non-blank)
  // -------------------------------------------------------------------------
  it("an unparseable paid amount does not submit a paidAt with a null paidMinor", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "$150.00");

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 14f: `paidAt` is the SOLE "is this paid" signal (CONTEXT.md "Paid").
  // A legacy cost with a paid amount but no paid date is NOT paid, and must
  // open with the box unticked.
  // -------------------------------------------------------------------------
  it("does not open with the Paid box ticked when editing a legacy cost that has an amount but no paid date", () => {
    const costs = [
      {
        id: "cost-1",
        costMinor: 9900,
        paidMinor: 9900,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /paid/i })).not.toBeChecked();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 14h: resaving a legacy amount-only cost untouched leaves it unpaid
  // and must not clear the paid amount — paidMinor is omitted (undefined),
  // never resent or nulled, so the existing amount survives as history
  // (review round 2 — Important 2 origin: don't fabricate a date the user
  // never saw into a financial record).
  // -------------------------------------------------------------------------
  it("saving a legacy amount-only cost without touching payment fields leaves it unpaid and does not clear the amount", async () => {
    const user = userEvent.setup();
    const costs = [
      {
        id: "cost-1",
        costMinor: 9900,
        paidMinor: 9900,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 15: >1 costs — cost fields are hidden (CostEditor authoritative)
  // -------------------------------------------------------------------------
  it("hides the inline cost field when the transport has more than one existing cost", () => {
    const costs = [
      {
        id: "cost-1",
        costMinor: 5000,
        paidMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
      {
        id: "cost-2",
        costMinor: 3000,
        paidMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        dueDate: null,
        settlement: "BEFORE",
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
    ];

    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    expect(screen.queryByLabelText(/^cost amount$/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 12: add-mode anchor — defaultAnchorStopId is forwarded on create
// ---------------------------------------------------------------------------

describe("TransportFormDialog: add-mode anchor (Task 12)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes defaultAnchorStopId as anchorStopId when creating a transport", async () => {
    const user = userEvent.setup();
    render(
      <TransportFormDialog
        {...baseProps}
        defaultAnchorStopId="stop-a"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ anchorStopId: "stop-a" }),
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// Task 13: "Position in plan" picker — edit mode only
// ---------------------------------------------------------------------------

describe("TransportFormDialog: position-in-plan picker (Task 13)", () => {
  beforeEach(() => vi.clearAllMocks());

  const transportWithAnchor: TransportCardTransport = {
    id: "transport-99",
    mode: "TRAIN",
    fromStopId: "stop-a",
    toStopId: "stop-b",
    sortOrder: 0,
    anchorStopId: "stop-a",
  };

  it("edit mode: selecting 'After B' submits updateTransport with anchorStopId='stop-b'", async () => {
    const user = userEvent.setup();
    render(
      <TransportFormDialog
        {...baseProps}
        transport={transportWithAnchor}
      />,
    );

    // The "Position in plan" select should be visible in edit mode
    const positionSelect = screen.getByRole("combobox", { name: /position in plan/i });
    await user.click(positionSelect);

    // Select "After Paris" (stop-b)
    const afterParisOption = await screen.findByRole("option", { name: /after paris/i });
    await user.click(afterParisOption);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({ anchorStopId: "stop-b" }),
    );
  });

  it("edit mode: selecting 'Before London' (head) submits updateTransport with anchorStopId=''", async () => {
    const user = userEvent.setup();
    render(
      <TransportFormDialog
        {...baseProps}
        transport={transportWithAnchor}
      />,
    );

    const positionSelect = screen.getByRole("combobox", { name: /position in plan/i });
    await user.click(positionSelect);

    // Select "Before London" (head sentinel)
    const beforeLondonOption = await screen.findByRole("option", { name: /before london/i });
    await user.click(beforeLondonOption);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateTransport).toHaveBeenCalledWith(
      "transport-99",
      expect.objectContaining({ anchorStopId: "" }),
    );
  });

  it("add mode: position-in-plan picker is NOT shown", () => {
    render(<TransportFormDialog {...baseProps} />);
    expect(
      screen.queryByRole("combobox", { name: /position in plan/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Home base option in LocationCombobox
// ---------------------------------------------------------------------------

describe("TransportFormDialog: homeBaseName", () => {
  // -------------------------------------------------------------------------
  // Case 16: Home option appears in From combobox when homeBaseName is set
  // -------------------------------------------------------------------------
  it("renders a Home option in the From combobox when homeBaseName is provided", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeBaseName="Sydney" />);

    // Open the From combobox via its aria-label
    const fromTrigger = screen.getByRole("button", { name: /^From:/i });
    await user.click(fromTrigger);

    // Home option should appear inside the popover
    expect(await screen.findByRole("button", { name: /🏠 Sydney/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 17: Home option NOT shown when homeBaseName is absent
  // -------------------------------------------------------------------------
  it("does not render a Home option when homeBaseName is not provided", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    // Open From combobox
    const fromTrigger = screen.getByRole("button", { name: /^From:/i });
    await user.click(fromTrigger);

    // No home emoji in the popover
    expect(screen.queryByText(/🏠/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 16b: Attachments — edit mode shows upload control, create shows hint
  // -------------------------------------------------------------------------
  it("shows attachments upload control when editing and a save-first hint when creating", () => {
    const { rerender } = render(
      <TransportFormDialog
        open
        tripId="t1"
        transport={{ id: "tr1", mode: "FLIGHT", sortOrder: 0 }}
        attachments={[]}
        stops={[]}
        onOpenChange={() => {}}
      />,
    );
    // Edit mode: upload control should be visible
    expect(screen.getByText(/add file/i)).toBeInTheDocument();

    rerender(
      <TransportFormDialog
        open
        tripId="t1"
        transport={undefined}
        attachments={[]}
        stops={[]}
        onOpenChange={() => {}}
      />,
    );
    // Create mode: save-first hint
    expect(screen.getByText(/save.*first|save the/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 18: Selecting Home in From combobox submits depIsHome=true
  // -------------------------------------------------------------------------
  it("submitting with Home selected as From location sends depIsHome=true and fromStopId=undefined", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeBaseName="Sydney" />);

    // Open the From combobox and select Home
    const fromTrigger = screen.getByRole("button", { name: /^From:/i });
    await user.click(fromTrigger);

    const homeOption = await screen.findByRole("button", { name: /🏠 Sydney/i });
    await user.click(homeOption);

    // Submit the form
    await user.click(screen.getByRole("button", { name: "Add flight" }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        depIsHome: true,
        fromStopId: undefined,
      }),
      undefined,
    );
  });
});

describe("TransportFormDialog: Delete leg (plan Task 13)", () => {
  it("in edit mode with onDelete, shows a ghost 'Delete leg' button that calls it", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TransportFormDialog {...baseProps} transport={existingTransport} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: "Delete leg" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("no Delete leg in create mode, or without onDelete", () => {
    const { unmount } = render(<TransportFormDialog {...baseProps} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete leg" })).toBeNull();
    unmount();
    render(<TransportFormDialog {...baseProps} transport={existingTransport} />);
    expect(screen.queryByRole("button", { name: "Delete leg" })).toBeNull();
  });

  it("disables Delete leg while a save is in flight, like the submit button", async () => {
    // A submit that never resolves keeps isPending true so we can observe it.
    (updateTransport as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} transport={existingTransport} onDelete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Delete leg" })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// The transport's notes thread stays reachable from the sheet (edit mode) —
// the leg pill dropped its own notes display when Task 13 flattened it to a
// plain strip pill. Reuses NoteThread with the same props/data the old
// TransportCard passed it (CONTROLLER RULING).
// ---------------------------------------------------------------------------

describe("TransportFormDialog: notes thread stays reachable (controller ruling)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edit mode shows the transport's existing notes thread", () => {
    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        currentUserId="user-1"
        notes={[
          {
            id: "note-1",
            body: "Platform confirmed the night before.",
            createdAt: new Date("2026-01-01T10:00:00Z"),
            author: { id: "user-1", name: "Alice", image: null },
          },
        ]}
      />,
    );
    expect(screen.getByText("Platform confirmed the night before.")).toBeInTheDocument();
  });

  it("posting a note neither submits the leg nor closes the sheet, and logs no nested-<form> warning", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <TransportFormDialog
        {...baseProps}
        transport={existingTransport}
        onOpenChange={onOpenChange}
        currentUserId="user-1"
        notes={[]}
      />,
    );

    await user.type(screen.getByLabelText("Note body"), "Seats confirmed for the whole carriage.");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    // The leg's own form (Save/updateTransport) must not have fired, and the
    // sheet must not have closed — NoteThread's own <form> used to be nested
    // inside the leg's <form>, so React bubbled its submit into ours.
    expect(updateTransport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    const nestedFormWarning = errorSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && /<form>.*descendant of.*<form>/i.test(a)),
    );
    expect(nestedFormWarning).toBe(false);
    errorSpy.mockRestore();
  });

  it("create mode never shows a notes thread (there's no transport to attach it to)", () => {
    render(<TransportFormDialog {...baseProps} currentUserId="user-1" notes={[]} />);
    expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PLAN.md §7.5 — the transport sheet restyle (Task 20)
// ---------------------------------------------------------------------------

const STOPS = [
  { id: "rom", name: "Rome", timezone: "Europe/Rome", sortOrder: 2, arriveDate: "2026-12-15", departDate: "2026-12-22" },
  { id: "flo", name: "Florence", timezone: "Europe/Rome", sortOrder: 3, arriveDate: "2026-12-22", departDate: "2026-12-27" },
];

describe("transport sheet (PLAN.md §7.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create: context row, How are you getting there?, six mode tiles", () => {
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "How are you getting there?" })).toBeInTheDocument();
    const ctx = screen.getByTestId("leg-context");
    expect(ctx).toHaveTextContent("Rome");
    expect(ctx).toHaveTextContent("Florence");
    expect(ctx).toHaveTextContent("Tue 22 Dec");
    const tiles = within(screen.getByRole("radiogroup", { name: "Mode" })).getAllByRole("radio");
    expect(tiles.map((t) => t.textContent)).toEqual(["Train", "Car", "Flight", "Bus", "Ferry", "Other"]);
  });

  it("picking a tile fills it coral; Car hides the times; the CTA names the mode", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Train" }));
    expect(screen.getByRole("radio", { name: "Train" }).className).toContain("bg-coral");
    expect(screen.getByLabelText("Leaves Rome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add train" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Car" }));
    // The times collapse (MOTION.md P13): inert while they fold away, then gone.
    const leaving = screen.queryByLabelText("Leaves Rome");
    expect(leaving).not.toBeNull();
    expect(leaving!.closest("[inert]")).not.toBeNull();
    await waitFor(() => expect(screen.queryByLabelText("Leaves Rome")).toBeNull());
    expect(screen.getByText("We'll estimate the drive once it's saved.").closest(".tp-rise-in")).not.toBeNull();
  });

  it("reduced motion: Car drops the times at once, not over 180ms (MOTION.md P13)", async () => {
    motionPref.reduced = true;
    try {
      const user = userEvent.setup();
      render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
      await user.click(screen.getByRole("radio", { name: "Car" }));
      await waitFor(() => expect(screen.queryByLabelText("Leaves Rome")).toBeNull(), { timeout: 120 });
    } finally {
      motionPref.reduced = false;
    }
  });

  it("the picked tile pops each time it is chosen (MOTION.md P13)", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    const flight = () => screen.getByRole("radio", { name: "Flight" });
    expect(flight().querySelector(".tp-pop")).toBeNull();
    await user.click(flight());
    const first = flight().querySelector(".tp-pop");
    expect(first).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Train" }).querySelector(".tp-pop")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Train" }));
    await user.click(flight());
    // A fresh node: the key bump replays the pop.
    expect(flight().querySelector(".tp-pop")).not.toBe(first);
    expect(flight().querySelector(".tp-pop")).not.toBeNull();
  });

  it("booking ref label and the Paste a booking swap", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} aiConfigured />);
    expect(screen.getByText("Booking ref · only people on the trip see this")).toBeInTheDocument();
    expect(screen.getByText("Got the confirmation email?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Paste a booking" }));
    expect(screen.getByTestId("ai-booking-parser")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to the leg" }));
    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
  });

  it("cost is collapsed behind + Add cost", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "+ Add cost" }));
    expect(screen.getByLabelText(/Amount|Cost/)).toBeInTheDocument();
  });

  it("edit: Train to Florence, Save, Delete leg", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TransportFormDialog tripId="t" stops={STOPS} transport={{ id: "tr1", mode: "TRAIN", fromStopId: "rom", toStopId: "flo", sortOrder: 0 }} open onOpenChange={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByRole("dialog", { name: "Train to Florence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete leg" }));
    expect(onDelete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Review round 1 (controller): Car drive estimate / Add times, mode-switch
// time preservation, collapsed-cost submit + existing-cost expansion, and
// "Change the stops" actually collapsing the comboboxes.
// ---------------------------------------------------------------------------

describe("transport sheet (PLAN.md §7.5): Car drive estimate and Add times", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Car with no times and no driveEstimate shows the fallback copy", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Car" }));
    expect(screen.getByText("We'll estimate the drive once it's saved.")).toBeInTheDocument();
  });

  it("edit-mode Car leg with a driveEstimate shows the formatted estimate", () => {
    render(
      <TransportFormDialog
        tripId="t"
        stops={STOPS}
        transport={{
          id: "tr1",
          mode: "CAR",
          fromStopId: "rom",
          toStopId: "flo",
          sortOrder: 0,
          driveEstimate: { minutes: 95, roadKm: 120 },
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("~1h 35m · 120 km")).toBeInTheDocument();
  });

  it("Add times reveals the Leaves/Arrives fields on a Car leg", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Car" }));
    await waitFor(() => expect(screen.queryByLabelText("Leaves Rome")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Add times" }));
    expect(screen.getByLabelText("Leaves Rome")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrives Florence")).toBeInTheDocument();
  });

  it("edit mode: a Car leg that already has times shows Leaves/Arrives immediately, with no drive estimate", () => {
    render(
      <TransportFormDialog
        tripId="t"
        stops={STOPS}
        transport={{
          id: "tr1",
          mode: "CAR",
          fromStopId: "rom",
          toStopId: "flo",
          sortOrder: 0,
          depAt: new Date("2026-12-22T09:00:00"),
          arrAt: new Date("2026-12-22T11:00:00"),
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Leaves Rome")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrives Florence")).toBeInTheDocument();
    expect(screen.queryByText(/estimate the drive/i)).not.toBeInTheDocument();
  });

  it("switching Train to Car keeps times already entered, and submits them", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Train" }));
    await user.type(screen.getByLabelText("Leaves Rome"), "2026-12-22T09:00");
    await user.type(screen.getByLabelText("Arrives Florence"), "2026-12-22T11:00");

    await user.click(screen.getByRole("radio", { name: "Car" }));
    // The mode switch alone must not clear times already entered.
    expect(screen.getByLabelText("Leaves Rome")).toHaveValue("2026-12-22T09:00");
    expect(screen.getByLabelText("Arrives Florence")).toHaveValue("2026-12-22T11:00");

    await user.click(screen.getByRole("button", { name: "Add car" }));
    expect(createTransport).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ mode: "CAR", depAt: "2026-12-22T09:00", arrAt: "2026-12-22T11:00" }),
      undefined,
    );
  });
});

describe("transport sheet (PLAN.md §7.5): collapsed cost submit and existing-cost expansion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("collapsed cost submits with no costMinor in the payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Train" }));
    await user.click(screen.getByRole("button", { name: "Add train" }));
    expect(createTransport).toHaveBeenCalledWith(
      "t",
      expect.not.objectContaining({ costMinor: expect.anything() }),
      undefined,
    );
  });

  it("an existing cost starts expanded — no + Add cost click needed", () => {
    render(
      <TransportFormDialog
        tripId="t"
        stops={STOPS}
        transport={{ id: "tr1", mode: "TRAIN", fromStopId: "rom", toStopId: "flo", sortOrder: 0 }}
        costs={[
          {
            id: "c1",
            costMinor: 5000,
            paidMinor: null,
            currency: "EUR",
            rateToHome: 1,
            paidAt: null,
            dueDate: null,
            settlement: "BEFORE",
            ownerType: "TRANSPORT",
            ownerId: "tr1",
            label: null,
            category: null,
          },
        ]}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Add cost" })).toBeNull();
    expect(screen.getByLabelText(/^cost amount$/i)).toHaveValue("50.00");
  });
});

describe("transport sheet (PLAN.md §7.5): 'Change the stops' actually collapses the comboboxes", () => {
  it("create mode with both defaults puts the stop comboboxes inside the collapsed 'Change the stops' details", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog tripId="t" stops={STOPS} defaultFromStopId="rom" defaultToStopId="flo" open onOpenChange={vi.fn()} />);
    const fromTrigger = screen.getByRole("button", { name: /^From:/i });
    expect(fromTrigger).not.toBeVisible();
    await user.click(screen.getByText("Change the stops"));
    expect(fromTrigger).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Spec 2026-10-04 §K: deleting a ticket on a leg. The trash icon sat inside
// the leg's <form> as an implicit submit button — clicking it saved the leg
// and closed the sheet, so the "Delete …?" confirm vanished unanswered.
// ---------------------------------------------------------------------------

describe("TransportFormDialog — deleting an Attachment", () => {
  beforeEach(() => vi.clearAllMocks());

  const ticket = {
    id: "att-1",
    filename: "eurostar-ticket.pdf",
    mime: "application/pdf",
    size: 120_000,
    url: "/api/attachments/att-1",
    uploadedById: "user-1",
    createdAt: new Date("2026-07-01"),
  };

  it("asks to confirm, deletes the ticket, and neither saves nor closes the leg", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <TransportFormDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        transport={existingTransport}
        attachments={[ticket]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete eurostar-ticket\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "eurostar-ticket\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(updateTransport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(updateTransport).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
