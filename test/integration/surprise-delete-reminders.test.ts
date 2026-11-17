import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock ONLY the Next/auth boundary; the real delete actions run against the
// real Postgres. `surprises` stands in for the Surprise guard's verdict.
const surprises = vi.hoisted(() => new Set<string>());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-sdr-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-sdr-user" }, membership: { role: "owner" } })),
  requireRowAccess: vi.fn(async (kind: "stop" | "item", id: string) => {
    const { db } = await import("@/lib/db");
    const row = kind === "stop" ? await db.stop.findUnique({ where: { id } }) : await db.item.findUnique({ where: { id } });
    if (!row) throw new Error("NOT_FOUND");
    const surpriseOf = surprises.has(id) ? { type: kind === "stop" ? "STOP" : "ITEM", id } : null;
    return { row, user: { id: "it-sdr-user" }, membership: { role: "owner" }, surpriseOf };
  }),
}));

import { db } from "@/lib/db";
import { deleteItem } from "@/server/actions/items";
import { deleteStop } from "@/server/actions/stops";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

const TRIP_ID = "it-sdr-trip";

describe.skipIf(process.env.INTEGRATION !== "1")("deleting a Surprise takes its Reminders (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-sdr-user" }, update: {}, create: { id: "it-sdr-user", email: "sdr@example.test", name: "SDR" } });
    await db.user.upsert({ where: { id: "it-sdr-other" }, update: {}, create: { id: "it-sdr-other", email: "sdr-other@example.test", name: "SDR Other" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Surprise delete", homeCurrency: "AUD", createdById: "it-sdr-user",
        members: { create: [{ userId: "it-sdr-user", role: "owner" }, { userId: "it-sdr-other", role: "member" }] },
      },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("a Surprise Item's Reminders go with it", async () => {
    const item = await db.item.create({ data: { tripId: TRIP_ID, title: "IT Ring box", category: "SHOPPING" } });
    const other = await db.item.create({ data: { tripId: TRIP_ID, title: "IT Plain", category: "OTHER" } });
    await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Ring box at the jeweller", date: "2027-01-05", itemId: item.id } });
    const keep = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Plain reminder", date: "2027-01-05", itemId: other.id } });
    surprises.add(item.id);

    expect((await deleteItem(item.id)).success).toBe(true);

    expect(await db.reminder.count({ where: { tripId: TRIP_ID, title: "IT Ring box at the jeweller" } })).toBe(0);
    expect(await db.reminder.findUnique({ where: { id: keep.id } })).not.toBeNull();
  });

  it("an ordinary Item's Reminder survives, about nothing", async () => {
    const item = await db.item.create({ data: { tripId: TRIP_ID, title: "IT Ordinary", category: "OTHER" } });
    const r = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Ordinary reminder", date: "2027-01-06", itemId: item.id } });

    expect((await deleteItem(item.id)).success).toBe(true);

    expect(await db.reminder.findUnique({ where: { id: r.id } })).toMatchObject({ itemId: null, title: "IT Ordinary reminder" });
  });

  it("a Surprise Stop's Reminders go with it; an ordinary Stop's survive", async () => {
    const secret = await db.stop.create({ data: { tripId: TRIP_ID, name: "IT Secret city", sortOrder: 0 } });
    const plain = await db.stop.create({ data: { tripId: TRIP_ID, name: "IT Plain city", sortOrder: 1 } });
    await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Book the secret hotel", date: "2027-01-07", stopId: secret.id } });
    const keep = await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Plain city visa", date: "2027-01-07", stopId: plain.id } });
    surprises.add(secret.id);

    expect((await deleteStop(secret.id)).success).toBe(true);
    expect((await deleteStop(plain.id)).success).toBe(true);

    expect(await db.reminder.count({ where: { tripId: TRIP_ID, title: "IT Book the secret hotel" } })).toBe(0);
    expect(await db.reminder.findUnique({ where: { id: keep.id } })).toMatchObject({ stopId: null });
  });

  it("a Surprise Stop's surviving Items stay hidden from the surprised Traveller, and its Items' Reminders stay hidden with them", async () => {
    const secret = await db.stop.create({
      data: { tripId: TRIP_ID, name: "IT Secret weekend", sortOrder: 2, surprisePlannerId: "it-sdr-user", surpriseForIds: '["it-sdr-other"]' },
    });
    const inside = await db.item.create({ data: { tripId: TRIP_ID, stopId: secret.id, title: "IT Inside dinner", category: "FOOD" } });
    const own = await db.item.create({
      data: { tripId: TRIP_ID, stopId: secret.id, title: "IT Own surprise", category: "FOOD", surprisePlannerId: "it-sdr-user", surpriseForIds: '["it-sdr-user"]' },
    });
    await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Book the inside dinner", date: "2027-01-08", itemId: inside.id } });
    await db.reminder.create({ data: { tripId: TRIP_ID, title: "IT Book the secret weekend", date: "2027-01-08", stopId: secret.id } });
    surprises.add(secret.id);

    expect((await deleteStop(secret.id)).success).toBe(true);

    expect(await db.reminder.count({ where: { tripId: TRIP_ID, title: "IT Book the secret weekend" } })).toBe(0);
    expect(await db.reminder.findFirst({ where: { tripId: TRIP_ID, title: "IT Book the inside dinner" } })).toMatchObject({ itemId: inside.id });
    const surprised = await loadSurpriseVisibility(TRIP_ID, "it-sdr-other");
    expect(surprised.hiddenItemIds).toContain(inside.id);
    expect(surprised.hiddenItemIds).not.toContain(own.id);
    const planner = await loadSurpriseVisibility(TRIP_ID, "it-sdr-user");
    expect(planner.hiddenItemIds).not.toContain(inside.id);
    expect(await db.item.findUnique({ where: { id: own.id } })).toMatchObject({ surpriseForIds: '["it-sdr-user"]' });
  });
});
