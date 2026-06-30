import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}));
import { createItem, updateItem } from "@/server/actions/items";

import { ItemFormDialog } from "./item-form-dialog";
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
    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    // Dialog title should say "Edit idea"
    expect(screen.getByRole("heading", { name: /edit idea/i })).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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

    await user.click(screen.getByRole("button", { name: /add idea/i }));

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
});
