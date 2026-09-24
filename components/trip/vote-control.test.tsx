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

  // Task 11 (phase 3): emoji-as-illustration → lucide (kit treatment), and the
  // other traveller's vote as a kit chip that stays legible on a sun island.
  it("illustrates each level with a lucide icon, not emoji", () => {
    const { container } = render(<VoteControl {...baseProps} />);
    for (const name of ["Must", "Keen", "Meh"]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio.querySelector("svg")).not.toBeNull();
    }
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("shows another traveller's vote as a kit chip with neutral ink text", () => {
    const votes = [{ userId: "u2", level: "MUST" as const, user: { name: "Pat Lee", image: null } }];
    render(<VoteControl {...baseProps} votes={votes} />);
    const chip = screen.getByTitle("Pat Lee: Must");
    expect(chip.className).toMatch(/\bborder-2\b/);
    expect(chip.className).toMatch(/\btext-foreground\b/);
    expect(chip.className).not.toMatch(/text-sun-text/);
  });

  // The hit area now lives in SegmentedItem (Ruling 13); this still pins that
  // the vote picker's levels keep it (e.g. no className override drops it).
  it("gives each vote level a ≥44px touch target on coarse pointers", () => {
    render(<VoteControl {...baseProps} />);
    expect(screen.getByRole("radio", { name: "Keen" }).className).toMatch(/pointer-coarse:after:-inset-y-1\.5/);
  });
});
