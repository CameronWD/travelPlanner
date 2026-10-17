import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  updateItem: vi.fn(), updateTransport: vi.fn(), updateAccommodation: vi.fn(),
  loadItemForMcp: vi.fn(), loadTransportForMcp: vi.fn(), loadAccommodationForMcp: vi.fn(),
  requireRealPlanRow: vi.fn(),
}));
vi.mock("@/server/actions/items", () => ({ updateItem: m.updateItem }));
vi.mock("@/server/actions/transport", () => ({ updateTransport: m.updateTransport }));
vi.mock("@/server/actions/accommodation", () => ({ updateAccommodation: m.updateAccommodation }));
vi.mock("../reads/entities", () => ({ loadItemForMcp: m.loadItemForMcp, loadTransportForMcp: m.loadTransportForMcp, loadAccommodationForMcp: m.loadAccommodationForMcp }));
vi.mock("../real-plan", () => ({ requireRealPlanRow: m.requireRealPlanRow, requireRealPlanRows: vi.fn() }));
// buildMcpServer registers every group; these keep the rest import-clean (as vocab.test.ts does).
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;

describe("set_booking_state (spec R2, R13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireRealPlanRow.mockResolvedValue({ tripId: "trip-1" });
    for (const fn of [m.updateItem, m.updateTransport, m.updateAccommodation]) fn.mockResolvedValue({ success: true });
    m.loadTransportForMcp.mockResolvedValue({ id: "tr-1", bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    m.loadItemForMcp.mockResolvedValue({ id: "it-1", bookingState: "BOOKED", bookBy: null });
    m.loadAccommodationForMcp.mockResolvedValue({ id: "acc-1", bookingState: "NONE", bookBy: null });
  });

  it("sets a leg To book by a date and returns the leg as it now stands", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "TRANSPORT", id: "tr-1", state: "TO_BOOK", bookBy: "2027-05-01" } });
    expect(m.requireRealPlanRow).toHaveBeenCalledWith("transport", "tr-1");
    expect(m.updateTransport).toHaveBeenCalledWith("tr-1", { bookingState: "TO_BOOK", bookBy: "2027-05-01" });
    expect(JSON.parse(text(r))).toEqual({ transport: { id: "tr-1", bookingState: "TO_BOOK", bookBy: "2027-05-01" } });
  });

  it("replaces both: no bookBy means no book-by date", async () => {
    const c = await connectTestClient();
    await c.callTool({ name: "set_booking_state", arguments: { kind: "ITEM", id: "it-1", state: "BOOKED" } });
    expect(m.updateItem).toHaveBeenCalledWith("it-1", { bookingState: "BOOKED", bookBy: null });
    await c.callTool({ name: "set_booking_state", arguments: { kind: "ACCOMMODATION", id: "acc-1", state: "NONE" } });
    expect(m.updateAccommodation).toHaveBeenCalledWith("acc-1", { bookingState: "NONE", bookBy: null });
  });

  it("reports the action's refusal and reads nothing back", async () => {
    m.updateItem.mockResolvedValue({ success: false, errors: { bookBy: ["A book-by date is only for something still to book."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "ITEM", id: "it-1", state: "BOOKED", bookBy: "2027-05-01" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("bookBy: A book-by date is only for something still to book.");
    expect(m.loadItemForMcp).not.toHaveBeenCalled();
  });

  it("a Fork's row or another Trip's reads as not found", async () => {
    m.requireRealPlanRow.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "set_booking_state", arguments: { kind: "TRANSPORT", id: "fork-leg", state: "BOOKED" } });
    expect(text(r)).toBe(NOT_FOUND_TEXT);
    expect(m.updateTransport).not.toHaveBeenCalled();
  });
});
