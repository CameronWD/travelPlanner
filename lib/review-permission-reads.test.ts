import { beforeEach, describe, expect, it, vi } from "vitest";

const { reviewFindManyMock, userFindUniqueMock, queryRawMock } = vi.hoisted(() => ({
  reviewFindManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  queryRawMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { review: { findMany: reviewFindManyMock }, user: { findUnique: userFindUniqueMock }, $queryRaw: queryRawMock },
}));

import { countedReviewStarts, loadReviewStanding } from "@/lib/review-permission-reads";

const NOW = new Date("2026-10-18T10:00:00.000Z");
const H = 3_600_000;

beforeEach(() => vi.clearAllMocks());

describe("countedReviewStarts", () => {
  it("asks for DONE, or RUNNING started within the last 15 minutes, since `since`, oldest first", async () => {
    reviewFindManyMock.mockResolvedValue([{ startedAt: new Date(NOW.getTime() - 2 * H) }]);
    const since = new Date(NOW.getTime() - 7 * 24 * H);
    expect(await countedReviewStarts("u1", since, { now: NOW })).toEqual([new Date(NOW.getTime() - 2 * H)]);
    expect(reviewFindManyMock).toHaveBeenCalledWith({
      where: {
        startedById: "u1",
        startedAt: { gt: since },
        OR: [{ status: "DONE" }, { status: "RUNNING", startedAt: { gt: new Date(NOW.getTime() - 15 * 60_000) } }],
      },
      select: { startedAt: true },
      orderBy: { startedAt: "asc" },
    });
  });
});

describe("loadReviewStanding", () => {
  it("Limited at the daily cap: canRun false with the next moment", async () => {
    userFindUniqueMock.mockResolvedValue({ reviewPermission: "LIMITED" });
    reviewFindManyMock.mockResolvedValue([{ startedAt: new Date(NOW.getTime() - 5 * H) }]);
    expect(await loadReviewStanding("u1", { now: NOW })).toEqual({
      permission: "LIMITED",
      canRun: false,
      nextAvailableAt: new Date(NOW.getTime() + 19 * H),
    });
  });

  it("Off and Unlimited never read the runs", async () => {
    userFindUniqueMock.mockResolvedValue({ reviewPermission: "OFF" });
    expect(await loadReviewStanding("u1", { now: NOW })).toEqual({ permission: "OFF", canRun: false, nextAvailableAt: null });
    userFindUniqueMock.mockResolvedValue({ reviewPermission: "UNLIMITED" });
    expect(await loadReviewStanding("u1", { now: NOW })).toEqual({ permission: "UNLIMITED", canRun: true, nextAvailableAt: null });
    expect(reviewFindManyMock).not.toHaveBeenCalled();
  });

  it("a missing account is OFF", async () => {
    userFindUniqueMock.mockResolvedValue(null);
    expect(await loadReviewStanding("gone", { now: NOW })).toEqual({ permission: "OFF", canRun: false, nextAvailableAt: null });
  });

  it("forUpdate reads the permission with a row lock through the given client", async () => {
    const tx = { review: { findMany: vi.fn().mockResolvedValue([]) }, user: { findUnique: vi.fn() }, $queryRaw: vi.fn().mockResolvedValue([{ reviewPermission: "LIMITED" }]) };
    expect(await loadReviewStanding("u1", { now: NOW, client: tx as never, forUpdate: true })).toEqual({
      permission: "LIMITED",
      canRun: true,
      nextAvailableAt: null,
    });
    const [strings] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join("?")).toMatch(/FROM "User"\s+WHERE "id" = \?\s+FOR UPDATE/);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.review.findMany).toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("forUpdate without a transaction client throws a clear error, and reads nothing", async () => {
    await expect(loadReviewStanding("u1", { now: NOW, forUpdate: true })).rejects.toThrow(/forUpdate needs the transaction's client/);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });
});
