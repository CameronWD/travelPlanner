import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/ai", () => ({
  aiDraftPackingList: vi.fn(),
}));
vi.mock("@/server/actions/checklists", () => ({
  addChecklistItem: vi.fn().mockResolvedValue({ success: true }),
  addChecklistItems: vi.fn().mockResolvedValue({ success: true }),
}));

import { aiDraftPackingList } from "@/server/actions/ai";
import { addChecklistItem, addChecklistItems } from "@/server/actions/checklists";
import { AiPackingSuggestions } from "./ai-packing-suggestions";

const draft = (items: string[]) =>
  vi.mocked(aiDraftPackingList).mockResolvedValue({ ok: true, data: { items } });

async function draftAndWait(user: ReturnType<typeof userEvent.setup>, items: string[]) {
  draft(items);
  await user.click(screen.getByRole("button", { name: /draft packing list/i }));
  for (const item of items) {
    await screen.findByText(item);
  }
}

describe("AiPackingSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("'Add all' calls addChecklistItems once with every not-yet-added item (not addChecklistItem per item)", async () => {
    const user = userEvent.setup();
    render(<AiPackingSuggestions tripId="trip-1" aiConfigured />);
    await draftAndWait(user, ["Sunscreen", "Hat", "Towel"]);

    await user.click(screen.getByRole("button", { name: /add all/i }));

    expect(addChecklistItems).toHaveBeenCalledTimes(1);
    expect(addChecklistItems).toHaveBeenCalledWith("trip-1", "PACKING", [
      "Sunscreen",
      "Hat",
      "Towel",
    ]);
    expect(addChecklistItem).not.toHaveBeenCalled();
  });

  it("'Add all' only includes items not already added individually", async () => {
    const user = userEvent.setup();
    render(<AiPackingSuggestions tripId="trip-1" aiConfigured />);
    await draftAndWait(user, ["Sunscreen", "Hat", "Towel"]);

    // Add "Hat" individually first.
    await user.click(screen.getByTitle('Add "Hat" to packing list'));
    expect(await screen.findByRole("button", { name: /added/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add all/i }));

    expect(addChecklistItems).toHaveBeenCalledWith("trip-1", "PACKING", [
      "Sunscreen",
      "Towel",
    ]);
  });

  it("per-item Add still calls addChecklistItem for just that item", async () => {
    const user = userEvent.setup();
    render(<AiPackingSuggestions tripId="trip-1" aiConfigured />);
    await draftAndWait(user, ["Sunscreen"]);

    await user.click(screen.getByTitle('Add "Sunscreen" to packing list'));

    expect(addChecklistItem).toHaveBeenCalledWith("trip-1", {
      kind: "PACKING",
      text: "Sunscreen",
    });
    expect(addChecklistItems).not.toHaveBeenCalled();
  });

  it("after a successful 'Add all' every item shows as Added and the button disappears", async () => {
    const user = userEvent.setup();
    render(<AiPackingSuggestions tripId="trip-1" aiConfigured />);
    await draftAndWait(user, ["Sunscreen", "Hat"]);

    await user.click(screen.getByRole("button", { name: /add all/i }));

    expect(await screen.findAllByRole("button", { name: /added/i })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /add all/i })).not.toBeInTheDocument();
  });

  it("a failed 'Add all' leaves items un-added", async () => {
    vi.mocked(addChecklistItems).mockResolvedValueOnce({
      success: false,
      errors: { _: ["nope"] },
    });
    const user = userEvent.setup();
    render(<AiPackingSuggestions tripId="trip-1" aiConfigured />);
    await draftAndWait(user, ["Sunscreen"]);

    await user.click(screen.getByRole("button", { name: /add all/i }));

    expect(screen.getByTitle('Add "Sunscreen" to packing list')).toBeInTheDocument();
  });
});
