import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  setNothingToAttach: vi.fn(),
  loadItemForMcp: vi.fn(), loadTransportForMcp: vi.fn(), loadAccommodationForMcp: vi.fn(),
  requireRealPlanRow: vi.fn(),
}));
vi.mock("@/server/actions/booking-confirmation", () => ({ setNothingToAttach: m.setNothingToAttach }));
vi.mock("../reads/entities", () => ({ loadItemForMcp: m.loadItemForMcp, loadTransportForMcp: m.loadTransportForMcp, loadAccommodationForMcp: m.loadAccommodationForMcp }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow, requireRealPlanRows: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;

describe("set_nothing_to_attach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
    m.setNothingToAttach.mockResolvedValue({ success: true });
    m.loadTransportForMcp.mockResolvedValue({ id: "tr-1", nothingToAttach: true, needsBookingConfirmation: false });
    m.loadItemForMcp.mockResolvedValue({ id: "it-1", nothingToAttach: false, needsBookingConfirmation: true });
    m.loadAccommodationForMcp.mockResolvedValue({ id: "acc-1", nothingToAttach: true, needsBookingConfirmation: false });
  });

  it("sets it and returns the leg as it now stands", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_nothing_to_attach", arguments: { kind: "TRANSPORT", id: "tr-1", nothingToAttach: true } });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("transport", "tr-1");
    expect(m.setNothingToAttach).toHaveBeenCalledWith("TRANSPORT", "tr-1", true);
    expect(JSON.parse(text(r))).toEqual({ transport: { id: "tr-1", nothingToAttach: true, needsBookingConfirmation: false } });
  });

  it("reads back an item and a stay under their own keys", async () => {
    const c = await connectTestClient();
    const item = await c.callTool({ name: "set_nothing_to_attach", arguments: { kind: "ITEM", id: "it-1", nothingToAttach: false } });
    expect(JSON.parse(text(item)).item.id).toBe("it-1");
    const stay = await c.callTool({ name: "set_nothing_to_attach", arguments: { kind: "ACCOMMODATION", id: "acc-1", nothingToAttach: true } });
    expect(m.setNothingToAttach).toHaveBeenLastCalledWith("ACCOMMODATION", "acc-1", true);
    expect(JSON.parse(text(stay)).accommodation.id).toBe("acc-1");
  });

  it("reports the action's refusal and reads nothing back", async () => {
    m.setNothingToAttach.mockResolvedValue({ success: false, errors: { nothingToAttach: ["Only a Booked thing can have nothing to attach."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_nothing_to_attach", arguments: { kind: "ITEM", id: "it-1", nothingToAttach: true } });
    expect(r.isError).toBe(true);
    expect(m.loadItemForMcp).not.toHaveBeenCalled();
  });

  it("a Fork's row reads as not found", async () => {
    m.requireRealPlanRow.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_nothing_to_attach", arguments: { kind: "TRANSPORT", id: "fork-leg", nothingToAttach: true } });
    expect(text(r)).toBe(NOT_FOUND_TEXT);
    expect(m.setNothingToAttach).not.toHaveBeenCalled();
  });
});
