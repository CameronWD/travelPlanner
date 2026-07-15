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

  it("shows a clear-vote hint on the active level's aria-label", () => {
    const votes: VoteView[] = [{ userId: "u1", level: "KEEN", user: { name: "Alice", image: null } }];
    render(<VoteControl {...baseProps} votes={votes} />);
    // The active level includes the clear hint in its accessible label
    expect(
      screen.getByRole("radio", { name: /keen.*clear your vote/i }),
    ).toBeInTheDocument();
    // Inactive levels do not carry the hint
    expect(screen.getByRole("radio", { name: "Must" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Meh" })).toBeInTheDocument();
  });

  it("shows a title tooltip on the active level", () => {
    const votes: VoteView[] = [{ userId: "u1", level: "MUST", user: { name: "Alice", image: null } }];
    render(<VoteControl {...baseProps} votes={votes} />);
    const mustItem = screen.getByRole("radio", { name: /must.*clear your vote/i });
    expect(mustItem).toHaveAttribute("title", "Click again to clear your vote");
  });

  it("gives the active vote a semantic-hued pill", () => {
    const votes = [{ userId: "me", level: "MUST" as const, user: { name: "Me", image: null } }];
    const { container } = render(
      <VoteControl tripId="t" itemId="i" votes={votes} currentUserId="me" />,
    );
    // pill track
    expect(container.querySelector(".rounded-full")).toBeTruthy();
    // active MUST segment carries the warning fill
    expect(container.querySelector('[data-state="on"]')?.className).toMatch(/bg-warning/);
  });
});
