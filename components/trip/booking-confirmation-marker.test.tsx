import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/server/actions/booking-confirmation", () => ({
  setNothingToAttach: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/ui/undo-toast", () => ({ toastWithUndo: vi.fn(() => "t1") }));

import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { toast } from "@/components/ui/use-toast";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { SOMETHING_WENT_WRONG } from "@/components/ui/action-failure";
import { BookingConfirmationMarker } from "./booking-confirmation-marker";

describe("BookingConfirmationMarker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says there is no confirmation and offers a plain Doesn't need one button", () => {
    render(<BookingConfirmationMarker kind="TRANSPORT" id="t1" />);
    expect(screen.getByText("No booking confirmation yet")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Doesn’t need one" });
    expect(button.className).not.toMatch(/underline/);
  });

  it("has no dangling dot and wraps its button under the text", () => {
    const { container } = render(<BookingConfirmationMarker kind="TRANSPORT" id="t1" />);
    expect(container.textContent).not.toContain("·");
    expect(container.firstElementChild!.className).toContain("flex flex-wrap items-center gap-x-2 gap-y-1");
  });

  it("saves for the kind and id, refreshes and offers Undo", async () => {
    render(<BookingConfirmationMarker kind="ACCOMMODATION" id="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Doesn’t need one" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(setNothingToAttach).toHaveBeenCalledWith("ACCOMMODATION", "a1", true);
    expect(toastWithUndo).toHaveBeenCalledTimes(1);
  });

  it("Undo clears the flag and refreshes again", async () => {
    render(<BookingConfirmationMarker kind="ACCOMMODATION" id="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Doesn’t need one" }));
    await waitFor(() => expect(toastWithUndo).toHaveBeenCalled());
    vi.mocked(toastWithUndo).mock.calls[0][0].onUndo();
    await waitFor(() => expect(setNothingToAttach).toHaveBeenCalledWith("ACCOMMODATION", "a1", false));
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(2));
  });

  it("toasts the server's reason and does not refresh when it refuses", async () => {
    vi.mocked(setNothingToAttach).mockResolvedValueOnce({ success: false, errors: { _: ["Not allowed."] } });
    render(<BookingConfirmationMarker kind="ITEM" id="i1" />);
    await userEvent.click(screen.getByRole("button", { name: "Doesn’t need one" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Not allowed." }));
    expect(refreshMock).not.toHaveBeenCalled();
    expect(toastWithUndo).not.toHaveBeenCalled();
  });

  it("falls back to a plain message when the call throws", async () => {
    vi.mocked(setNothingToAttach).mockRejectedValueOnce(new Error("offline"));
    render(<BookingConfirmationMarker kind="ITEM" id="i1" />);
    await userEvent.click(screen.getByRole("button", { name: "Doesn’t need one" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: SOMETHING_WENT_WRONG }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
