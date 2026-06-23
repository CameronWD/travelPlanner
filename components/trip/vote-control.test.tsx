import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoteControl, type VoteView } from "./vote-control";

vi.mock("@/server/actions/votes", () => ({
  setVote: vi.fn().mockResolvedValue(undefined),
  clearVote: vi.fn().mockResolvedValue(undefined),
}));
import { setVote } from "@/server/actions/votes";

const baseProps = {
  tripId: "t1",
  itemId: "i1",
  currentUserId: "u1",
  votes: [] as VoteView[],
};

describe("VoteControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the three vote levels", () => {
    render(<VoteControl {...baseProps} />);
    expect(screen.getByRole("radio", { name: "Must" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Keen" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Meh" })).toBeInTheDocument();
  });

  it("calls setVote when a level is chosen", async () => {
    const user = userEvent.setup();
    render(<VoteControl {...baseProps} />);
    await user.click(screen.getByRole("radio", { name: "Must" }));
    expect(setVote).toHaveBeenCalledWith("t1", "i1", "MUST");
  });
});
