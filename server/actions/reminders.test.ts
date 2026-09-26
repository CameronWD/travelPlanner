import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for reminder server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  notFoundMock,
  reminderFindUniqueMock,
  reminderFindManyMock,
  reminderCreateMock,
  reminderUpdateMock,
  reminderDeleteMock,
  stopFindFirstMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  reminderFindUniqueMock: vi.fn(),
  reminderFindManyMock: vi.fn(),
  reminderCreateMock: vi.fn(),
  reminderUpdateMock: vi.fn(),
  reminderDeleteMock: vi.fn(),
  // Task 7 fix: addReminder/updateReminder look this up to verify a given
  // stopId actually belongs to the trip being written to.
  stopFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/db", () => ({
  db: {
    reminder: {
      findUnique: reminderFindUniqueMock,
      findMany: reminderFindManyMock,
      create: reminderCreateMock,
      update: reminderUpdateMock,
      delete: reminderDeleteMock,
    },
    stop: {
      findFirst: stopFindFirstMock,
    },
  },
}));

// Import after mocks
import {
  addReminder,
  updateReminder,
  deleteReminder,
  listRemindersForTrip,
} from "@/server/actions/reminders";

const TRIP_ID = "trip-1";
const REMINDER_ID = "rem-1";

const VALID_INPUT = {
  title: "Book hotel",
  date: "2026-07-01",
};

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// addReminder
// ---------------------------------------------------------------------------

describe("addReminder", () => {
  it("creates a reminder and returns { success: true, id }", async () => {
    reminderCreateMock.mockResolvedValue({ id: REMINDER_ID });

    const result = await addReminder(TRIP_ID, VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, reminderCreateMock);
    expect(reminderCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: TRIP_ID,
          title: "Book hotel",
        }),
        select: { id: true },
      }),
    );
    expect(result).toEqual({ success: true, id: REMINDER_ID });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/today`);
  });

  it("returns validation errors when title is empty", async () => {
    const result = await addReminder(TRIP_ID, { ...VALID_INPUT, title: "" });
    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.errors.title).toBeDefined();
    }
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("returns validation errors when the date is not a valid date", async () => {
    const result = await addReminder(TRIP_ID, {
      ...VALID_INPUT,
      date: "not-a-date",
    });
    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.errors.date).toBeDefined();
    }
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a date that is not YYYY-MM-DD", async () => {
    const result = await addReminder(TRIP_ID, {
      title: "Print docs",
      date: "28 Nov",
    });
    expect(result.success).toBe(false);
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  // A Reminder carries a date and never a time (CONTEXT.md "Reminder") — the
  // string the Traveller picked must reach the row untouched, with no Date
  // round-trip that could shunt it a day either way.
  it("stores the date verbatim, with no time component", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r1" });
    await addReminder(TRIP_ID, { title: "Print docs", date: "2026-11-28" });
    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: { tripId: TRIP_ID, title: "Print docs", date: "2026-11-28" },
      select: { id: true },
    });
  });

  it("revalidates Home, Today, and Plan (a Stop card can show a Reminder too)", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r1" });
    await addReminder(TRIP_ID, { title: "Print docs", date: "2026-11-28" });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/today`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });

  it("calls requireTripAccess to verify membership", async () => {
    reminderCreateMock.mockResolvedValue({ id: REMINDER_ID });
    await addReminder(TRIP_ID, VALID_INPUT);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, reminderCreateMock);
  });

  // Task 7: a Reminder may be about a Stop.
  it("passes stopId through to db.reminder.create when it belongs to this trip", async () => {
    stopFindFirstMock.mockResolvedValue({ id: "cst0p00000000000000000000" });
    reminderCreateMock.mockResolvedValue({ id: "r1" });
    await addReminder(TRIP_ID, { ...VALID_INPUT, stopId: "cst0p00000000000000000000" });
    expect(stopFindFirstMock).toHaveBeenCalledWith({
      where: { id: "cst0p00000000000000000000", tripId: TRIP_ID },
      select: { id: true },
    });
    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: {
        tripId: TRIP_ID,
        title: VALID_INPUT.title,
        date: VALID_INPUT.date,
        stopId: "cst0p00000000000000000000",
      },
      select: { id: true },
    });
  });

  it("omits stopId entirely (leaving it NULL) when not given — a Reminder about the Trip as a whole", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r1" });
    await addReminder(TRIP_ID, VALID_INPUT);
    expect(stopFindFirstMock).not.toHaveBeenCalled();
    expect(reminderCreateMock).toHaveBeenCalledWith({
      data: { tripId: TRIP_ID, title: VALID_INPUT.title, date: VALID_INPUT.date },
      select: { id: true },
    });
  });

  it("rejects a stopId that isn't a valid cuid", async () => {
    const result = await addReminder(TRIP_ID, { ...VALID_INPUT, stopId: "not-a-cuid" });
    expect(result.success).toBe(false);
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  // Fix: a Stop id from a different trip must not silently link — it would
  // leak that trip's Stop name onto this trip's Home card, and a delete on
  // the other trip's Stop would reach into this trip's Reminder via SetNull.
  it("rejects a stopId that belongs to a different trip, and does not call create", async () => {
    stopFindFirstMock.mockResolvedValue(null);
    const result = await addReminder(TRIP_ID, {
      ...VALID_INPUT,
      stopId: "cst0p00000000000000000000",
    });
    expect(stopFindFirstMock).toHaveBeenCalledWith({
      where: { id: "cst0p00000000000000000000", tripId: TRIP_ID },
      select: { id: true },
    });
    expect(result).toEqual({
      success: false,
      errors: { stopId: ["That Stop isn't on this trip"] },
    });
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });
});

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
});

