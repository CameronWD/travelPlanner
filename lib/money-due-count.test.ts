import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => 3));
const shell = vi.hoisted(() => ({ current: { stops: [] } as null | { stops: unknown[] } }));
vi.mock("@/lib/db", () => ({ db: { cost: { count: (...a: unknown[]) => count(...a) } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => shell.current) }));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: () => "2026-10-10" }));

import { loadMoneyDueCount } from "./money-due-count";
import { requireTripAccess } from "@/lib/guards";

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = { stops: [] };
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
});
