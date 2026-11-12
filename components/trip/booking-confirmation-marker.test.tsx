import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/server/actions/booking-confirmation", () => ({
  setNothingToAttach: vi.fn(async () => ({ success: true })),
}));

import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { BookingConfirmationMarker } from "./booking-confirmation-marker";

describe("BookingConfirmationMarker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says there is no confirmation and offers Nothing to attach", () => {
    render(<BookingConfirmationMarker kind="TRANSPORT" id="t1" />);
    expect(screen.getByText("No booking confirmation yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nothing to attach" })).toBeInTheDocument();
  });

  it("Nothing to attach saves for the kind and id, then refreshes", async () => {
    render(<BookingConfirmationMarker kind="ACCOMMODATION" id="a1" />);
    await userEvent.click(screen.getByRole("button", { name: "Nothing to attach" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(setNothingToAttach).toHaveBeenCalledWith("ACCOMMODATION", "a1", true);
  });

  it("shows the server's reason and does not refresh when it refuses", async () => {
    vi.mocked(setNothingToAttach).mockResolvedValueOnce({ success: false, errors: { _: ["Not allowed."] } });
    render(<BookingConfirmationMarker kind="ITEM" id="i1" />);
    await userEvent.click(screen.getByRole("button", { name: "Nothing to attach" }));
    expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("falls back to a plain message when the call throws", async () => {
    vi.mocked(setNothingToAttach).mockRejectedValueOnce(new Error("offline"));
    render(<BookingConfirmationMarker kind="ITEM" id="i1" />);
    await userEvent.click(screen.getByRole("button", { name: "Nothing to attach" }));
    expect(await screen.findByText("Couldn't do that. Nothing changed. Try again.")).toBeInTheDocument();
  });
});
