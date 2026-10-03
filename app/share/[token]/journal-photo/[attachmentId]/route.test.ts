import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Task 20 (spec L / ADR 0051 amendment): a link-scoped Journal photo route —
// NO auth (Share links are public bearer URLs), and every one of these
// checks must 404 rather than leak a private attachment through by guessing
// its id:
//   1. the link doesn't exist, is revoked/rotated (token no longer matches),
//      or its includeJournal dial is off
//   2. the attachment isn't a JOURNAL photo of THIS link's trip
//   3. the day hasn't arrived yet (Trip-local "today", canWriteJournal)
//   4. the author's JournalEntry for that date is hiddenFromShares

const {
  shareFindFirstMock,
  attachmentFindUniqueMock,
  journalEntryFindUniqueMock,
  loadJournalWindowMock,
  serveAttachmentMock,
} = vi.hoisted(() => ({
  shareFindFirstMock: vi.fn(),
  attachmentFindUniqueMock: vi.fn(),
  journalEntryFindUniqueMock: vi.fn(),
  loadJournalWindowMock: vi.fn(),
  serveAttachmentMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    shareLink: { findFirst: shareFindFirstMock },
    attachment: { findUnique: attachmentFindUniqueMock },
    journalEntry: { findUnique: journalEntryFindUniqueMock },
  },
}));
vi.mock("@/lib/journal-window-loader", () => ({
  loadJournalWindow: loadJournalWindowMock,
}));
vi.mock("@/lib/attachment-serve", () => ({
  serveAttachment: serveAttachmentMock,
}));

import { GET } from "./route";

const TOKEN = "tok-1";
const TRIP_ID = "trip-1";
const ATTACHMENT_ID = "att-1";

function req() {
  return new NextRequest(`http://test.local/share/${TOKEN}/journal-photo/${ATTACHMENT_ID}`);
}

function callGET() {
  return GET(req(), { params: Promise.resolve({ token: TOKEN, attachmentId: ATTACHMENT_ID }) });
}

const shareLink = (over: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  includeJournal: true,
  ...over,
});

const attachment = (over: Partial<Record<string, unknown>> = {}) => ({
  id: ATTACHMENT_ID,
  tripId: TRIP_ID,
  targetType: "JOURNAL",
  targetId: "2026-09-27",
  uploadedById: "author-1",
  filename: "photo.jpg",
  mime: "image/jpeg",
  storageKey: "trips/trip-1/photo.jpg",
  ...over,
});

// Trip-local "today" is 2026-09-27, trip runs 2026-09-20..2026-09-30, so
// 2026-09-27 has arrived and 2026-09-28 has not.
const WINDOW = { startDate: "2026-09-20", endDate: "2026-09-30", today: "2026-09-27" };

beforeEach(() => {
  vi.clearAllMocks();
  shareFindFirstMock.mockResolvedValue(shareLink());
  attachmentFindUniqueMock.mockResolvedValue(attachment());
  journalEntryFindUniqueMock.mockResolvedValue(null);
  loadJournalWindowMock.mockResolvedValue(WINDOW);
  serveAttachmentMock.mockResolvedValue(new Response(null, { status: 302 }));
});

describe("GET /share/:token/journal-photo/:attachmentId", () => {
  it("404s when the link's includeJournal dial is off", async () => {
    shareFindFirstMock.mockResolvedValue(shareLink({ includeJournal: false }));
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s when the token doesn't match any link (revoked or rotated)", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  // ADR 0067 (Recently deleted): the link lookup itself excludes a Trip in
  // Recently deleted, same as an unknown token.
  it("looks the link up with a filter that excludes a Trip in Recently deleted", async () => {
    await callGET();
    expect(shareFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: TOKEN, trip: { deletedAt: null } } }),
    );
  });

  it("404s for a non-JOURNAL attachment (e.g. a ticket)", async () => {
    attachmentFindUniqueMock.mockResolvedValue(attachment({ targetType: "TRANSPORT" }));
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s when the attachment belongs to a different trip than the link", async () => {
    attachmentFindUniqueMock.mockResolvedValue(attachment({ tripId: "other-trip" }));
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s when the attachment doesn't exist", async () => {
    attachmentFindUniqueMock.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s for a non-image Journal upload (mime not starting with image/)", async () => {
    attachmentFindUniqueMock.mockResolvedValue(attachment({ mime: "application/pdf" }));
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s for a day that hasn't arrived yet (Trip-local today)", async () => {
    attachmentFindUniqueMock.mockResolvedValue(attachment({ targetId: "2026-09-28" }));
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
  });

  it("404s when the author's JournalEntry for that date is hiddenFromShares", async () => {
    journalEntryFindUniqueMock.mockResolvedValue({ hiddenFromShares: true });
    const res = await callGET();
    expect(res.status).toBe(404);
    expect(serveAttachmentMock).not.toHaveBeenCalled();
    expect(journalEntryFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_date_authorId: {
            tripId: TRIP_ID,
            date: "2026-09-27",
            authorId: "author-1",
          },
        },
      }),
    );
  });

  it("serves the photo when every check passes, even with no JournalEntry row (photo-only day)", async () => {
    journalEntryFindUniqueMock.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(302);
    expect(serveAttachmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: ATTACHMENT_ID, storageKey: "trips/trip-1/photo.jpg" }),
      // Shorter than the private route's default: a revoked/rotated link's
      // photos should drop out of a viewer's cache soon after.
      { cacheControl: "private, max-age=300" },
    );
  });

  it("serves the photo when the author's entry exists and is not hidden", async () => {
    journalEntryFindUniqueMock.mockResolvedValue({ hiddenFromShares: false });
    const res = await callGET();
    expect(res.status).toBe(302);
    expect(serveAttachmentMock).toHaveBeenCalled();
  });

  it("every 404 carries Cache-Control: no-store", async () => {
    shareFindFirstMock.mockResolvedValue(null);
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
