import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi, describe, beforeEach } from "vitest";

const createStop = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/stops", () => ({ createStop: (...a: unknown[]) => createStop(...a) }));

import { QuickAddStops } from "./quick-add-stops";

describe("QuickAddStops", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds a rough stop into the given chapter and clears the input on success", async () => {
    render(<QuickAddStops tripId="trip-1" chapterId="it" />);
    const input = screen.getByPlaceholderText(/add a place/i);
    await userEvent.type(input, "Rome");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(createStop).toHaveBeenCalledWith("trip-1", expect.objectContaining({ mode: "rough", name: "Rome", chapterId: "it" }));
    expect(input).toHaveValue("");
  });

  it("preserves the typed value when the submit action fails", async () => {
    createStop.mockResolvedValueOnce({ success: false, errors: { name: ["Something went wrong"] } });
    render(<QuickAddStops tripId="trip-1" chapterId="it" />);
    const input = screen.getByPlaceholderText(/add a place/i);
    await userEvent.type(input, "BadPlace");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));
    // Input should NOT be cleared on failure so the user can correct it
    expect(input).toHaveValue("BadPlace");
  });
});
