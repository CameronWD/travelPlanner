import { describe, it, expect, vi, beforeEach } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem } from "@/test/helpers/surprise-visibility";

const db = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  cost: { findMany: vi.fn() },
  stop: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  chapter: { findMany: vi.fn() },
}));
const buildBudget = vi.hoisted(() => vi.fn());
const loadSurpriseVisibility = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/budget", async (orig) => ({
  ...(await orig<typeof import("./budget")>()),
  buildBudget,
}));
vi.mock("@/lib/surprise-visibility", async (orig) => ({
  ...(await orig<typeof import("./surprise-visibility")>()),
  loadSurpriseVisibility,
}));

import { loadBudget, buildBudgetFromRows } from "./budget-loader";

const TRIP_ID = "trip-1";
const VIEWER = "u1";

beforeEach(() => {
  vi.clearAllMocks();
  loadSurpriseVisibility.mockResolvedValue(NO_SURPRISES);
  db.trip.findUnique.mockResolvedValue({
    homeCurrency: "GBP",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    chaptersEnabled: false,
  });
  db.cost.findMany.mockResolvedValue([]);
  db.stop.findMany.mockResolvedValue([]);
  db.item.findMany.mockResolvedValue([]);
  db.accommodation.findMany.mockResolvedValue([]);
  db.transport.findMany.mockResolvedValue([]);
  db.chapter.findMany.mockResolvedValue([]);
  buildBudget.mockReturnValue({ homeCurrency: "GBP", grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
});

describe("loadBudget", () => {
  it("asks the visibility loader for this viewer, no forkId", async () => {
    await loadBudget(TRIP_ID, VIEWER);
    expect(loadSurpriseVisibility).toHaveBeenCalledWith(TRIP_ID, VIEWER);
  });

  it("passes forkId through to every plan-scoped query when given one", async () => {
    await loadBudget(TRIP_ID, VIEWER, "fork-9");
    for (const k of ["cost", "item", "accommodation", "transport"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: "fork-9" }) }));
    }
    expect(db.stop.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: TRIP_ID, forkId: "fork-9" }) }));
  });

  it("defaults every plan-scoped query to the real plan (forkId: null)", async () => {
    await loadBudget(TRIP_ID, VIEWER);
    for (const k of ["cost", "stop", "item", "accommodation", "transport"] as const) {
      expect(db[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
    }
  });

  it("the cost, item and accommodation reads stay whole — no Surprise where fragment", async () => {
    await loadBudget(TRIP_ID, VIEWER);
    for (const k of ["cost", "item", "accommodation"] as const) {
      const where = db[k].findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty("AND");
    }
  });

  it("returns buildBudget's result", async () => {
    const result = await loadBudget(TRIP_ID, VIEWER);
    expect(result).toEqual({ homeCurrency: "GBP", grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    expect(buildBudget).toHaveBeenCalledWith(
      expect.objectContaining({ homeCurrency: "GBP", tripStart: "2026-01-01", tripEnd: "2026-01-10", chapters: [] }),
    );
  });

  it("a date-less trip falls back to today for both ends of the window", async () => {
    db.trip.findUnique.mockResolvedValue({ homeCurrency: "GBP", startDate: null, endDate: null, chaptersEnabled: false });
    await loadBudget(TRIP_ID, VIEWER);
    const input = buildBudget.mock.calls[0][0];
    expect(input.tripStart).toBe(input.tripEnd);
    expect(input.tripStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("skips the chapter query and passes [] when chapters are disabled", async () => {
    await loadBudget(TRIP_ID, VIEWER);
    expect(db.chapter.findMany).not.toHaveBeenCalled();
    expect(buildBudget).toHaveBeenCalledWith(expect.objectContaining({ chapters: [] }));
  });

  it("selects the Trip's homeTimezone and transport depIsHome, and feeds them to buildBudget (spec 2026-10-14)", async () => {
    db.trip.findUnique.mockResolvedValue({
      homeCurrency: "GBP",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      chaptersEnabled: false,
      homeTimezone: "Australia/Brisbane",
    });
    await loadBudget(TRIP_ID, VIEWER);
    expect(db.trip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ homeTimezone: true }) }),
    );
    expect(db.transport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ depIsHome: true }) }),
    );
    expect(buildBudget).toHaveBeenCalledWith(expect.objectContaining({ homeTimezone: "Australia/Brisbane" }));
  });

  it("queries only dated chapters and passes them through when chapters are enabled", async () => {
    db.trip.findUnique.mockResolvedValue({ homeCurrency: "GBP", startDate: "2026-01-01", endDate: "2026-01-10", chaptersEnabled: true });
    const chapters = [{ id: "c1", name: "Italy", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-05" }];
    db.chapter.findMany.mockResolvedValue(chapters);
    await loadBudget(TRIP_ID, VIEWER);
    expect(db.chapter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ startDate: { not: null } }) }));
    expect(buildBudget).toHaveBeenCalledWith(expect.objectContaining({ chapters }));
  });

  it("passes the visibility loader's hiddenOwnerIds through as surpriseOwnerIds — grand total keeps the money, byCategory folds it", async () => {
    loadSurpriseVisibility.mockResolvedValue(
      hiddenVisibility({ placeholders: [placeholderItem({ id: "item-hidden" }), placeholderItem({ id: "acc-hidden" })] }),
    );
    await loadBudget(TRIP_ID, VIEWER);
    expect(buildBudget).toHaveBeenCalledWith(expect.objectContaining({ surpriseOwnerIds: ["item-hidden", "acc-hidden"] }));
  });

  it("no live Surprise → surpriseOwnerIds is empty", async () => {
    await loadBudget(TRIP_ID, VIEWER);
    expect(buildBudget).toHaveBeenCalledWith(expect.objectContaining({ surpriseOwnerIds: [] }));
  });
});

