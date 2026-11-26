import { describe, it, expect, vi, beforeEach } from "vitest";
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, MARKER_WHERE } from "@/test/helpers/surprise-visibility";

const db = vi.hoisted(() => ({
  stop: { findMany: vi.fn() },
  cost: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { loadTripCurrencies } from "./trip-currencies-loader";

const STOPS = [
  { id: "s-fr", countryCode: "fr", arriveDate: null, departDate: null, sortOrder: 0 },
  { id: "s-jp", countryCode: "jp", arriveDate: null, departDate: null, sortOrder: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.stop.findMany.mockImplementation(async ({ where }: { where: { id?: { notIn: string[] } } }) =>
    STOPS.filter((s) => !where.id?.notIn.includes(s.id)),
  );
  db.cost.findMany.mockResolvedValue([]);
});

describe("loadTripCurrencies", () => {
  it("lists Home, then the Stops' currencies, then the Cost currencies", async () => {
    db.cost.findMany.mockResolvedValue([{ currency: "THB" }]);
    expect(await loadTripCurrencies("trip-1", "AUD", NO_SURPRISES)).toEqual(["AUD", "EUR", "JPY", "THB"]);
  });

  it("a Stop hidden by a Surprise adds no currency", async () => {
    const v = hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s-jp"] });
    const out = await loadTripCurrencies("trip-1", "AUD", v);
    expect(out).toEqual(["AUD", "EUR"]);
    expect(db.stop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1", forkId: null, id: { notIn: ["s-jp"] } } }),
    );
  });

  it("the Cost read is masked with v.where.cost and spans every Plan", async () => {
    const v = hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s-jp"] });
    await loadTripCurrencies("trip-1", "AUD", v);
    expect(db.cost.findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", ...MARKER_WHERE.cost },
      distinct: ["currency"],
      orderBy: { createdAt: "asc" },
      select: { currency: true },
    });
  });

  it("a Transport ending at Bangkok adds no THB", async () => {
    await loadTripCurrencies("trip-1", "AUD", NO_SURPRISES);
    expect(db.transport.findMany).not.toHaveBeenCalled();
  });
});
