import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { runAsTraveller } from "@/lib/mcp/acting-traveller";

/**
 * Tests for recordActivity.
 * Mocks: lib/db, lib/guards
 */

const {
  requireTripAccessMock,
  activityCreateMock,
  stopFindUniqueMock,
  itemFindUniqueMock,
  loadSurpriseVisibilityMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  stopFindUniqueMock: vi.fn(),
  itemFindUniqueMock: vi.fn(),
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1", name: "Test User", image: null },
    membership: { userId: "user-1", role: "owner", lastReadActivityAt: null },
  }),
  activityCreateMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));

vi.mock("@/lib/error-sink", () => ({ reportError: reportErrorMock }));

vi.mock("@/lib/db", () => ({
  db: {
    activity: {
      create: activityCreateMock,
    },
    stop: { findUnique: stopFindUniqueMock },
    item: { findUnique: itemFindUniqueMock },
  },
}));

vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { recordActivity } from "./activity-record";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID, name: "Test User", image: null },
    membership: { userId: USER_ID, role: "owner", lastReadActivityAt: null },
  });
  activityCreateMock.mockResolvedValue({});
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
      route: "lib/activity-record.ts#recordActivity",
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
