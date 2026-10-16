import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for reminder server actions.
 *
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidateTripMock,
  revalidateTripsListMock,
  notFoundMock,
  reminderFindUniqueMock,
  reminderCreateMock,
  reminderUpdateMock,
  reminderDeleteMock,
  stopFindFirstMock,
  recordActivityMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidateTripMock: vi.fn(),
  revalidateTripsListMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  reminderFindUniqueMock: vi.fn(),
  reminderCreateMock: vi.fn(),
  reminderUpdateMock: vi.fn(),
  reminderDeleteMock: vi.fn(),
  // Task 7 fix: addReminder/updateReminder look this up to verify a given
  // stopId actually belongs to the trip being written to.
  stopFindFirstMock: vi.fn(),
  recordActivityMock: vi.fn(),
}));

vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock, revalidateTripsList: revalidateTripsListMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/db", () => ({
  db: {
    reminder: {
      findUnique: reminderFindUniqueMock,
      create: reminderCreateMock,
      update: reminderUpdateMock,
      delete: reminderDeleteMock,
    },
    stop: {
      findFirst: stopFindFirstMock,
    },
  },
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: recordActivityMock }));
const requireOutsideSurpriseMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/lib/surprise-guard", () => ({
  requireOutsideSurprise: requireOutsideSurpriseMock,
  surpriseRootFor: vi.fn().mockResolvedValue(null),
  surpriseRootForEntity: vi.fn().mockResolvedValue(null),
}));
// requireReminderAccess is now a thin adapter over requireRowAccess (Task 5)
// — forward to the same reminderFindUniqueMock/requireTripAccessMock/
// requireOutsideSurpriseMock every test already seeds, so existing
// mockResolvedValueOnce chains for the guard's own lookup keep working
// unchanged.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async () => {
    const row = await reminderFindUniqueMock();
    // This file mocks next/navigation's notFound as notFoundMock — reach
    // for that same mock via dynamic import.
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccessMock(row.tripId);
    const surpriseOf = await requireOutsideSurpriseMock(user.id, { stopId: row.stopId });
    return { row, user, membership, surpriseOf };
  }),
);
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireRowAccess: requireRowAccessMock,
}));

// Import after mocks
import {
  addReminder,
  updateReminder,
  deleteReminder,
} from "@/server/actions/reminders";

const TRIP_ID = "trip-1";
const REMINDER_ID = "rem-1";

const VALID_INPUT = {
  title: "Book hotel",
  date: "2026-07-01",
};

afterEach(() => {
  vi.clearAllMocks();
  requireOutsideSurpriseMock.mockResolvedValue(null);
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
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan", "lists");
    expect(revalidateTripsListMock).toHaveBeenCalled();
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

  it("rejects a date that matches the format but is not a calendar date", async () => {
    const result = await addReminder(TRIP_ID, { ...VALID_INPUT, date: "2026-02-30" });
    expect(result).toMatchObject({ success: false, errors: { date: ["Reminder date must be a real date"] } });
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

  it("revalidates the trip's plan and lists scopes, and the trips list", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r1" });
    await addReminder(TRIP_ID, { title: "Print docs", date: "2026-11-28" });
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan", "lists");
    expect(revalidateTripsListMock).toHaveBeenCalled();
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
// updateReminder
// ---------------------------------------------------------------------------

describe("updateReminder", () => {
  it("updates a reminder and returns { success: true }", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
      title: VALID_INPUT.title,
      date: VALID_INPUT.date,
      stop: null,
    });
    reminderUpdateMock.mockResolvedValue({
      title: "Updated title",
      date: VALID_INPUT.date,
      stop: null,
    });

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
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan", "lists");
    expect(revalidateTripsListMock).toHaveBeenCalled();
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
    reminderFindUniqueMock.mockResolvedValue({
      id: REMINDER_ID,
      tripId: TRIP_ID,
      title: VALID_INPUT.title,
      date: VALID_INPUT.date,
      stop: null,
    });
    stopFindFirstMock.mockResolvedValue({ id: "cst0p00000000000000000000" });
    reminderUpdateMock.mockResolvedValue({
      title: VALID_INPUT.title,
      date: VALID_INPUT.date,
      stop: { name: "Some stop" },
    });

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
      select: { title: true, date: true, stop: { select: { name: true } } },
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
// updateReminder — PATCH merge (ADR 0075), moved here from the MCP tool
// ---------------------------------------------------------------------------

describe("updateReminder (PATCH, ADR 0075)", () => {
  const ROW = { id: "r1", tripId: "trip-1", title: "Reconfirm the tour", date: "2026-07-02", stopId: null, stop: null };
  // Brief literal was "new-stop" — not a valid cuid, and this now goes through
  // the real reminderSchema (stopId: z.string().cuid()), so a valid-looking
  // cuid stands in for it, same substitution already made above for "stop-1".
  const NEW_STOP_ID = "cst0p00000000000000000002";

  it("with only title keeps the current date and writes no stopId", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    reminderUpdateMock.mockResolvedValue({ title: "New title", date: "2026-07-02", stop: null });
    await updateReminder("r1", { title: "New title" });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "r1" },
      data: { title: "New title", date: "2026-07-02" },
    }));
  });

  it("a supplied stopId replaces the current one", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    stopFindFirstMock.mockResolvedValue({ id: NEW_STOP_ID });
    reminderUpdateMock.mockResolvedValue({ title: "Reconfirm the tour", date: "2026-07-02", stop: null });
    await updateReminder("r1", { stopId: NEW_STOP_ID });
    expect(reminderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { title: "Reconfirm the tour", date: "2026-07-02", stopId: NEW_STOP_ID },
    }));
  });

  it("a null title is refused by the schema, nothing written", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    const r = await updateReminder("r1", { title: null });
    expect(r.success).toBe(false);
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
      title: VALID_INPUT.title,
      date: VALID_INPUT.date,
      stop: null,
    });
    reminderDeleteMock.mockResolvedValue({});

    const result = await deleteReminder(REMINDER_ID);

    expect(result).toEqual({ success: true });
    expect(reminderDeleteMock).toHaveBeenCalledWith({
      where: { id: REMINDER_ID },
    });
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan", "lists");
    expect(revalidateTripsListMock).toHaveBeenCalled();
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
      title: VALID_INPUT.title,
      date: VALID_INPUT.date,
      stop: null,
    });
    reminderDeleteMock.mockResolvedValue({});

    await deleteReminder(REMINDER_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, reminderDeleteMock);
  });
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

