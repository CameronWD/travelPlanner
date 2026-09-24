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

// Fixed "today" for deterministic due-date tests.
const FIXED_TODAY = "2026-07-14";
vi.mock("@/lib/dates", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/dates")>();
  return { ...real, todayISO: () => FIXED_TODAY, todayLocalISO: () => FIXED_TODAY };
});

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

    // Click the first (unchecked) item's checkbox — the Checkbox primitive is
    // named by the item text (was an icon button named "Mark complete").
    await user.click(screen.getByRole("checkbox", { name: "Book airport taxi" }));

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

  it("due badge shows humanized label: Overdue for past date, Due soon for near-future date", () => {
    // FIXED_TODAY = "2026-07-14"
    // Overdue: clearly in the past
    const overdueItem: ChecklistItemRow = {
      id: "item-overdue",
      kind: "PRETRIP",
      text: "Overdue task",
      done: false,
      dueDate: "2026-07-01", // 13 days before FIXED_TODAY → overdue
      sortOrder: 0,
      assignedTo: null,
    };
    // Soon: 3 days ahead → within 7-day window
    const soonItem: ChecklistItemRow = {
      id: "item-soon",
      kind: "PRETRIP",
      text: "Soon task",
      done: false,
      dueDate: "2026-07-17", // 3 days after FIXED_TODAY → "due soon"
      sortOrder: 1,
      assignedTo: null,
    };

    const { rerender } = render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={[overdueItem]}
        showDueDate={true}
        showAssignee={false}
      />,
    );
    // Should contain "Overdue" prefix in the badge
    expect(screen.getAllByText(/Overdue/)[0]).toBeInTheDocument();

    rerender(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={[soonItem]}
        showDueDate={true}
        showAssignee={false}
      />,
    );
    // Should contain "Due soon" prefix in the badge
    expect(screen.getAllByText(/Due soon/)[0]).toBeInTheDocument();
  });

  // ── Playground kit restyle (Task 14) ──────────────────────────────────────

  it("each item is a Checkbox primitive labelled by its text, checked when done", () => {
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />,
    );
    const todo = screen.getByRole("checkbox", { name: "Book airport taxi" });
    const done = screen.getByRole("checkbox", { name: "Print boarding pass" });
    expect(todo).not.toBeChecked();
    expect(done).toBeChecked();
    // Native input inside a label: the whole ≥44px label row is the hit area.
    expect(todo.closest("label")).toHaveClass("min-h-11");
    // No legacy icon-button toggles remain.
    expect(screen.queryByRole("button", { name: /mark (in)?complete/i })).toBeNull();
  });

  it("toggling a done item calls toggleChecklistItem with false", async () => {
    const user = userEvent.setup();
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Print boarding pass" }));
    expect(toggleChecklistItem).toHaveBeenCalledWith("item-2", false);
  });

  it("items sit in one kit Card (2px border, hard shadow) with soft row rules", () => {
    const { container } = render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />,
    );
    const card = container.querySelector('[data-slot="checklist-card"]');
    expect(card).not.toBeNull();
    expect(card).toHaveClass("border-2", "shadow-hard-2");
    expect(card!.querySelectorAll("li")).toHaveLength(2);
    // Kit "N of M done" muted count + ProgressBar primitive in the teal accent.
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "1 of 2 done" });
    expect(bar).toHaveClass("border-2");
    expect(bar.firstElementChild).toHaveClass("bg-teal");
  });

  it("icon-only row actions have accessible names and ≥44px touch targets", () => {
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={[seedItems[0]]} showDueDate={false} showAssignee={false} />,
    );
    for (const name of ["Move up", "Move down", "Edit Item", "Delete Item"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn.className).toMatch(/pointer-coarse:after:-inset-1\.5/);
    }
  });

  it("empty list uses EmptyState (kit punctuation, teal tile) above the add form", () => {
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={[]} showDueDate={false} showAssignee={false} />,
    );
    expect(screen.getByRole("heading", { name: "No pre-trip tasks yet" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/book airport taxi/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
