import { describe, it, expect } from "vitest";
import { resolveTransportSlot, groupTransportsBySlot, HEAD_SLOT } from "./transport-anchor";

const stops = [{ id: "a" }, { id: "b" }, { id: "c" }];
const t = (o: Partial<Parameters<typeof resolveTransportSlot>[0]>) =>
  ({ id: "x", sortOrder: 0, ...o }) as Parameters<typeof resolveTransportSlot>[0];

describe("resolveTransportSlot", () => {
  it("uses explicit anchorStopId when the stop exists", () => {
    expect(resolveTransportSlot(t({ anchorStopId: "b" }), stops)).toBe("b");
  });
  it("falls back to fromStopId", () => {
    expect(resolveTransportSlot(t({ fromStopId: "a" }), stops)).toBe("a");
  });
  it("anchors an arrival above its to-stop (previous stop's slot)", () => {
    expect(resolveTransportSlot(t({ toStopId: "b" }), stops)).toBe("a");
  });
  it("arrival at the first stop → head slot", () => {
    expect(resolveTransportSlot(t({ toStopId: "a" }), stops)).toBe(HEAD_SLOT);
  });
  it("no usable endpoint → head slot", () => {
    expect(resolveTransportSlot(t({}), stops)).toBe(HEAD_SLOT);
  });
  it("ignores an anchorStopId that no longer exists, falling through", () => {
    expect(resolveTransportSlot(t({ anchorStopId: "zzz", fromStopId: "c" }), stops)).toBe("c");
  });
});

describe("groupTransportsBySlot", () => {
  it("groups by slot and sorts within a slot by sortOrder", () => {
    const legs = [
      { id: "1", anchorStopId: "a", sortOrder: 2 },
      { id: "2", anchorStopId: "a", sortOrder: 1 },
      { id: "3", toStopId: "a", sortOrder: 0 },
    ];
    const g = groupTransportsBySlot(legs, stops);
    expect(g.get("a")!.map((l) => l.id)).toEqual(["2", "1"]);
    expect(g.get(HEAD_SLOT)!.map((l) => l.id)).toEqual(["3"]);
  });
  it("excludes ids in the exclude set (e.g. home bookends)", () => {
    const legs = [{ id: "1", anchorStopId: "a", sortOrder: 0 }];
    expect(groupTransportsBySlot(legs, stops, new Set(["1"])).size).toBe(0);
  });
});
