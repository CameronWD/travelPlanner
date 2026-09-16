import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for Feedback note server actions.
 *
 * Mocks: lib/db, lib/guards
 */
const {
  requireUserMock,
  feedbackNoteUpsertMock,
  feedbackNoteFindManyMock,
  feedbackNoteFindUniqueMock,
  feedbackNoteDeleteMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  feedbackNoteUpsertMock: vi.fn(),
  feedbackNoteFindManyMock: vi.fn(),
  feedbackNoteFindUniqueMock: vi.fn(),
  feedbackNoteDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    feedbackNote: {
      upsert: feedbackNoteUpsertMock,
      findMany: feedbackNoteFindManyMock,
      findUnique: feedbackNoteFindUniqueMock,
      delete: feedbackNoteDeleteMock,
    },
  },
}));

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
}));

import {
  createFeedbackNote,
  deleteFeedbackNote,
  listFeedbackNotes,
} from "@/server/actions/feedback";

const author = { id: "u1", name: "Cam" };

const input = {
  clientKey: "fk_1",
  body: "Drag is fiddly on a phone",
  route: "/trips/t1/plan",
  pageLabel: "Plan editor",
  tripId: "t1",
  tripName: "Europe Summer 2026",
  viewport: "390x844",
  userAgent: "iPhone",
  authoredAt: "2026-09-08T04:05:06.000Z",
};

const row = {
  id: "n1",
  body: input.body,
  route: input.route,
  pageLabel: input.pageLabel,
  tripName: input.tripName,
  authorId: "u1",
  status: "OPEN",
  authoredAt: new Date(input.authoredAt),
  author: { name: "Cam" },
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("createFeedbackNote", () => {
  it("stores the note and returns a serialisable view", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteUpsertMock.mockResolvedValue(row);

    const result = await createFeedbackNote(input);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.note).toEqual({
      id: "n1",
      body: "Drag is fiddly on a phone",
      route: "/trips/t1/plan",
      pageLabel: "Plan editor",
      tripName: "Europe Summer 2026",
      authorId: "u1",
      authorName: "Cam",
      status: "OPEN",
      authoredAt: "2026-09-08T04:05:06.000Z",
    });
  });

  it("upserts on clientKey so a replayed offline flush cannot duplicate", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteUpsertMock.mockResolvedValue(row);

    await createFeedbackNote(input);

    const args = feedbackNoteUpsertMock.mock.calls[0][0];
    expect(args.where).toEqual({ clientKey: "fk_1" });
    expect(args.update).toEqual({});
    expect(args.create.authorId).toBe("u1");
    expect(args.create.authoredAt).toEqual(new Date(input.authoredAt));
  });

  it("rejects an empty body without touching the database", async () => {
    requireUserMock.mockResolvedValue(author);

    const result = await createFeedbackNote({ ...input, body: "  " });

    expect(result.success).toBe(false);
    expect(feedbackNoteUpsertMock).not.toHaveBeenCalled();
  });
});

describe("listFeedbackNotes", () => {
  it("returns only the caller's own notes, oldest first", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindManyMock.mockResolvedValue([row]);

    const result = await listFeedbackNotes();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].authorName).toBe("Cam");
    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toEqual({
      authorId: "u1",
    });
    expect(feedbackNoteFindManyMock.mock.calls[0][0].orderBy).toEqual({
      authoredAt: "asc",
    });
  });

  it("returns every author's notes to an Admin (ADMIN_EMAILS match)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "operator@example.com");
    requireUserMock.mockResolvedValue({
      ...author,
      email: "Operator@Example.com", // case-insensitive match is part of the contract
    });
    feedbackNoteFindManyMock.mockResolvedValue([row]);

    const result = await listFeedbackNotes();

    expect(result.success).toBe(true);
    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toBeUndefined();
  });

  it("does not treat a signed-in non-admin as an Admin when ADMIN_EMAILS is set", async () => {
    vi.stubEnv("ADMIN_EMAILS", "operator@example.com");
    requireUserMock.mockResolvedValue({ ...author, email: "sister@example.com" });
    feedbackNoteFindManyMock.mockResolvedValue([]);

    await listFeedbackNotes();

    expect(feedbackNoteFindManyMock.mock.calls[0][0].where).toEqual({
      authorId: "u1",
    });
  });
});

describe("deleteFeedbackNote", () => {
  it("deletes the caller's own note", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindUniqueMock.mockResolvedValue({ id: "n1", authorId: "u1" });

    const result = await deleteFeedbackNote("n1");

    expect(result.success).toBe(true);
    expect(feedbackNoteDeleteMock).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("refuses to delete another traveller's note", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindUniqueMock.mockResolvedValue({ id: "n1", authorId: "u2" });

    const result = await deleteFeedbackNote("n1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors._form).toBeDefined();
    expect(feedbackNoteDeleteMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the note is already gone", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindUniqueMock.mockResolvedValue(null);

    const result = await deleteFeedbackNote("missing");

    expect(result.success).toBe(false);
    expect(feedbackNoteDeleteMock).not.toHaveBeenCalled();
  });
});
