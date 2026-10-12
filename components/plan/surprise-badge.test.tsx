import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurpriseBadge } from "./surprise-badge";

const view = (over = {}) => ({
  plannerId: "cam", plannerName: "Cam", forIds: ["sam", "alex"], forNames: ["Sam", "Alex"], youAreSurprised: false, ...over,
});

describe("SurpriseBadge (CONTEXT.md Surprise)", () => {
  it("to everyone in on it, names who is surprised", () => {
    render(<SurpriseBadge view={view()} />);
    const badge = screen.getByRole("img", { name: "Surprise for Sam and Alex" });
    expect(badge).toHaveTextContent("Surprise for Sam and Alex");
    expect(badge).toHaveAttribute("title", "Surprise for Sam and Alex");
  });

  it("to the surprised, names only the planner", () => {
    render(<SurpriseBadge view={view({ youAreSurprised: true })} size="sm" />);
    expect(screen.getByRole("img", { name: "Surprise, planned by Cam" })).toHaveTextContent("Surprise, planned by Cam");
    expect(screen.queryByText(/Sam/)).toBeNull();
  });
});
