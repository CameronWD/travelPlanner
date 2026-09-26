import { describe, expect, it } from "vitest";
import { toView, type FeedbackNoteQueryRow } from "./feedback-view";

const row = (site: string | null): FeedbackNoteQueryRow => ({
  id: "n1",
  body: "b",
  route: "/trips",
  pageLabel: "Trips",
  tripName: null,
  authorId: "u1",
  authorName: "Cam",
  status: "OPEN",
  authoredAt: new Date("2026-09-26"),
  site,
});

describe("toView — siteChip", () => {
  it("chips a note from another site", () => {
    expect(toView(row("beta"), "u1", "main").siteChip).toBe("Beta");
    expect(toView(row(null), "u1", "beta").siteChip).toBe("Main");
  });

  it("doesn't chip a note from the current site, including old notes on main", () => {
    expect(toView(row("beta"), "u1", "beta").siteChip).toBeNull();
    expect(toView(row(null), "u1", "main").siteChip).toBeNull();
  });
});
