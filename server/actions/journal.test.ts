import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  revalidatePathMock,
  notFoundMock,
  journalFindUniqueMock,
  journalUpsertMock,
  journalUpdateMock,
  journalDeleteManyMock,
  tripFindUniqueMock,
  todayISOInZoneMock,
  currentTripTimezoneMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  }),
  revalidatePathMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  journalFindUniqueMock: vi.fn(),
  journalUpsertMock: vi.fn().mockResolvedValue({}),
  journalUpdateMock: vi.fn().mockResolvedValue({}),
  journalDeleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
  tripFindUniqueMock: vi.fn(),
  todayISOInZoneMock: vi.fn(),
  currentTripTimezoneMock: vi.fn().mockReturnValue("UTC"),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/tz", () => ({
  todayISOInZone: todayISOInZoneMock,
  currentTripTimezone: currentTripTimezoneMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    journalEntry: {
      findUnique: journalFindUniqueMock,
      upsert: journalUpsertMock,
      update: journalUpdateMock,
      deleteMany: journalDeleteManyMock,
    },
    trip: {
      findUnique: tripFindUniqueMock,
    },
  },
}));

import { saveJournalEntry, deleteJournalEntry, setJournalShareHidden } from "./journal";
import { JOURNAL_NOTE_MAX } from "@/lib/journal-window";

const TRIP_ID = "trip-1";
const DATE = "2026-07-15";
const TODAY = "2026-07-15";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTrip(overrides: Partial<{ startDate: string | null; endDate: string | null }> = {}) {
  tripFindUniqueMock.mockResolvedValue({
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    stops: [],
    ...overrides,
  });
}

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  });
  journalFindUniqueMock.mockResolvedValue(null);
  journalUpsertMock.mockResolvedValue({});
  journalUpdateMock.mockResolvedValue({});
  journalDeleteManyMock.mockResolvedValue({ count: 1 });
  todayISOInZoneMock.mockReturnValue(TODAY);
  currentTripTimezoneMock.mockReturnValue("UTC");
  mockTrip();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// saveJournalEntry
// ---------------------------------------------------------------------------

