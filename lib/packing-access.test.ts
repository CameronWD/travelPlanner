import { describe, expect, it } from "vitest";
import {
  canAddPackingTo,
  canManagePackingItem,
  canSeePackingItem,
  packingMineOrSharedWhere,
  packingVisibleWhere,
  toOwnerId,
} from "./packing-access";

const owners = [null, "me", "them"] as const;

describe("packing access", () => {
  it.each([true, false])("rules table, open=%s", (open) => {
    const v = { userId: "me", open };
    for (const o of owners) {
      const theirs = o === "them";
      expect(canSeePackingItem(o, v)).toBe(!theirs || open);
      expect(canManagePackingItem(o, v)).toBe(!theirs);
      expect(canAddPackingTo(o, v)).toBe(!theirs || open);
    }
  });

  it("maps SHARED to null", () => {
    expect(toOwnerId("SHARED")).toBeNull();
    expect(toOwnerId("u1")).toBe("u1");
  });

  it("builds the visibility filter", () => {
    expect(packingVisibleWhere({ userId: "me", open: true })).toEqual({});
    expect(packingVisibleWhere({ userId: "me", open: false })).toEqual({
      OR: [{ kind: { not: "PACKING" } }, { ownerId: null }, { ownerId: "me" }],
    });
  });

  it("builds the mine-or-shared filter", () => {
    expect(packingMineOrSharedWhere("me")).toEqual({
      kind: "PACKING",
      OR: [{ ownerId: null }, { ownerId: "me" }],
    });
  });
});
