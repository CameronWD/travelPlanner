import { describe, it, expect, vi, beforeEach } from "vitest";

const { journalEntryFindManyMock, attachmentFindManyMock } = vi.hoisted(() => ({
  journalEntryFindManyMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
  },
}));

const { loadTodaysJournal } = await import("./journal-loader");

describe("loadTodaysJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries entries and photos scoped to the trip and date", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);

    await loadTodaysJournal("trip-1", "2026-06-01", "me");

    expect(journalEntryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", date: "2026-06-01" } }),
    );
    expect(attachmentFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: "trip-1", targetType: "JOURNAL", targetId: "2026-06-01" },
      }),
    );
  });

  it("returns null mine/minePhoto and an empty others list when nobody has written today", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);

    const result = await loadTodaysJournal("trip-1", "2026-06-01", "me");

    expect(result).toEqual({ mine: null, minePhoto: null, others: [] });
  });

  it("splits my own entry/photo out from everyone else's", async () => {
    const updatedAt = new Date("2026-06-01T10:00:00Z");
    journalEntryFindManyMock.mockResolvedValue([
      {
        body: "My day",
        updatedAt,
        authorId: "me",
        hiddenFromShares: false,
        author: { id: "me", name: "Cam", image: null },
      },
      {
        body: "Their day",
        updatedAt,
        authorId: "them",
        hiddenFromShares: false,
        author: { id: "them", name: "Alex", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "photo-me",
        filename: "me.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-me",
        uploadedById: "me",
        createdAt: new Date("2026-06-01T09:00:00Z"),
        uploadedBy: { id: "me", name: "Cam", image: null },
      },
      {
        id: "photo-them",
        filename: "them.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-them",
        uploadedById: "them",
        createdAt: new Date("2026-06-01T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    const result = await loadTodaysJournal("trip-1", "2026-06-01", "me");

    expect(result.mine).toEqual({ body: "My day", updatedAt, hiddenFromShares: false });
    expect(result.minePhoto?.id).toBe("photo-me");
    expect(result.others).toHaveLength(1);
    expect(result.others[0].body).toBe("Their day");
    expect(result.others[0].photo?.id).toBe("photo-them");
    expect(result.others[0].traveller.id).toBe("them");
  });

  it("surfaces a co-Traveller who only added a photo (no note) as an 'other' with an empty body", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "photo-them",
        filename: "them.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-them",
        uploadedById: "them",
        createdAt: new Date("2026-06-01T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    const result = await loadTodaysJournal("trip-1", "2026-06-01", "me");

    expect(result.mine).toBeNull();
    expect(result.minePhoto).toBeNull();
    expect(result.others).toEqual([
      { traveller: { id: "them", name: "Alex", image: null }, body: "", photo: expect.objectContaining({ id: "photo-them" }) },
    ]);
  });

  it("never duplicates a co-Traveller who has both a note and a photo", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        body: "Their day",
        updatedAt: new Date("2026-06-01T10:00:00Z"),
        authorId: "them",
        hiddenFromShares: false,
        author: { id: "them", name: "Alex", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "photo-them",
        filename: "them.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-them",
        uploadedById: "them",
        createdAt: new Date("2026-06-01T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    const result = await loadTodaysJournal("trip-1", "2026-06-01", "me");

    expect(result.others).toHaveLength(1);
  });
});
