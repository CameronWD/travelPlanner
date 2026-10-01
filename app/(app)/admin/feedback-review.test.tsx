import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FeedbackReviewPanel } from "./feedback-review";
import type { FeedbackReviewView } from "@/server/actions/feedback";
import { relativeTime } from "@/lib/relative-time";

const NOW = new Date("2026-10-02T12:00:00.000Z");

const notes: FeedbackReviewView[] = [
  {
    id: "n-review-1",
    body: "I'd like to tap an idea to see its details",
    pageLabel: "Plan editor",
    tripName: "Christmas in Europe 2026",
    authorName: "Priya Example",
    authoredAt: "2026-10-01T12:00:00.000Z",
    siteChip: "Beta",
  },
  {
    id: "n2",
    body: "Second",
    pageLabel: "Files",
    tripName: null,
    authorName: "Traveller",
    authoredAt: "2026-10-02T11:00:00.000Z",
    siteChip: null,
  },
];

describe("FeedbackReviewPanel (spec 2026-10-02 §D)", () => {
  it("shows an empty state", () => {
    render(<FeedbackReviewPanel notes={[]} now={NOW} />);
    expect(screen.getByText("No Feedback notes waiting for review.")).toBeInTheDocument();
  });

  it("lists author, page, trip, site chip, body, age and the id, in the order given", () => {
    render(<FeedbackReviewPanel notes={notes} now={NOW} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0]);
    expect(first.getByText("Priya Example")).toBeInTheDocument();
    expect(first.getByText("Plan editor")).toBeInTheDocument();
    expect(first.getByText("Christmas in Europe 2026")).toBeInTheDocument();
    expect(first.getByText("Beta")).toBeInTheDocument();
    expect(first.getByText("I'd like to tap an idea to see its details")).toBeInTheDocument();
    expect(first.getByText("n-review-1").tagName).toBe("CODE");
    expect(first.getByText(relativeTime(new Date(notes[0].authoredAt), NOW))).toBeInTheDocument();
    expect(within(items[1]).queryByText("Beta")).toBeNull();
    expect(within(items[1]).getByText("Second")).toBeInTheDocument();
  });

  it("is read-only: no buttons at all", () => {
    render(<FeedbackReviewPanel notes={notes} now={NOW} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
