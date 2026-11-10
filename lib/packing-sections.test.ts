import { describe, it, expect } from "vitest";
import { buildPackingSections, type PackingRow } from "./packing-sections";

const cam = { id: "cam", name: "Cam", image: null };
const sam = { id: "sam", name: "Sam", image: null };
const alex = { id: "alex", name: "Alex", image: null };

function row(id: string, ownerId: string | null, done = false): PackingRow {
  return { id, text: id, done, sortOrder: 0, buy: null, ownerId, packedBy: null };
}

const rows = [
  row("mine-1", "cam", true),
  row("mine-2", "cam"),
  row("shared-1", null, true),
  row("sam-1", "sam", true),
  row("sam-2", "sam"),
  row("alex-1", "alex"),
];

describe("buildPackingSections", () => {
  it("splits Mine, Shared and each other Traveller in member order", () => {
    const s = buildPackingSections(rows, [sam, cam, alex], { userId: "cam", open: true });
    expect(s.mine.map((r) => r.id)).toEqual(["mine-1", "mine-2"]);
    expect(s.shared.map((r) => r.id)).toEqual(["shared-1"]);
    expect(s.others.map((o) => [o.traveller.id, o.items.map((r) => r.id)])).toEqual([
      ["sam", ["sam-1", "sam-2"]],
      ["alex", ["alex-1"]],
    ]);
  });

  it("lists an other Traveller with nothing packed yet as an empty section", () => {
    const s = buildPackingSections([], [cam, sam], { userId: "cam", open: true });
    expect(s.others).toEqual([{ traveller: sam, items: [] }]);
  });

  it("Private: no other sections and no partner rows anywhere", () => {
    const s = buildPackingSections(rows, [cam, sam, alex], { userId: "cam", open: false });
    expect(s.others).toEqual([]);
    const ids = [...s.mine, ...s.shared].map((r) => r.id);
    expect(ids).not.toContain("sam-1");
    expect(ids).not.toContain("alex-1");
  });

  it("counts packed and total over Mine and Shared only", () => {
    const s = buildPackingSections(rows, [cam, sam, alex], { userId: "cam", open: true });
    expect(s.packed).toBe(2);
    expect(s.total).toBe(3);
  });
});
