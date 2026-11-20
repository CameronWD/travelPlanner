import { afterAll, beforeAll, describe, expect, it } from "vitest";

type DbModule = typeof import("@/lib/db");

const USER = "it-usage-purge-user";
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe.skipIf(process.env.INTEGRATION !== "1")("purgeOldUsage (real Postgres)", () => {
  let db: DbModule["db"];
  let purgeOldUsage: typeof import("@/lib/usage/purge").purgeOldUsage;

  const clean = () => db.usageRecord.deleteMany({ where: { userId: USER } });

  const row = (receivedAt: Date, occurredAt: Date) => ({
    userId: USER,
    screen: "trips",
    mode: "desktop",
    site: "local",
    occurredAt,
    receivedAt,
  });

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ purgeOldUsage } = await import("@/lib/usage/purge"));
    await clean();
  });

  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

  it("deletes records received more than 180 days ago and keeps the rest", async () => {
    await clean();
    const now = new Date();
    await db.usageRecord.createMany({
      data: [
        row(new Date(now.getTime() - 181 * DAY), new Date(now.getTime() - 181 * DAY)),
        row(new Date(now.getTime() - 180 * DAY + HOUR), new Date(now.getTime() - 180 * DAY + HOUR)),
        row(new Date(now.getTime() - DAY), new Date(now.getTime() - DAY)),
      ],
    });
    const deleted = await purgeOldUsage(now);
    expect(deleted).toBeGreaterThanOrEqual(1);
    const left = await db.usageRecord.findMany({ where: { userId: USER } });
    expect(left).toHaveLength(2);
    expect(left.every((r) => r.receivedAt.getTime() > now.getTime() - 180 * DAY)).toBe(true);
  });

  it("keeps a record received now whose device clock was months behind", async () => {
    await clean();
    const now = new Date();
    await db.usageRecord.createMany({
      data: [row(now, new Date(now.getTime() - 179 * DAY))],
    });
    await purgeOldUsage(now);
    expect(await db.usageRecord.count({ where: { userId: USER } })).toBe(1);
  });

  it("does nothing on an empty table", async () => {
    await clean();
    await expect(purgeOldUsage()).resolves.toBeGreaterThanOrEqual(0);
    expect(await db.usageRecord.count({ where: { userId: USER } })).toBe(0);
  });
});
