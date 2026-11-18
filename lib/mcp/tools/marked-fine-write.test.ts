import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ markFlagFine: vi.fn(), unmarkFlagFine: vi.fn(), loadFlagsForMcp: vi.fn() }));
vi.mock("@/server/actions/flag-dismissals", () => ({ markFlagFine: m.markFlagFine, unmarkFlagFine: m.unmarkFlagFine }));
vi.mock("../reads/flags", () => ({ loadFlagsForMcp: m.loadFlagsForMcp }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(), requireUser: vi.fn(), requireRowAccess: vi.fn(), isTripOwnerOrAdmin: vi.fn() }));
vi.mock("@/lib/globe", () => ({ requireGlobeAccess: vi.fn() }));
vi.mock("@/lib/error-sink", () => ({ reportError: vi.fn() }));

import { connectTestClient } from "../test-client";
import { NOT_FOUND_TEXT } from "../run-tool";

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;
const AFTER = {
  flags: [],
  markedFine: [{ flagId: "tight-a-b", detail: "Cutting it close.", by: "Xanthia", at: "2026-06-01T10:00:00.000Z" }],
};

describe("mark_flag_fine / unmark_flag_fine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.markFlagFine.mockResolvedValue({ success: true });
    m.unmarkFlagFine.mockResolvedValue({ success: true });
    m.loadFlagsForMcp.mockResolvedValue(AFTER);
  });

  it("marks it fine through the app's action and returns the Flags as they now stand", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "mark_flag_fine", arguments: { tripId: "trip-1", flagId: "tight-a-b", fingerprint: "fp-1" } });
    expect(m.markFlagFine).toHaveBeenCalledWith("trip-1", "tight-a-b", "fp-1");
    expect(m.loadFlagsForMcp).toHaveBeenCalledWith("trip-1");
    expect(JSON.parse(text(r))).toEqual(AFTER);
  });

  it("unmarks it", async () => {
    const c = await connectTestClient();
    await c.callTool({ name: "unmark_flag_fine", arguments: { tripId: "trip-1", flagId: "tight-a-b" } });
    expect(m.unmarkFlagFine).toHaveBeenCalledWith("trip-1", "tight-a-b");
  });

  it("reports the action's refusal and reads nothing back", async () => {
    m.markFlagFine.mockResolvedValue({ success: false, errors: { _: ["Only a travel-time warning can be marked fine."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "mark_flag_fine", arguments: { tripId: "trip-1", flagId: "packed-2026-07-02", fingerprint: "fp-1" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Only a travel-time warning can be marked fine.");
    expect(m.loadFlagsForMcp).not.toHaveBeenCalled();
  });

  it("refuses a stale fingerprint, says so, and reads nothing back", async () => {
    m.markFlagFine.mockResolvedValue({ success: false, errors: { _: ["That warning has changed. Have another look."] } });
    const c = await connectTestClient();
    const r = await c.callTool({ name: "mark_flag_fine", arguments: { tripId: "trip-1", flagId: "tight-a-b", fingerprint: "an-old-one" } });
    expect(m.markFlagFine).toHaveBeenCalledWith("trip-1", "tight-a-b", "an-old-one");
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("That warning has changed.");
    expect(m.loadFlagsForMcp).not.toHaveBeenCalled();
  });

  it("asks for the fingerprint", async () => {
    const c = await connectTestClient();
    const r = await c.callTool({ name: "mark_flag_fine", arguments: { tripId: "trip-1", flagId: "tight-a-b" } });
    expect(r.isError).toBe(true);
    expect(m.markFlagFine).not.toHaveBeenCalled();
  });

  it("a hidden Surprise or another Trip's Item reads as not found", async () => {
    m.markFlagFine.mockRejectedValue(Object.assign(new Error("nf"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
    const c = await connectTestClient();
    const r = await c.callTool({ name: "mark_flag_fine", arguments: { tripId: "trip-1", flagId: "tight-a-b", fingerprint: "fp-1" } });
    expect(text(r)).toBe(NOT_FOUND_TEXT);
  });
});
