import { describe, expect, it, vi } from "vitest";

const { loadFlagRows, getTripProjection, detectFlags } = vi.hoisted(() => ({ loadFlagRows: vi.fn(), getTripProjection: vi.fn(), detectFlags: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-projection-reads", () => ({ getTripProjection }));
vi.mock("@/lib/flags-loader", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags-loader")>()), loadFlagRows }));
vi.mock("@/lib/flags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/flags")>()), detectFlags }));

import { loadLiveFlags } from "./live-flags";
import { shownState } from "./fixed";

describe("loadLiveFlags: Marked fine (spec 2026-11-18 T5)", () => {
  it("a Marked fine Flag is not live, so a Finding restating it reads as Fixed in the plan", async () => {
    detectFlags.mockReturnValue([{ id: "tight-a-b", severity: "info", message: "Cutting it close.", targetType: "DAY", fingerprint: "fp-1" }]);
    getTripProjection.mockResolvedValue({ projectedEnd: null, hardEndDate: null, deadline: null });
    loadFlagRows.mockResolvedValue({
      trip: { startDate: "2026-01-01", endDate: "2026-01-10" },
      allStops: [], transports: [], accommodations: [], items: [], hiddenStopIds: [], hiddenItemIds: [], today: "2026-01-01", travel: new Map(),
      markedFine: [{ flagId: "tight-a-b", fingerprint: "fp-1", markedByName: "Xanthia", createdAt: new Date() }],
    });
    const live = await loadLiveFlags("t1");
    expect(loadFlagRows).toHaveBeenCalledWith("t1", null);
    expect(live?.has("tight-a-b")).toBe(false);
    expect(shownState({ origin: "FLAG", state: "OPEN", key: "LOGISTICS|DAY|2026-01-03|tight-a-b" }, live).state).toBe("FIXED");
  });
});
