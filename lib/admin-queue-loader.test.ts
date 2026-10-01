import { beforeEach, describe, expect, it, vi } from "vitest";

const accessRequestCountMock = vi.hoisted(() => vi.fn());
const feedbackNoteCountMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    accessRequest: { count: accessRequestCountMock },
    feedbackNote: { count: feedbackNoteCountMock },
  },
}));

import { countAdminQueue } from "./admin-queue-loader";

beforeEach(() => {
  accessRequestCountMock.mockReset().mockResolvedValue(0);
  feedbackNoteCountMock.mockReset().mockResolvedValue(0);
});

describe("countAdminQueue", () => {
  it("returns both counts", async () => {
    accessRequestCountMock.mockResolvedValue(2);
    feedbackNoteCountMock.mockResolvedValue(1);
    await expect(countAdminQueue()).resolves.toEqual({ accessRequests: 2, feedbackNeedingReview: 1 });
  });

  // Review Focus 5: approving stamps resolvedAt and leaves status "pending"
  // (server/actions/access-requests.ts), so the predicate is resolvedAt —
  // a status filter would count every approved request for ever.
  it("counts Access requests by resolvedAt, never status", async () => {
    await countAdminQueue();
    expect(accessRequestCountMock).toHaveBeenCalledWith({ where: { resolvedAt: null } });
  });

  it("counts only NEEDS_REVIEW notes, from every site", async () => {
    await countAdminQueue();
    expect(feedbackNoteCountMock).toHaveBeenCalledWith({ where: { status: "NEEDS_REVIEW" } });
  });

  it("rejects when a count rejects — callers degrade to an empty queue", async () => {
    feedbackNoteCountMock.mockRejectedValue(new Error("db down"));
    await expect(countAdminQueue()).rejects.toThrow("db down");
  });
});
