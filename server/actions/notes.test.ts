import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for notes server actions.
 * Mocks: lib/db, lib/guards, next/cache, next/navigation
 */

const {
  requireTripAccessMock,
  revalidateTripMock,
  noteFindUniqueMock,
  noteCreateMock,
  noteDeleteMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidateTripMock: vi.fn(),
  noteFindUniqueMock: vi.fn(),
  noteCreateMock: vi.fn(),
  noteDeleteMock: vi.fn(),
}));

vi.mock("@/lib/revalidate", () => ({ revalidateTrip: revalidateTripMock }));
// This file never mocks next/navigation (ARCH-TEN-9): addNote's own
// row.tripId !== tripId check calls the real notFound(), which throws
// "NEXT_HTTP_ERROR_FALLBACK;404" — same pattern as items.test.ts/costs.test.ts.
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
const requireOutsideSurpriseMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/lib/surprise-guard", () => ({
  requireOutsideSurprise: requireOutsideSurpriseMock,
  surpriseRootFor: vi.fn().mockResolvedValue(null),
  surpriseRootForEntity: vi.fn().mockResolvedValue(null),
}));

// requireNoteAccess is now a thin adapter over requireRowAccess (Task 5) —
// forward to the same noteFindUniqueMock/requireTripAccessMock/
// requireOutsideSurpriseMock every test already seeds, so existing
// mockResolvedValueOnce chains for the guard's own lookup keep working
// unchanged. ARCH-TEN-9: addNote now also calls requireRowAccess for a
// STOP/ITEM/TRANSPORT/ACCOMMODATION target — a different `kind` than
// "note", so this mock branches: "note" keeps deleteNote's existing
// forwarding behaviour; anything else defaults to a row on the same trip
// addNote's own requireTripAccess already validated (tests override via
// mockResolvedValueOnce/mockRejectedValueOnce for the cross-trip and
// Surprise cases).
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async (kind: string, id: string) => {
    if (kind !== "note") {
      return { row: { id, tripId: "trip-1" }, user: { id: "user-1" }, membership: { role: "owner" }, surpriseOf: null };
    }
    const row = await noteFindUniqueMock();
    // This file never mocks next/navigation, so reach for the real
    // notFound(), which throws "NEXT_HTTP_ERROR_FALLBACK;404" — production's
    // own message/digest.
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccessMock(row.tripId);
    const surpriseOf = await requireOutsideSurpriseMock(user.id, { target: row });
    return { row, user, membership, surpriseOf };
  }),
);
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock, requireRowAccess: requireRowAccessMock }));

import { addNote, deleteNote } from "./notes";
import { recordActivity } from "@/server/actions/activity";

beforeEach(() => {
  requireTripAccessMock.mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  });
  noteCreateMock.mockResolvedValue({ id: "note-1" });
  requireOutsideSurpriseMock.mockResolvedValue(null);
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
    expectAccessCheckedBeforeWrite(requireTripAccessMock, noteCreateMock);
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
    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan");
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
  // The old "looks up the note by id" test asserted the guard's own
  // db.note.findUnique({ where: { id } }) call shape — that lookup now lives
  // in requireRowAccess (lib/guards.ts, card C), which already covers it.
  // This file's requireRowAccessMock forwards to noteFindUniqueMock with no
  // args, so there is nothing of this module's own to assert here.

  it("calls requireTripAccess on the note's tripId", async () => {
    noteFindUniqueMock.mockResolvedValue({
      id: NOTE_ID,
      tripId: TRIP_ID,
      authorId: "user-1",
    });
    noteDeleteMock.mockResolvedValue({});

    await deleteNote(NOTE_ID);

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireRowAccessMock, noteDeleteMock);
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

    expect(revalidateTripMock).toHaveBeenCalledWith(TRIP_ID, "plan");
  });

  it("throws notFound when the note does not exist", async () => {
    noteFindUniqueMock.mockResolvedValue(null);
    await expect(deleteNote(NOTE_ID)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
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

// ---------------------------------------------------------------------------
// Surprise (CONTEXT.md): the write guard
// ---------------------------------------------------------------------------

describe("Surprise write guard", () => {
  it("refuses a surprised viewer before the write", async () => {
    noteFindUniqueMock.mockResolvedValue({ id: NOTE_ID, tripId: TRIP_ID, authorId: "user-2", targetType: "STOP", targetId: "stop-1" });
    requireOutsideSurpriseMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(deleteNote(NOTE_ID)).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireOutsideSurpriseMock).toHaveBeenCalledWith("user-1", {
      target: expect.objectContaining({ targetType: "STOP", targetId: "stop-1" }),
    });
    expect(noteDeleteMock).not.toHaveBeenCalled();
  });

  it("addNote refuses a target the caller is surprised by", async () => {
    // ARCH-TEN-9: an ITEM target now goes through requireRowAccess, which
    // runs the same Surprise check internally (lib/guards.ts surpriseRefFor)
    // — addNote no longer calls requireOutsideSurprise itself for this kind.
    requireRowAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(addNote(TRIP_ID, { targetType: "ITEM", targetId: "item-9", body: "Ooh" })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(requireRowAccessMock).toHaveBeenCalledWith("item", "item-9");
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("ARCH-TEN-9: addNote on a STOP target checks the Stop belongs to the Trip", async () => {
    requireRowAccessMock.mockResolvedValueOnce({ row: { id: "s1", tripId: "trip-OTHER" }, user: { id: "u1" }, membership: {}, surpriseOf: null });
    await expect(addNote("trip-1", { targetType: "STOP", targetId: "s1", body: "hi" } as never)).rejects.toThrow(/404/);
    expect(noteCreateMock).not.toHaveBeenCalled();
  });

  it("passes the Surprise root to the Activity record on delete", async () => {
    noteFindUniqueMock.mockResolvedValue({ id: NOTE_ID, tripId: TRIP_ID, authorId: "user-1", targetType: "ITEM", targetId: "item-1" });
    noteDeleteMock.mockResolvedValue({});
    requireOutsideSurpriseMock.mockResolvedValue({ type: "ITEM", id: "item-1" });

    await deleteNote(NOTE_ID);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "DELETED", entityType: "NOTE", surpriseOf: { type: "ITEM", id: "item-1" } }),
    );
  });
});
