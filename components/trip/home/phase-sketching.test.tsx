import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-sketching.tsx is a lightweight async server component with two DB
// calls. We assert their fork-scoping by mocking db per-model methods
// directly (mirrors server/actions/search.test.ts and the sibling
// phase-planning.test.tsx / phase-past.test.tsx / phase-travelling.test.tsx).

const { stopFindManyMock, chapterFindManyMock } = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    chapter: { findMany: chapterFindManyMock },
  },
}));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/home/quick-actions", () => ({ QuickActions: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
// React import needed for JSX in mocks above
import React from "react";

const { PhaseSketching } = await import("./phase-sketching");

describe("PhaseSketching fork-scoped plan queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([]);
  });

  async function renderSketching() {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
  }

  it("scopes the stops query to the real plan", async () => {
    await renderSketching();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query to the real plan", async () => {
    await renderSketching();
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });
});

describe("PhaseSketching chapter gating (Task 13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([
      { id: "s1", name: "Rome", country: "Italy", nights: 3, chapterId: null, arriveDate: null },
    ]);
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky" },
    ]);
  });

  it("skips the chapters query when chaptersEnabled is false", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip", chaptersEnabled: false });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
  });

  it("runs the chapters query when chaptersEnabled is true", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip", chaptersEnabled: true });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("defaults to enabled when chaptersEnabled is omitted (pre-toggle call sites)", async () => {
    await PhaseSketching({ tripId: "trip-1", tripName: "Test Trip" });
    expect(chapterFindManyMock).toHaveBeenCalled();
  });
});
