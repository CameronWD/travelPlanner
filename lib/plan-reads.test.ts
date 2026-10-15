import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockDb } from "@/test/helpers/db-mock";
import { trip, stop, transport, stay, item, cost, chapter } from "@/test/builders";
import { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } from "@/test/helpers/surprise-visibility";

vi.mock("@/lib/db", async () => {
  const { mockDb } = await import("@/test/helpers/db-mock");
  return { db: mockDb(["stop", "transport", "accommodation", "item", "cost", "exchangeRate", "chapter", "fork"]) };
});
const { readTripShell, loadSurpriseVisibility, notFound } = vi.hoisted(() => ({
  readTripShell: vi.fn(),
  loadSurpriseVisibility: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility };
});
vi.mock("next/navigation", () => ({ notFound }));

import { db as realDb } from "@/lib/db";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { readPlan, resolvePlanParam, mergePlanItems, maskPlanStops, COST_SELECT } from "./plan-reads";

const db = realDb as unknown as MockDb<"stop" | "transport" | "accommodation" | "item" | "cost" | "exchangeRate" | "chapter" | "fork">;

/** The shell row readTripShell hands back: a Trip plus the layout's members/stops. */
function shell(o: Parameters<typeof trip>[0] = {}) {
  return { ...trip(o), members: [], stops: [] };
}

const PLAN_TABLES = ["stop", "transport", "accommodation", "item", "cost", "chapter"] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of ["stop", "transport", "accommodation", "item", "cost", "exchangeRate", "chapter"] as const) {
    db[t].findMany.mockResolvedValue([]);
  }
  db.fork.findFirst.mockResolvedValue(null);
  readTripShell.mockResolvedValue(shell({ chaptersEnabled: true }));
  loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
});

function whereOf(table: (typeof PLAN_TABLES)[number] | "exchangeRate", call = 0) {
  return db[table].findMany.mock.calls[call][0].where;
}

