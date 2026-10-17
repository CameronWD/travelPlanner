import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ id: "it-rem-owner" }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: viewer.id }, membership: { role: "owner" } })),
  // The Reminder guard's own steps (lib/guards.ts requireRowAccess), with the
  // real Surprise check: load the row, then refuse a surprised viewer.
  requireRowAccess: vi.fn(async (_kind: "reminder", id: string) => {
    const { db } = await import("@/lib/db");
    const { requireOutsideSurprise } = await import("@/lib/surprise-guard");
    const { notFound } = await import("next/navigation");
    const row = await db.reminder.findUnique({ where: { id }, select: { id: true, tripId: true, stopId: true, itemId: true } });
    if (!row) return notFound();
    await requireOutsideSurprise(viewer.id, row.itemId ? { itemId: row.itemId } : { stopId: row.stopId });
    return { row, user: { id: viewer.id } };
  }),
}));

import { db } from "@/lib/db";
import { listRemindersForTrip, readReminderAboutOptions, readReminderItem, readRemindersAbout } from "@/lib/reminder-reads";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";

// Real Postgres (npm run test:integration): the Reminders read moved out of
// server/actions/reminders.ts (card 3.N), with the real Surprise visibility
// loader — a Reminder about a Stop hidden from the viewer stays hidden (ADR 0051).
const OWNER = "it-rem-owner";
const MEMBER = "it-rem-member";
const TRIP_ID = "it-rem-trip";
const SECRET = "it-rem-secret";

