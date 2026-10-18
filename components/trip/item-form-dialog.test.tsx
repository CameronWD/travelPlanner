import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
  deleteItem: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));
vi.mock("@/server/actions/item-photo", () => ({
  setItemPhoto: vi.fn().mockResolvedValue({ success: true, attachmentId: "att-new-1" }),
  removeItemPhoto: vi.fn().mockResolvedValue({ success: true }),
}));
// The real compressImage dynamically imports `browser-image-compression`,
// which touches window/Worker — pass the file through unchanged instead
// (same approach as cover-image-field.test.tsx) so these tests assert on the
// exact File that was selected.
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});
vi.mock("@/components/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/use-toast")>()),
  toast: vi.fn(),
}));
import { toast } from "@/components/ui/use-toast";
import { createItem, updateItem, deleteItem } from "@/server/actions/items";
import { setItemPhoto, removeItemPhoto } from "@/server/actions/item-photo";
import { deleteAttachment } from "@/server/actions/attachments";

import { ItemFormDialog, AddItemButton } from "./item-form-dialog";
import type { ItemCardItem } from "./item-card";
import { nearestPositionedAncestor } from "@/test/helpers/containing-block";
import { reminderItem } from "@/test/helpers/reminder-item";

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
  id: "item-99", bookingStateSet: false,
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

  it("lays out fields in two columns from sm", () => {
    render(<ItemFormDialog {...baseProps} />);
    const form = document.querySelector("form");
    expect(form?.className).toContain("sm:grid-cols-2");
  });

  it("keeps Start time and End time paired even with no Stops on the trip (baseProps has stops: [])", () => {
    render(<ItemFormDialog {...baseProps} />);
    const startTime = screen.getByLabelText(/start time/i);
    const endTime = screen.getByLabelText(/end time/i);
    const pair = startTime.closest("div.sm\\:col-span-2");
    expect(pair).not.toBeNull();
    expect(pair).toContainElement(endTime);
  });

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
      undefined,
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
      undefined,
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
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Task 9: "Hide from shared links" checkbox
  // -------------------------------------------------------------------------
  describe("Hide from shared links (Task 9)", () => {
    it("defaults to unchecked and sends hiddenFromShares: false on create", async () => {
      const user = userEvent.setup();
      render(<ItemFormDialog {...baseProps} />);

      expect(screen.getByRole("checkbox", { name: /hide from shared links/i })).not.toBeChecked();

      const titleInput = screen.getByPlaceholderText(/visit the night market/i);
      await user.type(titleInput, "Eiffel Tower");
      await user.click(screen.getByRole("button", { name: /add item/i }));

      expect(createItem).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ hiddenFromShares: false }),
        undefined,
      );
    });

    it("ticking the checkbox sends hiddenFromShares: true to createItem", async () => {
      const user = userEvent.setup();
      render(<ItemFormDialog {...baseProps} />);

      const titleInput = screen.getByPlaceholderText(/visit the night market/i);
      await user.type(titleInput, "Eiffel Tower");
      await user.click(screen.getByRole("checkbox", { name: /hide from shared links/i }));
      await user.click(screen.getByRole("button", { name: /add item/i }));

      expect(createItem).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ hiddenFromShares: true }),
        undefined,
      );
    });

    it("pre-checks the checkbox when editing an Item already hidden from shares", () => {
      render(
        <ItemFormDialog {...baseProps} item={{ ...existingItem, hiddenFromShares: true }} />,
      );
      expect(screen.getByRole("checkbox", { name: /hide from shared links/i })).toBeChecked();
    });

    it("shows help text clarifying the Item stays visible to every Traveller", () => {
      render(<ItemFormDialog {...baseProps} />);
      expect(screen.getByText("Still visible to everyone on the trip.")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: edit mode — updateItem is called, not createItem
  // -------------------------------------------------------------------------
  it("in edit mode submitting calls updateItem with the item id and updated payload", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);

    // Dialog title should say "Edit Item" (already Title Case)
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

  it("an edit that empties Link, Booking and Notes and the date sends them as null (PATCH)", async () => {
    const user = userEvent.setup();
    render(
      <ItemFormDialog
        {...baseProps}
        item={{
          ...existingItem,
          link: "https://example.test",
          booking: "BOOK-1",
          notes: "Bring passport",
          date: "2026-05-01",
        }}
      />,
    );

    await user.clear(screen.getByLabelText(/^link$/i));
    await user.clear(screen.getByLabelText(/booking reference/i));
    await user.clear(screen.getByLabelText(/^notes$/i));
    await user.clear(screen.getByLabelText(/^date$/i));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateItem).toHaveBeenCalledWith(
      "item-99",
      expect.objectContaining({ link: null, booking: null, notes: null, date: null, startTime: null, endTime: null }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 4: server-returned form-level error is displayed
  // -------------------------------------------------------------------------
  it("renders a server-returned form-level error after submit", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Something went wrong, please try again"] },
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
  // Case 6: a form-level error appears with role=alert via FormError
  // -------------------------------------------------------------------------
  it("a form-level error renders with role=alert", async () => {
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Server error"] },
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
  // LA-049: category chips get an invisible 44px coarse-pointer tap target.
  // -------------------------------------------------------------------------
  it("gives every category chip a 44px tap target", async () => {
    render(<ItemFormDialog {...baseProps} />);

    const categoryGroup = screen.getByRole("group", { name: "Category" });
    const chips = within(categoryGroup).getAllByRole("button");
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(chip.className).toContain("tap-target");
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
  // Case 9: Cost field is rendered when homeCurrency is provided
  // -------------------------------------------------------------------------
  it("renders a Cost field", () => {
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);
    expect(screen.getByLabelText(/^cost amount$/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 10: filling the cost amount sends it in the payload
  // -------------------------------------------------------------------------
  it("submitting with a cost amount sends costMinor and currency in the payload", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    const amountInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(amountInput, "120.50");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
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
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);
    await user.type(screen.getByPlaceholderText(/visit the night market/i), "Dinner");
    await user.type(screen.getByLabelText(/^cost amount$/i), "80.00");
    await user.click(screen.getByRole("radio", { name: "Paid on the trip" }));
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ costMinor: 8000, settlement: "ON_TRIP" }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 11: no costMinor when amount field is empty
  // -------------------------------------------------------------------------
  it("does NOT include costMinor in the payload when the amount field is empty", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.not.objectContaining({ costMinor: expect.anything() }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 12: edit mode prefills cost fields from single existing cost
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
    expect(screen.getByLabelText(/^cost amount$/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 12b: editing a cost that's already paid opens with the box ticked
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

    expect(screen.getByRole("checkbox", { name: /paid/i })).toBeChecked();
    expect(screen.getByLabelText(/you paid amount/i)).toHaveValue("99.00");
  });

  // -------------------------------------------------------------------------
  // Case 12c: un-ticking Paid clears the paid date but must NEVER clear the
  // paid amount — it survives as history so re-ticking can offer back what
  // was actually paid (CONTEXT.md "Paid"). paidMinor is omitted (undefined)
  // rather than sent as null, so the server leaves the existing amount alone.
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

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateItem).toHaveBeenCalledWith(
      "item-99",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null, // an edit's empty paid date is a clear (toPatch, ADR 0075)
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Card 2.I bug fix: a typed cost that doesn't parse used to be dropped
  // silently and the item saved without it.
  // -------------------------------------------------------------------------
  it("refuses an unparseable cost instead of saving without it", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    await user.type(screen.getByPlaceholderText(/visit the night market/i), "Eiffel Tower");
    await user.type(screen.getByLabelText(/^cost amount$/i), "abc");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(await screen.findByText("Enter the cost")).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 12d: ticking Paid then clearing the amount must not submit a date
  // with no amount (review finding — was previously gated on the checkbox
  // alone, not on the amount actually being present).
  // Card 2.I: it is now refused ("Enter what you paid"), not saved unpaid.
  // -------------------------------------------------------------------------
  it("refuses Paid with no paid amount (Review Focus 5)", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(await screen.findByText("Enter what you paid")).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 12e: clearing the paid date while an amount remains sends
  // no `paidAt` rather than fabricating a date — the invariant is
  // one-directional (a date requires an amount; an amount with no date is a
  // legal, honest, incomplete record) (review round 2 — reverses round 1's
  // "keep pairing strict" fix, which invented dates the user never saw)
  // -------------------------------------------------------------------------
  it("clearing the paid date while a paid amount remains sends no paidAt instead of fabricating a date", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const dateInput = screen.getByLabelText(/date paid/i);
    await user.clear(dateInput);

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        paidMinor: 10000,
        paidAt: undefined,
      }),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 12g: an unparseable-but-non-empty paid amount (e.g. pasted with a
  // currency symbol) must not leak a paidAt through with a null paidMinor
  // (review round 2 — the guard must check the amount actually *parses*,
  // not just that the text field is non-blank).
  // Card 2.I: it is now refused ("Enter what you paid"), not saved unpaid.
  // -------------------------------------------------------------------------
  it("refuses Paid with an unparseable paid amount instead of saving it unpaid", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} homeCurrency="AUD" />);

    const titleInput = screen.getByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Eiffel Tower");

    const costInput = screen.getByLabelText(/^cost amount$/i);
    await user.type(costInput, "100");

    await user.click(screen.getByRole("checkbox", { name: /paid/i }));
    const paidInput = screen.getByLabelText(/you paid amount/i);
    await user.clear(paidInput);
    await user.type(paidInput, "$150.00");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    expect(await screen.findByText("Enter what you paid")).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 12f: `paidAt` is the SOLE "is this paid" signal (CONTEXT.md "Paid").
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

    expect(screen.getByRole("checkbox", { name: /paid/i })).not.toBeChecked();
    expect(screen.queryByLabelText(/you paid amount/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 12h: resaving a legacy amount-only cost untouched leaves it unpaid
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

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateItem).toHaveBeenCalledWith(
      "item-99",
      expect.objectContaining({
        paidMinor: undefined,
        paidAt: null, // an edit's empty paid date is a clear (toPatch, ADR 0075)
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case 13: >1 costs — cost fields are hidden (CostEditor authoritative)
  // -------------------------------------------------------------------------
  it("hides the inline cost field when the item has more than one existing cost", () => {
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
        ownerType: "ITEM",
        ownerId: "item-99",
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

    expect(screen.queryByLabelText(/^cost amount$/i)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 14: Delete — offered only in edit mode, confirmed, then deletes.
  // -------------------------------------------------------------------------
  it("offers Delete only when editing an existing item", () => {
    const { unmount } = render(<ItemFormDialog {...baseProps} item={existingItem} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    unmount();
    render(<ItemFormDialog {...baseProps} />);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("asks before deleting, then deletes and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));
    expect(deleteItem).toHaveBeenCalledWith("item-99");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /cancel/i }));
    expect(deleteItem).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 15: Save/Delete stay disabled while busy, so a double-click (or a
  // second Enter/confirm) can't fire the action twice.
  // -------------------------------------------------------------------------
  it("disables the Save/Add button while createItem is pending", async () => {
    let resolveCreate!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveCreate = res;
    });
    (createItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    const saveButton = screen.getByRole("button", { name: /add item/i });
    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add item/i })).toBeDisabled();
    });

    resolveCreate({ success: true });
    await waitFor(() => {
      expect(createItem).toHaveBeenCalledTimes(1);
    });
  });

  it("disables both Delete and Save while a delete is pending", async () => {
    let resolveDelete!: (v: { success: true }) => void;
    const pendingPromise = new Promise<{ success: true }>((res) => {
      resolveDelete = res;
    });
    (deleteItem as ReturnType<typeof vi.fn>).mockReturnValueOnce(pendingPromise);

    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();

    resolveDelete({ success: true });
    await waitFor(() => {
      expect(deleteItem).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the dialog open and shows an error when deleteItem rejects", async () => {
    (deleteItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("not found"));

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await screen.findByText(/couldn't delete this item/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and toasts the server's reason when deleteItem refuses (spec 2026-10-06 §E)", async () => {
    (deleteItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Only Travellers on this trip can delete it."] },
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={existingItem} />);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: /delete "museum visit"\?/i });
    await user.click(within(confirmDialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: "Only Travellers on this trip can delete it." }),
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /^delete$/i })).not.toBeDisabled();
  });

  it("pairs Booking reference with Link; Address runs full width (spec 2026-10-05 §D)", () => {
    render(<ItemFormDialog {...baseProps} />);
    const pair = screen.getByLabelText(/booking reference/i).closest("[data-pair='booking']");
    expect(pair).toContainElement(screen.getByLabelText(/^link$/i));
    expect(pair).not.toContainElement(screen.getByLabelText(/^address$/i));
    expect(screen.getByLabelText(/^address$/i).closest("div.sm\\:col-span-2")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AddItemButton — homeCurrency forwarding
// ---------------------------------------------------------------------------

describe("AddItemButton — homeCurrency forwarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Cost field inside the dialog when homeCurrency is passed", async () => {
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
    expect(screen.getByLabelText(/^cost amount$/i)).toBeInTheDocument();
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
// defaultDate prop
// ---------------------------------------------------------------------------

describe("defaultDate prop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-fills the date field from defaultDate on create", () => {
    render(
      <ItemFormDialog
        tripId="t1"
        stops={[{ id: "s1", name: "Paris" }]}
        defaultUnscheduled={false}
        defaultDate="2026-12-06"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/^date$/i)).toHaveValue("2026-12-06");
  });

  it("ignores defaultDate in edit mode — the item's own date wins", () => {
    render(
      <ItemFormDialog
        tripId="t1"
        stops={[{ id: "s1", name: "Paris" }]}
        item={{
          id: "i1", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-07", bookingStateSet: false,
          startTime: null, endTime: null, address: null, link: null,
          booking: null, notes: null, stopId: "s1",
        }}
        defaultDate="2026-12-06"
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/^date$/i)).toHaveValue("2026-12-07");
  });
});

describe("AddItemButton — defaultDate forwarding (Day view)", () => {
  it("opens the dialog with the day preselected, over the trip start and Stop defaults", async () => {
    const user = userEvent.setup();
    render(
      <AddItemButton
        tripId="t1"
        stops={[{ id: "s1", name: "Paris", arriveDate: "2026-12-04" }]}
        tripStartDate="2026-12-04"
        defaultUnscheduled={false}
        defaultDate="2026-12-12"
        label="Add to this day"
      />,
    );
    await user.click(screen.getByRole("button", { name: /add to this day/i }));
    expect(screen.getByLabelText(/^date$/i)).toHaveValue("2026-12-12");
  });
});

// ---------------------------------------------------------------------------
// Stop arrive-date defaults (scheduled create defaults to the Stop's date)
// ---------------------------------------------------------------------------

describe("Stop arrive-date defaults", () => {
  beforeEach(() => vi.clearAllMocks());

  const STOPS = [
    { id: "stop-a", name: "Denpasar", arriveDate: "2026-12-04" },
    { id: "stop-b", name: "Munich", arriveDate: "2026-12-08" },
  ];

  it("scheduled create defaults the date to the pre-selected Stop's arrive date", () => {
    render(
      <ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} defaultStopId="stop-a" tripStartDate="2026-12-01" />,
    );
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-12-04");
  });

  it("scheduled create with no Stop falls back to the trip start", () => {
    render(<ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} tripStartDate="2026-12-01" />);
    expect(screen.getByLabelText(/^date/i)).toHaveValue("2026-12-01");
  });

  it("unscheduled create keeps the date blank even under a Stop", () => {
    render(<ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled defaultStopId="stop-a" />);
    expect(screen.getByLabelText(/^date/i)).toHaveValue("");
  });

  it("changing the Stop re-defaults an untouched date, but never a date the Traveller typed", async () => {
    const user = userEvent.setup();
    render(
      <ItemFormDialog {...baseProps} stops={STOPS} defaultUnscheduled={false} defaultStopId="stop-a" tripStartDate="2026-12-01" />,
    );
    const date = screen.getByLabelText(/^date/i);
    // Pick Munich via the Stop Select (Radix). The trigger carries no
    // accessible name of its own (unlike the Currency combobox, which has
    // aria-label="Currency"), so with a Stop present there are two
    // comboboxes on the page — the Stop trigger is the first in DOM order.
    const stopSelect = () => screen.getAllByRole("combobox")[0];
    await user.click(stopSelect());
    await user.click(await screen.findByRole("option", { name: "Munich" }));
    expect(date).toHaveValue("2026-12-08");
    await user.clear(date);
    await user.type(date, "2026-12-09");
    await user.click(stopSelect());
    await user.click(await screen.findByRole("option", { name: "Denpasar" }));
    expect(date).toHaveValue("2026-12-09");
  });
});

// ---------------------------------------------------------------------------
// Task 9 (CONTEXT.md "Item photo", spec §I): the Photo field
// ---------------------------------------------------------------------------

describe("Photo field", () => {
  beforeEach(() => vi.clearAllMocks());

  function photoFileInput(): HTMLInputElement {
    return screen.getByLabelText(/item photo/i) as HTMLInputElement;
  }

  it("create mode (no item id yet) shows no upload control — just the 'save first' hint", () => {
    render(<ItemFormDialog {...baseProps} />);
    expect(
      screen.getByText("Save this item first, then reopen it to add a photo."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/item photo/i)).not.toBeInTheDocument();
  });

  it("edit mode with no existing photo shows an 'Add a photo' control and no thumb", () => {
    render(<ItemFormDialog {...baseProps} item={existingItem} />);
    expect(screen.getByRole("button", { name: /add a photo/i })).toBeInTheDocument();
    expect(screen.queryByTestId("item-photo-thumb")).not.toBeInTheDocument();
  });

  it("selecting a file calls setItemPhoto with FormData containing itemId and the file", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={existingItem} />);

    const file = new File(["img-data"], "museum.png", { type: "image/png" });
    await user.upload(photoFileInput(), file);

    await waitFor(() => expect(setItemPhoto).toHaveBeenCalledTimes(1));
    const formData = vi.mocked(setItemPhoto).mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("itemId")).toBe("item-99");
    expect(formData.get("file")).toBe(file);
  });

  it("edit mode with an existing photo shows the thumb and Replace/Remove; Remove calls removeItemPhoto(itemId)", async () => {
    const user = userEvent.setup();
    render(
      <ItemFormDialog
        {...baseProps}
        item={{ ...existingItem, photoUrl: "/api/attachments/att-1" }}
      />,
    );
    expect(screen.getByTestId("item-photo-thumb")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeItemPhoto).toHaveBeenCalledWith("item-99"));
  });

  // Final review #5 (spec §I: "upload, or drop an image").
  describe("drop zone", () => {
    function dropzone(): HTMLElement {
      const el = document.querySelector('[data-slot="item-photo-dropzone"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    }

    it("shows a visible drop affordance, highlighted while dragging over", () => {
      render(<ItemFormDialog {...baseProps} item={existingItem} />);
      expect(screen.getByText("or drop an image here")).toBeInTheDocument();
      fireEvent.dragOver(dropzone(), { dataTransfer: { files: [], dropEffect: "none" } });
      expect(dropzone()).toHaveAttribute("data-dragging");
      expect(screen.getByText("Drop to use this photo")).toBeInTheDocument();
    });

    it("dropping an image uploads it through setItemPhoto, like the file picker", async () => {
      render(<ItemFormDialog {...baseProps} item={existingItem} />);
      const file = new File(["img-data"], "drop.jpg", { type: "image/jpeg" });
      fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });
      await waitFor(() => expect(setItemPhoto).toHaveBeenCalledTimes(1));
      const formData = vi.mocked(setItemPhoto).mock.calls[0][0];
      expect(formData.get("itemId")).toBe("item-99");
      expect(formData.get("file")).toBe(file);
      expect(dropzone()).not.toHaveAttribute("data-dragging");
    });

    it("ignores a dropped non-image with a message, and uploads nothing", async () => {
      render(<ItemFormDialog {...baseProps} item={existingItem} />);
      const file = new File(["%PDF"], "ticket.pdf", { type: "application/pdf" });
      fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });
      expect(await screen.findByText("That isn't an image. Drop a photo instead.")).toBeInTheDocument();
      expect(setItemPhoto).not.toHaveBeenCalled();
    });

    it("create mode has no drop zone (save first)", () => {
      render(<ItemFormDialog {...baseProps} />);
      expect(document.querySelector('[data-slot="item-photo-dropzone"]')).toBeNull();
    });

    it("centres the dropzone's thumbnail, buttons and hint (Feedback cmumcvsu8000004jkjtit9tvs)", async () => {
      render(<ItemFormDialog {...baseProps} item={existingItem} />);
      const el = document.querySelector('[data-slot="item-photo-dropzone"]')!;
      const c = el.className.split(/\s+/);
      expect(c).toContain("justify-center");
      expect(c).toContain("text-center");
      const buttons = el.querySelector("[data-slot='item-photo-buttons']")!;
      expect(buttons.className.split(/\s+/)).toContain("items-center");
    });
  });
});

// ---------------------------------------------------------------------------
// Spec 2026-10-04 §K: the Item edit dialog shares AttachmentList-inside-a-
// <form> with the Transport sheet, so it had the same implicit-submit bug.
// ---------------------------------------------------------------------------

describe("ItemFormDialog — deleting an Attachment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks to confirm, deletes the file, and neither saves nor closes the Item", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ItemFormDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        item={existingItem}
        attachments={[
          {
            id: "att-1",
            filename: "museum-tickets.pdf",
            mime: "application/pdf",
            size: 80_000,
            url: "/api/attachments/att-1",
            uploadedById: "user-1",
            createdAt: new Date("2026-07-01"),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete museum-tickets\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "museum-tickets\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(updateItem).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(updateItem).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("Dialog scroll containment (spec 2026-10-04 §G)", () => {
  // The reported bug: after adding an attachment the footer bar covered most
  // of the dialog. Clicking "Add file" focuses the Attachments' sr-only file
  // input; anchored to the fixed frame, focusing it scrolled the frame itself.
  // Every visually-hidden control in this form must resolve its containing
  // block to the scroll body instead.
  it("anchors the Attachments input, the Photo input and the Hide-from-shared-links checkbox to the scroll body", () => {
    render(<ItemFormDialog {...baseProps} item={existingItem} attachments={[]} />);
    const body = screen.getByRole("dialog").querySelector<HTMLElement>('[data-slot="dialog-body"]');
    expect(body).not.toBeNull();

    const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(fileInputs).toHaveLength(2); // Photo + Attachments
    const checkbox = screen.getByRole("checkbox", { name: "Hide from shared links" });

    for (const control of [...fileInputs, checkbox]) {
      expect(nearestPositionedAncestor(control)).toBe(body);
    }
  });
});

describe("dirty guard (spec 2026-10-06 §M)", () => {
  it("asks before discarding typed changes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/^title/i), "Colosseum");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  it("an untouched form still closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Surprise for… (CONTEXT.md Surprise)", () => {
  const MEMBERS = [
    { id: "cam", name: "Cam Williams", image: null },
    { id: "sam", name: "Sam Jones", image: null },
    { id: "alex", name: "Alex Lee", image: null },
  ];
  const surpriseProps = { ...baseProps, members: MEMBERS, currentUserId: "cam" };
  beforeEach(() => vi.mocked(createItem).mockClear());

  it("appears only when members and the current user are given", () => {
    const { unmount } = render(<ItemFormDialog {...baseProps} />);
    expect(screen.queryByRole("group", { name: "Surprise for…" })).toBeNull();
    unmount();
    render(<ItemFormDialog {...surpriseProps} />);
    const group = screen.getByRole("group", { name: "Surprise for…" });
    expect(within(group).getByRole("checkbox", { name: "Sam" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Cam" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Sam" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alex" })).not.toBeChecked();
  });

  it("the payload carries the ticked ids", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...surpriseProps} />);
    await user.type(screen.getByPlaceholderText(/visit the night market/i), "Birthday dinner");
    await user.click(screen.getByRole("checkbox", { name: "Sam" }));
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(createItem).toHaveBeenCalledWith("trip-1", expect.objectContaining({ surpriseForIds: ["sam"] }), undefined);
  });

  it("edit starts from the Item's Surprise, and clearing every box sends an empty list", async () => {
    const user = userEvent.setup();
    const surprise = { plannerId: "cam", plannerName: "Cam", forIds: ["sam"], forNames: ["Sam"], youAreSurprised: false };
    render(<ItemFormDialog {...surpriseProps} item={{ ...existingItem, surprise }} />);
    expect(screen.getByRole("checkbox", { name: "Sam" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Sam" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ surpriseForIds: [] }));
  });

  it("an unchanged set is not sent, so editing someone else's Surprise touches only the Item", async () => {
    const user = userEvent.setup();
    const surprise = { plannerId: "alex", plannerName: "Alex", forIds: ["sam"], forNames: ["Sam"], youAreSurprised: false };
    render(<ItemFormDialog {...surpriseProps} item={{ ...existingItem, surprise }} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(vi.mocked(updateItem).mock.calls.at(-1)![1]).not.toHaveProperty("surpriseForIds");
  });

  it("ticking a box counts as a change for the dirty guard", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...surpriseProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("checkbox", { name: "Sam" }));
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});


// ---------------------------------------------------------------------------
// AddItemButton — defaultStopId forwarding (Day view, spec 2026-10-13 D7)
// ---------------------------------------------------------------------------

describe("AddItemButton — defaultStopId forwarding (Day view)", () => {
  it("AddItemButton passes defaultStopId to the dialog on create", async () => {
    const user = userEvent.setup();
    render(
      <AddItemButton
        tripId="t"
        stops={[
          { id: "s0", name: "Brisbane", arriveDate: "2026-11-01" },
          { id: "s1", name: "Cairns", arriveDate: "2026-11-04" },
        ]}
        defaultUnscheduled={false}
        defaultStopId="s1"
        defaultDate="2026-11-04"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Add Item/ }));
    // The Stop trigger has no accessible name of its own; it is the first
    // combobox in DOM order (see "Stop arrive-date defaults" above).
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Cairns");
  });
});

describe("ItemFormDialog: Proposal mode (Booking import)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirms the seeded thing to do through the override", async () => {
    const user = userEvent.setup();
    const onSubmitOverride = vi.fn().mockResolvedValue({ success: true });
    const onDraftChange = vi.fn();
    render(
      <ItemFormDialog
        tripId="t" stops={[{ id: "s-lis", name: "Lisbon", arriveDate: "2026-12-02" }]} open onOpenChange={vi.fn()}
        initialValues={{ title: "Pena Palace entry", category: "OTHER", stopId: "s-lis", date: "2026-12-04", startTime: "09:30", booking: "PENA-1" }}
        onDraftChange={onDraftChange}
        onSubmitOverride={onSubmitOverride}
        preview={<div>preview card</div>}
      />,
    );
    expect(screen.getByTestId("proposal-preview")).toHaveTextContent("preview card");
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Pena Palace entry", date: "2026-12-04" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSubmitOverride).toHaveBeenCalledWith(expect.objectContaining({ title: "Pena Palace entry", category: "OTHER", stopId: "s-lis", date: "2026-12-04", startTime: "09:30", booking: "PENA-1" }));
    expect(createItem).not.toHaveBeenCalled();
  });

  // Fix round 1 (controller ruling): buildInput() never carries openingHours
  // (a Proposal has nowhere to store them), so showing the editor here would
  // silently drop whatever the Traveller typed into it. Hide it instead.
  it("has no Opening hours editor — buildInput() never carries it, so anything typed there would be silently dropped", () => {
    render(
      <ItemFormDialog
        tripId="t" stops={[{ id: "s-lis", name: "Lisbon", arriveDate: "2026-12-02" }]} open onOpenChange={vi.fn()}
        initialValues={{ title: "Pena Palace entry", category: "OTHER" }}
        onSubmitOverride={vi.fn().mockResolvedValue({ success: true })}
      />,
    );
    expect(screen.queryByText("Opening hours")).not.toBeInTheDocument();
  });

  it("has no Try list editor: buildInput() never carries one", () => {
    render(
      <ItemFormDialog
        tripId="t" stops={[{ id: "s-lis", name: "Lisbon", arriveDate: "2026-12-02" }]} open onOpenChange={vi.fn()}
        initialValues={{ title: "Pena Palace entry", category: "OTHER" }}
        onSubmitOverride={vi.fn().mockResolvedValue({ success: true })}
      />,
    );
    expect(screen.queryByText("Try list")).not.toBeInTheDocument();
  });
});

describe("ItemFormDialog: Reminders (F8)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the Item's Reminders and offers Add a reminder without saving the Item (F8)", async () => {
    const user = userEvent.setup();
    const onAddReminder = vi.fn();
    render(<ItemFormDialog {...baseProps} item={existingItem} reminders={[reminderItem({ id: "r1", title: "Book a slot", date: "2026-08-01", itemId: existingItem.id })]} onAddReminder={onAddReminder} />);
    expect(screen.getByText("Book a slot")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAddReminder).toHaveBeenCalledTimes(1);
    expect(updateItem).not.toHaveBeenCalled();
  });

  it("shows no Reminders field when creating an Item", () => {
    render(<ItemFormDialog {...baseProps} onAddReminder={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
  });
});

describe("ItemFormDialog: Booking state (spec 2026-10-17 R2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a new thing to do needs no booking; choosing To book with a date sends both", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    expect(screen.getByRole("radio", { name: "No booking needed" })).toHaveAttribute("data-state", "on");
    await user.type(screen.getByLabelText(/^title/i), "Lodge tour");
    await user.click(screen.getByRole("radio", { name: "To book" }));
    await user.type(screen.getByLabelText("Book by"), "2027-05-20");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(vi.mocked(createItem).mock.calls[0][1]).toMatchObject({ bookingState: "TO_BOOK", bookBy: "2027-05-20" });
  });

  it("a booking reference on an un-chosen thing previews Booked and sends no state", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/^title/i), "Museum");
    await user.type(screen.getByLabelText(/booking reference/i), "BK-1");
    expect(screen.getByRole("radio", { name: "Booked" })).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(vi.mocked(createItem).mock.calls[0][1].bookingState).toBeUndefined();
    expect(vi.mocked(createItem).mock.calls[0][1].bookBy).toBeUndefined();
  });

  it("an edit of a To book thing whose date is cleared sends bookBy null (PATCH)", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" }} />);
    await user.clear(screen.getByLabelText("Book by"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith(existingItem.id, expect.objectContaining({ bookingState: "TO_BOOK", bookBy: null }));
  });

  it("an edit of a To book thing with a date, marked Booked, sends bookBy null so the server does not refuse it", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, bookingState: "TO_BOOK", bookingStateSet: true, bookBy: "2027-05-20" }} />);
    await user.click(screen.getByRole("radio", { name: "Booked" }));
    expect(screen.queryByLabelText("Book by")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith(existingItem.id, expect.objectContaining({ bookingState: "BOOKED", bookBy: null }));
  });

  it("a Proposal opens Booked and confirms Booked", async () => {
    const user = userEvent.setup();
    const onSubmitOverride = vi.fn().mockResolvedValue({ success: true });
    render(
      <ItemFormDialog
        {...baseProps}
        initialValues={{ title: "Museum ticket", category: "SIGHTSEEING", bookingState: "BOOKED" }}
        onSubmitOverride={onSubmitOverride}
      />,
    );
    expect(screen.getByRole("radio", { name: "Booked" })).toHaveAttribute("data-state", "on");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSubmitOverride).toHaveBeenCalledWith(expect.objectContaining({ bookingState: "BOOKED" }));
  });
});

describe("Ticket (Slot time, R3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is collapsed for a new Item and sends the slot, the margin and refundability", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} defaultUnscheduled={false} tripStartDate="2027-06-02" />);
    const ticket = screen.getByText("Ticket").closest("details")!;
    expect(ticket).not.toHaveAttribute("open");
    await user.type(screen.getByPlaceholderText(/visit the night market/i), "Lodge tour");
    await user.click(screen.getByText("Ticket"));
    await user.type(screen.getByLabelText(/slot time/i), "12:00");
    await user.type(screen.getByLabelText(/be there early/i), "15");
    await user.click(screen.getByRole("radio", { name: "No" }));
    // The empty start says what it will default to.
    expect(screen.getByText(/starts at 11:45 if left empty/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ date: "2027-06-02", startTime: undefined, slotTime: "12:00", arriveByMinutes: 15, refundable: false }),
      undefined,
    );
  });

  it("opens with the saved ticket, and an unrelated edit sends it back unchanged", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, date: "2027-06-02", startTime: "11:45", slotTime: "12:00", arriveByMinutes: 15, refundable: false }} />);
    expect(screen.getByText("Ticket").closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText(/slot time/i)).toHaveValue("12:00");
    await user.type(screen.getByLabelText(/^notes$/i), "Bring ID");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ slotTime: "12:00", arriveByMinutes: 15, refundable: false, startTime: "11:45" }));
  });

  it("emptying the slot and the margin clears them (PATCH)", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, slotTime: "12:00", arriveByMinutes: 15 }} />);
    await user.clear(screen.getByLabelText(/slot time/i));
    await user.clear(screen.getByLabelText(/be there early/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateItem).toHaveBeenCalledWith("item-99", expect.objectContaining({ slotTime: null, arriveByMinutes: null, refundable: null }));
  });

  it("the Refundable control is a labelled Field, and a server error is announced on it", async () => {
    (updateItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, errors: { refundable: ["Pick yes, no or not known"] } });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, refundable: true }} />);
    const group = screen.getByRole("radiogroup", { name: "Refundable" });
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("refundable-label")).toBeNull(); // no fixed id: two dialogs could share it
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    const invalid = await screen.findByRole("radiogroup", { name: "Refundable" });
    await waitFor(() => expect(invalid).toHaveAttribute("aria-invalid", "true"));
    expect(invalid).toHaveAccessibleDescription("Pick yes, no or not known");
  });
});

