import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the MCP real-plan check.
 *
 * `requireRealPlanRow`/`requireRealPlanRows` are now a thin wrapper over
 * `requireRowAccess` (lib/guards.ts, card C) — the missing-row, non-member,
 * fork-scoping (`realPlanOnly`) and per-kind Surprise-ref behaviour this file
 * used to exercise directly against `db`/`requireTripAccess`/
 * `requireOutsideSurprise` are now that guard's own responsibility, fully
 * covered by lib/guards.test.ts's "requireRowAccess (card C)" suite. This
 * file only has to prove the wrapper calls through correctly.
 */

const { requireRowAccessMock } = vi.hoisted(() => ({
  requireRowAccessMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireRowAccess: requireRowAccessMock }));

import { requireRealPlanRow, requireRealPlanRows } from "./real-plan";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireRealPlanRow", () => {
  it("delegates to requireRowAccess scoped to the real plan (realPlanOnly: true)", async () => {
    requireRowAccessMock.mockResolvedValue({
      row: { tripId: "trip-1" },
      user: { id: "sam" },
      membership: { role: "member" },
      surpriseOf: null,
    });

    const result = await requireRealPlanRow("stop", "stop-1");

    expect(requireRowAccessMock).toHaveBeenCalledWith("stop", "stop-1", { realPlanOnly: true });
    expect(result).toEqual({ tripId: "trip-1" });
  });

  it("propagates the guard's rejection as-is (missing row, non-member, or a live Surprise)", async () => {
    requireRowAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(requireRealPlanRow("cost", "cost-1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("works for every RealPlanKind", async () => {
    requireRowAccessMock.mockResolvedValue({
      row: { tripId: "trip-1" },
      user: { id: "sam" },
      membership: { role: "member" },
      surpriseOf: null,
    });

    for (const kind of ["stop", "item", "chapter", "accommodation", "transport", "cost"] as const) {
      await requireRealPlanRow(kind, `${kind}-1`);
      expect(requireRowAccessMock).toHaveBeenCalledWith(kind, `${kind}-1`, { realPlanOnly: true });
    }
  });
});

describe("requireRealPlanRows", () => {
  it("calls requireRealPlanRow for each present id, in order, skipping null/undefined", async () => {
    requireRowAccessMock.mockResolvedValue({
      row: { tripId: "trip-1" },
      user: { id: "sam" },
      membership: { role: "member" },
      surpriseOf: null,
    });

    await requireRealPlanRows([
      ["stop", "stop-1"],
      ["item", undefined],
      ["cost", null],
      ["transport", "tr-1"],
    ]);

    expect(requireRowAccessMock).toHaveBeenCalledTimes(2);
    expect(requireRowAccessMock).toHaveBeenNthCalledWith(1, "stop", "stop-1", { realPlanOnly: true });
    expect(requireRowAccessMock).toHaveBeenNthCalledWith(2, "transport", "tr-1", { realPlanOnly: true });
  });

  it("propagates a rejection from any ref", async () => {
    requireRowAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(requireRealPlanRows([["stop", "stop-1"]])).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
