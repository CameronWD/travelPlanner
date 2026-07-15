import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const inviteToTrip = vi.fn().mockResolvedValue({ success: true });
const cancelInvite = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/invites", () => ({
  get inviteToTrip() { return inviteToTrip; },
  get cancelInvite() { return cancelInvite; },
}));

import { InvitePanel } from "./invite-panel";

const members = [
  {
    userId: "u1",
    role: "owner",
    user: { id: "u1", name: "Alice Smith", email: "alice@example.com", image: null },
  },
];

const pendingInvites = [
  { id: "inv1", email: "bob@example.com" },
];

describe("InvitePanel", () => {
  beforeEach(() => {
    inviteToTrip.mockClear();
    cancelInvite.mockClear();
  });

  it("submitting the invite form calls inviteToTrip with the typed email", async () => {
    render(<InvitePanel tripId="trip1" members={members} pendingInvites={[]} />);
    const input = screen.getByPlaceholderText("partner@example.com");
    await userEvent.type(input, "newperson@example.com");
    const btn = screen.getByRole("button", { name: /invite/i });
    await userEvent.click(btn);
    expect(inviteToTrip).toHaveBeenCalledWith("trip1", "newperson@example.com");
  });

  it("a pending invite's cancel-X calls cancelInvite with the invite id", async () => {
    render(<InvitePanel tripId="trip1" members={members} pendingInvites={pendingInvites} />);
    const cancelBtn = screen.getByRole("button", { name: `Cancel invite for bob@example.com` });
    await userEvent.click(cancelBtn);
    expect(cancelInvite).toHaveBeenCalledWith("inv1");
  });
});
