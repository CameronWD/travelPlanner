import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  updateChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  toggleChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  deleteChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  reorderChecklistItem: vi.fn().mockResolvedValue({ success: true }),
}));
import { toggleChecklistItem, addChecklistItem, deleteChecklistItem } from "@/server/actions/checklists";

import { Checklist } from "./checklist";
import type { ChecklistItemRow } from "./checklist";

const seedItems: ChecklistItemRow[] = [
  {
    id: "item-1",
    kind: "PRETRIP",
    text: "Book airport taxi",
    done: false,
    dueDate: null,
    sortOrder: 0,
    assignedTo: null,
  },
  {
    id: "item-2",
    kind: "PRETRIP",
    text: "Print boarding pass",
    done: true,
    dueDate: null,
    sortOrder: 1,
    assignedTo: null,
  },
];

describe("Checklist", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clicking an unchecked item's checkbox calls toggleChecklistItem with its id and true", async () => {
    const user = userEvent.setup();
    render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={seedItems}
        showDueDate={false}
        showAssignee={false}
      />,
    );

    // Click the "Mark complete" button for the first (unchecked) item
    await user.click(screen.getByRole("button", { name: "Mark complete" }));

    expect(toggleChecklistItem).toHaveBeenCalledWith("item-1", true);
  });

  it("adding an item via the input calls addChecklistItem with the typed text and kind", async () => {
    const user = userEvent.setup();
    render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={seedItems}
        showDueDate={false}
        showAssignee={false}
      />,
    );

    // Type into the new item input and submit
    const input = screen.getByPlaceholderText(/book airport taxi/i);
    await user.type(input, "Pack passport");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(addChecklistItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        text: "Pack passport",
        kind: "PRETRIP",
      }),
    );
  });

  it("delete shows a confirmation dialog naming the item and fires only after confirming", async () => {
    const user = userEvent.setup();
    render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={seedItems}
        showDueDate={false}
        showAssignee={false}
      />,
    );

    // Hover to reveal actions then click delete on first item
    const deleteButtons = screen.getAllByRole("button", { name: /delete item/i });
    await user.click(deleteButtons[0]);

    // Dialog title should appear with the item text
    expect(
      await screen.findByRole("heading", { name: /Delete "Book airport taxi"\?/i }),
    ).toBeInTheDocument();

    // deleteChecklistItem must NOT have been called yet
    expect(deleteChecklistItem).not.toHaveBeenCalled();

    // Confirm deletion
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteChecklistItem).toHaveBeenCalledWith("item-1");
  });

  it("delete does NOT fire when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={seedItems}
        showDueDate={false}
        showAssignee={false}
      />,
    );

    const deleteButtons = screen.getAllByRole("button", { name: /delete item/i });
    await user.click(deleteButtons[0]);
    await screen.findByRole("heading", { name: /Delete "Book airport taxi"\?/i });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteChecklistItem).not.toHaveBeenCalled();
  });
});
