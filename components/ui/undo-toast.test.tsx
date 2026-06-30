import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "./toaster";
import { toastWithUndo } from "./undo-toast";

describe("toastWithUndo", () => {
  it("renders an Undo action that calls onUndo when clicked", async () => {
    const onUndo = vi.fn();
    render(<Toaster />);
    toastWithUndo({ title: "Moved to Wishlist", onUndo });
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
