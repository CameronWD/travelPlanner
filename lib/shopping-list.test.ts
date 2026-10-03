import { describe, it, expect } from "vitest";
import { buildShoppingEntries, shoppingOpenCount } from "./shopping-list";

describe("buildShoppingEntries", () => {
  it("lists flagged packing items first (in packing order), then standalone items", () => {
    const entries = buildShoppingEntries(
      [
        { id: "p2", text: "Jacket", buy: "NEEDED", sortOrder: 2 },
        { id: "p1", text: "Socks", buy: null, sortOrder: 1 },
        { id: "p3", text: "Adapter", buy: "BOUGHT", sortOrder: 3 },
      ],
      [{ id: "s1", text: "Snacks", done: false, sortOrder: 1 }],
    );
    expect(entries.map((e) => e.id)).toEqual(["p2", "p3", "s1"]);
    expect(entries[1]).toEqual({ source: "packing", id: "p3", text: "Adapter", bought: true });
    expect(shoppingOpenCount(entries)).toBe(2);
  });

  it("omits packing items with no buy state", () => {
    const entries = buildShoppingEntries(
      [{ id: "p1", text: "Socks", buy: null, sortOrder: 1 }],
      [],
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
    );
    expect(entries.map((e) => e.id)).toEqual(["s1", "s2"]);
  });
});