describe("Opening hours (R4)", () => {
  beforeEach(() => vi.clearAllMocks());

  const span = [["10:00", "18:00"]] as [string, string][];
  const HOURS = {
    week: { sun: span, mon: span, tue: span, wed: span, thu: span, fri: span, sat: span },
    seasons: [],
    closed: [],
  };

  it("an edit that leaves the hours alone sends no openingHours", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("openingHours");
  });

  it("closing a weekday in the editor sends the new hours", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.selectOptions(screen.getByLabelText("Tuesday"), "closed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toMatchObject({ openingHours: { week: { tue: [] } } });
  });

  it("removing the hours sends null", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Remove opening hours" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("openingHours", null);
  });

  it("a create with hours set sends them", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Lello");
    await user.click(screen.getByText("Opening hours"));
    await user.click(screen.getByRole("button", { name: "Add opening hours" }));
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).toHaveProperty("openingHours.week");
  });

  // Fix round 1 (controller ruling): the previous version of this test only
  // ever exercised the "with hours" branch of buildInput's condition — it
  // never actually created an Item with the editor left untouched.
  it("a create with no hours sends no openingHours", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Lello");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).not.toHaveProperty("openingHours");
  });

  it("shows the server's opening-hours error in the editor", async () => {
    (updateItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { openingHours: ["A season must end on or after it starts"] },
    });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.selectOptions(screen.getByLabelText("Tuesday"), "closed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("A season must end on or after it starts")).toBeInTheDocument();
  });

  it("keeps the editor open once opened, even after a successful save clears the error", async () => {
    (updateItem as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: false, errors: { openingHours: ["A season must end on or after it starts"] } })
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, openingHours: HOURS }} />);
    await user.click(screen.getByText("Opening hours"));
    await user.selectOptions(screen.getByLabelText("Tuesday"), "closed");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("A season must end on or after it starts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Opening hours").closest("details")).toHaveAttribute("open");
  });
});

