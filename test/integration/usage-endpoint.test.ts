import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as { user: { id: string; email: string; name: string | null; image: string | null } } | null }));
vi.mock("@/lib/auth/auth", () => ({ auth: async () => session.current }));

type DbModule = typeof import("@/lib/db");

const A = "it-usage-a";
const B = "it-usage-b";
const TRIP = "it-usage-trip";
const OTHER = "it-usage-other";
const GONE = "it-usage-gone";
const RAW = "it-usage-raw";
const DAY = 86_400_000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

describe.skipIf(process.env.INTEGRATION !== "1")("POST /api/usage (real Postgres)", () => {
  let db: DbModule["db"];
  let POST: typeof import("@/app/api/usage/route").POST;
  let primeUsageRecording: typeof import("@/lib/usage/switch").primeUsageRecording;

  async function clean() {
    await db.usageRecord.deleteMany({ where: { userId: { in: [A, B, RAW] } } });
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

  it("stores only what it recognises, under the session's user, with a surprised Traveller's offsets gone and no offset without a Trip", async () => {
    signIn(A);
    const at = Date.now();
    const res = await send([
      { screen: "plan", at, mode: "desktop", tripId: TRIP, phase: "planning" },
      { screen: "day", at: at + 1, mode: "phone-app", tripId: TRIP, phase: "planning", dayOffset: 2 },
      { action: "day-changed", detail: "swipe", at: at + 2, mode: "phone-app", tripId: TRIP, phase: "planning", dayOffset: 2 },
      { screen: "plan", at, mode: "desktop", tripId: OTHER, phase: "planning" },
      { screen: "plan", at, mode: "desktop", tripId: GONE, phase: "planning" },
      { screen: "paris", at, mode: "desktop" },
      { action: "day-changed", detail: "arrow", at, mode: "phone-app", dayOffset: 1 },
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

  it("with the switch row off, nothing is stored, with no cache primed", async () => {
    signIn(A);
    await db.usageSwitch.upsert({ where: { id: "usage" }, update: { recording: false }, create: { id: "usage", recording: false } });
    vi.resetModules();
    ({ POST } = await import("@/app/api/usage/route"));
    const before = await db.usageRecord.count({ where: { userId: A } });
    const res = await send([{ screen: "trips", at: Date.now(), mode: "desktop" }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recording: false });
    expect(await db.usageRecord.count({ where: { userId: A } })).toBe(before);
  });

  it("the database itself holds every CHECK", async () => {
    const names = await db.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conrelid = '"UsageRecord"'::regclass AND contype = 'c' ORDER BY conname`;
    expect(names.map((n) => n.conname)).toEqual([
      "UsageRecord_action_check",
      "UsageRecord_detail_check",
      "UsageRecord_ids_check",
      "UsageRecord_kind_check",
      "UsageRecord_mode_check",
      "UsageRecord_numbers_check",
      "UsageRecord_offset_trip_check",
      "UsageRecord_phase_check",
      "UsageRecord_screen_check",
      "UsageRecord_site_check",
    ]);

    let n = 0;
    const insert = (row: { screen: string | null; action: string | null; tripId: string | null; dayOffset: number | null; site: string }) => {
      n += 1;
      return db.$executeRaw`
        INSERT INTO "UsageRecord" ("id", "screen", "action", "userId", "tripId", "phase", "mode", "site", "dayOffset", "occurredAt")
        VALUES (${`it-usage-raw-${n}`}::text, ${row.screen}::text, ${row.action}::text, ${RAW}::text, ${row.tripId}::text,
                ${row.tripId === null ? null : "planning"}::text, 'desktop', ${row.site}::text, ${row.dayOffset}::int, now())`;
    };
    const good = { screen: "day", action: null, tripId: TRIP, dayOffset: 2, site: "main" };

    await expect(insert(good)).resolves.toBe(1);
    await expect(insert({ ...good, screen: "paris" })).rejects.toThrow();
    await expect(insert({ ...good, screen: null, action: "clicked", dayOffset: null })).rejects.toThrow();
    await expect(insert({ ...good, screen: "trips", action: "search-opened", tripId: null, dayOffset: null })).rejects.toThrow();
    await expect(insert({ ...good, screen: null, action: null })).rejects.toThrow();
    await expect(insert({ ...good, tripId: null })).rejects.toThrow();
    await expect(insert({ ...good, site: "feat/usage" })).rejects.toThrow();
    expect(await db.usageRecord.count({ where: { userId: RAW } })).toBe(1);
  });
});
