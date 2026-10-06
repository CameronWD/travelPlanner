import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany, reconcile, order } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    findMany: vi.fn<(args: unknown) => Promise<never[]>>(async () => { order.push("read"); return []; }),
    reconcile: vi.fn(async () => { order.push("reconcile"); }),
  };
});
vi.mock("@/lib/db", () => ({ db: { tripMember: { findMany } } }));
vi.mock("@/lib/reconcile-invites", () => ({ reconcilePendingInvites: reconcile }));

import { readMemberTrips } from "./membership-reads";

beforeEach(() => { vi.clearAllMocks(); order.length = 0; });

describe("readMemberTrips (spec 2026-10-06 §C)", () => {
  it("reconciles Invites before reading, so a just-accepted Trip is listed", async () => {
    await readMemberTrips("u1", "alice@example.com");
    expect(reconcile).toHaveBeenCalledWith("u1", "alice@example.com");
    expect(order).toEqual(["reconcile", "read"]);
  });
  it("skips the reconcile without an address", async () => {
    await readMemberTrips("u1", null);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("reads the viewer's live Trips with what the switcher and the hue need", async () => {
    await readMemberTrips("u1", null);
    const args = findMany.mock.calls[0][0] as { where: unknown; include: { trip: { select: Record<string, unknown> } }; orderBy: unknown };
    expect(args.where).toEqual({ userId: "u1", trip: { deletedAt: null } });
    expect(args.include.trip.select).toMatchObject({ id: true, name: true, slug: true, startDate: true, endDate: true, createdAt: true });
    expect(args.orderBy).toEqual({ trip: { createdAt: "desc" } });
  });
});
