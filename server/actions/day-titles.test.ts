import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for the setDayTitle server action.
 *
 * Mocks: lib/db, lib/guards, next/cache, next/navigation,
 * server/actions/activity (recordActivity) — lib/activity-guard and
 * lib/activity run for real, same pattern as accommodation.test.ts.
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  recordActivityMock,
  stopFindUniqueMock,
  stopFindFirstMock,
  dayTitleFindUniqueMock,
  dayTitleUpsertMock,
  dayTitleDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  }),
  revalidatePathMock: vi.fn(),
  recordActivityMock: vi.fn().mockResolvedValue(undefined),
  stopFindUniqueMock: vi.fn(),
  stopFindFirstMock: vi.fn().mockResolvedValue(null),
  dayTitleFindUniqueMock: vi.fn().mockResolvedValue(null),
  dayTitleUpsertMock: vi.fn().mockResolvedValue({ id: "dt-1", title: "Sintra day trip" }),
  dayTitleDeleteMock: vi.fn().mockResolvedValue({ id: "dt-1" }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));
vi.mock("@/lib/db", () => ({
  db: {
    stop: {
      findUnique: stopFindUniqueMock,
      findFirst: stopFindFirstMock,
    },
    dayTitle: {
      findUnique: dayTitleFindUniqueMock,
      upsert: dayTitleUpsertMock,
      delete: dayTitleDeleteMock,
    },
  },
}));

import { setDayTitle } from "./day-titles";

const LISBON = {
  id: "stop-lisbon",
  tripId: "trip-1",
  forkId: null,
  arriveDate: "2026-12-10",
  departDate: "2026-12-13",
};

const PORTO = {
  id: "stop-porto",
  tripId: "trip-1",
  forkId: null,
  arriveDate: "2026-12-13",
  departDate: "2026-12-15",
};

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  });
  stopFindUniqueMock.mockReset();
  stopFindFirstMock.mockResolvedValue(null);
  dayTitleFindUniqueMock.mockResolvedValue(null);
  dayTitleUpsertMock.mockResolvedValue({ id: "dt-1", title: "Sintra day trip" });
  dayTitleDeleteMock.mockResolvedValue({ id: "dt-1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setDayTitle", () => {
  it("is access-checked before the write", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "Sintra day trip" });
    expect(requireTripAccessMock).toHaveBeenCalledWith(LISBON.tripId);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, dayTitleUpsertMock);
  });

  it("upserts by (stopId, dayIndex) computed from the date", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    const result = await setDayTitle({
      stopId: LISBON.id,
      date: "2026-12-11",
      title: "Sintra day trip",
    });

    expect(result.success).toBe(true);
    expect(dayTitleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stopId_dayIndex: { stopId: LISBON.id, dayIndex: 1 } },
        create: expect.objectContaining({
          stopId: LISBON.id,
          dayIndex: 1,
          title: "Sintra day trip",
        }),
        update: { title: "Sintra day trip" },
      }),
    );
  });

  it("a date outside the Stop's stay returns an error (no write)", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    const result = await setDayTitle({
      stopId: LISBON.id,
      date: "2026-12-20", // well past departDate
      title: "Somewhere else",
    });

    expect(result.success).toBe(false);
    expect(dayTitleUpsertMock).not.toHaveBeenCalled();
    expect(dayTitleDeleteMock).not.toHaveBeenCalled();
  });

  it("a rough Stop (no dates) refuses every date", async () => {
    stopFindUniqueMock.mockResolvedValue({ ...LISBON, arriveDate: null, departDate: null });
    const result = await setDayTitle({
      stopId: LISBON.id,
      date: "2026-12-11",
      title: "Rest day",
    });

    expect(result.success).toBe(false);
    expect(dayTitleUpsertMock).not.toHaveBeenCalled();
  });

  it("empty title deletes the existing row", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-1", title: "Sintra day trip" });

    const result = await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "" });

    expect(result.success).toBe(true);
    expect(dayTitleDeleteMock).toHaveBeenCalledWith({ where: { id: "dt-1" } });
    expect(dayTitleUpsertMock).not.toHaveBeenCalled();
  });

  it("whitespace-only title deletes too", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-1", title: "Sintra day trip" });

    const result = await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "   " });

    expect(result.success).toBe(true);
    expect(dayTitleDeleteMock).toHaveBeenCalled();
  });

  it("deleting a title that doesn't exist is a harmless no-op", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue(null);

    const result = await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "" });

    expect(result.success).toBe(true);
    expect(dayTitleDeleteMock).not.toHaveBeenCalled();
  });

  it("refuses a title over 80 characters", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    const result = await setDayTitle({
      stopId: LISBON.id,
      date: "2026-12-11",
      title: "x".repeat(81),
    });

    expect(result.success).toBe(false);
    expect(dayTitleUpsertMock).not.toHaveBeenCalled();
  });

  it("setting on Porto's first day when Lisbon already owns that changeover date updates Lisbon's row instead", async () => {
    // Porto's arrive date (2026-12-13) is the changeover day shared with
    // Lisbon's depart date. Lisbon owns dayIndex 3 (its last day) for it.
    stopFindUniqueMock.mockResolvedValue(PORTO);
    stopFindFirstMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue({ id: "dt-lisbon", title: "Train day" });

    const result = await setDayTitle({
      stopId: PORTO.id,
      date: "2026-12-13",
      title: "Travel day",
    });

    expect(result.success).toBe(true);
    // The partner (Lisbon) lookup is scoped to the same trip/plan, excluding Porto.
    expect(stopFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripId: PORTO.tripId,
          forkId: PORTO.forkId,
          id: { not: PORTO.id },
        }),
      }),
    );
    // Lisbon's dayIndex for 2026-12-13 is 3 (arrive 12-10 + 3 = 12-13).
    expect(dayTitleFindUniqueMock).toHaveBeenCalledWith({
      where: { stopId_dayIndex: { stopId: LISBON.id, dayIndex: 3 } },
    });
    expect(dayTitleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stopId_dayIndex: { stopId: LISBON.id, dayIndex: 3 } },
        update: { title: "Travel day" },
      }),
    );
  });

  it("on a changeover day with no existing partner title, writes its own row", async () => {
    stopFindUniqueMock.mockResolvedValue(PORTO);
    stopFindFirstMock.mockResolvedValue(LISBON);
    dayTitleFindUniqueMock.mockResolvedValue(null); // Lisbon has no title for the shared date

    const result = await setDayTitle({
      stopId: PORTO.id,
      date: "2026-12-13",
      title: "Arrival day",
    });

    expect(result.success).toBe(true);
    expect(dayTitleUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stopId_dayIndex: { stopId: PORTO.id, dayIndex: 0 } },
      }),
    );
  });

  it("revalidates plan, calendar, day and Home paths", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "Sintra day trip" });

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${LISBON.tripId}/plan`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${LISBON.tripId}/calendar`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${LISBON.tripId}/day/2026-12-11`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${LISBON.tripId}`);
  });

  it("records Activity for a set", async () => {
    stopFindUniqueMock.mockResolvedValue(LISBON);
    await setDayTitle({ stopId: LISBON.id, date: "2026-12-11", title: "Sintra day trip" });

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: LISBON.tripId,
        verb: "UPDATED",
        entityType: "DAY_TITLE",
        entityLabel: "Day title",
      }),
    );
  });

  it("404s when the Stop doesn't exist", async () => {
    stopFindUniqueMock.mockResolvedValue(null);
    await expect(
      setDayTitle({ stopId: "nope", date: "2026-12-11", title: "X" }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
