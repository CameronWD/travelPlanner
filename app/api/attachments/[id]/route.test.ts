import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/attachments/:id — the Surprise gate (CONTEXT.md "Surprise", ADR
 * 0051). A file inside a live Surprise is refused to a surprised Traveller
 * exactly as to a non-member (notFound); its planner still gets the bytes.
 * The real lib/surprise-guard runs over a mocked db, so the route is pinned
 * to the actual rule, not to a stub of it. Caching and presign behaviour are
 * covered by app/api/serve-route-caching.test.ts.
 */

const {
  requireUserMock,
  requireTripAccessMock,
  requireGlobeAccessMock,
  attachmentFindUniqueMock,
  stopFindUniqueMock,
  storageReadMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  requireTripAccessMock: vi.fn(),
  requireGlobeAccessMock: vi.fn(),
  attachmentFindUniqueMock: vi.fn(),
  stopFindUniqueMock: vi.fn(),
  storageReadMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock, requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: requireGlobeAccessMock }));
vi.mock("@/lib/db", () => ({
  db: {
    attachment: { findUnique: attachmentFindUniqueMock },
    stop: { findUnique: stopFindUniqueMock },
  },
}));
vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    getStorage: vi.fn(() => ({
      save: vi.fn(),
      delete: vi.fn(),
      read: storageReadMock,
      presignDownload: vi.fn().mockResolvedValue(null),
    })),
  };
});

import { GET } from "./route";

const PLANNER = "u-planner";
const SURPRISED = "u-surprised";

const FILE_IN_SECRET_STOP = {
  id: "a1",
  tripId: "t1",
  globeId: null,
  targetType: "STOP",
  targetId: "s-secret",
  filename: "tickets.pdf",
  mime: "application/pdf",
  storageKey: "trips/t1/tickets.pdf",
};

const SECRET_STOP = {
  id: "s-secret",
  departDate: "2099-01-10", // live: the auto-reveal is far off
  timezone: "UTC",
  surprisePlannerId: PLANNER,
  surpriseForIds: JSON.stringify([SURPRISED]),
  surpriseRevealedAt: null,
};

function as(userId: string) {
  requireUserMock.mockResolvedValue({ id: userId });
  requireTripAccessMock.mockResolvedValue({ user: { id: userId }, membership: { role: "member" } });
}

function get() {
  return GET(new NextRequest("http://test.local/api/attachments/a1"), { params: Promise.resolve({ id: "a1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  attachmentFindUniqueMock.mockResolvedValue(FILE_IN_SECRET_STOP);
  stopFindUniqueMock.mockResolvedValue(SECRET_STOP);
  storageReadMock.mockResolvedValue(Buffer.from("pdf"));
});

describe("GET /api/attachments/:id — Surprise", () => {
  it("reads the attachment's target so the gate can find its Surprise", async () => {
    as(PLANNER);
    await get();
    expect(attachmentFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "a1" },
      select: expect.objectContaining({ targetType: true, targetId: true }),
    });
  });

  it("refuses a surprised Traveller with notFound, after the Trip access check, without reading the bytes", async () => {
    as(SURPRISED);
    await expect(get()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireTripAccessMock).toHaveBeenCalledWith("t1");
    expect(stopFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s-secret" } }));
    expect(storageReadMock).not.toHaveBeenCalled();
  });

  it("serves the planner the file", async () => {
    as(PLANNER);
    const res = await get();
    expect(res.status).toBe(200);
    expect(storageReadMock).toHaveBeenCalledWith("trips/t1/tickets.pdf");
  });

  it("serves a Traveller the Surprise is not for", async () => {
    as("u-other");
    const res = await get();
    expect(res.status).toBe(200);
  });

  it("a Globe attachment skips the Trip and Surprise checks", async () => {
    as(SURPRISED);
    attachmentFindUniqueMock.mockResolvedValue({ ...FILE_IN_SECRET_STOP, tripId: null, globeId: "g1", targetType: "MARKER", targetId: "m1" });
    requireGlobeAccessMock.mockResolvedValue({ globe: { id: "g1" } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(requireTripAccessMock).not.toHaveBeenCalled();
    expect(stopFindUniqueMock).not.toHaveBeenCalled();
  });
});
