import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for activity server actions.
 * Mocks: lib/db, lib/guards
 */

const {
  requireUserMock,
  requireTripAccessMock,
  activityCreateMock,
  activityCountMock,
  tripMemberUpdateManyMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1", name: "Test User", image: null }),
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1", name: "Test User", image: null },
    membership: { userId: "user-1", role: "owner", lastReadActivityAt: null },
  }),
  activityCreateMock: vi.fn(),
  activityCountMock: vi.fn(),
  tripMemberUpdateManyMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    activity: {
      create: activityCreateMock,
      count: activityCountMock,
    },
    tripMember: {
      updateMany: tripMemberUpdateManyMock,
    },
  },
}));

import { recordActivity, markAllRead, getUnreadActivityCount } from "./activity";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

beforeEach(() => {
  requireUserMock.mockResolvedValue({ id: USER_ID, name: "Test User", image: null });
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID, name: "Test User", image: null },
    membership: { userId: USER_ID, role: "owner", lastReadActivityAt: null },
  });
  activityCreateMock.mockResolvedValue({});
  activityCountMock.mockResolvedValue(0);
  tripMemberUpdateManyMock.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

describe("recordActivity", () => {
  it("calls db.activity.create with actorId from the current user", async () => {
    await recordActivity({
      tripId: TRIP_ID,
      verb: "CREATED",
      entityType: "STOP",
      entityLabel: "Rome",
    });
    expect(activityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          actorId: USER_ID,
          verb: "CREATED",
          entityType: "STOP",
          entityLabel: "Rome",
        }),
      }),
    );
  });

  it("passes optional entityId and changes fields through", async () => {
    const changes = [{ field: "name", label: "Name", from: "London", to: "Rome" }];
    await recordActivity({
      tripId: TRIP_ID,
      verb: "UPDATED",
      entityType: "STOP",
      entityId: "stop-1",
      entityLabel: "Rome",
      changes,
    });
    expect(activityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: "stop-1",
          changes,
        }),
      }),
    );
  });

  it("does NOT call db.activity.create when verb is UPDATED and changes is empty array", async () => {
    await recordActivity({
      tripId: TRIP_ID,
      verb: "UPDATED",
      entityType: "STOP",
      entityLabel: "Rome",
      changes: [],
    });
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("resolves without throwing when db.activity.create rejects (best-effort)", async () => {
    activityCreateMock.mockRejectedValue(new Error("DB error"));
    await expect(
      recordActivity({
        tripId: TRIP_ID,
        verb: "CREATED",
        entityType: "STOP",
        entityLabel: "Rome",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when requireUser rejects (best-effort)", async () => {
    requireUserMock.mockRejectedValue(new Error("Unauthenticated"));
    await expect(
      recordActivity({
        tripId: TRIP_ID,
        verb: "CREATED",
        entityType: "STOP",
        entityLabel: "Rome",
      }),
    ).resolves.toBeUndefined();
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("calls db.activity.create when verb is UPDATED and changes is non-empty", async () => {
    const changes = [{ field: "name", label: "Name", from: "Old", to: "New" }];
    await recordActivity({
      tripId: TRIP_ID,
      verb: "UPDATED",
      entityType: "STOP",
      entityLabel: "Rome",
      changes,
    });
    expect(activityCreateMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

describe("markAllRead", () => {
  it("calls db.tripMember.updateMany scoped to tripId and userId", async () => {
    await markAllRead(TRIP_ID);
    expect(tripMemberUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: TRIP_ID, userId: USER_ID },
      }),
    );
  });

  it("sets lastReadActivityAt to a Date", async () => {
    await markAllRead(TRIP_ID);
    expect(tripMemberUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastReadActivityAt: expect.any(Date),
        }),
      }),
    );
  });
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
