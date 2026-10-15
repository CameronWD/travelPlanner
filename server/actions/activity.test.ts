import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";

/**
 * Tests for activity server actions.
 * Mocks: lib/db, lib/guards
 */

const {
  requireUserMock,
  requireTripAccessMock,
  activityCreateMock,
  activityCountMock,
  activityFindManyMock,
  loadSurpriseVisibilityMock,
  tripMemberUpdateManyMock,
  stopFindUniqueMock,
  itemFindUniqueMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  stopFindUniqueMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1", name: "Test User", image: null }),
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1", name: "Test User", image: null },
    membership: { userId: "user-1", role: "owner", lastReadActivityAt: null },
  }),
  activityCreateMock: vi.fn(),
  activityCountMock: vi.fn(),
  activityFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
  tripMemberUpdateManyMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

vi.mock("@/lib/db", () => ({
  db: {
    activity: {
      create: activityCreateMock,
      count: activityCountMock,
      findMany: activityFindManyMock,
    },
    tripMember: {
      updateMany: tripMemberUpdateManyMock,
    },
    stop: { findUnique: stopFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
  },
}));

vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { recordActivity, markAllRead, getUnreadActivityCount, getRecentActivity } from "./activity";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

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
  activityFindManyMock.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
  tripMemberUpdateManyMock.mockResolvedValue({ count: 1 });
  stopFindUniqueMock.mockResolvedValue(null);
  itemFindUniqueMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// recordActivity
// ---------------------------------------------------------------------------

describe("recordActivity — Surprise stamp", () => {
  const LIVE = { surprisePlannerId: "user-1", surpriseForIds: '["sam"]', surpriseRevealedAt: null };
  const PLAIN = { surprisePlannerId: null, surpriseForIds: null, surpriseRevealedAt: null };

  it("stamps the live Surprise Stop an Item is inside", async () => {
    itemFindUniqueMock.mockResolvedValue({ id: "item-1", stopId: "stop-1", date: null, ...PLAIN, stop: { timezone: "UTC" } });
    stopFindUniqueMock.mockResolvedValue({ id: "stop-1", departDate: null, timezone: "UTC", ...LIVE });
    await recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "ITEM", entityId: "item-1", entityLabel: "Dinner" });
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ surpriseOfType: "STOP", surpriseOfId: "stop-1" }),
    });
  });

  it("a failed Surprise lookup still writes the row, unstamped", async () => {
    itemFindUniqueMock.mockRejectedValue(new Error("db down"));
    await recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "ITEM", entityId: "item-1", entityLabel: "Dinner" });
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ surpriseOfType: null, surpriseOfId: null }),
    });
  });

  it("surpriseOf: null writes nulls without querying", async () => {
    await recordActivity({ tripId: TRIP_ID, verb: "UPDATED", entityType: "ITEM", entityId: "item-1", entityLabel: "Dinner", surpriseOf: null });
    expect(itemFindUniqueMock).not.toHaveBeenCalled();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ surpriseOfType: null, surpriseOfId: null }),
    });
  });

  it("an explicit root is stamped as given", async () => {
    await recordActivity({
      tripId: TRIP_ID, verb: "DELETED", entityType: "ITEM", entityId: "item-1", entityLabel: "Dinner",
      surpriseOf: { type: "ITEM", id: "item-9" },
    });
    expect(itemFindUniqueMock).not.toHaveBeenCalled();
    expect(activityCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ surpriseOfType: "ITEM", surpriseOfId: "item-9" }),
    });
  });
});

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

  it("resolves without throwing when requireTripAccess rejects (best-effort)", async () => {
    // requireTripAccess is the guard recordActivity now uses (ARCH-TEN-2);
    // this is the same best-effort-swallow intent the old requireUser
    // variant of this test covered, updated to the new guard.
    requireTripAccessMock.mockRejectedValue(new Error("Unauthenticated"));
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

  it("ARCH-TEN-2: does not write an Activity row for a Trip the caller is not a member of", async () => {
    // requireTripAccess() calls notFound() (a throw) for non-members; the
    // caller-swallowing catch{} in recordActivity absorbs it, so a forged
    // call becomes a silent no-op rather than a silent write.
    requireTripAccessMock.mockRejectedValueOnce(new Error("NOT_FOUND"));

    await recordActivity({
      tripId: "trip-B",
      verb: "CREATED",
      entityType: "STOP",
      entityLabel: "Forged",
    });

    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("ARCH-TEN-2: checks Trip access before writing the Activity row", async () => {
    await recordActivity({
      tripId: TRIP_ID,
      verb: "CREATED",
      entityType: "STOP",
      entityLabel: "Rome",
    });
    expectAccessCheckedBeforeWrite(requireTripAccessMock, activityCreateMock);
  });

  it("stamps source CLAUDE inside a Claude connection, null otherwise", async () => {
    await recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "STOP", entityLabel: "Lisbon" });
    expect(activityCreateMock.mock.calls[0][0].data.source).toBeNull();
    await runAsTraveller({ id: USER_ID, name: null, email: "c@x.test", image: null }, () =>
      recordActivity({ tripId: TRIP_ID, verb: "CREATED", entityType: "STOP", entityLabel: "Lisbon" }),
    );
    expect(activityCreateMock.mock.calls[1][0].data.source).toBe("CLAUDE");
  });

  it("reports a failed Activity write before swallowing it (ARCH-OBS-3)", async () => {
    const input = { tripId: TRIP_ID, verb: "CREATED" as const, entityType: "STOP" as const, entityLabel: "Rome" };
    activityCreateMock.mockRejectedValue(new Error("db down"));
    await expect(recordActivity(input)).resolves.toBeUndefined();
    expect(reportErrorMock).toHaveBeenCalledWith(expect.any(Error), {
      route: "server/actions/activity.ts#recordActivity",
      source: "server",
    });
  });

  it("stays silent for a forged call refused by the guard (ARCH-TEN-2)", async () => {
    const input = { tripId: TRIP_ID, verb: "CREATED" as const, entityType: "STOP" as const, entityLabel: "Rome" };
    requireTripAccessMock.mockRejectedValue(
      Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
    );
    await expect(recordActivity(input)).resolves.toBeUndefined();
    expect(reportErrorMock).not.toHaveBeenCalled();
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

  it("is access-checked before the write", async () => {
    // markAllRead's guard is requireUser (not requireTripAccess) — it scopes
    // the update by tripId + the caller's own userId rather than checking
    // trip membership, so requireUser is the guard whose ordering matters here.
    await markAllRead(TRIP_ID);

    expect(requireUserMock).toHaveBeenCalled();
    expectAccessCheckedBeforeWrite(requireUserMock, tripMemberUpdateManyMock);
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