describe("Activity", () => {
  it("adding records CREATED named by the Reminder's text", async () => {
    reminderCreateMock.mockResolvedValue({ id: "r-1" });
    await addReminder("trip-1", { title: "Print the insurance docs", date: "2026-11-28" });
    expect(recordActivityMock).toHaveBeenCalledWith({
      tripId: "trip-1",
      verb: "CREATED",
      entityType: "REMINDER",
      entityId: "r-1",
      entityLabel: "Print the insurance docs",
    });
  });

  it("editing records field diffs with the Stop by name", async () => {
    reminderFindUniqueMock.mockResolvedValue({
      id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null,
    });
    reminderUpdateMock.mockResolvedValue({ title: "Print docs", date: "2026-11-28", stop: { name: "Lisbon" } });
    // assertStopOnTrip needs this Stop to resolve on this trip; stopId must be
    // a valid cuid per reminderSchema (the brief's literal "stop-1" fails
    // z.string().cuid() and never reaches the update — substituted here).
    stopFindFirstMock.mockResolvedValue({ id: "cst0p00000000000000000001" });
    await updateReminder("r-1", { title: "Print docs", date: "2026-11-28", stopId: "cst0p00000000000000000001" });
    const call = recordActivityMock.mock.calls[0][0];
    expect(call).toMatchObject({ verb: "UPDATED", entityType: "REMINDER", entityId: "r-1", entityLabel: "Print docs" });
    expect(call.changes).toEqual([
      { field: "date", label: "Date", from: "Thu 26 Nov 2026", to: "Sat 28 Nov 2026" },
      { field: "stopName", label: "About", from: "", to: "Lisbon" },
    ]);
  });

  it("an edit that re-sends the same values passes empty changes", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null });
    reminderUpdateMock.mockResolvedValue({ title: "Print docs", date: "2026-11-26", stop: null });
    await updateReminder("r-1", { title: "Print docs", date: "2026-11-26" });
    expect(recordActivityMock.mock.calls[0][0].changes).toEqual([]);
  });

  it("removing records DELETED named by its text", async () => {
    reminderFindUniqueMock.mockResolvedValue({ id: "r-1", tripId: "trip-1", title: "Print docs", date: "2026-11-26", stop: null });
    await deleteReminder("r-1");
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "REMINDER", entityId: "r-1", entityLabel: "Print docs" }),
    );
  });

  it("a failed validation records nothing", async () => {
    await addReminder("trip-1", { title: "", date: "2026-11-28" });
    expect(recordActivityMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Surprise (CONTEXT.md): the write guard
// ---------------------------------------------------------------------------

describe("Surprise write guard", () => {
  const ROW = { id: REMINDER_ID, tripId: TRIP_ID, title: "Book hotel", date: "2026-07-01", stopId: "stop-1", stop: { name: "Rome" } };

  it("refuses a surprised viewer before the write", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(deleteReminder(REMINDER_ID)).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { stopId: "stop-1" });
    expect(reminderDeleteMock).not.toHaveBeenCalled();
  });

  it("addReminder refuses a Stop the caller is surprised by", async () => {
    stopFindFirstMock.mockResolvedValue({ id: "cjld2cjxh0000qzrmn831i7rn" });
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(addReminder(TRIP_ID, { ...VALID_INPUT, stopId: "cjld2cjxh0000qzrmn831i7rn" })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", { stopId: "cjld2cjxh0000qzrmn831i7rn" });
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("passes the Surprise root to the Activity record on delete", async () => {
    reminderFindUniqueMock.mockResolvedValue(ROW);
    reminderDeleteMock.mockResolvedValue({});
    requireOutsideSurpriseMock.mockResolvedValue({ type: "STOP", id: "stop-1" });

    await deleteReminder(REMINDER_ID);

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "REMINDER", surpriseOf: { type: "STOP", id: "stop-1" } }),
    );
  });
});
