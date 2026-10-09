import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  createTransport,
  updateTransport,
  deleteTransport,
  createCost,
  updateCost,
  deleteCost,
  markCostPaid,
  markCostUnpaid,
  requireTripAccess,
  accommodationFindUnique,
  transportFindUnique,
  costFindUnique,
  costFindMany,
} = vi.hoisted(() => ({
  createAccommodation: vi.fn(),
  updateAccommodation: vi.fn(),
  deleteAccommodation: vi.fn(),
  createTransport: vi.fn(),
  updateTransport: vi.fn(),
  deleteTransport: vi.fn(),
  createCost: vi.fn(),
  updateCost: vi.fn(),
  deleteCost: vi.fn(),
  markCostPaid: vi.fn(),
  markCostUnpaid: vi.fn(),
  requireTripAccess: vi.fn(),
  accommodationFindUnique: vi.fn(),
  transportFindUnique: vi.fn(),
  costFindUnique: vi.fn(),
  costFindMany: vi.fn(),
}));

vi.mock("@/server/actions/accommodation", () => ({ createAccommodation, updateAccommodation, deleteAccommodation }));
vi.mock("@/server/actions/transport", () => ({ createTransport, updateTransport, deleteTransport }));
vi.mock("@/server/actions/costs", () => ({ createCost, updateCost, deleteCost, markCostPaid, markCostUnpaid }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    accommodation: { findUnique: accommodationFindUnique },
    transport: { findUnique: transportFindUnique },
    cost: { findUnique: costFindUnique, findMany: costFindMany },
  },
}));
// The rest of the server (reads.ts, trips-read.ts, trips-stops-write.ts,
// plan-write.ts) touches these only when their own tools are *called*;
// stubbing keeps buildMcpServer's full registration side-effect-free here
// without reproducing every property.
vi.mock("@/lib/guards", () => ({ requireTripAccess, requireUser: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";
import { accommodationSchema } from "@/lib/validations/accommodation";
import { transportSchema } from "@/lib/validations/transport";
import {
  mergeAccommodationPatch,
  mergeTransportPatch,
  completeInlineCost,
  isFailure,
  type AccommodationRow,
  type TransportRow,
} from "./bookings-write";

const TRIP_ID = "trip-1";
const STOP_ID = "stop-1";
const ACCOMMODATION_ID = "acc-1";
const TRANSPORT_ID = "transport-1";
const COST_ID = "cost-1";
const notFoundErr = () => Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

const accommodationRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  stopId: STOP_ID,
  name: "Hotel Roma",
  address: "Via Roma 1",
  checkIn: "2026-05-01",
  checkOut: "2026-05-04",
  checkInTime: "14:00",
  checkOutTime: "10:00",
  confirmation: "ABC123",
  notes: "old notes",
  ...overrides,
});

const transportRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  mode: "FLIGHT",
  fromStopId: "stop-a",
  toStopId: "stop-b",
  anchorStopId: null,
  depIsHome: false,
  arrIsHome: false,
  depPlace: null,
  arrPlace: null,
  depAt: new Date("2026-05-01T08:00:00.000Z"),
  arrAt: new Date("2026-05-01T10:00:00.000Z"),
  reference: "XYZ789",
  notes: "old transport notes",
  ...overrides,
});

const costRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tripId: TRIP_ID,
  costMinor: 10000,
  currency: "USD",
  paidMinor: 10000,
  paidAt: new Date("2026-04-01T00:00:00.000Z"),
  dueDate: null,
  ownerType: "OTHER",
  ownerId: null,
  label: "Travel insurance",
  category: "Insurance",
  settlement: "BEFORE",
  ...overrides,
});

