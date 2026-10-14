import { describe, expect, it } from "vitest";
import { previewStopMap, stayRange, transportPreview } from "./preview";
import type { ImportContext, ProposalBase, StopProposal } from "./types";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };
const CONTEXT: ImportContext = {
  homeName: "Brisbane",
  homeTimezone: "Australia/Brisbane",
  homeCurrency: "AUD",
  stops: [{ id: "s-rough", name: "Somewhere", country: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 0 }],
};
const LISBON: StopProposal = { ...BASE, clientId: "s1", kind: "stop", input: { mode: "scheduled", name: "Lisbon", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" } };

describe("Booking import preview", () => {
  it("maps real and proposed Stops by the id a Proposal uses", () => {
    const stops = previewStopMap(CONTEXT, [LISBON]);
    expect(stops.get("s-rough")?.name).toBe("Somewhere");
    expect(stops.get("proposed:s1")).toEqual({ id: "proposed:s1", name: "Lisbon", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-15" });
  });

  it("turns wall times into instants in each end's own zone", () => {
    const { transport, homeTimezone } = transportPreview(
      { mode: "FLIGHT", depIsHome: true, depAt: "2026-12-01T10:00", toStopId: "proposed:s1", arrAt: "2026-12-02T07:15" },
      previewStopMap(CONTEXT, [LISBON]),
      CONTEXT.homeTimezone,
    );
    expect(homeTimezone).toBe("Australia/Brisbane");
    expect(transport.depAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(transport.arrAt?.toISOString()).toBe("2026-12-02T07:15:00.000Z");
    expect(transport.toStopName).toBe("Lisbon");
  });

  it("uses an end's zone hint when it has no Stop, and the Home hint when Home has no zone", () => {
    const { transport, homeTimezone } = transportPreview(
      { mode: "FLIGHT", depIsHome: true, depTimezone: "Australia/Sydney", depAt: "2026-12-01T10:00", arrPlace: "Singapore Changi (SIN)", arrTimezone: "Asia/Singapore", arrAt: "2026-12-01T16:00" },
      new Map(),
      null,
    );
    expect(homeTimezone).toBe("Australia/Sydney");
    expect(transport.depAt?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(transport.arrAt?.toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(transport.toStopTimezone).toBe("Asia/Singapore");
  });

  it("a stay is checked against its Stop's dates, or its own when the Stop is rough", () => {
    const stops = previewStopMap(CONTEXT, [LISBON]);
    expect(stayRange({ stopId: "proposed:s1", name: "Casa", checkIn: "2026-12-02", checkOut: "2026-12-08" }, stops)).toEqual({ arriveDate: "2026-12-02", departDate: "2026-12-15" });
    expect(stayRange({ stopId: "s-rough", name: "Casa", checkIn: "2026-12-02", checkOut: "2026-12-08" }, stops)).toEqual({ arriveDate: "2026-12-02", departDate: "2026-12-08" });
  });
});
