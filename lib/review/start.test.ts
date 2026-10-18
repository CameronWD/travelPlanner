import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  transaction: vi.fn(), queryRaw: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), loadReviewStanding: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: m.transaction } }));
vi.mock("@/lib/review-permission-reads", () => ({ loadReviewStanding: m.loadReviewStanding }));

import { REVIEW_STALE_AFTER_MS } from "@/lib/review-permission";
import { REVIEW_MESSAGES } from "./messages";
import { beginReview } from "./start";

const tx = { $queryRaw: m.queryRaw, review: { updateMany: m.updateMany, findFirst: m.findFirst, create: m.create } };
const NOW = new Date("2026-10-18T09:00:00Z");
const HOUR = 60 * 60 * 1000;
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();
const as = (permission: string, canRun = permission !== "OFF", nextAvailableAt: Date | null = null) =>
  m.loadReviewStanding.mockResolvedValue({ permission, canRun, nextAvailableAt });
const begin = () => beginReview("u1", "trip-1", "DEEP", "claude-opus-5", NOW);

beforeEach(() => {
  vi.resetAllMocks();
  m.transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  m.queryRaw.mockResolvedValue([{ id: "x" }]);
  m.updateMany.mockResolvedValue({ count: 0 });
  m.findFirst.mockResolvedValue(null);
  m.create.mockResolvedValue({ id: "rev-1" });
});

describe("beginReview (spec 2026-10-17 R12)", () => {
  it("locks the starter's User row, then the Trip row, before reading or writing anything", async () => {
    as("UNLIMITED");
    await begin();
    expect(sqlOf(m.queryRaw.mock.calls[0])).toBe('SELECT "id" FROM "User" WHERE "id" = ? FOR UPDATE');
    expect(m.queryRaw.mock.calls[0].slice(1)).toEqual(["u1"]);
    expect(sqlOf(m.queryRaw.mock.calls[1])).toBe('SELECT "id" FROM "Trip" WHERE "id" = ? FOR NO KEY UPDATE');
    expect(m.queryRaw.mock.calls[1].slice(1)).toEqual(["trip-1"]);
    expect(m.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(m.updateMany.mock.invocationCallOrder[0]);
  });

  it("inside the lock, first marks stale RUNNING rows, this Trip's and this account's, FAILED", async () => {
    as("LIMITED");
    await begin();
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { status: "RUNNING", startedAt: { lte: new Date(NOW.getTime() - REVIEW_STALE_AFTER_MS) }, OR: [{ tripId: "trip-1" }, { startedById: "u1" }] },
      data: { status: "FAILED", error: REVIEW_MESSAGES.stale, finishedAt: NOW },
    });
    expect(m.updateMany.mock.invocationCallOrder[0]).toBeLessThan(m.loadReviewStanding.mock.invocationCallOrder[0]);
    expect(m.updateMany.mock.invocationCallOrder[0]).toBeLessThan(m.findFirst.mock.invocationCallOrder[0]);
  });

  it("then reads the permission and the counted runs on the transaction, under the User lock", async () => {
    as("LIMITED");
    await begin();
    expect(m.loadReviewStanding).toHaveBeenCalledWith("u1", { now: NOW, client: tx, forUpdate: true });
  });

  it("writes the RUNNING row with the kind, the model and the start", async () => {
    as("UNLIMITED");
    expect(await begin()).toEqual({ kind: "started", reviewId: "rev-1" });
    expect(m.create).toHaveBeenCalledWith({
      data: { tripId: "trip-1", startedById: "u1", kind: "DEEP", model: "claude-opus-5", status: "RUNNING", startedAt: NOW },
      select: { id: true },
    });
  });

  it("Off refuses and writes no Review", async () => {
    as("OFF");
    expect(await begin()).toEqual({ kind: "off" });
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("Limited at its cap: refused, with when the next run frees up", async () => {
    const next = new Date(NOW.getTime() + 22 * HOUR);
    as("LIMITED", false, next);
    expect(await begin()).toEqual({ kind: "limit", nextAvailableAt: next });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("refuses while another Review runs on the Trip, naming who started it", async () => {
    as("UNLIMITED");
    m.findFirst.mockResolvedValue({ startedById: "u2" });
    expect(await begin()).toEqual({ kind: "running", startedById: "u2" });
    expect(m.findFirst).toHaveBeenCalledWith({ where: { tripId: "trip-1", status: "RUNNING" }, select: { startedById: true } });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("a running Review whose starter's account is gone still blocks the Trip", async () => {
    as("UNLIMITED");
    m.findFirst.mockResolvedValue({ startedById: null });
    expect(await begin()).toEqual({ kind: "running", startedById: null });
  });
});