describe("readPlan", () => {
  it("reads the eight tables in one wave with the plan scope on every plan table", async () => {
    // Hold every findMany open: if all of them have been called before any
    // resolves, they went out in one wave.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    for (const t of ["stop", "transport", "accommodation", "item", "cost", "exchangeRate", "chapter"] as const) {
      db[t].findMany.mockImplementation(async () => {
        await gate;
        return [];
      });
    }
    const pending = readPlan("trip-1", "u1", null);
    await vi.waitFor(() => {
      expect(db.stop.findMany).toHaveBeenCalledTimes(1);
      expect(db.transport.findMany).toHaveBeenCalledTimes(1);
      expect(db.accommodation.findMany).toHaveBeenCalledTimes(2); // visible + budgetAccommodations
      expect(db.item.findMany).toHaveBeenCalledTimes(2); // visible + budgetItems
      expect(db.cost.findMany).toHaveBeenCalledTimes(1);
      expect(db.exchangeRate.findMany).toHaveBeenCalledTimes(1);
      expect(db.chapter.findMany).toHaveBeenCalledTimes(1);
    });
    release();
    await pending;

    expect(loadSurpriseVisibility).toHaveBeenCalledWith("trip-1", "u1");
    for (const t of PLAN_TABLES) {
      for (const call of db[t].findMany.mock.calls) {
        expect(call[0].where).toMatchObject({ tripId: "trip-1", forkId: null });
      }
    }
    expect(whereOf("exchangeRate")).toEqual({ tripId: "trip-1" });
    expect(db.exchangeRate.findMany.mock.calls[0][0].select).toEqual({ base: true, quote: true, rate: true, manual: true, fetchedAt: true });
    // Visible Items are plan placements only (no Wishlist ideas).
    expect(whereOf("item", 0)).toMatchObject({ OR: [{ stopId: { not: null } }, { date: { not: null } }] });
  });

  it("a Fork id reads that Fork's rows", async () => {
    db.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });
    const rows = await readPlan("trip-1", "u1", "fork-1");
    for (const t of PLAN_TABLES) {
      for (const call of db[t].findMany.mock.calls) {
        expect(call[0].where).toMatchObject({ tripId: "trip-1", forkId: "fork-1" });
      }
    }
    expect(rows.plan).toBe("fork-1");
    expect(rows.fork).toEqual({ id: "fork-1", name: "Plan B" });
    expect(db.fork.findFirst).toHaveBeenCalledWith({ where: { id: "fork-1", tripId: "trip-1" }, select: { id: true, name: true } });
  });

  it("the real plan carries no fork and never reads the fork table", async () => {
    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.plan).toBeNull();
    expect(rows.fork).toBeNull();
    expect(db.fork.findFirst).not.toHaveBeenCalled();
  });

  it("notFound for a missing or Recently deleted Trip", async () => {
    readTripShell.mockResolvedValueOnce(null);
    await expect(readPlan("trip-1", "u1", null)).rejects.toThrow("NEXT_NOT_FOUND");
    readTripShell.mockResolvedValueOnce(shell({ deletedAt: new Date() }));
    await expect(readPlan("trip-1", "u1", null)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Review Focus 3: a hidden Stop comes back with notes null and its Surprise view; a hidden root Item comes back as its placeholder", async () => {
    const ph = placeholderItem({ id: "item-secret", stopId: "stop-2", date: "2026-11-05" });
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["stop-1"], placeholders: [ph] }));
    db.stop.findMany.mockResolvedValue([
      stop({ id: "stop-1", notes: "the secret", sortOrder: 0 }),
      stop({ id: "stop-2", notes: "visible", arriveDate: "2026-11-04", departDate: "2026-11-07", sortOrder: 1 }),
    ]);
    db.item.findMany.mockResolvedValueOnce([item({ id: "item-1", stopId: "stop-2" })]);

    const rows = await readPlan("trip-1", null, null);

    expect(loadSurpriseVisibility).toHaveBeenCalledWith("trip-1", null);
    expect(rows.stops.map((s) => [s.id, s.notes, s.surprise])).toEqual([
      ["stop-1", null, SURPRISED_VIEW],
      ["stop-2", "visible", null],
    ]);
    expect(rows.items.map((i) => [i.id, i.title, i.surprise])).toEqual([
      ["item-1", "Belém Tower", null],
      ["item-secret", "Surprise", SURPRISED_VIEW],
    ]);
    // The visibility fragments reached the visible reads, not the budget ones.
    expect(whereOf("item", 0)).toMatchObject(MARKER_WHERE.item);
    expect(whereOf("accommodation", 0)).toMatchObject(MARKER_WHERE.accommodation);
    expect(whereOf("item", 1)).not.toHaveProperty("AND");
    expect(whereOf("accommodation", 1)).not.toHaveProperty("AND");
    expect(rows.visibility.hiddenStopIds).toEqual(["stop-1"]);
  });

  it("a Fork's placeholders are not merged into the real plan", async () => {
    const real = placeholderItem({ id: "ph-real", forkId: null });
    const forked = placeholderItem({ id: "ph-fork", forkId: "fork-1" });
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ placeholders: [real, forked] }));

    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.items.map((i) => i.id)).toEqual(["ph-real"]);

    db.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });
    const forkRows = await readPlan("trip-1", "u1", "fork-1");
    expect(forkRows.items.map((i) => i.id)).toEqual(["ph-fork"]);
  });

  it("chapters are [] when the Trip's chapters toggle is off and the chapter table is not read", async () => {
    readTripShell.mockResolvedValue(shell({ chaptersEnabled: false }));
    db.chapter.findMany.mockResolvedValue([chapter()]);
    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.chapters).toEqual([]);
    expect(db.chapter.findMany).not.toHaveBeenCalled();
  });

  it("chapters are read dated and rough when the toggle is on", async () => {
    db.chapter.findMany.mockResolvedValue([chapter(), chapter({ id: "ch-2", startDate: null, endDate: null })]);
    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.chapters).toHaveLength(2);
    expect(whereOf("chapter")).toEqual({ tripId: "trip-1", forkId: null });
  });

  it("costs are unfiltered and budgetItems/budgetAccommodations are the minimal unfiltered rows", async () => {
    loadSurpriseVisibility.mockResolvedValue(hiddenVisibility({ hiddenStopIds: ["stop-1"], placeholders: [placeholderItem({ id: "item-x" })] }));
    db.cost.findMany.mockResolvedValue([cost(), cost({ id: "cost-hidden", ownerId: "item-x" })]);
    db.item.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "item-x", stopId: "stop-1", category: "FOOD", date: "2026-11-02" }]);
    db.accommodation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "acc-1", stopId: "stop-1", checkIn: "2026-11-01", checkOut: "2026-11-04" }]);

    const rows = await readPlan("trip-1", "u1", null);

    expect(whereOf("cost")).toEqual({ tripId: "trip-1", forkId: null });
    expect(db.cost.findMany.mock.calls[0][0].select).toBe(COST_SELECT);
    expect(rows.costs.map((c) => c.id)).toEqual(["cost-1", "cost-hidden"]);
    expect(whereOf("item", 1)).toEqual({ tripId: "trip-1", forkId: null });
    expect(db.item.findMany.mock.calls[1][0].select).toEqual({ id: true, stopId: true, category: true, date: true });
    expect(whereOf("accommodation", 1)).toEqual({ tripId: "trip-1", forkId: null });
    expect(db.accommodation.findMany.mock.calls[1][0].select).toEqual({ id: true, stopId: true, checkIn: true, checkOut: true });
    expect(rows.budgetItems).toEqual([{ id: "item-x", stopId: "stop-1", category: "FOOD", date: "2026-11-02" }]);
    expect(rows.budgetAccommodations).toEqual([{ id: "acc-1", stopId: "stop-1", checkIn: "2026-11-01", checkOut: "2026-11-04" }]);
  });

  it("COST_SELECT is the union of the private copies (dueDate included)", () => {
    expect(Object.keys(COST_SELECT).sort()).toEqual(
      ["id", "costMinor", "paidMinor", "currency", "rateToHome", "paidAt", "dueDate", "ownerType", "ownerId", "label", "category", "settlement"].sort(),
    );
  });

  it("stops come back in canonical plan order (orderPlanStops), not raw sortOrder", async () => {
    db.stop.findMany.mockResolvedValue([
      stop({ id: "late", arriveDate: "2026-11-07", departDate: "2026-11-10", sortOrder: 0 }),
      stop({ id: "rough", arriveDate: null, departDate: null, timezone: null, sortOrder: 1 }),
      stop({ id: "early", arriveDate: "2026-11-01", departDate: "2026-11-04", sortOrder: 2 }),
    ]);
    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.stops.map((s) => s.id)).toEqual(["early", "rough", "late"]);
    expect(db.stop.findMany.mock.calls[0][0].orderBy).toEqual({ sortOrder: "asc" });
  });

  it("passes the rows through: transports, visible accommodations, exchange rates, the trip header", async () => {
    db.transport.findMany.mockResolvedValue([transport()]);
    db.accommodation.findMany.mockResolvedValueOnce([stay()]);
    db.exchangeRate.findMany.mockResolvedValue([{ base: "EUR", quote: "AUD", rate: 1.6, manual: false, fetchedAt: null }]);
    const rows = await readPlan("trip-1", "u1", null);
    expect(rows.transports.map((t) => t.id)).toEqual(["tr-1"]);
    expect(rows.accommodations.map((a) => a.id)).toEqual(["acc-1"]);
    expect(rows.exchangeRates).toHaveLength(1);
    expect(rows.trip.id).toBe("trip-1");
  });
});

