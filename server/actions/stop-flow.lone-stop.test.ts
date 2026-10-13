import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleLoneStopTx } from "./stop-flow";

vi.mock("./stop-flow", async (orig) => {
  const mod = await orig<typeof import("./stop-flow")>();
  return { ...mod, recomputeChapterSpans: vi.fn() };
});

function tx(opts: {
  trip: { startDate: string | null; endDate: string | null } | null;
  stops: Array<{ id: string; arriveDate: string | null; departDate: string | null; timezone: string | null; country: string | null; countryCode: string | null }>;
}) {
  const update = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue(opts.stops);
  return {
    client: {
      trip: { findUnique: vi.fn().mockResolvedValue(opts.trip) },
      stop: { findMany, update },
      chapter: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    } as never,
    update,
    findMany,
  };
}

// lib/tz.ts COUNTRY_TO_TZ keys both "au" and "australia" to "Australia/Sydney"
// (not "Australia/Brisbane" as a first draft might assume) — see task-1 brief.
const rough = { id: "s1", arriveDate: null, departDate: null, timezone: null, country: "Australia", countryCode: "au" };

describe("scheduleLoneStopTx (ADR 0073)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("schedules a rough lone Stop to the Trip's dates and derives its timezone", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(true);
    expect(t.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip1", forkId: null } }));
    expect(t.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-11-04", departDate: "2026-11-05", nights: null, timezone: "Australia/Sydney" },
    });
  });

  it("does nothing when the Trip has no end date", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: null }, stops: [rough] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("does nothing when the plan has two Stops", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough, { ...rough, id: "s2" }] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("counts per plan: a Fork's lone Stop is scoped by forkId", async () => {
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [rough] });
    await scheduleLoneStopTx(t.client, "trip1", "fork9", "fill");
    expect(t.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip1", forkId: "fork9" } }));
  });

  it("fill leaves a scheduled lone Stop alone", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-04", timezone: "Australia/Sydney" };
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "fill")).resolves.toBe(false);
    expect(t.update).not.toHaveBeenCalled();
  });

  it("follow moves a scheduled lone Stop onto the Trip's dates and keeps its timezone", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-04", timezone: "Australia/Sydney" };
    const t = tx({ trip: { startDate: "2026-11-10", endDate: "2026-11-12" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "follow")).resolves.toBe(true);
    expect(t.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { arriveDate: "2026-11-10", departDate: "2026-11-12", nights: null, timezone: "Australia/Sydney" },
    });
  });

  it("follow is a no-op when the Stop already matches", async () => {
    const scheduled = { ...rough, arriveDate: "2026-11-04", departDate: "2026-11-05", timezone: "Australia/Sydney" };
    const t = tx({ trip: { startDate: "2026-11-04", endDate: "2026-11-05" }, stops: [scheduled] });
    await expect(scheduleLoneStopTx(t.client, "trip1", null, "follow")).resolves.toBe(false);
  });
});
