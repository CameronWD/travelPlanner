import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for notes server actions.
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  noteFindUniqueMock,
  noteCreateMock,
  noteDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  noteFindUniqueMock: vi.fn(),
  noteCreateMock: vi.fn(),
  noteDeleteMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    note: {
      findUnique: noteFindUniqueMock,
      create: noteCreateMock,
      delete: noteDeleteMock,
    },
  },
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));

import { addNote, deleteNote } from "./notes";
import { recordActivity } from "@/server/actions/activity";

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  noteCreateMock.mockResolvedValue({ id: "note-1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

const TRIP_ID = "trip-1";
const NOTE_ID = "note-1";

// ---------------------------------------------------------------------------
// addNote
// ---------------------------------------------------------------------------

describe("addNote", () => {
  const VALID_INPUT = {
    targetType: "ITEM" as const,
    targetId: "item-1",
    body: "Great idea!",
  };

  it("calls requireTripAccess with the tripId", async () => {
    noteCreateMock.mockResolvedValue({ id: "note-1" });
    await addNote(TRIP_ID, VALID_INPUT);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("creates a note with the current user as authorId", async () => {
    noteCreateMock.mockResolvedValue({ id: "note-1" });
    await addNote(TRIP_ID, VALID_INPUT);
    expect(noteCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: TRIP_ID,
        authorId: "user-1",
        targetType: "ITEM",
        targetId: "item-1",
        body: "Great idea!",
      }),
    });
  });

  it("returns { success: true } on success", async () => {
    noteCreateMock.mockResolvedValue({ id: "note-1" });
    const result = await addNote(TRIP_ID, VALID_INPUT);
    expect(result).toEqual({ success: true });
  });

  it("revalidates relevant paths after creating a note", async () => {
    noteCreateMock.mockResolvedValue({ id: "note-1" });
    await addNote(TRIP_ID, VALID_INPUT);
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    const result = await addNote(TRIP_ID, {
      ...VALID_INPUT,
      body: "",
    });
    expect(result).toMatchObject({ success: false });
    expect((result as { success: false; errors: Record<string, string[]> }).errors.body).toBeTruthy();
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only body", async () => {
    const result = await addNote(TRIP_ID, {
      ...VALID_INPUT,
      body: "   ",
    });
    expect(result).toMatchObject({ success: false });
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a body exceeding 2000 characters", async () => {
    const result = await addNote(TRIP_ID, {
      ...VALID_INPUT,
      body: "x".repeat(2001),
    });
    expect(result).toMatchObject({ success: false });
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("accepts a body of exactly 2000 characters", async () => {
    noteCreateMock.mockResolvedValue({ id: "note-1" });
    const result = await addNote(TRIP_ID, {
      ...VALID_INPUT,
      body: "x".repeat(2000),
    });
    expect(result).toEqual({ success: true });
  });

  it("rejects an invalid targetType", async () => {
    const result = await addNote(TRIP_ID, {
      ...VALID_INPUT,
      // @ts-expect-error intentional bad value
      targetType: "INVALID",
    });
    expect(result).toMatchObject({ success: false });
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("is access-checked — notFound for non-members", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(addNote(TRIP_ID, VALID_INPUT)).rejects.toThrow("NOT_FOUND");
    expect(noteCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteNote
// ---------------------------------------------------------------------------

describe("deleteNote", () => {
  it("looks up the note by id", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-1",
    });
    noteDeleteMock.mockResolvedValue({});

    await deleteNote(NOTE_ID);

    expect(noteFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: NOTE_ID } }),
    );
  });

  it("calls requireTripAccess on the note's tripId", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-1",
    });
    noteDeleteMock.mockResolvedValue({});

    await deleteNote(NOTE_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("deletes the note", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-1",
    });
    noteDeleteMock.mockResolvedValue({});

    const result = await deleteNote(NOTE_ID);

    expect(noteDeleteMock).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
    expect(result).toEqual({ success: true });
  });

  it("revalidates paths after deletion", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-1",
    });
    noteDeleteMock.mockResolvedValue({});

    await deleteNote(NOTE_ID);

    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("throws notFound when the note does not exist", async () => {
    noteFindUniqueMock.mockResolvedValue(null);
    await expect(deleteNote(NOTE_ID)).rejects.toThrow("NOT_FOUND");
    expect(noteDeleteMock).not.toHaveBeenCalled();
  });

  it("is access-checked — throws if user is not a trip member", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "other-user",
    });
    requireTripAccessMock.mockRejectedValue(new Error("NOT_FOUND"));

    await expect(deleteNote(NOTE_ID)).rejects.toThrow("NOT_FOUND");
    expect(noteDeleteMock).not.toHaveBeenCalled();
  });

  it("allows any trip member to delete (not just the author)", async () => {
    // authorId is different from current user (user-1)
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-2",
    });
    noteDeleteMock.mockResolvedValue({});
    // requireTripAccess succeeds for user-1 (they are a member)

    const result = await deleteNote(NOTE_ID);

    expect(result).toEqual({ success: true });
    expect(noteDeleteMock).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
  });
});

// ---------------------------------------------------------------------------
// activity recording
// ---------------------------------------------------------------------------

describe("addNote — activity", () => {
  const VALID_INPUT = {
    targetType: "ITEM" as const,
    targetId: "item-1",
    body: "Great idea for the trip!",
  };

  it("records NOTED activity with a changes.excerpt after addNote", async () => {
    await addNote(TRIP_ID, VALID_INPUT);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      tripId: TRIP_ID,
      verb: "NOTED",
      entityType: "NOTE",
      entityId: "note-1",
      changes: expect.objectContaining({ excerpt: VALID_INPUT.body.slice(0, 80) }),
    }));
  });

  it("truncates the excerpt to 80 characters", async () => {
    const longBody = "x".repeat(200);
    noteCreateMock.mockResolvedValue({ id: "note-2" });
    await addNote(TRIP_ID, { ...VALID_INPUT, body: longBody });
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ excerpt: longBody.slice(0, 80) }),
    }));
  });

  it("does not record activity when validation fails", async () => {
    await addNote(TRIP_ID, { ...VALID_INPUT, body: "" });
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("deleteNote — activity", () => {
  it("records DELETED activity with verb DELETED and entityType NOTE", async () => {
    noteFindUniqueMock.mockResolvedValue({ id: NOTE_ID, tripId: TRIP_ID, authorId: "user-1" });
    noteDeleteMock.mockResolvedValue({});

    await deleteNote(NOTE_ID);

    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
      tripId: TRIP_ID,
      verb: "DELETED",
      entityType: "NOTE",
      entityId: NOTE_ID,
      entityLabel: "note",
    }));
  });
});