describe.skipIf(process.env.INTEGRATION !== "1")("listRemindersForTrip (real Postgres)", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: OWNER }, update: {}, create: { id: OWNER, email: "rem-owner@example.test", name: "Rem Owner" } });
    await db.user.upsert({ where: { id: MEMBER }, update: {}, create: { id: MEMBER, email: "rem-member@example.test", name: "Rem Member" } });
  });

  beforeEach(async () => {
    viewer.id = OWNER;
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID, name: "IT Reminders", homeCurrency: "AUD", createdById: OWNER,
        startDate: "2027-06-01", endDate: "2027-06-07",
        members: { create: [{ userId: OWNER, role: "owner" }, { userId: MEMBER, role: "member" }] },
      },
    });
    await db.stop.createMany({
      data: [
        { id: "it-rem-porto", tripId: TRIP_ID, name: "IT Porto", timezone: "Europe/Lisbon", arriveDate: "2027-06-01", departDate: "2027-06-04", nights: 3, sortOrder: 0 },
        { id: SECRET, tripId: TRIP_ID, name: "IT Secret", timezone: "Europe/Lisbon", arriveDate: "2027-06-04", departDate: "2027-06-07", nights: 3, sortOrder: 1,
          surprisePlannerId: OWNER, surpriseForIds: JSON.stringify([MEMBER]) },
      ],
    });
    await db.item.create({ data: { id: "it-rem-secret-item", tripId: TRIP_ID, stopId: SECRET, title: "IT Secret show", category: "OTHER" } });
    await db.item.create({ data: { id: "it-rem-tram", tripId: TRIP_ID, stopId: "it-rem-porto", title: "IT Tram 28", category: "OTHER" } });
    await db.transport.create({ data: { id: "it-rem-leg", tripId: TRIP_ID, mode: "TRAIN", fromStopId: "it-rem-porto", toStopId: SECRET } });
    await db.reminder.createMany({
      data: [
        { tripId: TRIP_ID, title: "IT Old", date: "2026-12-31" },
        { tripId: TRIP_ID, title: "IT Visa", date: "2027-05-01" },
        { tripId: TRIP_ID, stopId: "it-rem-porto", title: "IT Port tour", date: "2027-06-02" },
        { tripId: TRIP_ID, stopId: SECRET, title: "IT Secret dinner", date: "2027-06-05" },
        { tripId: TRIP_ID, itemId: "it-rem-tram", title: "IT Tram tickets", date: "2027-06-03", notes: "Buy a Viva card" },
        { tripId: TRIP_ID, itemId: "it-rem-secret-item", title: "IT Secret tickets", date: "2027-06-05" },
        { tripId: TRIP_ID, transportId: "it-rem-leg", title: "IT Seats", date: "2027-06-04" },
      ],
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("the planner sees every Reminder on or after the date, soonest first, with the Stop's name", async () => {
    const rows = await listRemindersForTrip(TRIP_ID, "2027-01-01");
    expect(rows.map((r) => r.title)).toEqual(["IT Visa", "IT Port tour", "IT Tram tickets", "IT Seats", "IT Secret dinner", "IT Secret tickets"]);
    expect(rows[1]).toMatchObject({ stopId: "it-rem-porto", stopName: "IT Porto" });
    expect(rows[0]).toMatchObject({ stopId: null, stopName: null });
  });

  it("the Traveller the Stop surprises does not see the Reminder about it", async () => {
    viewer.id = MEMBER;
    expect((await listRemindersForTrip(TRIP_ID, "2027-01-01")).map((r) => r.title)).toEqual(["IT Visa", "IT Port tour", "IT Tram tickets", "IT Seats"]);
  });

  it("returns notes and the Item / leg by name (F8)", async () => {
    const rows = await listRemindersForTrip(TRIP_ID, "2027-01-01");
    expect(rows.find((r) => r.title === "IT Tram tickets")).toMatchObject({ notes: "Buy a Viva card", itemId: "it-rem-tram", itemTitle: "IT Tram 28" });
    expect(rows.find((r) => r.title === "IT Seats")).toMatchObject({ transportId: "it-rem-leg", transportLabel: "Train IT Porto → IT Secret" });
  });

  it("readRemindersAbout groups by thing, any date, and hides a Reminder about an Item inside a Surprise Stop from the surprised Traveller", async () => {
    const forOwner = await readRemindersAbout(TRIP_ID, await loadSurpriseVisibility(TRIP_ID, OWNER));
    expect(forOwner.byItemId.get("it-rem-secret-item")?.map((r) => r.title)).toEqual(["IT Secret tickets"]);
    expect(forOwner.byStopId.get("it-rem-porto")?.map((r) => r.title)).toEqual(["IT Port tour"]);
    expect(forOwner.byTransportId.get("it-rem-leg")?.map((r) => r.title)).toEqual(["IT Seats"]);
    viewer.id = MEMBER;
    const forMember = await readRemindersAbout(TRIP_ID, await loadSurpriseVisibility(TRIP_ID, MEMBER));
    expect(forMember.byItemId.has("it-rem-secret-item")).toBe(false);
    expect(forMember.byStopId.has(SECRET)).toBe(false);
    expect(forMember.byItemId.get("it-rem-tram")?.length).toBe(1);
  });

  it("readReminderAboutOptions never offers the surprised Traveller the Surprise Stop or anything inside it", async () => {
    const forOwner = await readReminderAboutOptions(TRIP_ID);
    expect(forOwner.stops.map((s) => s.id)).toEqual(["it-rem-porto", SECRET]);
    expect(forOwner.items.map((i) => i.id).sort()).toEqual(["it-rem-secret-item", "it-rem-tram"]);
    expect(forOwner.transports).toEqual([{ id: "it-rem-leg", label: "Train IT Porto → IT Secret" }]);
    viewer.id = MEMBER;
    const forMember = await readReminderAboutOptions(TRIP_ID);
    expect(forMember.stops.map((s) => s.id)).toEqual(["it-rem-porto"]);
    expect(forMember.items.map((i) => i.id)).toEqual(["it-rem-tram"]);
  });

  it("readReminderItem reads one Reminder; one about a hidden Surprise Stop is notFound to the surprised member", async () => {
    const porto = await db.reminder.findFirstOrThrow({ where: { tripId: TRIP_ID, title: "IT Port tour" } });
    const secret = await db.reminder.findFirstOrThrow({ where: { tripId: TRIP_ID, title: "IT Secret dinner" } });
    expect(await readReminderItem(porto.id)).toMatchObject({ id: porto.id, stopName: "IT Porto" });
    expect(await readReminderItem(secret.id)).toMatchObject({ id: secret.id, stopName: "IT Secret" });
    viewer.id = MEMBER;
    await expect(readReminderItem(secret.id)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});
