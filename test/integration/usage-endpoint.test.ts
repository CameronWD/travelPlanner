import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as { user: { id: string; email: string; name: string | null; image: string | null } } | null }));
vi.mock("@/lib/auth/auth", () => ({ auth: async () => session.current }));

type DbModule = typeof import("@/lib/db");

const A = "it-usage-a";
const B = "it-usage-b";
const TRIP = "it-usage-trip";
const OTHER = "it-usage-other";
const GONE = "it-usage-gone";
const DAY = 86_400_000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

describe.skipIf(process.env.INTEGRATION !== "1")("POST /api/usage (real Postgres)", () => {
  let db: DbModule["db"];
  let POST: typeof import("@/app/api/usage/route").POST;
  let primeUsageRecording: typeof import("@/lib/usage/switch").primeUsageRecording;

  async function clean() {
    await db.usageRecord.deleteMany({ where: { userId: { in: [A, B] } } });
    await db.usageSwitch.deleteMany({ where: { id: "usage" } });
    await db.trip.deleteMany({ where: { id: { in: [TRIP, OTHER, GONE] } } });
    await db.user.deleteMany({ where: { id: { in: [A, B] } } });
  }

  const signIn = (id: string) => {
    session.current = { user: { id, email: `${id}@example.test`, name: null, image: null } };
  };

  const send = (records: unknown[]) =>
    POST(new Request("http://x/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ records }) }));

  const rowsOf = (userId: string) => db.usageRecord.findMany({ where: { userId }, orderBy: { occurredAt: "asc" } });

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ POST } = await import("@/app/api/usage/route"));
    ({ primeUsageRecording } = await import("@/lib/usage/switch"));
    await clean();
    primeUsageRecording(true);

    await db.user.create({ data: { id: A, email: "it-usage-a@example.test", name: "Ada Northvale" } });
    await db.user.create({ data: { id: B, email: "it-usage-b@example.test", name: "Bo Westby" } });
    const trip = (id: string, members: string[], deletedAt: Date | null = null) =>
      db.trip.create({
        data: {
          id, name: id, homeCurrency: "AUD", createdById: members[0], deletedAt,
          members: { create: members.map((userId, i) => ({ userId, role: i === 0 ? "owner" : "member" })) },
        },
      });
    await trip(TRIP, [B, A]);
    await trip(OTHER, [B]);
    await trip(GONE, [A], new Date());
    await db.stop.create({
      data: {
        tripId: TRIP, name: "IT Northvale", sortOrder: 0, timezone: "Etc/UTC",
        arriveDate: isoIn(28), departDate: isoIn(31),
        surprisePlannerId: B, surpriseForIds: JSON.stringify([A]), surpriseRevealedAt: null,
      },
    });
  });

  afterAll(async () => {
    primeUsageRecording(true);
    await clean();
  });

  it("stores only what it recognises, under the session's user, with a surprised Traveller's offsets gone", async () => {
    signIn(A);
    const at = Date.now();
    const res = await send([
      { screen: "plan", at, mode: "desktop", tripId: TRIP, phase: "planning" },
      { screen: "day", at: at + 1, mode: "phone-app", tripId: TRIP, phase: "planning", dayOffset: 2 },
      { action: "day-changed", detail: "swipe", at: at + 2, mode: "phone-app", tripId: TRIP, phase: "planning", dayOffset: 2 },
      { screen: "plan", at, mode: "desktop", tripId: OTHER, phase: "planning" },
      { screen: "plan", at, mode: "desktop", tripId: GONE, phase: "planning" },
      { screen: "paris", at, mode: "desktop" },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: true });

    const rows = await rowsOf(A);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.userId === A && r.tripId === TRIP && r.site === "local")).toBe(true);
    expect(rows.map((r) => [r.screen, r.action, r.detail, r.dayOffset])).toEqual([
      ["plan", null, null, null],
      ["day", null, null, null],
      [null, "day-changed", "swipe", null],
    ]);
  });

  it("the Surprise's planner keeps their offset", async () => {
    signIn(B);
    const res = await send([{ screen: "day", at: Date.now(), mode: "phone-browser", tripId: TRIP, phase: "planning", dayOffset: 2 }]);
    expect(res.status).toBe(200);
    expect((await rowsOf(B)).map((r) => r.dayOffset)).toEqual([2]);
  });

  it("signed out, nothing is stored", async () => {
    session.current = null;
    const before = await db.usageRecord.count({ where: { userId: { in: [A, B] } } });
    const res = await send([{ screen: "trips", at: Date.now(), mode: "desktop" }]);
    expect(res.status).toBe(401);
    expect(await db.usageRecord.count({ where: { userId: { in: [A, B] } } })).toBe(before);
  });

  it("with recording off, nothing is stored", async () => {
    signIn(A);
    await db.usageSwitch.upsert({ where: { id: "usage" }, update: { recording: false }, create: { id: "usage", recording: false } });
    primeUsageRecording(false);
    const before = await db.usageRecord.count({ where: { userId: A } });
    const res = await send([{ screen: "trips", at: Date.now(), mode: "desktop" }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: false });
    expect(await db.usageRecord.count({ where: { userId: A } })).toBe(before);
  });
});
