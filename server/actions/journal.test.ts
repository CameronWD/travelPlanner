import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireTripAccessMock,
  revalidatePathMock,
  journalUpsertMock,
  journalDeleteManyMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  }),
  revalidatePathMock: vi.fn(),
  journalUpsertMock: vi.fn().mockResolvedValue({}),
  journalDeleteManyMock: vi.fn().mockResolvedValue({ count: 1 }),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    journalEntry: {
      upsert: journalUpsertMock,
      deleteMany: journalDeleteManyMock,
    },
  },
}));

import { saveJournalEntry, deleteJournalEntry } from "./journal";

const TRIP_ID = "trip-1";
const DATE = "2026-07-15";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "member" },
  });
  journalUpsertMock.mockResolvedValue({});
  journalDeleteManyMock.mockResolvedValue({ count: 1 });
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
  });

  it("upserts by (tripId, date) and sets authorId to current user", async () => {
    await saveJournalEntry(TRIP_ID, DATE, "A wonderful day in Paris.");
    expect(journalUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId_date: { tripId: TRIP_ID, date: DATE } },
        create: expect.objectContaining({
          tripId: TRIP_ID,
          date: DATE,
          body: "A wonderful day in Paris.",
          authorId: "user-1",
        }),
        update: expect.objectContaining({
          body: "A wonderful day in Paris.",
          authorId: "user-1",
        }),
      }),
    );
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

  it("deletes existing entry when body is empty", async () => {
    const result = await saveJournalEntry(TRIP_ID, DATE, "");
    expect(journalDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: DATE },
    });
    expect(journalUpsertMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("deletes existing entry when body is whitespace-only", async () => {
    const result = await saveJournalEntry(TRIP_ID, DATE, "   ");
    expect(journalDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: DATE },
    });
    expect(journalUpsertMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
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

  it("returns validation errors when body exceeds 5000 chars", async () => {
    const result = await saveJournalEntry(TRIP_ID, DATE, "x".repeat(5001));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.body).toBeDefined();
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
});

// ---------------------------------------------------------------------------
// deleteJournalEntry
// ---------------------------------------------------------------------------

describe("deleteJournalEntry", () => {
  it("is access-checked — calls requireTripAccess with tripId", async () => {
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("deletes the entry by (tripId, date)", async () => {
    await deleteJournalEntry(TRIP_ID, DATE);
    expect(journalDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: TRIP_ID, date: DATE },
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
