import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    const depAtInput = screen.getByLabelText(/departure time/i);
    await user.type(depAtInput, "2026-07-10T09:00");

    await user.click(screen.getByRole("button", { name: /add transport/i }));

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

    // Dialog title should say "Edit Transport"
    expect(
      screen.getByRole("heading", { name: /edit transport/i }),
    ).toBeInTheDocument();

    // In edit mode the form prefills from existingTransport.
    // existingTransport has fromStopId="stop-a" (London) and depPlace="St Pancras"
    // Per the derivation logic: edit + fromStopId → {kind:"stop"} so depPlace is ignored in initial state.
    // toStopId="stop-b" (Paris) → {kind:"stop"}, arrPlace ignored.
    // Just submit directly to verify the payload is correct.
    await user.click(screen.getByRole("button", { name: /save changes/i }));

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

    await user.click(screen.getByRole("button", { name: /add transport/i }));

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

    const depAtInput = screen.getByLabelText(/departure time/i);
    const arrAtInput = screen.getByLabelText(/arrival time/i);

    // Set departure AFTER arrival (inverted)
    await user.type(depAtInput, "2026-07-10T14:00");
    await user.type(arrAtInput, "2026-07-10T09:00");

    // Warning should appear
    expect(
      screen.getByText(/departure is on or after arrival/i),
    ).toBeInTheDocument();

    // Submit button must remain enabled
    expect(
      screen.getByRole("button", { name: /add transport/i }),
    ).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Case 7: soft date-order warning disappears when one field is cleared
  // -------------------------------------------------------------------------
  it("hides the date-order warning when one of the datetime fields is cleared", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} />);

    const depAtInput = screen.getByLabelText(/departure time/i);
    const arrAtInput = screen.getByLabelText(/arrival time/i);

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

    const depAtInput = screen.getByLabelText(/departure time/i);
    const arrAtInput = screen.getByLabelText(/arrival time/i);

    await user.type(depAtInput, "2026-07-10T09:00");
    await user.type(arrAtInput, "2026-07-10T14:00");

    expect(
      screen.queryByText(/departure is on or after arrival/i),
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(await screen.findByText("Departure time is required")).toBeInTheDocument();
    const depAtInput = screen.getByLabelText(/departure time/i);
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

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });

  // -------------------------------------------------------------------------
  // Case 11: Estimated cost field is rendered
  // -------------------------------------------------------------------------
  it("renders an Estimated cost field", () => {
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);
    expect(screen.getByLabelText(/estimated cost amount/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 12: filling estimated amount sends it in the payload
  // -------------------------------------------------------------------------
  it("submitting with an estimated amount sends estimatedMinor and currency in the payload", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    const amountInput = screen.getByLabelText(/estimated cost amount/i);
    await user.type(amountInput, "120.50");

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        estimatedMinor: 12050,
        currency: "AUD",
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 13: no estimatedMinor when amount field is empty
  // -------------------------------------------------------------------------
  it("does NOT include estimatedMinor in the payload when the amount field is empty", async () => {
    const user = userEvent.setup();
    render(<TransportFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.click(screen.getByRole("button", { name: /add transport/i }));

    expect(createTransport).toHaveBeenCalledWith(
      "trip-1",
      expect.not.objectContaining({ estimatedMinor: expect.anything() }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 14: edit mode prefills cost fields from single existing cost
  // -------------------------------------------------------------------------
  it("in edit mode, prefills the estimated amount from the single existing cost", () => {
    const costs = [
      {
        id: "cost-1",
        estimatedMinor: 9900,
        actualMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
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
    expect(screen.getByLabelText(/estimated cost amount/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 15: >1 costs — cost fields are hidden (CostEditor authoritative)
  // -------------------------------------------------------------------------
  it("hides the inline cost field when the transport has more than one existing cost", () => {
    const costs = [
      {
        id: "cost-1",
        estimatedMinor: 5000,
        actualMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        ownerType: "TRANSPORT",
        ownerId: "transport-99",
        label: null,
        category: null,
      },
      {
        id: "cost-2",
        estimatedMinor: 3000,
        actualMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
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

    expect(screen.queryByLabelText(/estimated cost amount/i)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /add transport/i }));

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

    await user.click(screen.getByRole("button", { name: /save changes/i }));

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

    await user.click(screen.getByRole("button", { name: /save changes/i }));

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
    await user.click(screen.getByRole("button", { name: /add transport/i }));

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
