import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
}));
// No network in tests: geocoding finds nothing, and the AUD rate is home currency anyway.
vi.mock("@/lib/geocode", async (orig) => ({
  ...(await orig<typeof import("@/lib/geocode")>()),
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { confirmProposal } from "@/server/actions/booking-import";
import type { ProposalBase, StopProposal, TransportProposal } from "@/lib/booking-import/types";

const TRIP_ID = "it-trip-booking-import";
const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };

describe.skipIf(process.env.INTEGRATION !== "1")("Booking import confirm end to end", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: "it-user" }, update: {}, create: { id: "it-user", email: "it@example.test", name: "IT" } });
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
    await db.trip.create({
      data: {
        id: TRIP_ID,
        name: "Booking import IT",
        homeCurrency: "AUD",
        createdById: "it-user",
        homeName: "Brisbane",
        homeCountryCode: "au",
        homeTimezone: "Australia/Brisbane",
        members: { create: { userId: "it-user", role: "owner" } },
      },
    });
  });

  afterAll(async () => {
    await db.trip.deleteMany({ where: { id: TRIP_ID } });
  });

  it("an overnight Home → Lisbon flight saves its new Stop first and stores each end in its own zone (Review Focus 2)", async () => {
    const lisbon: StopProposal = {
      ...BASE,
      clientId: "s1",
      kind: "stop",
      input: { mode: "scheduled", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" },
    };
    const flight: TransportProposal = {
      ...BASE,
      clientId: "p1",
      kind: "transport",
      input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "proposed:s1", arrPlace: "Lisbon (LIS)", arrAt: "2026-12-02T07:15", reference: "QX7P2M", costMinor: 214_000, currency: "AUD", paidMinor: 214_000, paidAt: "2026-10-01" },
    };

    const result = await confirmProposal(TRIP_ID, { proposal: flight, proposedStops: [lisbon], resolvedStops: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stop = await db.stop.findUniqueOrThrow({ where: { id: result.createdStops.s1 } });
    expect(stop).toMatchObject({ name: "Lisbon", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15", forkId: null });

    const leg = await db.transport.findUniqueOrThrow({ where: { id: result.createdId } });
    expect(leg).toMatchObject({ depIsHome: true, toStopId: stop.id, arrPlace: "Lisbon (LIS)", reference: "QX7P2M" });
    expect(leg.depAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z"); // 10:00 Brisbane (UTC+10)
    expect(leg.arrAt?.toISOString()).toBe("2026-12-02T07:15:00.000Z"); // 07:15 Lisbon (UTC+0 in December)

    const cost = await db.cost.findFirstOrThrow({ where: { ownerType: "TRANSPORT", ownerId: leg.id } });
    expect(cost).toMatchObject({ costMinor: 214_000, currency: "AUD", paidMinor: 214_000 });
    expect(cost.paidAt?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });
});
