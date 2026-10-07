import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  updateChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  toggleChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  deleteChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  reorderChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  setBuyState: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { act } from "react";
import {
  toggleChecklistItem,
  addChecklistItem,
  deleteChecklistItem,
  setBuyState,
} from "@/server/actions/checklists";

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
    buy: null,
  },
  {
    id: "item-2",
    kind: "PRETRIP",
    text: "Print boarding pass",
    done: true,
    dueDate: null,
    sortOrder: 1,
    assignedTo: null,
    buy: null,
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
      buy: null,
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
      buy: null,
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

  // Task 2 (one TravellerAvatar everywhere): the assignee's Display name —
  // not just their provider name — must show here too (the avatar's title).
  it("titles the assignee avatar with their Display name, not just their provider name", () => {
    const assignedItem: ChecklistItemRow = {
      ...seedItems[0],
      assignedTo: { id: "u1", name: "Cameron Williams", image: null, displayName: "Cam" },
    };
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={[assignedItem]} showDueDate={false} showAssignee />,
    );
    expect(screen.getByTitle("Cam")).toBeInTheDocument();
    expect(screen.queryByTitle("Cameron Williams")).not.toBeInTheDocument();
  });

  // Renders the assignee's uploaded Profile photo, not just initials.
  it("renders the assignee's uploaded Profile photo, not just initials", async () => {
    const assignedItem: ChecklistItemRow = {
      ...seedItems[0],
      assignedTo: {
        id: "u1",
        name: "Cam",
        image: null,
        photoKey: "users/u1/photo.png",
        photoUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    };
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={[assignedItem]} showDueDate={false} showAssignee />,
    );
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toMatch(/^\/api\/avatars\/u1/);
  });

  it("empty list uses EmptyState (kit punctuation, teal tile) above the add form", () => {
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={[]} showDueDate={false} showAssignee={false} />,
    );
    expect(screen.getByRole("heading", { name: "No pre-trip tasks yet" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/book airport taxi/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  // Task 11 (LA-017): the Checklists page now also embeds this quick-add form
  // inside a companion-column grid card, which is always narrower than a full
  // page column. A viewport-based `sm:flex-row` doesn't know that — it rowed
  // up and overlapped its own fields whenever the *form's* width, not the
  // viewport's, was the narrow one. It must react to its own rendered width.
  it("the quick-add form sizes its row layout off its own width, not the viewport", () => {
    render(
      <Checklist
        tripId="trip-1"
        kind="PRETRIP"
        items={[]}
        members={[{ id: "u1", name: "You", image: null }]}
        showDueDate
        showAssignee
      />,
    );
    const form = screen.getByRole("form", { name: "Add a pre-trip task" });
    expect(form.className).not.toMatch(/(^|\s)sm:flex-row/);
    expect(form.className).toContain("@min-[700px]:flex-row");
    expect(form.parentElement).toHaveClass("@container");
  });

  // ── Shopping list (Task 13, spec §G) ──────────────────────────────────────

  it("a PACKING row shows a 'Need to buy' button that calls setBuyState with NEEDED", async () => {
    const user = userEvent.setup();
    const packingItem: ChecklistItemRow = {
      id: "pack-1",
      kind: "PACKING",
      text: "Sunscreen",
      done: false,
      dueDate: null,
      sortOrder: 0,
      assignedTo: null,
      buy: null,
    };
    render(
      <Checklist tripId="trip-1" kind="PACKING" items={[packingItem]} showDueDate={false} showAssignee={false} />,
    );
    const button = screen.getByRole("button", { name: /need to buy/i });
    await user.click(button);
    expect(setBuyState).toHaveBeenCalledWith("pack-1", "NEEDED");
  });

  it("a PACKING row with buy: BOUGHT shows the text 'Bought'", () => {
    const boughtItem: ChecklistItemRow = {
      id: "pack-2",
      kind: "PACKING",
      text: "Adapter",
      done: false,
      dueDate: null,
      sortOrder: 0,
      assignedTo: null,
      buy: "BOUGHT",
    };
    render(
      <Checklist tripId="trip-1" kind="PACKING" items={[boughtItem]} showDueDate={false} showAssignee={false} />,
    );
    expect(screen.getByText("Bought")).toBeInTheDocument();
    // The badge already shows the state — the button to flag it would be
    // redundant (and clicking it again makes no sense once it's bought).
    expect(screen.queryByRole("button", { name: /need to buy/i })).toBeNull();
  });

  it("a PACKING row with buy: NEEDED shows the text 'To buy'", () => {
    const neededItem: ChecklistItemRow = {
      id: "pack-3",
      kind: "PACKING",
      text: "Jacket",
      done: false,
      dueDate: null,
      sortOrder: 0,
      assignedTo: null,
      buy: "NEEDED",
    };
    render(
      <Checklist tripId="trip-1" kind="PACKING" items={[neededItem]} showDueDate={false} showAssignee={false} />,
    );
    expect(screen.getByText("To buy")).toBeInTheDocument();
    // Same as BOUGHT: once buy is set, the "To buy" badge is the only signal
    // — the "Need to buy" button hides rather than duplicating it.
    expect(screen.queryByRole("button", { name: /need to buy/i })).toBeNull();
  });

  it("PRETRIP rows show no 'Need to buy' button", () => {
    render(
      <Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />,
    );
    expect(screen.queryByRole("button", { name: /need to buy/i })).toBeNull();
  });

  it("ticks at once, and rolls back with a toast when the server refuses (spec 2026-10-06 §W)", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(toggleChecklistItem).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<Checklist tripId="trip-1" kind="PRETRIP" items={seedItems} showDueDate={false} showAssignee={false} />);
    const box = screen.getByRole("checkbox", { name: "Book airport taxi" });
    await user.click(box);
    expect(box).toBeChecked();
    await act(async () => resolve({ success: false, errors: { _: ["Couldn't update that item."] } }));
    expect(box).not.toBeChecked();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't update that item." });
  });
});
