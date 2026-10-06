import { describe, it, expect } from "vitest";
import { planCollisionDetection, POINTER_ACTIVATION, resolveItemDrop, scheduleInputFor, TOUCH_ACTIVATION } from "./plan-dnd";

const ACTIVE = { type: "item", stopId: "par", date: "2026-12-11", itemId: "a", title: "Louvre", startTime: "10:00", endTime: "12:00" };

describe("resolveItemDrop (spec D5)", () => {
  it("a slot in the same stop's strip on another day is a move", () => {
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "par", date: "2026-12-13" })).toEqual({
      itemId: "a", title: "Louvre", stopId: "par",
      from: { date: "2026-12-11", startTime: "10:00", endTime: "12:00" }, to: "2026-12-13",
    });
  });
  it("another stop's strip, the same day, a non-slot or nothing: no move", () => {
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "rom", date: "2026-12-15" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, { type: "slot", stopId: "par", date: "2026-12-11" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, { type: "stop" })).toBeNull();
    expect(resolveItemDrop(ACTIVE, undefined)).toBeNull();
    expect(resolveItemDrop({ type: "stop" }, { type: "slot", stopId: "par", date: "2026-12-13" })).toBeNull();
  });
});

describe("scheduleInputFor", () => {
  it("passes times through and sends no key for an untimed item", () => {
    expect(scheduleInputFor("2026-12-13", { startTime: "10:00", endTime: "12:00" })).toEqual({ date: "2026-12-13", startTime: "10:00", endTime: "12:00" });
    expect(scheduleInputFor("2026-12-13", { startTime: null, endTime: null })).toEqual({ date: "2026-12-13" });
  });
});

describe("planCollisionDetection", () => {
  const rect = (top: number) => ({ top, left: 0, width: 100, height: 40, bottom: top + 40, right: 100 });
  const container = (id: string, data: unknown) => ({ id, data: { current: data }, disabled: false, key: id, node: { current: null }, rect: { current: null } });
  function argsFor(activeData: unknown) {
    const containers = [container("slot:par:2026-12-13", { type: "slot", stopId: "par", date: "2026-12-13" }), container("rom", { type: "stop" })];
    return {
      active: { id: "x", data: { current: activeData }, rect: { current: { initial: null, translated: null } } },
      collisionRect: rect(0),
      droppableRects: new Map([["slot:par:2026-12-13", rect(0)], ["rom", rect(200)]]),
      droppableContainers: containers,
      pointerCoordinates: { x: 10, y: 10 },
    } as unknown as Parameters<typeof planCollisionDetection>[0];
  }

  it("an item drag only ever hits day slots", () => {
    expect(planCollisionDetection(argsFor(ACTIVE)).map((c) => c.id)).toEqual(["slot:par:2026-12-13"]);
  });

  it("a stop drag never hits a day slot, even the nearest one", () => {
    expect(planCollisionDetection(argsFor({ type: "stop" })).map((c) => c.id)).toEqual(["rom"]);
  });
});

describe("drag activation (spec 2026-10-05 §G)", () => {
  it("a short tap is never a drag: touch waits for a hold, a mouse press for real travel", () => {
    expect(TOUCH_ACTIVATION.delay).toBeGreaterThanOrEqual(150);
    expect(TOUCH_ACTIVATION.tolerance).toBeGreaterThan(0);
    expect(POINTER_ACTIVATION.distance).toBeGreaterThan(0);
  });
});
