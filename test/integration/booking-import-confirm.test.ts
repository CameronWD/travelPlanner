import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/guards", async () => ({
  isTripOwnerOrAdmin: (await import("@/lib/access")).isTripOwnerOrAdmin,
  requireUser: vi.fn(async () => ({ id: "it-user" })),
  requireTripAccess: vi.fn(async () => ({ user: { id: "it-user" }, membership: { role: "owner" } })),
  // ADR 0074 Task 4 (spec 2026-10-14 Q4): confirmProposal now calls
  // requirePlanAccess instead of requireTripAccess. These tests use the real
  // plan throughout, so `plan` is just `forkId ?? null` — same user/membership
  // the requireTripAccess mock above returns.
  requirePlanAccess: vi.fn(async (_tripId: string, forkId?: string | null) => ({
    user: { id: "it-user" },
    membership: { role: "owner" },
    plan: forkId ?? null,
  })),
}));
// No network in tests: geocoding finds nothing, and the AUD rate is home currency anyway.
vi.mock("@/lib/geocode", async (orig) => ({
  ...(await orig<typeof import("@/lib/geocode")>()),
  geocodePlace: vi.fn(async () => null),
  geocodePlaceDetailed: vi.fn(async () => null),
}));

import { db } from "@/lib/db";
import { confirmProposal } from "@/server/actions/booking-import";
import { transportPreview } from "@/lib/booking-import/preview";
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
    // Two already-saved Stops, for the overnight cross-zone case (fix round 1, #3):
    // real (not `proposed:`) ids, so confirmProposal's plan-membership check and
    // createTransport's own zone resolution both exercise against real rows.
    await db.stop.createMany({
      data: [
        { id: "it-stop-bne", tripId: TRIP_ID, name: "Brisbane leg", sortOrder: 10, timezone: "Australia/Brisbane" },
        { id: "it-stop-sin", tripId: TRIP_ID, name: "Singapore leg", sortOrder: 11, timezone: "Asia/Singapore" },
        // A rough Stop, sketched with no time zone yet (final review #1).
        { id: "it-stop-lis-rough", tripId: TRIP_ID, name: "Lisbon", sortOrder: 12, timezone: null },
      ],
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
    expect(result.success).toBe(true);
    if (!result.success) return;

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

  it("an overnight Brisbane → Singapore leg between two existing Stops converts each end in its own zone (fix round 1, #3)", async () => {
    const leg: TransportProposal = {
      ...BASE,
      clientId: "p2",
      kind: "transport",
      input: { mode: "FLIGHT", fromStopId: "it-stop-bne", toStopId: "it-stop-sin", depAt: "2026-12-01T22:30", arrAt: "2026-12-02T06:10" },
    };

    const result = await confirmProposal(TRIP_ID, { proposal: leg, proposedStops: [], resolvedStops: {} });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = await db.transport.findUniqueOrThrow({ where: { id: result.createdId } });
    expect(saved.depAt?.toISOString()).toBe("2026-12-01T12:30:00.000Z"); // 22:30 Brisbane (UTC+10)
    expect(saved.arrAt?.toISOString()).toBe("2026-12-01T22:10:00.000Z"); // 06:10 Singapore (UTC+8), the day before in UTC
  });

  it("a flight from a zoned Stop into a rough Stop with no time zone saves the arrival the preview showed, read in the import's hint (final review #1)", async () => {
    const input = { mode: "FLIGHT" as const, fromStopId: "it-stop-sin", toStopId: "it-stop-lis-rough", depAt: "2026-07-01T23:30", arrAt: "2026-07-02T07:15", arrTimezone: "Europe/Lisbon" };
    const leg: TransportProposal = { ...BASE, clientId: "p3", kind: "transport", input };

    const result = await confirmProposal(TRIP_ID, { proposal: leg, proposedStops: [], resolvedStops: {} });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = await db.transport.findUniqueOrThrow({ where: { id: result.createdId } });
    expect(saved.depAt?.toISOString()).toBe("2026-07-01T15:30:00.000Z"); // 23:30 Singapore (UTC+8)
    expect(saved.arrAt?.toISOString()).toBe("2026-07-02T06:15:00.000Z"); // 07:15 Lisbon (UTC+1 in July), not Singapore

    const stops = new Map([
      ["it-stop-sin", { id: "it-stop-sin", name: "Singapore leg", timezone: "Asia/Singapore", arriveDate: null, departDate: null }],
      ["it-stop-lis-rough", { id: "it-stop-lis-rough", name: "Lisbon", timezone: null, arriveDate: null, departDate: null }],
    ]);
    const preview = transportPreview(input, stops, "Australia/Brisbane").transport;
    expect(preview.arrAt?.toISOString()).toBe(saved.arrAt?.toISOString());
    expect(preview.depAt?.toISOString()).toBe(saved.depAt?.toISOString());
  });

  it("a confirmed booking with no reference printed lands Booked as a choice (spec 2026-10-17 R2)", async () => {
    const leg: TransportProposal = {
      ...BASE,
      clientId: "p4",
      kind: "transport",
      input: { mode: "TRAIN", fromStopId: "it-stop-bne", toStopId: "it-stop-sin", bookingState: "BOOKED" },
    };

    const result = await confirmProposal(TRIP_ID, { proposal: leg, proposedStops: [], resolvedStops: {} });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = await db.transport.findUniqueOrThrow({ where: { id: result.createdId } });
    expect(saved).toMatchObject({ reference: null, bookingState: "BOOKED", bookingStateSet: true, bookBy: null });
  });
});
