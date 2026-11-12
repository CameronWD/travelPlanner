import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/server/actions/booking-confirmation", () => ({
  setNothingToAttach: vi.fn(async () => ({ success: true })),
}));

import { setNothingToAttach } from "@/server/actions/booking-confirmation";
import { NothingToAttachSwitch } from "./nothing-to-attach-switch";

describe("NothingToAttachSwitch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a labelled switch reflecting the stored value", () => {
    render(<NothingToAttachSwitch kind="ITEM" id="i1" value />);
    expect(screen.getByRole("switch", { name: "Nothing to attach" })).toHaveAttribute("aria-checked", "true");
  });

  it("saves the toggled value at once, then refreshes", async () => {
    render(<NothingToAttachSwitch kind="TRANSPORT" id="t1" value={false} />);
    await userEvent.click(screen.getByRole("switch", { name: "Nothing to attach" }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(setNothingToAttach).toHaveBeenCalledWith("TRANSPORT", "t1", true);
  });

  it("switching it off saves false", async () => {
    render(<NothingToAttachSwitch kind="ACCOMMODATION" id="a1" value />);
    await userEvent.click(screen.getByRole("switch", { name: "Nothing to attach" }));
    await waitFor(() => expect(setNothingToAttach).toHaveBeenCalledWith("ACCOMMODATION", "a1", false));
  });

  it("shows the server's reason and does not refresh when it refuses", async () => {
    vi.mocked(setNothingToAttach).mockResolvedValueOnce({ success: false, errors: { _: ["Not allowed."] } });
    render(<NothingToAttachSwitch kind="ITEM" id="i1" value={false} />);
    await userEvent.click(screen.getByRole("switch", { name: "Nothing to attach" }));
    expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