// ---------------------------------------------------------------------------
// updateReminder
// ---------------------------------------------------------------------------

describe("updateReminder", () => {
  it("updates a reminder and returns { success: true }", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
    });
    reminderUpdateMock.mockResolvedValue({});

    const result = await updateReminder(REMINDER_ID, {
      ...VALID_INPUT,
      title: "Updated title",
    });

    expect(result).toEqual({ success: true });
    expect(reminderUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REMINDER_ID },
        data: expect.objectContaining({ title: "Updated title" }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/today`);
  });

  it("returns NOT_FOUND when reminder does not exist", async () => {
    reminderFindUniqueMock.mockResolvedValue(null);

    await expect(
      updateReminder(REMINDER_ID, VALID_INPUT),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("returns validation errors on bad input", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
    });

    const result = await updateReminder(REMINDER_ID, {
      ...VALID_INPUT,
      title: "",
    });
    expect(result).toMatchObject({ success: false });
    expect(reminderUpdateMock).not.toHaveBeenCalled();
  });

  // Task 7: a Reminder may be about a Stop.
  it("passes stopId through to db.reminder.update when it belongs to this trip", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: REMINDER_ID, tripId: TRIP_ID });
    stopFindFirstMock.mockResolvedValue({ id: "cst0p00000000000000000000" });
    reminderUpdateMock.mockResolvedValue({});

    const result = await updateReminder(REMINDER_ID, {
      ...VALID_INPUT,
      stopId: "cst0p00000000000000000000",
    });

    expect(stopFindFirstMock).toHaveBeenCalledWith({
      where: { id: "cst0p00000000000000000000", tripId: TRIP_ID },
      select: { id: true },
    });
    expect(reminderUpdateMock).toHaveBeenCalledWith({
      where: { id: REMINDER_ID },
      data: {
        title: VALID_INPUT.title,
        date: VALID_INPUT.date,
        stopId: "cst0p00000000000000000000",
      },
    });
    expect(result).toEqual({ success: true });
  });

  // Fix: the same cross-trip check as addReminder, keyed off the *existing*
  // reminder's own tripId (not a caller-supplied one — there isn't one).
  it("rejects a stopId that belongs to a different trip, and does not call update", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: REMINDER_ID, tripId: TRIP_ID });
    stopFindFirstMock.mockResolvedValue(null);

    const result = await updateReminder(REMINDER_ID, {
      ...VALID_INPUT,
      stopId: "cst0p00000000000000000000",
    });

    expect(stopFindFirstMock).toHaveBeenCalledWith({
      where: { id: "cst0p00000000000000000000", tripId: TRIP_ID },
      select: { id: true },
    });
    expect(result).toEqual({
      success: false,
      errors: { stopId: ["That Stop isn't on this trip"] },
    });
    expect(reminderUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteReminder
// ---------------------------------------------------------------------------

describe("deleteReminder", () => {
  it("deletes a reminder and returns { success: true }", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
    });
    reminderDeleteMock.mockResolvedValue({});

    const result = await deleteReminder(REMINDER_ID);

    expect(result).toEqual({ success: true });
    expect(reminderDeleteMock).toHaveBeenCalledWith({
      where: { id: REMINDER_ID },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/today`);
  });

  it("returns NOT_FOUND when reminder does not exist", async () => {
    reminderFindUniqueMock.mockResolvedValue(null);

    await expect(deleteReminder(REMINDER_ID)).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("verifies trip access before deletion", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
    });
    reminderDeleteMock.mockResolvedValue({});

    await deleteReminder(REMINDER_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, reminderDeleteMock);
  });
});