describe("pure helpers", () => {
  it("maskPlanStops blanks a hidden Stop's notes and attaches every Stop's Surprise view", () => {
    const v = hiddenVisibility({ hiddenStopIds: ["s1"] });
    expect(maskPlanStops([{ id: "s1", notes: "x" }, { id: "s2", notes: "y" }], v)).toEqual([
      { id: "s1", notes: null, surprise: SURPRISED_VIEW },
      { id: "s2", notes: "y", surprise: null },
    ]);
  });

  it("mergePlanItems attaches views and appends only this plan's placeholders", () => {
    const v = hiddenVisibility({ placeholders: [placeholderItem({ id: "p1", forkId: "f1" }), placeholderItem({ id: "p2" })] });
    expect(mergePlanItems([{ id: "a" }], v, "f1").map((i) => i.id)).toEqual(["a", "p1"]);
    expect(mergePlanItems([{ id: "a" }], NO_SURPRISES, null)).toEqual([{ id: "a", surprise: null }]);
  });
});

describe("resolvePlanParam", () => {
  it("resolvePlanParam: Forks off → real plan; a Fork of this Trip → it; a stranger's id → real plan", async () => {
    readTripShell.mockResolvedValue(shell({ forksEnabled: false }));
    expect(await resolvePlanParam("trip-1", "fork-1")).toEqual({ plan: null, fork: null });
    expect(db.fork.findFirst).not.toHaveBeenCalled();

    readTripShell.mockResolvedValue(shell({ forksEnabled: true }));
    db.fork.findFirst.mockResolvedValueOnce({ id: "fork-1", name: "Plan B" });
    expect(await resolvePlanParam("trip-1", ["fork-1", "fork-2"])).toEqual({ plan: "fork-1", fork: { id: "fork-1", name: "Plan B" } });
    expect(db.fork.findFirst).toHaveBeenCalledWith({ where: { id: "fork-1", tripId: "trip-1" }, select: { id: true, name: true } });

    db.fork.findFirst.mockResolvedValueOnce(null);
    expect(await resolvePlanParam("trip-1", "someone-elses-fork")).toEqual({ plan: null, fork: null });

    expect(await resolvePlanParam("trip-1", undefined)).toEqual({ plan: null, fork: null });
  });
});
