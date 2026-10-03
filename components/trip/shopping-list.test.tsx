import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  toggleChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  deleteChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  setBuyState: vi.fn().mockResolvedValue({ success: true }),
}));
import {
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  setBuyState,
} from "@/server/actions/checklists";

import { ShoppingList } from "./shopping-list";
import type { ShoppingEntry } from "@/lib/shopping-list";

const entries: ShoppingEntry[] = [
  { source: "packing", id: "p1", text: "Jacket", bought: false },
  { source: "packing", id: "p2", text: "Adapter", bought: true },
  { source: "standalone", id: "s1", text: "Snacks", bought: false },
];

describe("ShoppingList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ticking a packing-derived entry calls setBuyState(id, BOUGHT)", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    await user.click(screen.getByRole("checkbox", { name: /^Jacket/ }));
    expect(setBuyState).toHaveBeenCalledWith("p1", "BOUGHT");
  });

  it("unticking a packing-derived entry calls setBuyState(id, NEEDED)", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    await user.click(screen.getByRole("checkbox", { name: /^Adapter/ }));
    expect(setBuyState).toHaveBeenCalledWith("p2", "NEEDED");
  });

  it("Remove on a packing-derived entry calls setBuyState(id, null)", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);
    expect(setBuyState).toHaveBeenCalledWith("p1", null);
  });

  it("ticking a standalone entry calls toggleChecklistItem", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    await user.click(screen.getByRole("checkbox", { name: /^Snacks/ }));
    expect(toggleChecklistItem).toHaveBeenCalledWith("s1", true);
  });

  it("typing + Enter in the add box calls addChecklistItem(tripId, { kind: SHOPPING, text })", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    const input = screen.getByRole("textbox", { name: /add a shopping item/i });
    await user.type(input, "Gift{Enter}");
    expect(addChecklistItem).toHaveBeenCalledWith("trip-1", {
      kind: "SHOPPING",
      text: "Gift",
    });
  });

  it("a packing-derived row shows a muted 'from Packing' hint", () => {
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    expect(screen.getAllByText(/from Packing/i).length).toBeGreaterThan(0);
  });

  it("deleting a standalone entry shows a confirm dialog, then calls deleteChecklistItem", async () => {
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(await screen.findByRole("heading", { name: /Snacks/i })).toBeInTheDocument();
    expect(deleteChecklistItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteChecklistItem).toHaveBeenCalledWith("s1");
  });

  it("empty entries shows an empty state and the add box", () => {
    render(<ShoppingList tripId="trip-1" entries={[]} />);
    expect(screen.getByRole("textbox", { name: /add a shopping item/i })).toBeInTheDocument();
  });
});
