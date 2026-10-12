import { describe, it, expect, vi, beforeEach } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

const count = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<number>>(async () => 3));
const shell = vi.hoisted(() => ({ current: { stops: [] } as null | { stops: unknown[] } }));
const loadSurpriseVisibility = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { cost: { count: (...a: unknown[]) => count(...a) } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: {} }) }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => shell.current) }));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: () => "2026-10-10" }));
vi.mock("@/lib/surprise-visibility", async (orig) => ({
  ...(await orig<typeof import("./surprise-visibility")>()),
  loadSurpriseVisibility,
}));

import { loadMoneyDueCount } from "./money-due-count";
import { requireTripAccess } from "@/lib/guards";

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = { stops: [] };
  loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
});

describe("loadMoneyDueCount", () => {
  it("counts unpaid, dated real-plan costs due on or before today + 14 (overdue included)", async () => {
    expect(await loadMoneyDueCount("t1")).toBe(3);
    expect(requireTripAccess).toHaveBeenCalledWith("t1");
    expect(count).toHaveBeenCalledWith({
      where: { tripId: "t1", forkId: null, paidAt: null, dueDate: { not: null, lte: "2026-10-24" } },
    });
  });
  it("is 0 for a missing trip, without counting", async () => {
    shell.current = null;
    expect(await loadMoneyDueCount("t1")).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });
  it("asks the visibility loader for this viewer and spreads its Cost fragment into the count (ADR 0051 — a hidden due payment is not theirs to chase)", async () => {
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s1"] }));
    await loadMoneyDueCount("t1");
    expect(loadSurpriseVisibility).toHaveBeenCalledWith("t1", "u1");
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining(MARKER_WHERE.cost),
    });
  });
});
