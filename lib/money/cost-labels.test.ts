import { describe, it, expect } from "vitest";
import { buildCostLabelMap, costLabel, type CostLabelSources } from "./cost-labels";

describe("buildCostLabelMap", () => {
  it("maps accommodation, transport, and item ids to display names", () => {
    const sources: CostLabelSources = {
      items: [{ id: "item-1", title: "Louvre tickets" }],
      accommodations: [{ id: "acc-1", name: "Hotel Lutetia" }],
      transports: [{ id: "t-1", mode: "TRAIN", depPlace: "Paris", arrPlace: "Lyon" }],
    };
    const map = buildCostLabelMap(sources);
    expect(map.get("item-1")).toBe("Louvre tickets");
    expect(map.get("acc-1")).toBe("Hotel Lutetia");
    expect(map.get("t-1")).toBe("Train · Paris → Lyon");
  });

  it("labels a transport by mode alone when only one endpoint resolves", () => {
    const sources: CostLabelSources = {
      items: [],
      accommodations: [],
      transports: [
        { id: "t-1", mode: "FLIGHT", depPlace: "London", arrPlace: null },
        { id: "t-2", mode: "flight", depPlace: null, arrPlace: null },
      ],
    };
    const map = buildCostLabelMap(sources);
    expect(map.get("t-1")).toBe("Flight");
    expect(map.get("t-2")).toBe("Flight");
  });
});

describe("costLabel", () => {
  const ownerNames = new Map<string, string>([
    ["acc-1", "Hotel Lutetia"],
    ["t-1", "Train · Paris → Lyon"],
  ]);

  it("falls back to cost.label, then 'Other cost', for OTHER-owned costs", () => {
    expect(costLabel({ ownerType: "OTHER", ownerId: null, label: "Travel insurance" }, ownerNames)).toBe(
      "Travel insurance",
    );
    expect(costLabel({ ownerType: "OTHER", ownerId: null, label: null }, ownerNames)).toBe("Other cost");
  });

  it("resolves owned costs via the owner-name map", () => {
    expect(costLabel({ ownerType: "ACCOMMODATION", ownerId: "acc-1", label: null }, ownerNames)).toBe(
      "Hotel Lutetia",
    );
    expect(costLabel({ ownerType: "TRANSPORT", ownerId: "t-1", label: null }, ownerNames)).toBe(
      "Train · Paris → Lyon",
    );
  });

  it("falls back to a type label when the owner isn't in the map", () => {
    expect(costLabel({ ownerType: "ACCOMMODATION", ownerId: "missing", label: null }, ownerNames)).toBe(
      "Accommodation",
    );
    expect(costLabel({ ownerType: "TRANSPORT", ownerId: "missing", label: null }, ownerNames)).toBe(
      "Transport",
    );
    expect(costLabel({ ownerType: "ITEM", ownerId: "missing", label: null }, ownerNames)).toBe("Item");
    expect(costLabel({ ownerType: "ACCOMMODATION", ownerId: null, label: null }, ownerNames)).toBe(
      "Accommodation",
    );
  });
});
