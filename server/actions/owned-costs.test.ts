import { describe, expect, it, vi } from "vitest";
import { deleteOwnedCostsTx, deleteRefundsProblemTx, type DeletedCostOwner } from "./owned-costs";
import { REFUND_MESSAGES } from "@/lib/money/refund";
import type { Prisma } from "@prisma/client";

function makeTx(costs: Array<Record<string, unknown>>) {
  const findMany = vi.fn().mockResolvedValue(costs);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const update = vi.fn().mockResolvedValue({});
  const tx = { cost: { findMany, deleteMany, update } } as unknown as Prisma.TransactionClient;
  return { tx, findMany, deleteMany, update };
}

const owner: DeletedCostOwner = { type: "ACCOMMODATION", id: "acc-1", label: "Hotel Lisboa" };

describe("deleteOwnedCostsTx", () => {
  it("deletes unpaid costs (no paidMinor, no paidAt)", async () => {
    const { tx, deleteMany } = makeTx([
      { id: "c1", paidMinor: null, paidAt: null, label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    ]);
    const result = await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(result).toEqual({ deleted: 1, converted: 0 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["c1"] } } });
  });

  it("converts a paid cost to an Other cost labelled after the owner", async () => {
    const { tx, update } = makeTx([
      { id: "c2", paidMinor: 8000, paidAt: new Date("2026-06-01"), label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    ]);
    const result = await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(result).toEqual({ deleted: 0, converted: 1 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { ownerType: "OTHER", ownerId: null, label: "Hotel Lisboa (deleted)" },
    });
  });

  it("treats paidMinor-without-paidAt (legacy rows) as paid — converts, never deletes", async () => {
    const { tx, update, deleteMany } = makeTx([
      { id: "c3", paidMinor: 500, paidAt: null, label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    ]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(update).toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("prefers the cost's own label when it has one", async () => {
    const { tx, update } = makeTx([
      { id: "c4", paidMinor: 100, paidAt: null, label: "Deposit", ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    ]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(update).toHaveBeenCalledWith({
      where: { id: "c4" },
      data: { ownerType: "OTHER", ownerId: null, label: "Deposit (deleted)" },
    });
  });

  it("queries costs scoped to the trip and the owner pairs, and no-ops on empty owners", async () => {
    const { tx, findMany } = makeTx([]);
    await deleteOwnedCostsTx(tx, "trip-1", [owner]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip-1",
        OR: [{ ownerType: "ACCOMMODATION", ownerId: { in: ["acc-1"] } }],
      },
      select: { id: true, paidMinor: true, paidAt: true, refundMinor: true, label: true, ownerType: true, ownerId: true },
    });
    const empty = await deleteOwnedCostsTx(tx, "trip-1", []);
    expect(empty).toEqual({ deleted: 0, converted: 0 });
  });

  describe("with refund answers", () => {
    const paid = { id: "c2", paidMinor: 20000, paidAt: new Date("2026-06-01"), label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" };

    it("a received answer converts the cost with the refund and a (cancelled) label", async () => {
      const { tx, update } = makeTx([paid]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "c2", refundMinor: 15000, refundedAt: "2026-07-02" }]);
      expect(update).toHaveBeenCalledWith({
        where: { id: "c2" },
        data: {
          ownerType: "OTHER",
          ownerId: null,
          label: "Hotel Lisboa (cancelled)",
          costMinor: 20000,
          refundMinor: 15000,
          refundedAt: new Date("2026-07-02"),
        },
      });
    });

    it("an expected answer stores no date", async () => {
      const { tx, update } = makeTx([paid]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "c2", refundMinor: 15000, refundedAt: null }]);
      expect(update).toHaveBeenCalledWith({
        where: { id: "c2" },
        data: { ownerType: "OTHER", ownerId: null, label: "Hotel Lisboa (cancelled)", costMinor: 20000, refundMinor: 15000, refundedAt: null },
      });
    });

    it("a cost with no answer keeps today's (deleted) conversion", async () => {
      const { tx, update } = makeTx([paid]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "other", refundMinor: 1, refundedAt: null }]);
      expect(update).toHaveBeenCalledWith({
        where: { id: "c2" },
        data: { ownerType: "OTHER", ownerId: null, label: "Hotel Lisboa (deleted)" },
      });
    });

    it("leaves a refund already on the cost alone, labels it (cancelled) and counts only what was paid", async () => {
      const { tx, update } = makeTx([{ ...paid, refundMinor: 5000, refundedAt: null }]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], []);
      const data = update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("refundMinor");
      expect(data).not.toHaveProperty("refundedAt");
      expect(data.label).toBe("Hotel Lisboa (cancelled)");
      expect(data.costMinor).toBe(20000);
    });

    it("a converted cost with no answer and no refund gets no costMinor", async () => {
      const { tx, update } = makeTx([paid]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], []);
      expect(update.mock.calls[0][0].data).not.toHaveProperty("costMinor");
    });

    it("an answer sets costMinor to what was paid, even when that is more than the cost was", async () => {
      const { tx, update } = makeTx([{ ...paid, paidMinor: 226400 }]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "c2", refundMinor: 100000, refundedAt: "2026-07-02" }]);
      expect(update.mock.calls[0][0].data.costMinor).toBe(226400);
    });

    it("a partly paid cost fully refunded counts only the deposit", async () => {
      const { tx, update } = makeTx([{ ...paid, paidMinor: 50000 }]);
      await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "c2", refundMinor: 50000, refundedAt: "2026-07-02" }]);
      const data = update.mock.calls[0][0].data;
      expect(data.costMinor).toBe(50000);
      expect(data.refundMinor).toBe(50000);
    });

    it("still deletes the owner's unpaid costs", async () => {
      const { tx, update, deleteMany } = makeTx([
        paid,
        { id: "c9", paidMinor: null, paidAt: null, label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
      ]);
      const result = await deleteOwnedCostsTx(tx, "trip-1", [owner], [{ costId: "c2", refundMinor: 100, refundedAt: null }]);
      expect(result).toEqual({ deleted: 1, converted: 1 });
      expect(update).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["c9"] } } });
    });
  });
});

