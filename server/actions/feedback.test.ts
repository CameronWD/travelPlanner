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
// Not from the action module: `toView` is a plain function, and a `"use
// server"` module may only export async ones. Exporting it from there for
// this test's benefit is what broke `next build`.
import { toView } from "@/lib/feedback-view";

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
  authorName: "Cam",
  status: "OPEN",
  authoredAt: new Date(input.authoredAt),
};

const otherRow = {
  id: "n2",
  body: "Someone else's note",
  route: "/trips/t1/budget",
  pageLabel: "Budget",
  tripName: "Europe Summer 2026",
  authorId: "u2",
  authorName: "Partner",
  status: "OPEN",
  authoredAt: new Date("2026-09-09T00:00:00.000Z"),
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
      authorName: "Cam",
      canDelete: true,
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

  it("records the server's site and ignores one sent by the client", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "beta");
    requireUserMock.mockResolvedValue(author);
    feedbackNoteUpsertMock.mockResolvedValue(row);

    await createFeedbackNote({ ...input, site: "main" } as never);

    expect(feedbackNoteUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ site: "beta" }) }),
    );
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

  it("never ships an authorId to the browser", async () => {
    // FN-04: authorId existed solely to gate the Delete control client-side.
    // Since ADR 0046 an Admin's client receives every author's notes, so that
    // was other Travellers' real user ids crossing the boundary for a boolean.
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindManyMock.mockResolvedValue([row, otherRow]);

    const result = await listFeedbackNotes();
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const note of result.notes) {
      expect(note).not.toHaveProperty("authorId");
    }
  });

  it("computes canDelete server-side: true for your own note, false for another's", async () => {
    requireUserMock.mockResolvedValue(author);
    feedbackNoteFindManyMock.mockResolvedValue([row, otherRow]);

    const result = await listFeedbackNotes();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.notes.map((n) => n.canDelete)).toContain(true);
    const other = result.notes.find((n) => n.id === "n2");
    expect(other?.canDelete).toBe(false);
  });
});

describe("toView", () => {
  it("shows the snapshotted author name", () => {
    const view = toView(
      {
        id: "f1",
        body: "b",
        route: "/r",
        pageLabel: "Home",
        tripName: null,
        authorId: "gone",
        authorName: "Cam",
        status: "OPEN",
        authoredAt: new Date("2026-09-21T00:00:00Z"),
      },
      "someone-else",
    );

    expect(view.authorName).toBe("Cam");
    expect(view.canDelete).toBe(false);
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
