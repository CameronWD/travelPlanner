import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createItemMock, suggestMock } = vi.hoisted(() => ({ createItemMock: vi.fn(), suggestMock: vi.fn() }));
vi.mock("@/server/actions/items", () => ({ createItem: createItemMock }));
vi.mock("@/server/actions/ai", () => ({ aiSuggestActivities: suggestMock }));

import { AiActivitySuggestions } from "./ai-activity-suggestions";

describe("AiActivitySuggestions", () => {
  it("adding a suggestion saves a Wishlist idea", async () => {
    suggestMock.mockResolvedValue({
      success: true,
      data: { suggestions: [{ title: "Louvre", category: "SIGHTSEEING", note: "Go early" }] },
    });
    createItemMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<AiActivitySuggestions tripId="t1" stopId="s1" stopName="Paris" aiConfigured />);
    await user.click(screen.getByRole("button", { name: /Suggest activities/ }));
    await user.click(await screen.findByRole("button", { name: /Add/ }));
    expect(createItemMock).toHaveBeenCalledWith("t1", {
      title: "Louvre",
      category: "SIGHTSEEING",
      notes: "Go early",
    });
  });
});