describe("buildBudgetFromRows", () => {
  it("does no I/O — assembles buildBudget's input straight from the given rows", () => {
    buildBudgetFromRows({
      homeCurrency: "GBP",
      costs: [
        { id: "c1", costMinor: 500, paidMinor: null, paidAt: null, currency: "GBP", rateToHome: 1, ownerType: "OTHER", ownerId: null, label: "Snack", category: "Food" },
      ],
      stops: [{ id: "s1", name: "Rome", timezone: "Europe/Rome", arriveDate: "2026-01-02", departDate: "2026-01-05", sortOrder: 0 }],
      items: [{ id: "i1", stopId: "s1", category: "SIGHTSEEING", date: "2026-01-03" }],
      accommodations: [{ id: "a1", stopId: "s1", checkIn: "2026-01-02", checkOut: "2026-01-05" }],
      transports: [{ id: "t1", fromStopId: null, toStopId: "s1", depAt: null }],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      chapters: [],
    });
    expect(db.trip.findUnique).not.toHaveBeenCalled();
    expect(loadSurpriseVisibility).not.toHaveBeenCalled();
    expect(buildBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        homeCurrency: "GBP",
        tripStart: "2026-01-01",
        tripEnd: "2026-01-10",
        costs: [expect.objectContaining({ id: "c1", costMinor: 500 })],
        stops: [expect.objectContaining({ id: "s1", arriveDate: "2026-01-02", departDate: "2026-01-05" })],
        items: [expect.objectContaining({ id: "i1" })],
        accommodations: [expect.objectContaining({ id: "a1" })],
        transports: [expect.objectContaining({ id: "t1" })],
        chapters: [],
      }),
    );
  });

  it("is what loadBudget calls internally after its own fetch", async () => {
    db.cost.findMany.mockResolvedValue([{ id: "c1", costMinor: 1, paidMinor: null, paidAt: null, currency: "GBP", rateToHome: 1, ownerType: "OTHER", ownerId: null, label: null, category: null }]);
    await loadBudget(TRIP_ID, VIEWER);
    const fromLoadBudget = buildBudget.mock.calls[0][0];
    buildBudget.mockClear();
    buildBudgetFromRows({
      homeCurrency: "GBP",
      costs: [{ id: "c1", costMinor: 1, paidMinor: null, paidAt: null, currency: "GBP", rateToHome: 1, ownerType: "OTHER", ownerId: null, label: null, category: null }],
      stops: [],
      items: [],
      accommodations: [],
      transports: [],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      chapters: [],
      surpriseOwnerIds: [],
    });
    expect(buildBudget.mock.calls[0][0]).toEqual(fromLoadBudget);
  });

  it("passes homeTimezone and a transport's depIsHome through to buildBudget (spec 2026-10-14)", () => {
    buildBudgetFromRows({
      homeCurrency: "GBP",
      costs: [],
      stops: [],
      items: [],
      accommodations: [],
      transports: [{ id: "t1", fromStopId: null, toStopId: "s1", depAt: null, depIsHome: true }],
      tripStart: "2026-01-01",
      tripEnd: "2026-01-10",
      chapters: [],
      homeTimezone: "Australia/Brisbane",
    });
    expect(buildBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        homeTimezone: "Australia/Brisbane",
        transports: [expect.objectContaining({ id: "t1", depIsHome: true })],
      }),
    );
  });
});
