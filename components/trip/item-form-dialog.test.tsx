import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}));
import { createItem, updateItem } from "@/server/actions/items";

import { ItemFormDialog, AddItemButton, EditItemButton } from "./item-form-dialog";
import type { ItemCardItem } from "./item-card";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseProps = {
  tripId: "trip-1",
  stops: [],
  open: true,
  onOpenChange: vi.fn(),
};

const existingItem: ItemCardItem = {
  id: "item-99",
  title: "Museum visit",
  category: "SIGHTSEEING",
  date: null,
  startTime: null,
  endTime: null,
  address: null,
  link: null,
  booking: null,
  notes: null,
  stopId: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ItemFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Case 1: empty title — no client-side guard; the server action IS called
  // with the empty string and then returns a field error which is rendered.
  // -------------------------------------------------------------------------
  it("submitting with empty title calls createItem and renders the server-returned title error", async () => {
    // Arrange: server rejects an empty title
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { title: ["Title is required"] },
    });

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    // Submit immediately — title field is empty by default
    await user.click(screen.getByRole("button", { name: /add item/i }));

    // The action IS called (no client-side gate)
    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ title: "" }),
    );

    // Server-returned field error is rendered
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2a: valid create — correct payload
  // -------------------------------------------------------------------------
  it("submitting valid title calls createItem with the expected payload", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        title: "Eiffel Tower",
        category: "SIGHTSEEING", // default category
        stopId: undefined,
        date: undefined,
        startTime: undefined,
        endTime: undefined,
      }),
    );
    expect(createItem).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 2b: valid create with optional date + times
  // -------------------------------------------------------------------------
  it("includes date and times in the payload when provided", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} defaultUnscheduled={false} tripStartDate="2026-07-10" />);

    // Fill title
    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Night market");

    // The date field should be pre-populated with tripStartDate; set start time
    const startTimeInput = screen.getByLabelText(/start time/i);
    await user.type(startTimeInput, "19:00");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        title: "Night market",
        date: "2026-07-10",
        startTime: "19:00",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 3: edit mode — updateItem is called, not createItem
  // -------------------------------------------------------------------------
  it("in edit mode submitting calls updateItem with the item id and updated payload", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);

    // Dialog title should say "Edit Item"
    expect(screen.getByRole("heading", { name: /edit item/i })).toBeInTheDocument();

    // Clear and replace the title
    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Museum visit updated");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateItem).toHaveBeenCalledWith(
      "item-99",
      expect.objectContaining({ title: "Museum visit updated" }),
    );
    expect(createItem).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 4: server-returned _form error is displayed
  // -------------------------------------------------------------------------
  it("renders a server-returned _form error after submit", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong, please try again"] },
    });

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Any title");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(
      await screen.findByText("Something went wrong, please try again"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 5: field-level title error wires aria-invalid to the title control
  // -------------------------------------------------------------------------
  it("a title field error sets aria-invalid on the title input", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { title: ["Title is required"] },
    });

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
  });

  // -------------------------------------------------------------------------
  // Case 6: _form error appears with role=alert via FormError
  // -------------------------------------------------------------------------
  it("_form error renders with role=alert", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Server error"] },
    });

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Any title");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Server error");
  });

  // -------------------------------------------------------------------------
  // Case 7: category field error wires aria-invalid to the category group
  // -------------------------------------------------------------------------
  it("a category field error sets aria-invalid on the category group", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { category: ["Category is required"] },
    });

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(await screen.findByText("Category is required")).toBeInTheDocument();
    const categoryGroup = screen.getByRole("group", { name: "Category" });
    expect(categoryGroup).toHaveAttribute("aria-invalid", "true");
  });

  // -------------------------------------------------------------------------
  // Case 8: end-time field shows "Set a start time first" hint when date is
  //          set but start time is empty
  // -------------------------------------------------------------------------
  it("end-time field shows 'Set a start time first' hint when date is set but start time is empty", async () => {
    render(
      <ItemFormDialog
        {...baseProps}
        defaultUnscheduled={false}
        tripStartDate="2026-07-10"
      />,
    );

    // Date is pre-filled (tripStartDate), start time is empty → hint should show
    expect(screen.getByText("Set a start time first")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 9: Estimated cost field is rendered when homeCurrency is provided
  // -------------------------------------------------------------------------
  it("renders an Estimated cost field", () => {
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);
    expect(screen.getByLabelText(/estimated cost amount/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 10: filling estimated amount sends it in the payload
  // -------------------------------------------------------------------------
  it("submitting with an estimated amount sends estimatedMinor and currency in the payload", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    const amountInput = screen.getByLabelText(/estimated cost amount/i);
    await user.type(amountInput, "120.50");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        estimatedMinor: 12050,
        currency: "AUD",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 11: no estimatedMinor when amount field is empty
  // -------------------------------------------------------------------------
  it("does NOT include estimatedMinor in the payload when the amount field is empty", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.not.objectContaining({ estimatedMinor: expect.anything() }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 12: edit mode prefills cost fields from single existing cost
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
        ownerType: "ITEM",
        ownerId: "item-99",
        label: null,
        category: null,
      },
    ];

    render(
      <ItemFormDialog
        {...baseProps}
        item={existingItem}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    // 9900 minor EUR = 99.00
    expect(screen.getByLabelText(/estimated cost amount/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 13: >1 costs — cost fields are hidden (CostEditor authoritative)
  // -------------------------------------------------------------------------
  it("hides the inline cost field when the item has more than one existing cost", () => {
    const costs = [
      {
        id: "cost-1",
        estimatedMinor: 5000,
        actualMinor: null,
        currency: "AUD",
        rateToHome: 1,
        paidAt: null,
        ownerType: "ITEM",
        ownerId: "item-99",
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
        ownerType: "ITEM",
        ownerId: "item-99",
        label: null,
        category: null,
      },
    ];

    render(
      <ItemFormDialog
        {...baseProps}
        item={existingItem}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    expect(screen.queryByLabelText(/estimated cost amount/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AddItemButton — homeCurrency forwarding
// ---------------------------------------------------------------------------

describe("AddItemButton — homeCurrency forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Estimated cost field inside the dialog when homeCurrency is passed", async () => {
    const user = userEvent.setup();
    render(
      <AddItemButton
        tripId="trip-1"
        stops={[]}
        homeCurrency="EUR"
      />,
    );

    // Open the dialog
    await user.click(screen.getByRole("button", { name: /add item/i }));

    // homeCurrency="EUR" should make the cost field appear
    expect(screen.getByLabelText(/estimated cost amount/i)).toBeInTheDocument();
  });

  it("defaults the currency picker to AUD when homeCurrency is omitted", async () => {
    const user = userEvent.setup();
    render(
      <AddItemButton
        tripId="trip-1"
        stops={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add item/i }));

    // Cost field always renders; without homeCurrency the fallback is "AUD"
    expect(screen.getByRole("combobox", { name: /currency/i })).toHaveTextContent("AUD");
  });
});

// ---------------------------------------------------------------------------
// EditItemButton — homeCurrency + costs forwarding
// ---------------------------------------------------------------------------

describe("EditItemButton — homeCurrency + costs forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Estimated cost field when homeCurrency is passed", async () => {
    const user = userEvent.setup();
    render(
      <EditItemButton
        tripId="trip-1"
        stops={[]}
        item={existingItem}
        homeCurrency="USD"
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit museum visit/i }));

    expect(screen.getByLabelText(/estimated cost amount/i)).toBeInTheDocument();
  });

  it("defaults the currency picker to homeCurrency when no costs are given", async () => {
    const user = userEvent.setup();
    render(
      <EditItemButton
        tripId="trip-1"
        stops={[]}
        item={existingItem}
        homeCurrency="GBP"
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit museum visit/i }));

    // The currency select trigger should display the home currency
    expect(screen.getByRole("combobox", { name: /currency/i })).toHaveTextContent("GBP");
  });

  it("prefills estimated amount from single cost when costs are forwarded", async () => {
    const user = userEvent.setup();
    const costs = [
      {
        id: "cost-1",
        estimatedMinor: 5500,
        actualMinor: null,
        currency: "EUR",
        rateToHome: 0.6,
        paidAt: null,
        ownerType: "ITEM" as const,
        ownerId: "item-99",
        label: null,
        category: null,
      },
    ];

    render(
      <EditItemButton
        tripId="trip-1"
        stops={[]}
        item={existingItem}
        homeCurrency="AUD"
        costs={costs}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit museum visit/i }));

    // 5500 minor EUR = 55.00
    expect(screen.getByLabelText(/estimated cost amount/i)).toHaveValue("55.00");
  });
});