describe("Try list (R6)", () => {
  beforeEach(() => vi.clearAllMocks());
  const LIST = [
    { id: "e1", text: "Lebkuchen", tried: true },
    { id: "e2", text: "Drei im Weggla", tried: false },
  ];

  it("an edit that leaves the list alone sends no tryList", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("adding an entry sends the list by id, without ticks, the new one without an id", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele{Enter}");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", [
      { id: "e1", text: "Lebkuchen" },
      { id: "e2", text: "Drei im Weggla" },
      { text: "Schäufele" },
    ]);
  });

  it("removing every entry sends null", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.click(screen.getByRole("button", { name: "Remove Lebkuchen" }));
    await user.click(screen.getByRole("button", { name: "Remove Drei im Weggla" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", null);
  });

  it("a create with entries sends them; without, sends none", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Christkindlesmarkt");
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Glühwein{Enter}");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).toHaveProperty("tryList", [{ text: "Glühwein" }]);
    unmount();
    vi.mocked(createItem).mockClear();
    render(<ItemFormDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/title/i), "Walk");
    await user.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(createItem).toHaveBeenCalled());
    expect(vi.mocked(createItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("text typed in New thing to try but not added is saved with the list (M6)", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", [
      { id: "e1", text: "Lebkuchen" },
      { id: "e2", text: "Drei im Weggla" },
      { text: "Schäufele" },
    ]);
  });

  it("text typed in New thing to try counts as a change: closing asks first (M6)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ItemFormDialog {...baseProps} onOpenChange={onOpenChange} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "Schäufele");
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  it("a reorder-only change sends the list", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.click(screen.getByRole("button", { name: "Move Drei im Weggla up" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).toHaveProperty("tryList", [
      { id: "e2", text: "Drei im Weggla" },
      { id: "e1", text: "Lebkuchen" },
    ]);
  });

  it("renaming an entry and back to its original text sends no tryList", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    const first = screen.getByLabelText("Thing to try 1");
    await user.type(first, "x");
    await user.type(first, "{Backspace}");
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("an edit of an Item with no Try list sends no tryList", async () => {
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: null }} />);
    await user.type(screen.getByLabelText(/notes/i), "x");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateItem).toHaveBeenCalled());
    expect(vi.mocked(updateItem).mock.calls[0][1]).not.toHaveProperty("tryList");
  });

  it("shows the server's Try list error in the editor", async () => {
    vi.mocked(updateItem).mockResolvedValueOnce({ success: false, errors: { tryList: ["A Try list holds up to 30 things"] } });
    const user = userEvent.setup();
    render(<ItemFormDialog {...baseProps} item={{ ...existingItem, tryList: LIST }} />);
    await user.click(screen.getByText("Try list"));
    await user.type(screen.getByLabelText("New thing to try"), "One more{Enter}");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("A Try list holds up to 30 things")).toBeInTheDocument();
  });
});
