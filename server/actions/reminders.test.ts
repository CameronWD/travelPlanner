import { afterEach, describe, expect, it, vi } from "vitest";

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
  reminderCreateMock,
  reminderUpdateMock,
  reminderDeleteMock,
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
  reminderCreateMock: vi.fn(),
  reminderUpdateMock: vi.fn(),
  reminderDeleteMock: vi.fn(),
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
      create: reminderCreateMock,
      update: reminderUpdateMock,
      delete: reminderDeleteMock,
    },
  },
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
  fireAt: "2026-07-01T09:00:00Z",
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

  it("returns validation errors when fireAt is not a valid date", async () => {
    const result = await addReminder(TRIP_ID, {
      ...VALID_INPUT,
      fireAt: "not-a-date",
    });
    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.errors.fireAt).toBeDefined();
    }
    expect(reminderCreateMock).not.toHaveBeenCalled();
  });

  it("calls requireTripAccess to verify membership", async () => {
    reminderCreateMock.mockResolvedValue({ id: REMINDER_ID });
    await addReminder(TRIP_ID, VALID_INPUT);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
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
  });
});