describe("saveJournalEntry", () => {
  it("is access-checked — calls requireTripAccess with tripId", async () => {
    await saveJournalEntry(TRIP_ID, DATE, "Hello world");
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, journalUpsertMock);
  });

  it("upserts by (tripId, date, authorId) and sets authorId to current user on create", async () => {
    await saveJournalEntry(TRIP_ID, DATE, "A wonderful day in Paris.");
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_date_authorId: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
        },
        create: expect.objectContaining({
          tripId: TRIP_ID,
          date: DATE,
          body: "A wonderful day in Paris.",
          authorId: "user-1",
        }),
        update: expect.objectContaining({
          body: "A wonderful day in Paris.",
        }),
      }),
    );
  });

  it("ARCH-DAT-6: two Travellers writing the same day get separate composite keys — both entries are kept", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "member" },
    });
    await saveJournalEntry(TRIP_ID, DATE, "Cam's account of the day");
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_date_authorId: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
        },
      }),
    );

    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2" },
      membership: { role: "member" },
    });
    await saveJournalEntry(TRIP_ID, DATE, "Alex's account of the day");
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_date_authorId: { tripId: TRIP_ID, date: DATE, authorId: "user-2" },
        },
      }),
    );

    // Neither call clobbers the other — both upserts happened, scoped to
    // their own author.
    expect(journalUpsertMock).toHaveBeenCalledTimes(2);
  });

  it("returns { success: true } on successful save", async () => {
    const result = await saveJournalEntry(TRIP_ID, DATE, "Great day!");
    expect(result).toEqual({ success: true });
  });

  it("revalidates the day and journal paths", async () => {
    await saveJournalEntry(TRIP_ID, DATE, "Some entry");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/day/${DATE}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/journal`);
  });

  it("returns validation errors for invalid date format", async () => {
    const result = await saveJournalEntry(TRIP_ID, "15-07-2026", "Some entry");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.date).toBeDefined();
      expect(result.errors.date.length).toBeGreaterThan(0);
    }
    expect(journalUpsertMock).not.toHaveBeenCalled();
  });

  it("is access-checked — throws when user is not a trip member", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(saveJournalEntry(TRIP_ID, DATE, "Entry")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(journalUpsertMock).not.toHaveBeenCalled();
  });

  it("trims the body before saving", async () => {
    await saveJournalEntry(TRIP_ID, DATE, "  Trimmed content  ");
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ body: "Trimmed content" }),
        update: expect.objectContaining({ body: "Trimmed content" }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Window (spec K / ADR 0058)
  // -------------------------------------------------------------------------

  describe("the writability window", () => {
    it("refuses a date that hasn't arrived yet (future relative to the Trip's local today)", async () => {
      todayISOInZoneMock.mockReturnValue("2026-07-15");
      const result = await saveJournalEntry(TRIP_ID, "2026-07-20", "Too soon");
      expect(result.success).toBe(false);
      expect(journalUpsertMock).not.toHaveBeenCalled();
      expect(journalDeleteManyMock).not.toHaveBeenCalled();
    });

    it("refuses a date-less Trip entirely", async () => {
      mockTrip({ startDate: null, endDate: null });
      const result = await saveJournalEntry(TRIP_ID, DATE, "No dates yet");
      expect(result.success).toBe(false);
      expect(journalUpsertMock).not.toHaveBeenCalled();
    });

    it("stays open after the Trip has ended", async () => {
      mockTrip({ startDate: "2026-07-01", endDate: "2026-07-10" });
      todayISOInZoneMock.mockReturnValue("2026-09-01");
      const result = await saveJournalEntry(TRIP_ID, "2026-07-05", "Catching up on a missed day");
      expect(result.success).toBe(true);
      expect(journalUpsertMock).toHaveBeenCalled();
    });

    it("accepts a trip-local 'today' one calendar day ahead of UTC (far-east zone) — window uses the trip's zone, not raw UTC", async () => {
      // The trip is currently at a far-east stop whose calendar has already
      // turned over to 2026-07-16 while UTC would still say 2026-07-15.
      // currentTripTimezone → the far-east zone; todayISOInZone → the day
      // AFTER the UTC date when called with it. The window must follow the
      // trip's own zone exactly as the Home page's
      // `todayISOInZone(currentTripTimezone(...))` does, not re-derive
      // "today" from the wall clock or from UTC.
      currentTripTimezoneMock.mockReturnValue("Pacific/Auckland");
      todayISOInZoneMock.mockImplementation((tz: string) =>
        tz === "Pacific/Auckland" ? "2026-07-16" : "2026-07-15",
      );
      mockTrip({ startDate: "2026-07-01", endDate: "2026-07-31" });

      const accepted = await saveJournalEntry(
        TRIP_ID,
        "2026-07-16",
        "Already tomorrow in Auckland",
      );
      expect(accepted.success).toBe(true);
      expect(todayISOInZoneMock).toHaveBeenCalledWith("Pacific/Auckland");

      journalUpsertMock.mockClear();
      const refused = await saveJournalEntry(
        TRIP_ID,
        "2026-07-17",
        "Still ahead even in Auckland",
      );
      expect(refused.success).toBe(false);
      expect(journalUpsertMock).not.toHaveBeenCalled();
    });

    it("loads the real plan's dated stops (forkId null) to compute the trip's current timezone", async () => {
      await saveJournalEntry(TRIP_ID, DATE, "Entry");
      expect(tripFindUniqueMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TRIP_ID } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Length (spec K)
  // -------------------------------------------------------------------------

  describe("the length rule", () => {
    it(`refuses ${JOURNAL_NOTE_MAX + 1} new chars`, async () => {
      const result = await saveJournalEntry(TRIP_ID, DATE, "x".repeat(JOURNAL_NOTE_MAX + 1));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.body).toBeDefined();
      }
      expect(journalUpsertMock).not.toHaveBeenCalled();
    });

    it(`accepts exactly ${JOURNAL_NOTE_MAX} new chars`, async () => {
      const result = await saveJournalEntry(TRIP_ID, DATE, "x".repeat(JOURNAL_NOTE_MAX));
      expect(result.success).toBe(true);
      expect(journalUpsertMock).toHaveBeenCalled();
    });

    it("accepts an existing 900-char entry saved unchanged", async () => {
      const legacy = "y".repeat(900);
      journalFindUniqueMock.mockResolvedValue({ body: legacy, hiddenFromShares: false });
      const result = await saveJournalEntry(TRIP_ID, DATE, legacy);
      expect(result.success).toBe(true);
      expect(journalUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ body: legacy }),
        }),
      );
    });

    it("refuses an existing 900-char entry edited but still over the cap", async () => {
      const legacy = "y".repeat(900);
      const edited = legacy.slice(0, -1) + "z";
      journalFindUniqueMock.mockResolvedValue({ body: legacy, hiddenFromShares: false });
      const result = await saveJournalEntry(TRIP_ID, DATE, edited);
      expect(result.success).toBe(false);
      expect(journalUpsertMock).not.toHaveBeenCalled();
    });

    it("accepts an existing 900-char entry shortened under the cap", async () => {
      const legacy = "y".repeat(900);
      const shortened = "z".repeat(200);
      journalFindUniqueMock.mockResolvedValue({ body: legacy, hiddenFromShares: false });
      const result = await saveJournalEntry(TRIP_ID, DATE, shortened);
      expect(result.success).toBe(true);
      expect(journalUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ body: shortened }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Empty body (deletes unless hiddenFromShares)
  // -------------------------------------------------------------------------

  describe("an empty body", () => {
    it("is a no-op when there is no existing entry", async () => {
      const result = await saveJournalEntry(TRIP_ID, DATE, "");
      expect(journalDeleteManyMock).not.toHaveBeenCalled();
      expect(journalUpsertMock).not.toHaveBeenCalled();
      expect(journalUpdateMock).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("is also a no-op for a whitespace-only body with no existing entry", async () => {
      const result = await saveJournalEntry(TRIP_ID, DATE, "   ");
      expect(journalDeleteManyMock).not.toHaveBeenCalled();
      expect(journalUpsertMock).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("deletes the existing entry when hiddenFromShares is false", async () => {
      journalFindUniqueMock.mockResolvedValue({ body: "Old entry", hiddenFromShares: false });
      const result = await saveJournalEntry(TRIP_ID, DATE, "");
      expect(journalDeleteManyMock).toHaveBeenCalledWith({
        where: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
      });
      expect(journalUpdateMock).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("keeps the row with body: '' when hiddenFromShares is true", async () => {
      journalFindUniqueMock.mockResolvedValue({ body: "Old entry", hiddenFromShares: true });
      const result = await saveJournalEntry(TRIP_ID, DATE, "");
      expect(journalDeleteManyMock).not.toHaveBeenCalled();
      expect(journalUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tripId_date_authorId: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
          },
          data: expect.objectContaining({ body: "" }),
        }),
      );
      expect(result).toEqual({ success: true });
    });
  });

  // -------------------------------------------------------------------------
  // opts.hiddenFromShares
  // -------------------------------------------------------------------------

  describe("opts.hiddenFromShares", () => {
    it("is passed through to the upsert when provided", async () => {
      await saveJournalEntry(TRIP_ID, DATE, "Entry", { hiddenFromShares: true });
      expect(journalUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ hiddenFromShares: true }),
          update: expect.objectContaining({ hiddenFromShares: true }),
        }),
      );
    });

    it("is omitted from the upsert when not provided, leaving existing rows' hiddenFromShares untouched", async () => {
      await saveJournalEntry(TRIP_ID, DATE, "Entry");
      const call = journalUpsertMock.mock.calls[0][0];
      expect(call.update).not.toHaveProperty("hiddenFromShares");
      expect(call.create).not.toHaveProperty("hiddenFromShares");
    });
  });
});

// ---------------------------------------------------------------------------
// deleteJournalEntry
// ---------------------------------------------------------------------------

describe("deleteJournalEntry", () => {
  it("is access-checked — calls requireTripAccess with tripId", async () => {
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, journalDeleteManyMock);
  });

  it("ARCH-DAT-6: deleteJournalEntry only removes the caller's own entry", async () => {
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(journalDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
    });
  });

  it("scopes deletion to a different caller's own id", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2" },
      membership: { role: "member" },
    });
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(journalDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: DATE, authorId: "user-2" },
    });
  });

  it("returns { success: true } after deletion", async () => {
    const result = await deleteJournalEntry(TRIP_ID, DATE);
    expect(result).toEqual({ success: true });
  });

  it("revalidates the day and journal paths", async () => {
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/day/${DATE}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/journal`);
  });

  it("is access-checked — throws when user is not a trip member", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(deleteJournalEntry(TRIP_ID, DATE)).rejects.toThrow("NOT_FOUND");
    expect(journalDeleteManyMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setJournalShareHidden
// ---------------------------------------------------------------------------

describe("setJournalShareHidden", () => {
  it("is access-checked — calls requireTripAccess with tripId", async () => {
    await setJournalShareHidden(TRIP_ID, DATE, true);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, journalUpsertMock);
  });

  it("creates a row with an empty body when none exists", async () => {
    await setJournalShareHidden(TRIP_ID, DATE, true);
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_date_authorId: { tripId: TRIP_ID, date: DATE, authorId: "user-1" },
        },
        create: expect.objectContaining({
          tripId: TRIP_ID,
          date: DATE,
          authorId: "user-1",
          body: "",
          hiddenFromShares: true,
        }),
        update: expect.objectContaining({ hiddenFromShares: true }),
      }),
    );
  });

  it("can clear the switch back to false", async () => {
    await setJournalShareHidden(TRIP_ID, DATE, false);
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ hiddenFromShares: false }),
      }),
    );
  });

  it("revalidates the day and journal paths", async () => {
    await setJournalShareHidden(TRIP_ID, DATE, true);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/day/${DATE}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/journal`);
  });

  it("is access-checked — throws when user is not a trip member", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setJournalShareHidden(TRIP_ID, DATE, true)).rejects.toThrow("NOT_FOUND");
    expect(journalUpsertMock).not.toHaveBeenCalled();
  });
});