describe("bookings write tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccess.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  });

  it("registers every write tool, none accepting a forkId", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "add_accommodation",
        "update_accommodation",
        "delete_accommodation",
        "add_transport",
        "update_transport",
        "delete_transport",
        "add_cost",
        "update_cost",
        "delete_cost",
        "mark_cost_paid",
        "mark_cost_unpaid",
      ]),
    );
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("forkId");
    }
  });

  it("add_accommodation and update_accommodation accept no lat/lng (action ignores them)", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    for (const name of ["add_accommodation", "update_accommodation"]) {
      const tool = tools.find((t) => t.name === name)!;
      const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("lat");
      expect(Object.keys(props)).not.toContain("lng");
    }
  });

  // -------------------------------------------------------------------------
  // Accommodation
  // -------------------------------------------------------------------------

  it("add_accommodation calls createAccommodation with a single argument, no forkId", async () => {
    createAccommodation.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_accommodation",
      arguments: { stopId: STOP_ID, name: "Hotel Roma", checkIn: "2026-05-01", checkOut: "2026-05-04" },
    });
    expect(createAccommodation).toHaveBeenCalledTimes(1);
    const call = createAccommodation.mock.calls[0];
    expect(call).toHaveLength(1);
    expect(call[0]).toEqual(
      expect.objectContaining({ stopId: STOP_ID, name: "Hotel Roma", checkIn: "2026-05-01", checkOut: "2026-05-04" }),
    );
  });

  describe("update_accommodation (PATCH)", () => {
    it("with only name keeps every other field, including stopId and dates", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      updateAccommodation.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, name: "New name" } });
      expect(updateAccommodation).toHaveBeenCalledWith(ACCOMMODATION_ID, {
        stopId: STOP_ID,
        name: "New name",
        address: "Via Roma 1",
        checkIn: "2026-05-01",
        checkOut: "2026-05-04",
        checkInTime: "14:00",
        checkOutTime: "10:00",
        confirmation: "ABC123",
        notes: "old notes",
      });
      // costFindMany is only consulted when the patch touches costMinor/currency.
      expect(costFindMany).not.toHaveBeenCalled();
    });

    it("costMinor-only update on a paid owned Cost forwards currency, paidMinor and paidAt together, so it doesn't un-pay it", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      costFindMany.mockResolvedValue([
        { costMinor: 9000, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00.000Z") },
      ]);
      updateAccommodation.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, costMinor: 9500 } });
      const call = updateAccommodation.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({ costMinor: 9500, currency: "EUR", paidMinor: 9000, paidAt: "2026-04-15" }),
      );
    });

    it("the merged input for a costMinor-only update on a paid owned Cost passes the REAL accommodationSchema", async () => {
      // Mocked actions hide a schema refine failure (accommodationSchema
      // rejects a paidAt with no paidMinor — "Enter what you paid"), so this
      // parses the merge's output with the actual schema, not a mock.
      const current: AccommodationRow = accommodationRow();
      costFindMany.mockResolvedValue([
        { costMinor: 9000, currency: "EUR", paidMinor: 9000, paidAt: new Date("2026-04-15T00:00:00.000Z") },
      ]);
      const inlineCost = await completeInlineCost("ACCOMMODATION", ACCOMMODATION_ID, { costMinor: 9500 });
      expect(isFailure(inlineCost)).toBe(false);
      if (isFailure(inlineCost)) throw new Error("unreachable");
      const merged = mergeAccommodationPatch(current, { costMinor: 9500 }, inlineCost);
      const parsed = accommodationSchema.safeParse(merged);
      expect(parsed.success).toBe(true);
    });

    it("costMinor-only update on an UNPAID owned Cost does not forward a paid pair", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      costFindMany.mockResolvedValue([{ costMinor: 9000, currency: "EUR", paidMinor: null, paidAt: null }]);
      updateAccommodation.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, costMinor: 9500 } });
      const call = updateAccommodation.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ costMinor: 9500, currency: "EUR", paidMinor: undefined, paidAt: undefined }));
    });

    it("currency-only with no owned Cost is a tool error, not a silent no-op", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      costFindMany.mockResolvedValue([]);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, currency: "EUR" } });
      expect(r.isError).toBe(true);
      expect(updateAccommodation).not.toHaveBeenCalled();
    });

    it("costMinor against more than one owned Cost is a tool error, not a silent no-op", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      costFindMany.mockResolvedValue([
        { costMinor: 100, currency: "USD", paidMinor: null, paidAt: null },
        { costMinor: 200, currency: "USD", paidMinor: null, paidAt: null },
      ]);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, costMinor: 9500 } });
      expect(r.isError).toBe(true);
      expect(updateAccommodation).not.toHaveBeenCalled();
    });

    it("checks trip access before using the loaded row, so a non-member's accommodation id returns NOT_FOUND_TEXT and does not call updateAccommodation", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, name: "New" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateAccommodation).not.toHaveBeenCalled();
    });

    it("a made-up accommodation id returns the same NOT_FOUND_TEXT", async () => {
      accommodationFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: "nope", name: "New" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateAccommodation).not.toHaveBeenCalled();
    });
  });

  it("delete_accommodation calls deleteAccommodation and its description is permanent", async () => {
    deleteAccommodation.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_accommodation")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.annotations?.destructiveHint).toBe(true);
    await c.callTool({ name: "delete_accommodation", arguments: { accommodationId: ACCOMMODATION_ID } });
    expect(deleteAccommodation).toHaveBeenCalledWith(ACCOMMODATION_ID);
  });

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  it("add_transport calls createTransport with tripId and a single input argument, no forkId", async () => {
    createTransport.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_transport",
      arguments: { tripId: TRIP_ID, mode: "FLIGHT", depAt: "2026-05-01T08:00", arrAt: "2026-05-01T10:00" },
    });
    expect(createTransport).toHaveBeenCalledTimes(1);
    const call = createTransport.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(TRIP_ID);
    expect(call[1]).toEqual(expect.objectContaining({ mode: "FLIGHT", depAt: "2026-05-01T08:00", arrAt: "2026-05-01T10:00" }));
  });

  describe("update_transport (PATCH)", () => {
    it("with only reference keeps every other field, including stop ids, home flags and times", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, reference: "NEW-REF" } });
      expect(updateTransport).toHaveBeenCalledWith(TRANSPORT_ID, {
        mode: "FLIGHT",
        fromStopId: "stop-a",
        toStopId: "stop-b",
        anchorStopId: undefined,
        depIsHome: false,
        arrIsHome: false,
        depPlace: undefined,
        arrPlace: undefined,
        depAt: transportRow().depAt,
        arrAt: transportRow().arrAt,
        reference: "NEW-REF",
        notes: "old transport notes",
      });
      expect(costFindMany).not.toHaveBeenCalled();
    });

    it("forwards depIsHome (true) when the patch doesn't mention it, instead of resetting it false", async () => {
      transportFindUnique.mockResolvedValue(transportRow({ depIsHome: true, fromStopId: null, depPlace: null }));
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, reference: "NEW-REF" } });
      const call = updateTransport.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ depIsHome: true }));
    });

    it("costMinor-only update on a paid owned Cost forwards currency, paidMinor and paidAt together", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      costFindMany.mockResolvedValue([
        { costMinor: 20000, currency: "GBP", paidMinor: 20000, paidAt: new Date("2026-03-01T00:00:00.000Z") },
      ]);
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, costMinor: 21000 } });
      const call = updateTransport.mock.calls[0];
      expect(call[1]).toEqual(
        expect.objectContaining({ costMinor: 21000, currency: "GBP", paidMinor: 20000, paidAt: "2026-03-01" }),
      );
    });

    it("the merged input for a costMinor-only update on a paid owned Cost passes the REAL transportSchema", async () => {
      const current: TransportRow = transportRow();
      costFindMany.mockResolvedValue([
        { costMinor: 20000, currency: "GBP", paidMinor: 20000, paidAt: new Date("2026-03-01T00:00:00.000Z") },
      ]);
      const inlineCost = await completeInlineCost("TRANSPORT", TRANSPORT_ID, { costMinor: 21000 });
      expect(isFailure(inlineCost)).toBe(false);
      if (isFailure(inlineCost)) throw new Error("unreachable");
      const merged = mergeTransportPatch(current, { costMinor: 21000 }, inlineCost);
      expect(isFailure(merged)).toBe(false);
      if (isFailure(merged)) throw new Error("unreachable");
      const parsed = transportSchema.safeParse(merged);
      expect(parsed.success).toBe(true);
    });

    it("setting fromStopId on a currently-Home departure clears depIsHome and depPlace", async () => {
      transportFindUnique.mockResolvedValue(transportRow({ depIsHome: true, fromStopId: null, depPlace: null }));
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, fromStopId: "stop-new" } });
      const call = updateTransport.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ fromStopId: "stop-new", depIsHome: false, depPlace: undefined }));
    });

    it("setting depPlace on a currently-stop departure clears fromStopId", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, depPlace: "The station" } });
      const call = updateTransport.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ depPlace: "The station", fromStopId: undefined, depIsHome: false }));
    });

    it("setting depIsHome true alone clears fromStopId/depPlace", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, depIsHome: true } });
      const call = updateTransport.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ depIsHome: true, fromStopId: undefined, depPlace: undefined }));
    });

    it("depIsHome true together with fromStopId in the same patch is a tool error", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_transport",
        arguments: { transportId: TRANSPORT_ID, depIsHome: true, fromStopId: "stop-new" },
      });
      expect(r.isError).toBe(true);
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("fromStopId together with depPlace in the same patch is a tool error", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_transport",
        arguments: { transportId: TRANSPORT_ID, fromStopId: "stop-new", depPlace: "Somewhere" },
      });
      expect(r.isError).toBe(true);
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("un-homing an endpoint with no stop/place to fall back on is a tool error", async () => {
      transportFindUnique.mockResolvedValue(transportRow({ depIsHome: true, fromStopId: null, depPlace: null }));
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, depIsHome: false } });
      expect(r.isError).toBe(true);
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("costMinor against more than one owned Cost is a tool error, not a silent no-op", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      costFindMany.mockResolvedValue([
        { costMinor: 100, currency: "USD", paidMinor: null, paidAt: null },
        { costMinor: 200, currency: "USD", paidMinor: null, paidAt: null },
      ]);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, costMinor: 9500 } });
      expect(r.isError).toBe(true);
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("checks trip access before using the loaded row, so a non-member's transport id returns NOT_FOUND_TEXT and does not call updateTransport", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, reference: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("a made-up transport id returns the same NOT_FOUND_TEXT", async () => {
      transportFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: "nope", reference: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateTransport).not.toHaveBeenCalled();
    });
  });

  it("delete_transport calls deleteTransport and its description is permanent", async () => {
    deleteTransport.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_transport")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.annotations?.destructiveHint).toBe(true);
    await c.callTool({ name: "delete_transport", arguments: { transportId: TRANSPORT_ID } });
    expect(deleteTransport).toHaveBeenCalledWith(TRANSPORT_ID);
  });

  // -------------------------------------------------------------------------
  // Cost
  // -------------------------------------------------------------------------

  it("add_cost calls createCost with tripId and a single input argument, no forkId", async () => {
    createCost.mockResolvedValue({ success: true, cost: { id: "c1" } });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_cost",
      arguments: { tripId: TRIP_ID, costMinor: 5000, currency: "USD", ownerType: "OTHER", label: "Visa fee" },
    });
    expect(createCost).toHaveBeenCalledTimes(1);
    const call = createCost.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(TRIP_ID);
    expect(call[1]).toEqual(expect.objectContaining({ costMinor: 5000, currency: "USD", ownerType: "OTHER", label: "Visa fee" }));
  });

  it("add_cost schema has no paidMinor/paidAt (a new Cost is unpaid; use mark_cost_paid)", async () => {
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "add_cost")!;
    const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).not.toContain("paidMinor");
    expect(Object.keys(props)).not.toContain("paidAt");
  });

  describe("update_cost (PATCH)", () => {
    it("with only category keeps every other field, including the paid amount and date", async () => {
      costFindUnique.mockResolvedValue(costRow());
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "New category" } });
      expect(updateCost).toHaveBeenCalledWith(COST_ID, {
        costMinor: 10000,
        currency: "USD",
        ownerType: "OTHER",
        ownerId: undefined,
        label: "Travel insurance",
        category: "New category",
        dueDate: undefined,
        settlement: "BEFORE",
        paidMinor: 10000,
        paidAt: "2026-04-01",
      });
    });

    it("a currency change on a paid Cost still forwards paidMinor/paidAt, matching the dialog resubmitting the same paid pair", async () => {
      costFindUnique.mockResolvedValue(costRow());
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, currency: "EUR" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ currency: "EUR", paidMinor: 10000, paidAt: "2026-04-01" }));
    });

    it("re-stating the same currency also forwards the paid pair", async () => {
      costFindUnique.mockResolvedValue(costRow());
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, currency: "USD" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ paidMinor: 10000, paidAt: "2026-04-01" }));
    });

    it("an unpaid Cost (no paidAt) forwards neither paidMinor nor paidAt", async () => {
      costFindUnique.mockResolvedValue(costRow({ paidAt: null }));
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "x" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ paidMinor: undefined, paidAt: undefined }));
    });

    it("a legacy row with paidAt set but paidMinor null is treated as unpaid (forwards neither)", async () => {
      costFindUnique.mockResolvedValue(costRow({ paidMinor: null }));
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "x" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ paidMinor: undefined, paidAt: undefined }));
    });

    it("drops dueDate when the patch sets settlement to ON_TRIP", async () => {
      costFindUnique.mockResolvedValue(costRow({ paidAt: null, paidMinor: null, dueDate: "2026-06-01" }));
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, settlement: "ON_TRIP" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ settlement: "ON_TRIP", dueDate: undefined }));
    });

    it("drops dueDate when the Cost is paid, even if a dueDate is present on the row", async () => {
      costFindUnique.mockResolvedValue(costRow({ dueDate: "2026-06-01" }));
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "x" } });
      const call = updateCost.mock.calls[0];
      expect(call[1]).toEqual(expect.objectContaining({ dueDate: undefined }));
    });

    it("checks trip access before using the loaded row, so a non-member's cost id returns NOT_FOUND_TEXT and does not call updateCost", async () => {
      costFindUnique.mockResolvedValue(costRow());
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateCost).not.toHaveBeenCalled();
    });

    it("a made-up cost id returns the same NOT_FOUND_TEXT", async () => {
      costFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_cost", arguments: { costId: "nope", category: "x" } });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(updateCost).not.toHaveBeenCalled();
    });
  });

  it("delete_cost calls deleteCost and its description is permanent", async () => {
    deleteCost.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    const tools = (await c.listTools()).tools;
    const tool = tools.find((t) => t.name === "delete_cost")!;
    expect(tool.description?.toLowerCase()).toContain("permanent");
    expect(tool.annotations?.destructiveHint).toBe(true);
    await c.callTool({ name: "delete_cost", arguments: { costId: COST_ID } });
    expect(deleteCost).toHaveBeenCalledWith(COST_ID);
  });

  describe("mark_cost_paid / mark_cost_unpaid", () => {
    it("mark_cost_paid loads the Cost, checks trip access, then calls markCostPaid", async () => {
      costFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      markCostPaid.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "mark_cost_paid", arguments: { costId: COST_ID, paidMinor: 10000, paidAt: "2026-04-01" } });
      expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID);
      expect(markCostPaid).toHaveBeenCalledWith(COST_ID, 10000, "2026-04-01");
    });

    it("mark_cost_unpaid loads the Cost, checks trip access, then calls markCostUnpaid", async () => {
      costFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      markCostUnpaid.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "mark_cost_unpaid", arguments: { costId: COST_ID } });
      expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID);
      expect(markCostUnpaid).toHaveBeenCalledWith(COST_ID);
    });

    it("a made-up cost id gives NOT_FOUND_TEXT for both, action never called", async () => {
      costFindUnique.mockResolvedValue(null);
      const c = await connectTestClient();
      const rPaid = await c.callTool({ name: "mark_cost_paid", arguments: { costId: "nope", paidMinor: 100, paidAt: "2026-04-01" } });
      expect(rPaid.isError).toBe(true);
      expect((rPaid.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(markCostPaid).not.toHaveBeenCalled();

      const rUnpaid = await c.callTool({ name: "mark_cost_unpaid", arguments: { costId: "nope" } });
      expect(rUnpaid.isError).toBe(true);
      expect((rUnpaid.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(markCostUnpaid).not.toHaveBeenCalled();
    });

    it("a non-member's cost id gives the same NOT_FOUND_TEXT for both, action never called", async () => {
      costFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const rPaid = await c.callTool({ name: "mark_cost_paid", arguments: { costId: COST_ID, paidMinor: 100, paidAt: "2026-04-01" } });
      expect(rPaid.isError).toBe(true);
      expect((rPaid.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(markCostPaid).not.toHaveBeenCalled();

      const rUnpaid = await c.callTool({ name: "mark_cost_unpaid", arguments: { costId: COST_ID } });
      expect(rUnpaid.isError).toBe(true);
      expect((rUnpaid.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(markCostUnpaid).not.toHaveBeenCalled();
    });
  });

  it("an action failure maps to isError (update_cost)", async () => {
    costFindUnique.mockResolvedValue(costRow());
    updateCost.mockResolvedValue({ success: false, errors: { costMinor: ["Cost must be 0 or greater"] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, costMinor: 100 } });
    expect(r.isError).toBe(true);
  });
});
