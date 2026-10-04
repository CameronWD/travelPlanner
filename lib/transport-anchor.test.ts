import { describe, it, expect } from "vitest";
import { resolveTransportSlot, groupTransportsBySlot, canSitBeforeFirstStop, creationAnchor, HEAD_SLOT } from "./transport-anchor";

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

describe("canSitBeforeFirstStop", () => {
  it("holds for a leg arriving at the first stop with no from-stop", () => {
    expect(canSitBeforeFirstStop({ toStopId: "a" }, stops)).toBe(true);
  });
  it("holds for a leg with no stop endpoint at all", () => {
    expect(canSitBeforeFirstStop({}, stops)).toBe(true);
  });
  it("does not hold for a leg with a from-stop — even one arriving at the first stop", () => {
    expect(canSitBeforeFirstStop({ fromStopId: "a", toStopId: "b" }, stops)).toBe(false);
    expect(canSitBeforeFirstStop({ fromStopId: "c", toStopId: "a" }, stops)).toBe(false);
  });
  it("does not hold for a leg with no from-stop arriving at a later stop", () => {
    expect(canSitBeforeFirstStop({ toStopId: "c" }, stops)).toBe(false);
  });
  it("treats a from-stop missing from the list as no from-stop", () => {
    expect(canSitBeforeFirstStop({ fromStopId: "gone", toStopId: "a" }, stops)).toBe(true);
  });
});

describe("creationAnchor", () => {
  it("is the from-stop for a leg leaving a stop", () => {
    expect(creationAnchor({ fromStopId: "b", toStopId: "c" }, stops)).toBe("b");
  });
  it("is the stop before the to-stop for an arrival with no from-stop", () => {
    expect(creationAnchor({ toStopId: "c" }, stops)).toBe("b");
  });
  it("is null (the head) for an arrival at the first stop", () => {
    expect(creationAnchor({ toStopId: "a" }, stops)).toBeNull();
  });
  it("keeps an explicit anchor that still names a stop", () => {
    expect(creationAnchor({ anchorStopId: "c", fromStopId: "a" }, stops)).toBe("c");
  });
  it("ignores an anchor that is not in the list", () => {
    expect(creationAnchor({ anchorStopId: "zzz", fromStopId: "a" }, stops)).toBe("a");
  });
});
