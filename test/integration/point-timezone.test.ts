import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// F3 against the real Postgres: a Stop's (and a Home base's) zone comes from
// its point. Only the Next/auth boundary, the network (geocode) and Activity
// are mocked; the actions, lib/tz-point and Prisma run for real.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/geocode", () => ({
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));
vi.mock("@/lib/activity-record", () => ({ recordActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  requirePlanAccess: vi.fn(async (_t: string, forkId?: string | null) => ({ user: { id: "it-user" }, membership: { role: "owner" }, plan: forkId ?? null })),
  requireRowAccess: vi.fn(async (kind: string, id: string) => {
    const { db } = await import("@/lib/db");
    const { notFound } = await import("next/navigation");
    const delegate = (db as unknown as Record<string, { findUnique(a: unknown): Promise<unknown> }>)[kind];
    const row = await delegate.findUnique({ where: { id } });
    if (!row) notFound();
    return { row, user: { id: "it-user" }, membership: { role: "owner" }, surpriseOf: null };
  }),
}));
vi.mock("@/lib/surprise-guard", async () => ({
  ...(await vi.importActual<object>("@/lib/surprise-guard")),
  requireOutsideSurprise: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { geocodePlaceDetailed } from "@/lib/geocode";
import { createStop } from "@/server/actions/stops";

// Undated, so the lone-Stop rule (ADR 0073) never re-dates these Stops.
const TRIP_ID = "it-trip-point-tz";

describe.skipIf(process.env.INTEGRATION !== "1")("a Stop's default zone comes from its point (F3, real Postgres)", () => {
  beforeAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it-user@example.test", name: "It User", isEmailVerified: true } });
    await db.trip.create({ data: { id: TRIP_ID, name: "Point tz trip", homeCurrency: "AUD", createdById: "it-user", members: { create: { userId: "it-user", role: "owner" } } } });
  });
  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  const stopZone = async (r: unknown) => (await db.stop.findUnique({ where: { id: (r as { id: string }).id } }))?.timezone;

  it("a picked Brisbane point sent with the UTC fallback stores Australia/Brisbane, not the country's Sydney", async () => {
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Brisbane", country: "Australia", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "UTC", arriveDate: "2026-06-01", departDate: "2026-06-03" });
    expect(r).toMatchObject({ success: true });
    expect(await stopZone(r)).toBe("Australia/Brisbane");
  });

  it("a geocoded Perth point decides when nothing was picked", async () => {
    vi.mocked(geocodePlaceDetailed).mockResolvedValueOnce({ name: "Perth, Australia", lat: -31.95, lng: 115.86, city: "Perth", country: "Australia", countryCode: "au" });
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Perth", country: "Australia", timezone: "UTC", arriveDate: "2026-06-03", departDate: "2026-06-05" });
    expect(await stopZone(r)).toBe("Australia/Perth");
  });

  it("a chosen zone wins over the point", async () => {
    const r = await createStop(TRIP_ID, { mode: "scheduled", name: "Brisbane again", countryCode: "au", lat: -27.47, lng: 153.03, timezone: "Australia/Sydney", arriveDate: "2026-06-05", departDate: "2026-06-06" });
    expect(await stopZone(r)).toBe("Australia/Sydney");
  });
});
