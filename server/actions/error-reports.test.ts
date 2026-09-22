import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the /admin Errors section's server actions (Task 17,
 * ARCH-OBS-2). `@/lib/guards` is mocked directly (requireAdmin stubbed) —
 * same convention as access-requests.test.ts: the guard's own branching is
 * covered by lib/guards.test.ts, this file only proves each action calls it
 * FIRST and respects its answer.
 */

const {
  requireAdminMock,
  errorReportFindManyMock,
  errorReportDeleteManyMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  errorReportFindManyMock: vi.fn(),
  errorReportDeleteManyMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    errorReport: {
      findMany: errorReportFindManyMock,
      deleteMany: errorReportDeleteManyMock,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { listErrorReports, clearErrorReport, clearAllErrorReports } from "./error-reports";

afterEach(() => vi.clearAllMocks());

const ROW = {
  id: "e1",
  signature: "sig1",
  message: "boom",
  stack: "at Foo",
  route: "/trips/t1",
  source: "client",
  userId: "u1",
  digest: "d1",
  count: 3,
  firstSeen: new Date("2026-09-01T00:00:00.000Z"),
  lastSeen: new Date("2026-09-20T00:00:00.000Z"),
};

describe("listErrorReports", () => {
  it("requires admin before touching the database", async () => {
    requireAdminMock.mockRejectedValue(new Error("not admin"));
    await expect(listErrorReports()).rejects.toThrow("not admin");
    expect(errorReportFindManyMock).not.toHaveBeenCalled();
  });

  it("lists rows ordered by lastSeen desc", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportFindManyMock.mockResolvedValue([ROW]);

    const result = await listErrorReports();

    expect(errorReportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastSeen: "desc" } }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "e1",
        signature: "sig1",
        message: "boom",
        route: "/trips/t1",
        source: "client",
        count: 3,
        firstSeen: ROW.firstSeen.toISOString(),
        lastSeen: ROW.lastSeen.toISOString(),
      }),
    ]);
  });

  // I1 (fix round 1): ErrorReport is the one table designed to grow, and
  // clearing was per-row only until clearAllErrorReports below — an
  // unbounded `findMany` here means the one cleanup surface fails exactly
  // when the table is largest, leaving raw SQL as the only recovery path.
  it("I1: caps the query at 200 rows", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportFindManyMock.mockResolvedValue([]);

    await listErrorReports();

    expect(errorReportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

describe("clearErrorReport", () => {
  it("requires admin before deleting", async () => {
    requireAdminMock.mockRejectedValue(new Error("not admin"));
    await expect(clearErrorReport("e1")).rejects.toThrow("not admin");
    expect(errorReportDeleteManyMock).not.toHaveBeenCalled();
  });

  // M2 (fix round 1): was findUnique + delete — two round trips, and the
  // second one throws P2025 (record not found) when another admin tab wins
  // a race to clear the same row first. clearErrorReport's caller
  // (ErrorReportsPanel.handleClear) has no try/catch, so that throw left
  // `pendingId` stuck set and the Clear button spinning forever.
  // `deleteMany` is atomic and a no-op (matches zero rows) rather than an
  // error when the row is already gone — one round trip, no failure mode
  // to leave a caller mid-state.
  it("M2: deletes via deleteMany (atomic, no-op-safe) and revalidates /admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportDeleteManyMock.mockResolvedValue({ count: 1 });

    const result = await clearErrorReport("e1");

    expect(errorReportDeleteManyMock).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(result.success).toBe(true);
  });

  it("M2: is a no-op success when the row is already gone (zero rows matched, no throw)", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportDeleteManyMock.mockResolvedValue({ count: 0 });

    const result = await clearErrorReport("gone");

    expect(result.success).toBe(true);
  });
});

describe("clearAllErrorReports", () => {
  it("requires admin before deleting", async () => {
    requireAdminMock.mockRejectedValue(new Error("not admin"));
    await expect(clearAllErrorReports()).rejects.toThrow("not admin");
    expect(errorReportDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes every row and revalidates /admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportDeleteManyMock.mockResolvedValue({ count: 42 });

    const result = await clearAllErrorReports();

    expect(errorReportDeleteManyMock).toHaveBeenCalledWith({});
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(result.success).toBe(true);
  });
});
