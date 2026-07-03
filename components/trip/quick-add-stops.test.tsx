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
    expect(createStop).toHaveBeenCalledWith("trip-1", expect.objectContaining({ mode: "rough", name: "Rome", chapterId: "it" }), undefined, null);
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

  it("passes the active forkId to createStop when forkId prop is set", async () => {
    render(<QuickAddStops tripId="t1" chapterId={null} forkId="fork-1" />);
    const input = screen.getByPlaceholderText(/add a place/i);
    await userEvent.type(input, "Rome");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(createStop).toHaveBeenCalledWith("t1", expect.objectContaining({ name: "Rome" }), "fork-1", null);
  });

  it("passes undefined to createStop when forkId is null", async () => {
    render(<QuickAddStops tripId="t1" chapterId={null} forkId={null} />);
    const input = screen.getByPlaceholderText(/add a place/i);
    await userEvent.type(input, "Berlin");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(createStop).toHaveBeenCalledWith("t1", expect.objectContaining({ name: "Berlin" }), undefined, null);
  });

  it("forwards afterStopId as the 4th arg to createStop", async () => {
    render(<QuickAddStops tripId="trip-1" chapterId="ch-1" afterStopId="stop-anchor" />);
    const input = screen.getByPlaceholderText(/add a place/i);
    await userEvent.type(input, "Florence");
    await userEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(createStop).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Florence" }),
      undefined,
      "stop-anchor",
    );
  });
});
