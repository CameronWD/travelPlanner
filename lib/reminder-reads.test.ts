import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

const { requireTripAccessMock, reminderFindManyMock, loadSurpriseVisibilityMock } = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({ user: { id: "user-1" }, membership: { role: "owner" } }),
  reminderFindManyMock: vi.fn(),
  loadSurpriseVisibilityMock: vi.fn(),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/db", () => ({ db: { reminder: { findMany: reminderFindManyMock } } }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  loadSurpriseVisibilityMock.mockImplementation(async () => actual.NO_SURPRISES);
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});

import { listRemindersForTrip } from "./reminder-reads";

const TRIP_ID = "trip-1";
beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// listRemindersForTrip
// ---------------------------------------------------------------------------

describe("listRemindersForTrip", () => {
  it("checks trip access before reading anything", async () => {
    reminderFindManyMock.mockResolvedValue([]);
    await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("returns reminders dated on or after fromDate, soonest first, capped at 20", async () => {
    reminderFindManyMock.mockResolvedValue([
      { id: "r1", title: "Print docs", date: "2026-07-02", stopId: null, stop: null },
    ]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");

    expect(reminderFindManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: { gte: "2026-07-01" } },
      orderBy: { date: "asc" },
      take: 20,
      select: {
        id: true,
        title: true,
        date: true,
        stopId: true,
        stop: { select: { name: true } },
      },
    });
    expect(result).toEqual([
      { id: "r1", title: "Print docs", date: "2026-07-02", stopId: null, stopName: null },
    ]);
  });

  // Task 7: a Reminder may be about a Stop — the card renders a chip from the
  // related Stop's name.
  it("returns stopName from the related Stop when the reminder is about one", async () => {
    reminderFindManyMock.mockResolvedValue([
      {
        id: "r1",
        title: "Reconfirm the tour",
        date: "2026-07-02",
        stopId: "s1",
        stop: { name: "Denpasar" },
      },
    ]);

    const result = await listRemindersForTrip(TRIP_ID, "2026-07-01");

    expect(result).toEqual([
      {
        id: "r1",
        title: "Reconfirm the tour",
        date: "2026-07-02",
        stopId: "s1",
        stopName: "Denpasar",
      },
    ]);
  });

  it("a Reminder about a Stop hidden from the viewer stays in the database (ADR 0051)", async () => {
    loadSurpriseVisibilityMock.mockResolvedValueOnce(hiddenVisibility({ viewerId: "user-1", hiddenStopIds: ["s1"] }));
    reminderFindManyMock.mockResolvedValue([]);
    await listRemindersForTrip(TRIP_ID, "2026-07-01");
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith(TRIP_ID, "user-1");
    expectAccessCheckedBeforeWrite(requireTripAccessMock, loadSurpriseVisibilityMock);
    expect(reminderFindManyMock.mock.calls[0][0].where).toEqual({
      tripId: TRIP_ID,
      date: { gte: "2026-07-01" },
      ...MARKER_WHERE.reminder,
    });
  });
});
