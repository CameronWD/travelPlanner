import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const inviteToTrip = vi.fn().mockResolvedValue({ success: true });
const cancelInvite = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/invites", () => ({
  get inviteToTrip() { return inviteToTrip; },
  get cancelInvite() { return cancelInvite; },
}));

const removeTripMember = vi.fn().mockResolvedValue({ success: true });
const leaveTrip = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/server/actions/trips", () => ({
  get removeTripMember() { return removeTripMember; },
  get leaveTrip() { return leaveTrip; },
}));

const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

import { InvitePanel } from "./invite-panel";

const members = [
  {
    userId: "u1",
    role: "owner",
    user: { id: "u1", name: "Alice Smith", email: "alice@example.com", image: null },
  },
  {
    userId: "u2",
    role: "member",
    user: { id: "u2", name: "Bob Jones", email: "bob-traveller@example.com", image: null },
  },
];

const pendingInvites = [
  { id: "inv1", email: "bob@example.com" },
];

describe("InvitePanel", () => {
  beforeEach(() => {
    inviteToTrip.mockClear();
    cancelInvite.mockClear();
    removeTripMember.mockClear();
    leaveTrip.mockClear();
    routerPushMock.mockClear();
  });

  it("submitting the invite form calls inviteToTrip with the typed email", async () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    const input = screen.getByPlaceholderText("partner@example.com");
    await userEvent.type(input, "newperson@example.com");
    const btn = screen.getByRole("button", { name: /invite/i });
    await userEvent.click(btn);
    expect(inviteToTrip).toHaveBeenCalledWith("trip1", "newperson@example.com");
  });

  it("a pending invite's cancel-X calls cancelInvite with the invite id", async () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={pendingInvites}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    const cancelBtn = screen.getByRole("button", { name: `Cancel invite for bob@example.com` });
    await userEvent.click(cancelBtn);
    expect(cancelInvite).toHaveBeenCalledWith("inv1");
  });

  // LA-037/LA-050: the Remove and Cancel-invite icon buttons get an
  // invisible 44px coarse-pointer tap target.
  it("gives the Remove and Cancel-invite icon buttons a 44px tap target", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={pendingInvites}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    expect(screen.getByRole("button", { name: "Remove Bob Jones from this trip" }).className).toContain("tap-target");
    expect(screen.getByRole("button", { name: "Cancel invite for bob@example.com" }).className).toContain("tap-target");
  });

  it("hides the invite form for a non-owner, non-admin member", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={pendingInvites}
        canInvite={false}
        currentUserId="u2"
        viewerIsOwner={false}
      />,
    );
    expect(screen.queryByPlaceholderText("partner@example.com")).not.toBeInTheDocument();
    // The pending-invite list and cancel control stay visible to every member.
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Cancel invite for bob@example.com` })).toBeInTheDocument();
  });

  it("shows 'Traveller' (never 'Member') as the role label for a non-owner", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    expect(screen.getByText("Traveller")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByText("member", { exact: true })).not.toBeInTheDocument();
  });

  it("the owner sees a Remove control on another Traveller's row, and it removes after confirming", async () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    const removeBtn = screen.getByRole("button", { name: "Remove Bob Jones from this trip" });
    await userEvent.click(removeBtn);

    // Behind a confirmation — not called yet.
    expect(removeTripMember).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: /Remove Bob Jones\?/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeTripMember).toHaveBeenCalledWith("trip1", "u2");
  });

  it("the owner has no Remove control on their own row", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Remove Alice Smith from this trip" }),
    ).not.toBeInTheDocument();
  });

  it("a plain Traveller sees no Remove control at all", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite={false}
        currentUserId="u2"
        viewerIsOwner={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("a non-owner Traveller sees a Leave trip control, which leaves and navigates to /trips after confirming", async () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite={false}
        currentUserId="u2"
        viewerIsOwner={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave trip" }));
    expect(await screen.findByRole("heading", { name: /Leave this trip\?/i })).toBeInTheDocument();
    expect(leaveTrip).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Yes, leave" }));
    expect(leaveTrip).toHaveBeenCalledWith("trip1");
    expect(routerPushMock).toHaveBeenCalledWith("/trips");
  });

  it("the owner sees an explanation instead of a Leave trip control", () => {
    render(
      <InvitePanel
        tripId="trip1"
        members={members}
        pendingInvites={[]}
        canInvite
        currentUserId="u1"
        viewerIsOwner
      />,
    );
    expect(screen.queryByRole("button", { name: "Leave trip" })).not.toBeInTheDocument();
    // I4 (final fix wave): this used to tell the Owner to "transfer ownership
    // to another Traveller first" — instructing them to use a feature the
    // glossary says will never exist. It states the constraint instead.
    expect(
      screen.getByText(/Owner role can.?t be transferred to another Traveller yet/i),
    ).toBeInTheDocument();
  });
});
