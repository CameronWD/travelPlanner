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
  stopFindUnique,
  itemFindUnique,
  loadAccommodationForMcp,
  loadTransportForMcp,
  loadCostForMcp,
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
  stopFindUnique: vi.fn(),
  itemFindUnique: vi.fn(),
  loadAccommodationForMcp: vi.fn(),
  loadTransportForMcp: vi.fn(),
  loadCostForMcp: vi.fn(),
}));

vi.mock("@/server/actions/accommodation", () => ({ createAccommodation, updateAccommodation, deleteAccommodation }));
vi.mock("@/server/actions/transport", () => ({ createTransport, updateTransport, deleteTransport }));
vi.mock("@/server/actions/costs", () => ({ createCost, updateCost, deleteCost, markCostPaid, markCostUnpaid }));
vi.mock("../reads/entities", () => ({ loadAccommodationForMcp, loadTransportForMcp }));
vi.mock("../reads/costs", () => ({ loadCostForMcp }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    accommodation: { findUnique: accommodationFindUnique },
    transport: { findUnique: transportFindUnique },
    cost: { findUnique: costFindUnique, findMany: costFindMany },
    stop: { findUnique: stopFindUnique },
    item: { findUnique: itemFindUnique },
  },
}));
// The rest of the server (reads.ts, trips-read.ts, trips-stops-write.ts,
// plan-write.ts) touches these only when their own tools are *called*;
// stubbing keeps buildMcpServer's full registration side-effect-free here
// without reproducing every property.
//
// requireRealPlanRow (lib/mcp/real-plan.ts) is now a thin wrapper over
// requireRowAccess (lib/guards.ts, card C); this mock stands in for that
// guard exactly as the pre-Task-5 real-plan.ts used to do it directly —
// same db.<kind>.findUnique call shape (so every existing assertion on it
// keeps working unchanged), same requireTripAccess, and — for accommodation
// and cost, which carry a Surprise ref — the real (unmocked)
// requireOutsideSurprise, with the same extra ownerType/ownerId lookup the
// old surpriseRefFor made for a cost. No test here exercises a Surprise
// refusal on a booking, but this stays faithful to production.
const requireRowAccessMock = vi.hoisted(() =>
  vi.fn(async (kind: string, id: string) => {
    const args = { where: { id, forkId: null }, select: { tripId: true } };
    let row: Record<string, unknown> | null = null;
    if (kind === "accommodation") row = await accommodationFindUnique(args);
    else if (kind === "transport") row = await transportFindUnique(args);
    else if (kind === "cost") row = await costFindUnique(args);
    else if (kind === "stop") row = await stopFindUnique(args);
    else if (kind === "item") row = await itemFindUnique(args);
    if (!row) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    const { user, membership } = await requireTripAccess((row as { tripId: string }).tripId);
    let surpriseOf = null;
    const { requireOutsideSurprise } = await import("@/lib/surprise-guard");
    if (kind === "accommodation") {
      surpriseOf = await requireOutsideSurprise(user.id, { accommodationId: id });
    } else if (kind === "cost") {
      const cost = await costFindUnique({ where: { id }, select: { ownerType: true, ownerId: true } });
      if (cost) surpriseOf = await requireOutsideSurprise(user.id, { costOwner: cost });
    } else if (kind === "stop") {
      surpriseOf = await requireOutsideSurprise(user.id, { stopId: id });
    } else if (kind === "item") {
      surpriseOf = await requireOutsideSurprise(user.id, { itemId: id });
    }
    return { row, user, membership, surpriseOf };
  }),
);
vi.mock("@/lib/guards", () => ({
  requireTripAccess,
  requireUser: vi.fn(),
  isTripOwnerOrAdmin: vi.fn(),
  requireRowAccess: requireRowAccessMock,
}));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";
import { MORE_THAN_ONE_COST } from "@/lib/money/cost-patch";

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
    // Real-plan pre-check default: every id names a real-plan row on TRIP_ID.
    stopFindUnique.mockResolvedValue({ tripId: TRIP_ID });
    accommodationFindUnique.mockResolvedValue(accommodationRow());
    transportFindUnique.mockResolvedValue(transportRow());
    costFindUnique.mockResolvedValue(costRow());
    itemFindUnique.mockResolvedValue({ tripId: TRIP_ID });
    loadAccommodationForMcp.mockImplementation(async (id: string) => ({ id }));
    loadTransportForMcp.mockImplementation(async (id: string) => ({ id }));
    loadCostForMcp.mockImplementation(async (id: string) => ({ id }));
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
    it("checks the Accommodation and any new Stop are real-plan, then forwards only the fields passed", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      updateAccommodation.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, name: "Hilton Garden Inn", costMinor: 9500 } });
      expect(updateAccommodation).toHaveBeenCalledWith(ACCOMMODATION_ID, { name: "Hilton Garden Inn", costMinor: 9500 });
      expect(costFindMany).not.toHaveBeenCalled(); // completion is the action's now
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

    it("more than one owned Cost: the app's Traveller-wording refusal gets the tool's own update_cost sentence appended", async () => {
      accommodationFindUnique.mockResolvedValue(accommodationRow());
      updateAccommodation.mockResolvedValue(MORE_THAN_ONE_COST);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: ACCOMMODATION_ID, costMinor: 9500 } });
      expect(r.isError).toBe(true);
      const t = (r.content as { text: string }[])[0].text;
      expect(t).toContain("This now has more than one Cost — edit them in Money.");
      expect(t).toContain("Use update_cost to edit a specific one.");
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

  it("add_transport forwards fromStopId and depPlace together", async () => {
    createTransport.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    await c.callTool({
      name: "add_transport",
      arguments: {
        tripId: TRIP_ID,
        mode: "FLIGHT",
        fromStopId: STOP_ID,
        depPlace: "Paris Gare du Nord",
        depAt: "2026-05-01T08:00",
        arrAt: "2026-05-01T10:00",
      },
    });
    const call = createTransport.mock.calls[0];
    expect(call[1]).toEqual(expect.objectContaining({ fromStopId: STOP_ID, depPlace: "Paris Gare du Nord" }));
  });

  it("add_transport rejects depIsHome true together with depPlace (spec B2)", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({
      name: "add_transport",
      arguments: {
        tripId: TRIP_ID,
        mode: "FLIGHT",
        depIsHome: true,
        depPlace: "Gold Coast Airport",
        depAt: "2026-05-01T08:00",
        arrAt: "2026-05-01T10:00",
      },
    });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain(
      "depIsHome can't be true together with fromStopId or depPlace.",
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("add_transport rejects arrIsHome true together with arrPlace (spec B2)", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({
      name: "add_transport",
      arguments: {
        tripId: TRIP_ID,
        mode: "FLIGHT",
        arrIsHome: true,
        arrPlace: "Gold Coast Airport",
        depAt: "2026-05-01T08:00",
        arrAt: "2026-05-01T10:00",
      },
    });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain(
      "arrIsHome can't be true together with toStopId or arrPlace.",
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("add_transport with fromStopId \"\" and depPlace succeeds without the real-plan stop check, and forwards both", async () => {
    createTransport.mockResolvedValue({ success: true });
    const c = await connectTestClient();
    const r = await c.callTool({
      name: "add_transport",
      arguments: {
        tripId: TRIP_ID,
        mode: "FLIGHT",
        fromStopId: "",
        depPlace: "Milan Malpensa (MXP)",
        depAt: "2026-05-01T08:00",
        arrAt: "2026-05-01T10:00",
      },
    });
    expect(r.isError).toBeFalsy();
    expect(stopFindUnique).not.toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledTimes(1);
    const call = createTransport.mock.calls[0];
    expect(call[1]).toEqual(expect.objectContaining({ fromStopId: "", depPlace: "Milan Malpensa (MXP)" }));
  });

  describe("update_transport (PATCH)", () => {
    // The endpoint merge is lib/transport-patch.ts's (its tests); the inline Cost and the held row are the action's.
    it("checks the Transport and any named Stops are real-plan, then forwards only the fields passed", async () => {
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, reference: "FR 9514", depPlace: "" } });
      expect(updateTransport).toHaveBeenCalledWith(TRANSPORT_ID, { reference: "FR 9514", depPlace: "" });
      expect(transportFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TRANSPORT_ID, forkId: null } }));
      expect(costFindMany).not.toHaveBeenCalled();
    });

    it("fromStopId \"\" together with depPlace \"\" leaves neither a stop nor a place and is a tool error", async () => {
      transportFindUnique.mockResolvedValue(transportRow({ fromStopId: "stop-a", depPlace: "Gare du Nord" }));
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_transport",
        arguments: { transportId: TRANSPORT_ID, fromStopId: "", depPlace: "" },
      });
      expect(r.isError).toBe(true);
      expect((r.content as { text: string }[])[0].text).toContain("Departure needs a stop or a place.");
      expect(updateTransport).not.toHaveBeenCalled();
    });

    it("depIsHome true with an empty depPlace is Home, not a tool error (deviation 5)", async () => {
      updateTransport.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, depIsHome: true, depPlace: "" } });
      expect(r.isError).toBeFalsy();
      expect(updateTransport).toHaveBeenCalledWith(TRANSPORT_ID, { depIsHome: true, depPlace: "" });
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

    it("more than one owned Cost: the app's Traveller-wording refusal gets the tool's own update_cost sentence appended", async () => {
      transportFindUnique.mockResolvedValue(transportRow());
      updateTransport.mockResolvedValue(MORE_THAN_ONE_COST);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_transport", arguments: { transportId: TRANSPORT_ID, costMinor: 9500 } });
      expect(r.isError).toBe(true);
      const t = (r.content as { text: string }[])[0].text;
      expect(t).toContain("This now has more than one Cost — edit them in Money.");
      expect(t).toContain("Use update_cost to edit a specific one.");
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
    it("checks the Cost is real-plan, then forwards only the fields passed", async () => {
      costFindUnique.mockResolvedValue(costRow());
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "Tours" } });
      expect(requireRowAccessMock).toHaveBeenCalledWith("cost", COST_ID, { realPlanOnly: true });
      expect(updateCost).toHaveBeenCalledWith(COST_ID, { category: "Tours" });
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
  describe("real plan only: a Fork's row reads as not found", () => {
    // A Fork-owned row exists, but only a query not scoped to forkId: null finds it.
    const forkOnly = (row: Record<string, unknown>) => ({ where }: { where: { forkId?: unknown } }) =>
      Promise.resolve(where.forkId === null ? null : row);

    it("delete_accommodation, delete_transport and delete_cost with a Fork's id are NOT_FOUND_TEXT and delete nothing", async () => {
      accommodationFindUnique.mockImplementation(forkOnly(accommodationRow()));
      transportFindUnique.mockImplementation(forkOnly(transportRow()));
      costFindUnique.mockImplementation(forkOnly(costRow()));
      const c = await connectTestClient();
      for (const [name, args] of [
        ["delete_accommodation", { accommodationId: "fork-acc" }],
        ["delete_transport", { transportId: "fork-transport" }],
        ["delete_cost", { costId: "fork-cost" }],
      ] as const) {
        const r = await c.callTool({ name, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      }
      expect(deleteAccommodation).not.toHaveBeenCalled();
      expect(deleteTransport).not.toHaveBeenCalled();
      expect(deleteCost).not.toHaveBeenCalled();
    });

    const stopCases: [string, Record<string, unknown>, () => unknown][] = [
      ["add_accommodation", { stopId: "fork-stop", name: "H", checkIn: "2026-05-01", checkOut: "2026-05-04" }, () => createAccommodation],
      ["update_accommodation", { accommodationId: ACCOMMODATION_ID, stopId: "fork-stop" }, () => updateAccommodation],
      ["add_transport", { tripId: TRIP_ID, mode: "FLIGHT", fromStopId: "fork-stop", depAt: "2026-05-01T08:00", arrAt: "2026-05-01T10:00" }, () => createTransport],
      ["add_transport", { tripId: TRIP_ID, mode: "FLIGHT", toStopId: "fork-stop", depAt: "2026-05-01T08:00", arrAt: "2026-05-01T10:00" }, () => createTransport],
      ["update_transport", { transportId: TRANSPORT_ID, toStopId: "fork-stop" }, () => updateTransport],
    ];
    for (const [tool, args, action] of stopCases) {
      it(`${tool} with a Fork's stop id (${Object.keys(args).find((k) => args[k] === "fork-stop")}) is NOT_FOUND_TEXT and calls no action`, async () => {
        stopFindUnique.mockImplementation(forkOnly({ tripId: TRIP_ID }));
        const c = await connectTestClient();
        const r = await c.callTool({ name: tool, arguments: args });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(action()).not.toHaveBeenCalled();
      });
    }

    it("a non-member's accommodation id on delete_accommodation is NOT_FOUND_TEXT", async () => {
      requireTripAccess.mockRejectedValue(notFoundErr());
      const c = await connectTestClient();
      const r = await c.callTool({ name: "delete_accommodation", arguments: { accommodationId: ACCOMMODATION_ID } });
      expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
      expect(deleteAccommodation).not.toHaveBeenCalled();
    });

    // add_cost/update_cost: ownerId names a Transport/Accommodation/Item, so
    // a Fork's id on the same trip must be rejected too (the gap this fixes
    // — verifyOwnerEntity in server/actions/costs.ts only checks tripId).
    const ownerCases: [string, string][] = [
      ["TRANSPORT", "fork-transport"],
      ["ACCOMMODATION", "fork-acc"],
      ["ITEM", "fork-item"],
    ];

    for (const [ownerType, forkId] of ownerCases) {
      it(`add_cost with a Fork's ${ownerType} ownerId is NOT_FOUND_TEXT and calls no action`, async () => {
        transportFindUnique.mockImplementation(forkOnly(transportRow()));
        accommodationFindUnique.mockImplementation(forkOnly(accommodationRow()));
        itemFindUnique.mockImplementation(forkOnly({ tripId: TRIP_ID }));
        const c = await connectTestClient();
        const r = await c.callTool({
          name: "add_cost",
          arguments: { tripId: TRIP_ID, costMinor: 500, currency: "USD", ownerType, ownerId: forkId },
        });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(createCost).not.toHaveBeenCalled();
      });

      it(`update_cost with a Fork's ${ownerType} ownerId is NOT_FOUND_TEXT and calls no action`, async () => {
        costFindUnique.mockResolvedValue(costRow());
        transportFindUnique.mockImplementation(forkOnly(transportRow()));
        accommodationFindUnique.mockImplementation(forkOnly(accommodationRow()));
        itemFindUnique.mockImplementation(forkOnly({ tripId: TRIP_ID }));
        const c = await connectTestClient();
        const r = await c.callTool({
          name: "update_cost",
          arguments: { costId: COST_ID, ownerType, ownerId: forkId },
        });
        expect(r.isError).toBe(true);
        expect((r.content as { text: string }[])[0].text).toBe(NOT_FOUND_TEXT);
        expect(updateCost).not.toHaveBeenCalled();
      });
    }

    it("add_cost with a real-plan owner still works (TRANSPORT)", async () => {
      createCost.mockResolvedValue({ success: true, cost: { id: "c1" } });
      transportFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_cost",
        arguments: { tripId: TRIP_ID, costMinor: 500, currency: "USD", ownerType: "TRANSPORT", ownerId: TRANSPORT_ID },
      });
      expect(r.isError).toBeFalsy();
      expect(createCost).toHaveBeenCalledTimes(1);
    });

    it("update_cost with a real-plan owner still works (ACCOMMODATION)", async () => {
      costFindUnique.mockResolvedValue(costRow());
      updateCost.mockResolvedValue({ success: true });
      accommodationFindUnique.mockResolvedValue({ tripId: TRIP_ID });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "update_cost",
        arguments: { costId: COST_ID, ownerType: "ACCOMMODATION", ownerId: ACCOMMODATION_ID },
      });
      expect(r.isError).toBeFalsy();
      expect(updateCost).toHaveBeenCalledTimes(1);
    });

    it("add_cost with ownerType OTHER and no ownerId is unaffected (no real-plan check attempted)", async () => {
      createCost.mockResolvedValue({ success: true, cost: { id: "c1" } });
      const c = await connectTestClient();
      const r = await c.callTool({
        name: "add_cost",
        arguments: { tripId: TRIP_ID, costMinor: 500, currency: "USD", ownerType: "OTHER", label: "Visa fee" },
      });
      expect(r.isError).toBeFalsy();
      expect(transportFindUnique).not.toHaveBeenCalled();
      expect(accommodationFindUnique).not.toHaveBeenCalled();
      expect(itemFindUnique).not.toHaveBeenCalled();
      expect(createCost).toHaveBeenCalledTimes(1);
    });

    it("update_cost with neither ownerType nor ownerId supplied skips the owner check (already accepted)", async () => {
      costFindUnique.mockResolvedValue(costRow({ ownerType: "OTHER", ownerId: null }));
      updateCost.mockResolvedValue({ success: true });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_cost", arguments: { costId: COST_ID, category: "x" } });
      expect(r.isError).toBeFalsy();
      expect(transportFindUnique).not.toHaveBeenCalled();
      expect(accommodationFindUnique).not.toHaveBeenCalled();
      expect(itemFindUnique).not.toHaveBeenCalled();
      expect(updateCost).toHaveBeenCalledTimes(1);
    });
  });

  describe("writes return the row (F6)", () => {
    const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

    beforeEach(() => {
      transportFindUnique.mockResolvedValue({ tripId: "trip-1" });
      accommodationFindUnique.mockResolvedValue({ tripId: "trip-1" });
      costFindUnique.mockResolvedValue({ tripId: "trip-1" });
    });

    it("add_transport returns the new leg through get_transport", async () => {
      createTransport.mockResolvedValue({ success: true, id: "tr-new" });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_transport", arguments: { tripId: "trip-1", mode: "TRAIN", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" } });
      expect(body(r)).toEqual({ transport: { id: "tr-new" } });
    });

    it("add_cost returns the new Cost in list_costs' shape", async () => {
      createCost.mockResolvedValue({ success: true, cost: { id: "cost-new" } });
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_cost", arguments: { tripId: "trip-1", costMinor: 1000, currency: "AUD", ownerType: "OTHER", label: "Insurance" } });
      expect(body(r)).toEqual({ cost: { id: "cost-new" } });
    });

    it("a refusal before the action reads nothing back", async () => {
      const c = await connectTestClient();
      const r = await c.callTool({ name: "add_transport", arguments: { tripId: "trip-1", mode: "TRAIN", depIsHome: true, depPlace: "Central", depAt: "2027-06-04T09:00", arrAt: "2027-06-04T12:00" } });
      expect(r.isError).toBe(true);
      expect(loadTransportForMcp).not.toHaveBeenCalled();
    });

    it.each([
      ["add_accommodation", { stopId: "stop-1", name: "Hotel", checkIn: "2027-06-01", checkOut: "2027-06-03" }, () => createAccommodation.mockResolvedValue({ success: true, id: "acc-new" }), { accommodation: { id: "acc-new" } }],
      ["update_accommodation", { accommodationId: "acc-1", name: "Hotel" }, () => updateAccommodation.mockResolvedValue({ success: true }), { accommodation: { id: "acc-1" } }],
      ["delete_accommodation", { accommodationId: "acc-1" }, () => deleteAccommodation.mockResolvedValue({ success: true }), { deleted: "acc-1" }],
      ["update_transport", { transportId: "tr-1", reference: "Q1" }, () => updateTransport.mockResolvedValue({ success: true }), { transport: { id: "tr-1" } }],
      ["delete_transport", { transportId: "tr-1" }, () => deleteTransport.mockResolvedValue({ success: true }), { deleted: "tr-1" }],
      ["update_cost", { costId: "cost-1", label: "Cover" }, () => updateCost.mockResolvedValue({ success: true }), { cost: { id: "cost-1" } }],
      ["delete_cost", { costId: "cost-1" }, () => deleteCost.mockResolvedValue({ success: true }), { deleted: "cost-1" }],
      ["mark_cost_paid", { costId: "cost-1", paidMinor: 1000, paidAt: "2027-06-01" }, () => markCostPaid.mockResolvedValue({ success: true }), { cost: { id: "cost-1" } }],
      ["mark_cost_unpaid", { costId: "cost-1" }, () => markCostUnpaid.mockResolvedValue({ success: true }), { cost: { id: "cost-1" } }],
    ] as const)("%s returns the row as it now stands", async (name, args, prime, expected) => {
      prime();
      const c = await connectTestClient();
      const r = await c.callTool({ name, arguments: args });
      expect(body(r)).toEqual(expected);
    });

    it("update_accommodation's more-than-one-Cost refusal reads nothing back", async () => {
      const { MORE_THAN_ONE_COST } = await import("@/lib/money/cost-patch");
      updateAccommodation.mockResolvedValue(MORE_THAN_ONE_COST);
      const c = await connectTestClient();
      const r = await c.callTool({ name: "update_accommodation", arguments: { accommodationId: "acc-1", costMinor: 500 } });
      expect(r.isError).toBe(true);
      expect(loadAccommodationForMcp).not.toHaveBeenCalled();
    });
  });
});
