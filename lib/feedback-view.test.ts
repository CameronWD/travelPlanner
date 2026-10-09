import { describe, expect, it } from "vitest";
import {
  isHiddenResolved,
  RESOLVED_SHOWN_FOR_MS,
  resolutionLine,
  toView,
  type FeedbackNoteQueryRow,
} from "./feedback-view";

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
  resolution: null,
  resolvedAt: null,
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

describe("toView — status", () => {
  it("shows a Needs-review note to its author as Open (review is the operator's concern)", () => {
    expect(toView({ ...row("main"), status: "NEEDS_REVIEW" }, "u1", "main").status).toBe("OPEN");
  });

  it("passes the other statuses through", () => {
    for (const status of ["OPEN", "DONE", "WONTFIX"]) {
      expect(toView({ ...row("main"), status }, "u1", "main").status).toBe(status);
    }
  });
});

describe("toView — resolution", () => {
  it("carries the Resolution and when it was given", () => {
    const view = toView(
      {
        ...row("main"),
        status: "DONE",
        resolution: "Budget totals now add up per currency.",
        resolvedAt: new Date("2026-10-05T09:00:00.000Z"),
      },
      "u1",
      "main",
    );
    expect(view.resolution).toBe("Budget totals now add up per currency.");
    expect(view.resolvedAt).toBe("2026-10-05T09:00:00.000Z");
  });

  it("is null on an open note", () => {
    const view = toView(row("main"), "u1", "main");
    expect(view.resolution).toBeNull();
    expect(view.resolvedAt).toBeNull();
  });

  it("treats a blank Resolution as none", () => {
    const view = toView(
      { ...row("main"), status: "DONE", resolution: "   ", resolvedAt: new Date("2026-10-05T09:00:00.000Z") },
      "u1",
      "main",
    );
    expect(view.resolution).toBeNull();
  });
});

describe("isHiddenResolved", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("is a week", () => {
    expect(RESOLVED_SHOWN_FOR_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("never hides an open note", () => {
    expect(isHiddenResolved({ status: "OPEN", resolvedAt: null }, now)).toBe(false);
    expect(isHiddenResolved({ status: "OPEN", resolvedAt: "2026-01-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("keeps a note resolved within the last 7 days, exactly 7 days included", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-11T00:00:00.000Z" }, now)).toBe(false);
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-05T12:00:00.000Z" }, now)).toBe(false);
    expect(isHiddenResolved({ status: "WONTFIX", resolvedAt: "2026-10-05T12:00:00.000Z" }, now)).toBe(false);
  });

  it("hides a Done or Won't fix note resolved more than 7 days ago", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: "2026-10-05T11:59:59.999Z" }, now)).toBe(true);
    expect(isHiddenResolved({ status: "WONTFIX", resolvedAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(true);
  });

  it("counts a closed note with no resolvedAt as old", () => {
    expect(isHiddenResolved({ status: "DONE", resolvedAt: null }, now)).toBe(true);
  });

  it("never hides a status it does not recognise (the panel labels those instead)", () => {
    expect(
      isHiddenResolved({ status: "PENDING" as never, resolvedAt: "2026-01-01T00:00:00.000Z" }, now),
    ).toBe(false);
  });
});

describe("resolutionLine", () => {
  it("reads Done {date}: {Resolution}", () => {
    expect(
      resolutionLine({ status: "DONE", resolution: "Fixed the totals.", resolvedAt: "2026-10-05T09:00:00.000Z" }),
    ).toBe("Done 5 Oct: Fixed the totals.");
  });

  it("reads Won't fix {date}: {Resolution}", () => {
    expect(
      resolutionLine({ status: "WONTFIX", resolution: "Same as the Globe one.", resolvedAt: "2026-09-21T09:00:00.000Z" }),
    ).toBe("Won't fix 21 Sep: Same as the Globe one.");
  });

  it("shows just the status and date when there is no Resolution text", () => {
    expect(resolutionLine({ status: "DONE", resolution: null, resolvedAt: "2026-10-05T09:00:00.000Z" })).toBe(
      "Done 5 Oct",
    );
  });

  it("shows just the status when the date is missing too", () => {
    expect(resolutionLine({ status: "WONTFIX", resolution: null, resolvedAt: null })).toBe("Won't fix");
  });

  it("is null for a note that isn't closed", () => {
    expect(resolutionLine({ status: "OPEN", resolution: null, resolvedAt: null })).toBeNull();
  });
});