describe("deleteRefundsProblemTx", () => {
  const paid = { id: "c2", paidMinor: 20000, paidAt: new Date("2026-06-01") };
  const run = (costs: Array<Record<string, unknown>>, refunds: Parameters<typeof deleteRefundsProblemTx>[3]) => {
    const { tx, findMany } = makeTx(costs);
    return { promise: deleteRefundsProblemTx(tx, "trip-1", owner, refunds), findMany };
  };

  it("is null with no answers and never queries", async () => {
    const { promise, findMany } = run([], []);
    expect(await promise).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is null for a valid answer, looked up by owner", async () => {
    const { promise, findMany } = run([paid], [{ costId: "c2", refundMinor: 20000, refundedAt: null }]);
    expect(await promise).toBeNull();
    expect(findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", ownerType: "ACCOMMODATION", ownerId: "acc-1", id: { in: ["c2"] } },
      select: { id: true, paidMinor: true, paidAt: true },
    });
  });

  it("refuses a cost that is not this owner's", async () => {
    const { promise } = run([paid], [{ costId: "not-mine", refundMinor: 100, refundedAt: null }]);
    expect(await promise).toBe(REFUND_MESSAGES.notThisThing);
  });

  it("refuses more than was paid", async () => {
    const { promise } = run([paid], [{ costId: "c2", refundMinor: 25000, refundedAt: null }]);
    expect(await promise).toBe(REFUND_MESSAGES.tooMuch);
  });

  it("refuses a cost that is not currently paid", async () => {
    const { promise } = run([{ id: "c2", paidMinor: 20000, paidAt: null }], [{ costId: "c2", refundMinor: 100, refundedAt: null }]);
    expect(await promise).toBe(REFUND_MESSAGES.notPaid);
  });

  it("refuses two answers for one cost", async () => {
    const { promise } = run([paid], [
      { costId: "c2", refundMinor: 100, refundedAt: null },
      { costId: "c2", refundMinor: 200, refundedAt: null },
    ]);
    expect(await promise).toBe(REFUND_MESSAGES.duplicateAnswer);
  });

  it("refuses a date that is not a date", async () => {
    const { promise } = run([paid], [{ costId: "c2", refundMinor: 100, refundedAt: "soon" }]);
    expect(await promise).toBe(REFUND_MESSAGES.dateNeeded);
  });
});
