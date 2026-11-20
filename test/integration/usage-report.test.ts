import { afterAll, beforeAll, describe, expect, it } from "vitest";

type DbModule = typeof import("@/lib/db");

const TRIP_ID = "it-usage-report-trip";
const OWNER_ID = "it-usage-report-owner";
const FRIEND_ID = "it-usage-report-friend";
const GONE_ID = "it-usage-report-gone";
const SKU = "it-usage-report-sku";
const INSIDE_DAY = "2026-12-03";
const OUTSIDE_DAY = "2027-03-01";

const at = (iso: string) => new Date(iso);

describe.skipIf(process.env.INTEGRATION !== "1")("Usage report (real Postgres)", () => {
  let db: DbModule["db"];
  let reports: typeof import("@/lib/usage/report");

  async function clean() {
    await db.usageRecord.deleteMany({ where: { tripId: TRIP_ID } });
    await db.aiUsage.deleteMany({ where: { tripId: TRIP_ID } });
    await db.googleUsage.deleteMany({ where: { sku: SKU } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.deleteMany({ where: { id: { in: [OWNER_ID, FRIEND_ID] } } });
  }

  const base = { userId: OWNER_ID, tripId: TRIP_ID, phase: "planning", mode: "desktop", site: "main" };

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    reports = await import("@/lib/usage/report");
    await clean();

    await db.user.createMany({
      data: [
        { id: OWNER_ID, email: "owner@usage-report.test", name: "Olive Northvale", isEmailVerified: true },
        { id: FRIEND_ID, email: "friend@usage-report.test", name: "Wren Westby", isEmailVerified: true },
      ],
    });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "Northvale and Westby",
        homeCurrency: "AUD",
        createdById: OWNER_ID,
        startDate: "2026-12-01",
        endDate: "2026-12-09",
        members: { create: [{ userId: OWNER_ID, role: "owner" }, { userId: FRIEND_ID, role: "member" }] },
      },
    });

    await db.usageRecord.createMany({
      data: [
        { ...base, screen: "day", occurredAt: at("2026-12-01T14:30:00Z"), appearMs: 100 },
        { ...base, screen: "day", occurredAt: at("2026-12-01T15:30:00Z"), appearMs: 300, savedCopy: true },
        { ...base, screen: "plan", occurredAt: at("2026-12-01T15:40:00Z"), appearMs: 900, savedCopy: true },
        { ...base, action: "day-changed", detail: "swipe", occurredAt: at("2026-12-01T15:31:00Z"), dayOffset: 2 },
        { ...base, action: "day-changed", detail: "chip", occurredAt: at("2026-12-01T15:32:00Z") },
        { ...base, userId: FRIEND_ID, screen: "money", occurredAt: at("2026-12-04T01:00:00Z") },
        { ...base, userId: GONE_ID, screen: "money", occurredAt: at("2026-12-04T01:00:00Z") },
        { ...base, screen: "day", occurredAt: at("2026-12-01T15:30:00Z"), site: "beta" },
        { ...base, screen: "day", occurredAt: at("2026-12-01T15:30:00Z"), site: "preview" },
      ],
    });

    await db.aiUsage.createMany({
      data: [
        { tripId: TRIP_ID, userId: OWNER_ID, model: "it-model", outcome: "ok", estimatedCostMicroUsd: 420000 },
        { tripId: TRIP_ID, userId: OWNER_ID, model: "it-model", outcome: "ok", estimatedCostMicroUsd: null },
      ],
    });
    await db.googleUsage.createMany({
      data: [
        { day: INSIDE_DAY, sku: SKU, count: 7 },
        { day: OUTSIDE_DAY, sku: SKU, count: 50 },
      ],
    });
  });

  afterAll(async () => {
    await clean();
  });

  const daysOf = (report: Awaited<ReturnType<typeof reports.readUsageTripReport>>, userId: string) =>
    report.travellers.find((t) => t.userId === userId)?.days ?? [];

  it("puts a record on the calendar day of the zone asked for", async () => {
    const brisbane = await reports.readUsageTripReport(TRIP_ID, "Australia/Brisbane");
    expect(daysOf(brisbane, OWNER_ID).map((d) => d.day)).toEqual(["2026-12-02"]);

    const utc = await reports.readUsageTripReport(TRIP_ID, "UTC");
    expect(daysOf(utc, OWNER_ID).map((d) => d.day)).toEqual(["2026-12-01"]);
  });

  it("reads an invalid zone as UTC", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "Not/AZone");
    expect(daysOf(report, OWNER_ID).map((d) => d.day)).toEqual(["2026-12-01"]);
  });

  it("counts screens and actions, the median, saved copies and each way of changing day", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "UTC");
    const [day] = daysOf(report, OWNER_ID);
    expect(day.screens).toEqual({ day: 2, plan: 1 });
    expect(day.screenCount).toBe(3);
    expect(day.actionCount).toBe(2);
    expect(day.medianMs).toBe(300);
    expect(day.savedCopies).toBe(2);
    expect(day.actions).toContainEqual({ action: "day-changed", detail: "swipe", count: 1 });
    expect(day.actions).toContainEqual({ action: "day-changed", detail: "chip", count: 1 });
    expect(JSON.stringify(report)).not.toContain("dayOffset");
  });

  it("names Travellers, and a former one without a name", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "UTC");
    expect(report.travellers.map((t) => t.name)).toEqual(["A former Traveller", "Olive Northvale", "Wren Westby"]);
  });

  it("keeps other sites out of the figures and counts them", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "UTC");
    expect(report.fromOtherSites).toBe(2);
    expect(daysOf(report, OWNER_ID)[0].screens.day).toBe(2);
  });

  it("adds up the AI runs and the ones with no price", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "UTC");
    expect(report.ai).toEqual({ microUsd: 420000, runs: 2, unpriced: 1 });
  });

  it("counts Google calls inside the Trip's dates only", async () => {
    const report = await reports.readUsageTripReport(TRIP_ID, "UTC");
    expect(report.google?.from).toBe("2026-12-01");
    expect(report.google?.to).toBe("2026-12-09");
    expect(report.google?.calls.find((c) => c.sku === SKU)?.count).toBe(7);
  });

  it("totals the main site, says how many came from others, and when the last arrived", async () => {
    const overview = await reports.readUsageOverview();
    const mainForTrip = await db.usageRecord.count({ where: { tripId: TRIP_ID, site: "main" } });
    expect(mainForTrip).toBe(7);
    expect(overview.total).toBeGreaterThanOrEqual(7);
    expect(overview.fromOtherSites).toBeGreaterThanOrEqual(2);
    expect(overview.lastReceivedAt).toBeInstanceOf(Date);
    expect(typeof overview.recording).toBe("boolean");
  });
});
