import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

vi.mock("@/server/actions/globe", () => ({
  inviteToGlobe: vi.fn().mockResolvedValue({ success: true }),
}));

import { inviteToGlobe } from "@/server/actions/globe";
import { GlobeInviteButton } from "./globe-invite-button";
import type { GlobeMemberView } from "./types";

const singleMember: GlobeMemberView[] = [
  {
    userId: "user-1",
    name: "Alice",
    email: "alice@example.com",
    role: "owner",
  },
];

const twoMembers: GlobeMemberView[] = [
  {
    userId: "user-1",
    name: "Alice",
    email: "alice@example.com",
    role: "owner",
  },
  {
    userId: "user-2",
    name: "Bob",
    email: "bob@example.com",
    role: "member",
  },
];

describe("GlobeInviteButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the Share button", () => {
    render(<GlobeInviteButton members={singleMember} />);
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("opening shows current members", async () => {
    const user = userEvent.setup();
    render(<GlobeInviteButton members={singleMember} />);

    await user.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
  });

  it("submitting a valid email calls inviteToGlobe with that email", async () => {
    const user = userEvent.setup();
    render(<GlobeInviteButton members={singleMember} />);

    await user.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => screen.getByPlaceholderText(/their@email.com/i));

    const input = screen.getByPlaceholderText(/their@email.com/i);
    await user.type(input, "friend@example.com");
    await user.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => {
      expect(inviteToGlobe).toHaveBeenCalledWith("friend@example.com");
    });
  });

  it("shows success message after invite", async () => {
    const user = userEvent.setup();
    render(<GlobeInviteButton members={singleMember} />);

    await user.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => screen.getByPlaceholderText(/their@email.com/i));

    const input = screen.getByPlaceholderText(/their@email.com/i);
    await user.type(input, "friend@example.com");
    await user.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invited — they'll join when they next sign in/i),
      ).toBeInTheDocument();
    });
  });

  it("on error result (errors under '_') the message renders", async () => {
    vi.mocked(inviteToGlobe).mockResolvedValueOnce({
      success: false,
      errors: { _: ["Enter a valid email address"] },
    });

    const user = userEvent.setup();
    render(<GlobeInviteButton members={singleMember} />);

    await user.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => screen.getByPlaceholderText(/their@email.com/i));

    const input = screen.getByPlaceholderText(/their@email.com/i);
    await user.type(input, "not-valid");
    await user.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    });
  });

  it("hides invite form when there are already 2 members", async () => {
    const user = userEvent.setup();
    render(<GlobeInviteButton members={twoMembers} />);

    await user.click(screen.getByRole("button", { name: /share/i }));

    await waitFor(() => {
      // Both members shown
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    // No invite input visible
    expect(screen.queryByPlaceholderText(/their@email.com/i)).not.toBeInTheDocument();
  });
});
