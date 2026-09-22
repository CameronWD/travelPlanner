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
  errorReportFindUniqueMock,
  errorReportDeleteMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  errorReportFindManyMock: vi.fn(),
  errorReportFindUniqueMock: vi.fn(),
  errorReportDeleteMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    errorReport: {
      findMany: errorReportFindManyMock,
      findUnique: errorReportFindUniqueMock,
      delete: errorReportDeleteMock,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { listErrorReports, clearErrorReport } from "./error-reports";

afterEach(() => vi.clearAllMocks());

const ROW = {
  id: "e1",
  signature: "sig1",
  message: "boom",
  stack: "at Foo",
  route: "/trips/t1",
  source: "client",
  userId: "u1",
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
});

describe("clearErrorReport", () => {
  it("requires admin before deleting", async () => {
    requireAdminMock.mockRejectedValue(new Error("not admin"));
    await expect(clearErrorReport("e1")).rejects.toThrow("not admin");
    expect(errorReportDeleteMock).not.toHaveBeenCalled();
  });

  it("deletes the row and revalidates /admin", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportFindUniqueMock.mockResolvedValue(ROW);

    const result = await clearErrorReport("e1");

    expect(errorReportDeleteMock).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(result.success).toBe(true);
  });

  it("is a no-op success when the row is already gone", async () => {
    requireAdminMock.mockResolvedValue({ id: "admin1", email: "a@x.com" });
    errorReportFindUniqueMock.mockResolvedValue(null);

    const result = await clearErrorReport("gone");

    expect(errorReportDeleteMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
