import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { creationAnchor } from "@/lib/transport-anchor";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { AccommodationProposal, ConfirmRequest, ProposalBase, StopProposal, TransportProposal } from "./types";

const m = vi.hoisted(() => ({
  createStop: vi.fn(),
  createTransport: vi.fn(),
  createAccommodation: vi.fn(),
  createItem: vi.fn(),
  stops: vi.fn(),
  visibility: vi.fn(),
}));
vi.mock("@/server/actions/stops", () => ({ createStop: m.createStop }));
vi.mock("@/server/actions/transport", () => ({ createTransport: m.createTransport }));
vi.mock("@/server/actions/accommodation", () => ({ createAccommodation: m.createAccommodation }));
vi.mock("@/server/actions/items", () => ({ createItem: m.createItem }));
vi.mock("@/lib/db", () => ({ db: { stop: { findMany: m.stops } } }));
vi.mock("@/lib/surprise-visibility", async (orig) => ({ ...(await orig<typeof import("@/lib/surprise-visibility")>()), loadSurpriseVisibility: m.visibility }));

import { confirmProposalFor } from "./confirm";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };
const LISBON_NEW: StopProposal = {
  ...BASE,
  clientId: "s1",
  kind: "stop",
  input: { mode: "scheduled", name: "Lisbon", country: "Portugal", countryCode: "pt", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" },
};
const OUTBOUND: TransportProposal = {
  ...BASE,
  clientId: "p1",
  kind: "transport",
  input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "proposed:s1", arrPlace: "Lisbon (LIS)", arrAt: "2026-12-02T07:15", reference: "QX7P2M", costMinor: 214_000, currency: "AUD", paidMinor: 214_000, paidAt: "2026-10-01" },
};
const STAY: AccommodationProposal = {
  ...BASE,
  clientId: "p3",
  kind: "accommodation",
  input: { stopId: "proposed:s1", name: "Casa do Rio Lisboa", checkIn: "2026-12-02", checkOut: "2026-12-08" },
};
const ORDERED = [{ id: "s-new", sortOrder: 0, arriveDate: "2026-12-02", departDate: "2026-12-15" }];

beforeEach(() => {
  vi.clearAllMocks();
  m.visibility.mockResolvedValue({ ...NO_SURPRISES, viewerId: "u1" });
  m.stops.mockResolvedValue(ORDERED);
  m.createStop.mockResolvedValue({ success: true, id: "s-new" });
  m.createTransport.mockResolvedValue({ success: true, id: "t-new" });
  m.createAccommodation.mockResolvedValue({ success: true, id: "a-new" });
  m.createItem.mockResolvedValue({ success: true, id: "i-new" });
});

const req = (r: Partial<ConfirmRequest> & Pick<ConfirmRequest, "proposal">): ConfirmRequest => ({ proposedStops: [], resolvedStops: {}, ...r });

