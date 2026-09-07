import { describe, expect, it, vi } from "vitest";
import { deleteOwnedCostsTx, type DeletedCostOwner } from "./owned-costs";
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
      select: { id: true, paidMinor: true, paidAt: true, label: true, ownerType: true, ownerId: true },
    });
    const empty = await deleteOwnedCostsTx(tx, "trip-1", []);
    expect(empty).toEqual({ deleted: 0, converted: 0 });
  });
});
