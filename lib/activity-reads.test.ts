import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for the Activity reads.
 * Mocks: lib/db, lib/guards
 */

const {
  requireTripAccessMock,
  activityCountMock,
  activityFindManyMock,
  loadSurpriseVisibilityMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1", name: "Test User", image: null },
    membership: { userId: "user-1", role: "owner", lastReadActivityAt: null },
  }),
  activityCountMock: vi.fn(),
  activityFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    activity: {
      count: activityCountMock,
      findMany: activityFindManyMock,
    },
  },
}));

vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { getUnreadActivityCount, getRecentActivity } from "./activity-reads";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID, name: "Test User", image: null },
    membership: { userId: USER_ID, role: "owner", lastReadActivityAt: null },
  });
  activityCountMock.mockResolvedValue(0);
  activityFindManyMock.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getUnreadActivityCount
// ---------------------------------------------------------------------------

describe("getUnreadActivityCount", () => {
  it("passes actorId: { not: userId } filter", async () => {
    await getUnreadActivityCount(TRIP_ID);
    expect(activityCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: { not: USER_ID },
        }),
      }),
    );
  });

  it("passes createdAt: { gt: since } filter when lastReadActivityAt is set", async () => {
    const since = new Date("2024-01-01T00:00:00Z");
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: USER_ID },
      membership: { userId: USER_ID, role: "owner", lastReadActivityAt: since },
    });
    await getUnreadActivityCount(TRIP_ID);
    expect(activityCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gt: since },
        }),
      }),
    );
  });

  it("omits createdAt filter when lastReadActivityAt is null", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: USER_ID },
      membership: { userId: USER_ID, role: "owner", lastReadActivityAt: null },
    });
    await getUnreadActivityCount(TRIP_ID);
    const call = activityCountMock.mock.calls[0][0];
    expect(call.where).not.toHaveProperty("createdAt");
  });

  it("returns the count from db.activity.count", async () => {
    activityCountMock.mockResolvedValueOnce(5);
    const count = await getUnreadActivityCount(TRIP_ID);
    expect(count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Surprise (CONTEXT.md Surprise, ADR 0051)
// ---------------------------------------------------------------------------

describe("Activity and the Surprise", () => {
  it("the recent feed reads through the viewer's Activity fragment, after the access check", async () => {
    loadSurpriseVisibilityMock.mockResolvedValue(hiddenVisibility({ viewerId: USER_ID, hiddenStopIds: ["s1"] }));
    await getRecentActivity(TRIP_ID, 10);
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, USER_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, loadSurpriseVisibilityMock);
    expect(activityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: TRIP_ID, ...MARKER_WHERE.activity }, take: 10 }),
    );
  });

  it("the unread count ignores every row stamped inside a Surprise (only unstamped rows count)", async () => {
    const since = new Date("2024-01-01T00:00:00Z");
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: USER_ID },
      membership: { userId: USER_ID, role: "owner", lastReadActivityAt: since },
    });
    await getUnreadActivityCount(TRIP_ID);
    expect(activityCountMock.mock.calls[0][0].where).toEqual({
      tripId: TRIP_ID,
      actorId: { not: USER_ID },
      surpriseOfId: null,
      createdAt: { gt: since },
    });
    // No per-viewer visibility needed: the rule is the same for everyone.
    expect(loadSurpriseVisibilityMock).not.toHaveBeenCalled();
  });
});