describe("confirmProposalFor", () => {
  it("saves the proposed Stop first, then the booking against it, with its inline Cost", async () => {
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal: OUTBOUND, proposedStops: [LISBON_NEW] }), null);
    expect(result).toEqual({ ok: true, createdId: "t-new", createdStops: { s1: "s-new" } });
    expect(m.createStop).toHaveBeenCalledWith("trip-1", LISBON_NEW.input, undefined);
    expect(m.createStop.mock.invocationCallOrder[0]).toBeLessThan(m.createTransport.mock.invocationCallOrder[0]);
    const [tripId, input, forkId] = m.createTransport.mock.calls[0];
    expect(tripId).toBe("trip-1");
    expect(forkId).toBeUndefined();
    expect(input).toMatchObject({ mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "s-new", arrAt: "2026-12-02T07:15", costMinor: 214_000, currency: "AUD", paidMinor: 214_000, paidAt: "2026-10-01" });
    expect(input.anchorStopId).toBe(creationAnchor({ toStopId: "s-new" }, ORDERED) ?? undefined);
  });

  it("writes to the Fork being viewed", async () => {
    m.stops.mockResolvedValue([{ id: "s-saved", sortOrder: 0, arriveDate: null, departDate: null }]);
    await confirmProposalFor("trip-1", "u1", req({ proposal: STAY, resolvedStops: { s1: "s-saved" } }), "fork-1");
    expect(m.createAccommodation).toHaveBeenCalledWith(expect.objectContaining({ stopId: "s-saved" }), "fork-1");
    expect(m.createStop).not.toHaveBeenCalled();
  });

  it("keeps the Stop and returns the booking's error when the booking then fails", async () => {
    m.createTransport.mockResolvedValue({ success: false, errors: { arrAt: ["Arrival must be after departure"] } });
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal: OUTBOUND, proposedStops: [LISBON_NEW] }), null);
    expect(result).toEqual({ ok: false, message: "Arrival must be after departure", errors: { arrAt: ["Arrival must be after departure"] }, createdStops: { s1: "s-new" } });
  });

  it("confirms a proposed Stop on its own", async () => {
    expect(await confirmProposalFor("trip-1", "u1", req({ proposal: LISBON_NEW }), null)).toEqual({ ok: true, createdId: "s-new", createdStops: { s1: "s-new" } });
  });

  it("refuses, writing nothing, when the Proposal's Stop is a Surprise for the Traveller", async () => {
    m.stops.mockResolvedValue([{ id: "s-lis", sortOrder: 0, arriveDate: null, departDate: null }]);
    m.visibility.mockResolvedValue({ ...NO_SURPRISES, viewerId: "u1", isEmpty: false, hiddenStopIds: ["s-lis"] });
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal: { ...STAY, input: { ...STAY.input, stopId: "s-lis" } } }), null);
    expect(result).toEqual({ ok: false, message: M.blocked, createdStops: {} });
    expect(m.createAccommodation).not.toHaveBeenCalled();
  });

  it("reads a connection airport's wall time in its own zone (Review Focus 2)", async () => {
    const leg: TransportProposal = { ...OUTBOUND, input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", arrPlace: "Singapore Changi (SIN)", arrTimezone: "Asia/Singapore", arrAt: "2026-12-01T16:00" } };
    await confirmProposalFor("trip-1", "u1", req({ proposal: leg }), null);
    const input = m.createTransport.mock.calls[0][1];
    expect(input.arrAt).toBe("2026-12-01T08:00:00.000Z");
    expect(input.depAt).toBe("2026-12-01T10:00"); // a Home end with a Home timezone: createTransport converts it
    expect(input).not.toHaveProperty("arrTimezone");
  });

  it("reads a Home end in the guessed zone when the Trip has no Home timezone (Review Focus 3)", async () => {
    m.stops.mockResolvedValue([{ id: "s-lis", sortOrder: 0, arriveDate: null, departDate: null }]);
    const leg: TransportProposal = { ...OUTBOUND, input: { ...OUTBOUND.input, toStopId: "s-lis", depTimezone: "Australia/Sydney" } };
    await confirmProposalFor("trip-1", "u1", req({ proposal: leg }), null);
    // 10:00 in Sydney in December (UTC+11) is 23:00 UTC the day before.
    expect(m.createTransport.mock.calls[0][1].depAt).toBe("2026-11-30T23:00:00.000Z");
  });

  it("leaves both ends' wall times for createTransport to convert when both are Stop-linked (overnight, cross-zone)", async () => {
    m.stops.mockResolvedValue([
      { id: "s-bne", sortOrder: 0, arriveDate: null, departDate: null },
      { id: "s-sin", sortOrder: 1, arriveDate: null, departDate: null },
    ]);
    const leg: TransportProposal = {
      ...OUTBOUND,
      input: { mode: "FLIGHT", fromStopId: "s-bne", toStopId: "s-sin", depAt: "2026-12-01T22:30", arrAt: "2026-12-02T06:10" },
    };
    await confirmProposalFor("trip-1", "u1", req({ proposal: leg }), null);
    const input = m.createTransport.mock.calls[0][1];
    expect(input.depAt).toBe("2026-12-01T22:30");
    expect(input.arrAt).toBe("2026-12-02T06:10");
  });

  it("keeps the original wall time when the guessed-zone conversion fails, instead of dropping it (fix round 1, #4)", async () => {
    const leg: TransportProposal = {
      ...OUTBOUND,
      input: { mode: "FLIGHT", depIsHome: true, depAt: "2026-13-45T99:99", depTimezone: "Australia/Sydney", arrPlace: "Lisbon (LIS)", arrAt: "2026-12-02T07:15" },
    };
    await confirmProposalFor("trip-1", "u1", req({ proposal: leg }), null);
    expect(m.createTransport.mock.calls[0][1].depAt).toBe("2026-13-45T99:99");
  });

  it("refuses a forged resolvedStops entry naming a Stop the Traveller is surprised by, writing nothing (fix round 1, #1)", async () => {
    m.stops.mockResolvedValue([{ id: "s-hidden", sortOrder: 0, arriveDate: null, departDate: null }]);
    m.visibility.mockResolvedValue({ ...NO_SURPRISES, viewerId: "u1", isEmpty: false, hiddenStopIds: ["s-hidden"] });
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal: OUTBOUND, resolvedStops: { s1: "s-hidden" } }), null);
    expect(result).toEqual({ ok: false, message: M.blocked, createdStops: {} });
    expect(m.createStop).not.toHaveBeenCalled();
    expect(m.createTransport).not.toHaveBeenCalled();
  });

  it("refuses a forged resolvedStops entry naming a Stop outside this Trip/plan, writing nothing (fix round 1, #1)", async () => {
    m.stops.mockResolvedValue([]); // "s-other-trip" isn't on this plan
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal: OUTBOUND, resolvedStops: { s1: "s-other-trip" } }), null);
    expect(result).toEqual({ ok: false, message: M.generic, createdStops: {} });
    expect(m.createStop).not.toHaveBeenCalled();
    expect(m.createTransport).not.toHaveBeenCalled();
    expect(m.visibility).not.toHaveBeenCalled(); // plan membership is checked before the Surprise lookup
  });

  it("refuses an Accommodation whose real stopId doesn't belong to this Trip/plan, writing nothing (fix round 1, #2)", async () => {
    m.stops.mockResolvedValue([]); // "s-other-trip" isn't on this plan
    const proposal: AccommodationProposal = { ...STAY, input: { ...STAY.input, stopId: "s-other-trip" } };
    const result = await confirmProposalFor("trip-1", "u1", req({ proposal }), null);
    expect(result).toEqual({ ok: false, message: M.generic, createdStops: {} });
    expect(m.createAccommodation).not.toHaveBeenCalled();
  });

  it("rejects a malformed request with the generic message", async () => {
    expect(await confirmProposalFor("trip-1", "u1", { proposal: { kind: "boat" } }, null)).toEqual({ ok: false, message: M.generic, createdStops: {} });
    expect(m.createStop).not.toHaveBeenCalled();
  });

  it("refuses a booking that refers to a proposed Stop it wasn't given", async () => {
    expect(await confirmProposalFor("trip-1", "u1", req({ proposal: STAY }), null)).toEqual({ ok: false, message: M.generic, createdStops: {} });
    expect(m.createAccommodation).not.toHaveBeenCalled();
  });
});
