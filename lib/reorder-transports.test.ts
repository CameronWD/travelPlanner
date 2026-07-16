import { describe, it, expect } from "vitest";
import { reorderTransportItems, type TransportSlimItem } from "./reorder-transports";
import { HEAD_SLOT } from "./transport-anchor";

function makeLeg(overrides: Partial<TransportSlimItem>): TransportSlimItem {
  return {
    id: "leg-1",
    anchorStopId: null,
    sortOrder: 0,
    ...overrides,
  };
}

const STOP_A = "stop-a";
const STOP_B = "stop-b";
const STOP_C = "stop-c";

// ---------------------------------------------------------------------------
// Basic slot move: A → B
// ---------------------------------------------------------------------------

describe("reorderTransportItems: move leg from one stop slot to another", () => {
  it("moves leg from stop-a slot to stop-b slot and assigns anchorStopId = stop-b", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: STOP_B, sortOrder: 0 }),
    ];

    const result = reorderTransportItems(legs, "leg-1", STOP_B, STOP_B, [STOP_A, STOP_B]);

    const leg1 = result.find((t) => t.id === "leg-1")!;
    expect(leg1.anchorStopId).toBe(STOP_B);
  });

  it("sortOrders within the target slot are contiguous starting at 0", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: STOP_B, sortOrder: 0 }),
      makeLeg({ id: "leg-3", anchorStopId: STOP_B, sortOrder: 1 }),
    ];

    // Move leg-1 into stop-b slot (append at end)
    const result = reorderTransportItems(legs, "leg-1", STOP_B, STOP_B, [STOP_A, STOP_B]);

    const slotB = result
      .filter((t) => t.anchorStopId === STOP_B)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    expect(slotB.map((t) => t.sortOrder)).toEqual([0, 1, 2]);
    // leg-1 is appended (insert at end when overId is the stopId, not another leg)
    expect(slotB[slotB.length - 1].id).toBe("leg-1");
  });

  it("original slot sortOrders are recomputed after removal", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: STOP_A, sortOrder: 1 }),
    ];

    // Move leg-1 to stop-b; leg-2 should now be at sortOrder 0 in stop-a
    const result = reorderTransportItems(legs, "leg-1", STOP_B, STOP_B, [STOP_A, STOP_B]);

    const leg2 = result.find((t) => t.id === "leg-2")!;
    expect(leg2.anchorStopId).toBe(STOP_A);
    expect(leg2.sortOrder).toBe(0);
  });

  it("moves leg into HEAD_SLOT (null anchorStopId)", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: null, sortOrder: 0 }),
    ];

    const result = reorderTransportItems(legs, "leg-1", HEAD_SLOT, HEAD_SLOT, [STOP_A]);

    const leg1 = result.find((t) => t.id === "leg-1")!;
    expect(leg1.anchorStopId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Within-slot reorder
// ---------------------------------------------------------------------------

describe("reorderTransportItems: reorder within the same slot", () => {
  it("inserts at the drop target index when overId is another leg in the same slot", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: STOP_A, sortOrder: 1 }),
      makeLeg({ id: "leg-3", anchorStopId: STOP_A, sortOrder: 2 }),
    ];

    // Drag leg-3 over leg-1 → leg-3 should become first
    const result = reorderTransportItems(legs, "leg-3", STOP_A, "leg-1", [STOP_A]);

    const slotA = result
      .filter((t) => t.anchorStopId === STOP_A)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    expect(slotA.map((t) => t.id)).toEqual(["leg-3", "leg-1", "leg-2"]);
    expect(slotA.map((t) => t.sortOrder)).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// No-op: same slot, same position
// ---------------------------------------------------------------------------

describe("reorderTransportItems: cross-slot with 3 stops", () => {
  it("only affects legs in the source and target slots; other slots untouched", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
      makeLeg({ id: "leg-2", anchorStopId: STOP_B, sortOrder: 0 }),
      makeLeg({ id: "leg-3", anchorStopId: STOP_C, sortOrder: 0 }),
    ];

    // Move leg-1 from stop-a to stop-b
    const result = reorderTransportItems(legs, "leg-1", STOP_B, STOP_B, [STOP_A, STOP_B, STOP_C]);

    const leg3 = result.find((t) => t.id === "leg-3")!;
    // leg-3 in stop-c should be completely untouched
    expect(leg3.anchorStopId).toBe(STOP_C);
    expect(leg3.sortOrder).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// null targetSlot treated as HEAD_SLOT
// ---------------------------------------------------------------------------

describe("reorderTransportItems: null targetSlot", () => {
  it("treats null targetSlot as HEAD_SLOT (anchorStopId = null)", () => {
    const legs: TransportSlimItem[] = [
      makeLeg({ id: "leg-1", anchorStopId: STOP_A, sortOrder: 0 }),
    ];

    const result = reorderTransportItems(legs, "leg-1", null, HEAD_SLOT, [STOP_A]);
    const leg1 = result.find((t) => t.id === "leg-1")!;
    expect(leg1.anchorStopId).toBeNull();
  });
});
