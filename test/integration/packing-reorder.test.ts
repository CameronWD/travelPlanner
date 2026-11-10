import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary (same pattern as lone-stop-rule.test.ts):
// reorderChecklistItem's raw `"ownerId" IS NOT DISTINCT FROM $n` runs against
// real Postgres, where a null parameter must still bind and match Shared rows.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { CHECKLIST_ITEM_ACTIVITY_SELECT } = await import("@/lib/checklists");
    const row = kind === "checklistItem"
      ? await db.checklistItem.findUnique({ where: { id }, select: CHECKLIST_ITEM_ACTIVITY_SELECT })
      : null;
    if (!row) throw new Error("NOT_FOUND");
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));

import { db } from "@/lib/db";
import { reorderChecklistItem } from "@/server/actions/checklists";

const TRIP_ID = "it-trip-packing-reorder";

async function sortOrders() {
  const rows = await db.checklistItem.findMany({ where: { tripId: TRIP_ID }, select: { text: true, sortOrder: true } });
  return Object.fromEntries(rows.map((r) => [r.text, r.sortOrder]));
}

describe.skipIf(process.env.INTEGRATION !== "1")("Shared Packing reorder against Postgres", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "Packing reorder IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
    await db.checklistItem.createMany({
      data: [
        { tripId: TRIP_ID, kind: "PACKING", text: "Shared A", ownerId: null, sortOrder: 0 },
        { tripId: TRIP_ID, kind: "PACKING", text: "Mine P", ownerId: "it-user", sortOrder: 1 },
        { tripId: TRIP_ID, kind: "PACKING", text: "Shared B", ownerId: null, sortOrder: 2 },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("swaps Shared rows past the personal row between them, and leaves the personal row alone", async () => {
    const b = await db.checklistItem.findFirstOrThrow({ where: { tripId: TRIP_ID, text: "Shared B" } });

    expect(await reorderChecklistItem(b.id, "up")).toEqual({ success: true });
    expect(await sortOrders()).toEqual({ "Shared B": 0, "Mine P": 1, "Shared A": 2 });

    expect(await reorderChecklistItem(b.id, "down")).toEqual({ success: true });
    expect(await sortOrders()).toEqual({ "Shared A": 0, "Mine P": 1, "Shared B": 2 });
  });
});
