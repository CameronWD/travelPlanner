import { describe, it, expect } from "vitest";
import { buildShoppingEntries, shoppingOpenCount } from "./shopping-list";

const viewer = { userId: "cam", open: true };
const sam = { id: "sam", name: "Sam", image: null };

describe("buildShoppingEntries", () => {
  it("lists flagged packing items first (in packing order), then standalone items", () => {
    const entries = buildShoppingEntries(
      [
        { id: "p2", text: "Jacket", buy: "NEEDED", sortOrder: 2, ownerId: null, owner: null },
        { id: "p1", text: "Socks", buy: null, sortOrder: 1, ownerId: null, owner: null },
        { id: "p3", text: "Adapter", buy: "BOUGHT", sortOrder: 3, ownerId: null, owner: null },
      ],
      [{ id: "s1", text: "Snacks", done: false, sortOrder: 1 }],
      viewer,
    );
    expect(entries.map((e) => e.id)).toEqual(["p2", "p3", "s1"]);
    expect(entries[1]).toEqual({ source: "packing", id: "p3", text: "Adapter", bought: true, owner: null, canUnmark: true });
    expect(shoppingOpenCount(entries)).toBe(2);
  });

  it("omits packing items with no buy state", () => {
    const entries = buildShoppingEntries(
      [{ id: "p1", text: "Socks", buy: null, sortOrder: 1, ownerId: null, owner: null }],
      [],
      viewer,
    );
    expect(entries).toEqual([]);
  });

  it("marks standalone entries as bought when done", () => {
    const entries = buildShoppingEntries(
      [],
      [
        { id: "s1", text: "Snacks", done: true, sortOrder: 1 },
        { id: "s2", text: "Gift", done: false, sortOrder: 2 },
      ],
      viewer,
    );
    expect(entries).toEqual([
      { source: "standalone", id: "s1", text: "Snacks", bought: true },
      { source: "standalone", id: "s2", text: "Gift", bought: false },
    ]);
    expect(shoppingOpenCount(entries)).toBe(1);
  });

  it("orders standalone entries by their own sortOrder", () => {
    const entries = buildShoppingEntries(
      [],
      [
        { id: "s2", text: "Gift", done: false, sortOrder: 2 },
        { id: "s1", text: "Snacks", done: false, sortOrder: 1 },
      ],
      viewer,
    );
    expect(entries.map((e) => e.id)).toEqual(["s1", "s2"]);
  });

  it("carries a personal entry's owner, and only lets its owner unmark it", () => {
    const entries = buildShoppingEntries(
      [
        { id: "p1", text: "Boots", buy: "NEEDED", sortOrder: 1, ownerId: "sam", owner: sam },
        { id: "p2", text: "Hat", buy: "NEEDED", sortOrder: 2, ownerId: "cam", owner: { id: "cam", name: "Cam", image: null } },
        { id: "p3", text: "Tent", buy: "NEEDED", sortOrder: 3, ownerId: null, owner: null },
      ],
      [],
      viewer,
    );
    expect(entries.map((e) => (e.source === "packing" ? [e.owner?.id ?? null, e.canUnmark] : null))).toEqual([
      ["sam", false],
      ["cam", true],
      [null, true],
    ]);
  });
});
