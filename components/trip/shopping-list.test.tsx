import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  toggleChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  deleteChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  setBuyState: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import {
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  setBuyState,
} from "@/server/actions/checklists";

import { ShoppingList } from "./shopping-list";
import type { ShoppingEntry } from "@/lib/shopping-list";

const entries: ShoppingEntry[] = [
  { source: "packing", id: "p1", text: "Jacket", bought: false, owner: null, canUnmark: true },
  { source: "packing", id: "p2", text: "Adapter", bought: true, owner: null, canUnmark: true },
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
    expect(screen.getByRole("heading", { name: "No shopping items yet" }).closest("[class*='border-0']")).not.toBeNull();
  });

  it("a personal entry shows its owner's avatar; a Shared one shows none", () => {
    render(
      <ShoppingList
        tripId="trip-1"
        entries={[
          { source: "packing", id: "p1", text: "Boots", bought: false, owner: { id: "sam", name: "Sam Lee", image: null }, canUnmark: false },
          { source: "packing", id: "p2", text: "Tent", bought: false, owner: null, canUnmark: true },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("SL");
    expect(rows[1].textContent).not.toContain("SL");
  });

  it("no Remove control on an entry the viewer can't unmark, but it can still be ticked Bought", async () => {
    const user = userEvent.setup();
    render(
      <ShoppingList
        tripId="trip-1"
        entries={[
          { source: "packing", id: "p1", text: "Boots", bought: false, owner: { id: "sam", name: "Sam", image: null }, canUnmark: false },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /^Boots/ }));
    expect(setBuyState).toHaveBeenCalledWith("p1", "BOUGHT");
  });

  function hold(fn: unknown) {
    let resolve!: (v: unknown) => void;
    vi.mocked(fn as () => Promise<unknown>).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    return (v: unknown) => act(async () => resolve(v));
  }

  it("ticking shows Bought at once and goes back with the server's message when refused", async () => {
    const settle = hold(setBuyState);
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    const box = screen.getByRole("checkbox", { name: /^Jacket/ });
    await user.click(box);
    expect(box).toBeChecked();
    await settle({ success: false, errors: { _: ["Not yours."] } });
    expect(box).not.toBeChecked();
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Not yours." });
  });

  it("ticking a standalone entry goes back and says why when the save rejects offline", async () => {
    vi.mocked(toggleChecklistItem).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    const box = screen.getByRole("checkbox", { name: /^Snacks/ });
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      await user.click(box);
      expect(await screen.findByRole("checkbox", { name: /^Snacks/ })).not.toBeChecked();
    } finally {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    }
    expect(toast).toHaveBeenCalled();
  });

  it("Remove says it is working while the change runs, and a second click does nothing", async () => {
    const settle = hold(setBuyState);
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    const remove = screen.getAllByRole("button", { name: /remove/i })[0];
    await user.click(remove);
    expect(remove).toHaveAttribute("aria-busy", "true");
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(setBuyState).toHaveBeenCalledTimes(1);
    await settle({ success: true });
  });

  it("deleting a standalone entry says it is working on its button, and a second click does nothing", async () => {
    const settle = hold(deleteChecklistItem);
    const user = userEvent.setup();
    render(<ShoppingList tripId="trip-1" entries={entries} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toHaveAttribute("aria-busy", "true");
    expect(del).toBeDisabled();
    await user.click(del);
    expect(deleteChecklistItem).toHaveBeenCalledTimes(1);
    await settle({ success: true });
  });
});
