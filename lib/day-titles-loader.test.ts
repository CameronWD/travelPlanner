import { beforeEach, describe, expect, it, vi } from "vitest";

const dayTitleFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    dayTitle: { findMany: dayTitleFindManyMock },
  },
}));

import { loadDayTitles } from "./day-titles-loader";

const LISBON = { id: "s1", arriveDate: "2026-12-05", departDate: "2026-12-08" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadDayTitles", () => {
  it("queries dayTitle scoped to the given stops' ids and resolves it via titlesByDate", async () => {
    dayTitleFindManyMock.mockResolvedValue([
      { stopId: "s1", dayIndex: 1, title: "Sintra day trip" },
    ]);

    const result = await loadDayTitles([LISBON]);

    expect(dayTitleFindManyMock).toHaveBeenCalledWith({
      where: { stopId: { in: ["s1"] } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(result.get("2026-12-06")).toEqual({ title: "Sintra day trip", stopId: "s1" });
  });

  it("returns an empty map without querying when there are no stops", async () => {
    const result = await loadDayTitles([]);
    expect(dayTitleFindManyMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("omits a title whose day falls outside its stop's stay (hidden, per titlesByDate)", async () => {
    dayTitleFindManyMock.mockResolvedValue([
      { stopId: "s1", dayIndex: 30, title: "Long gone" },
    ]);
    const result = await loadDayTitles([LISBON]);
    expect(result.size).toBe(0);
  });
});
