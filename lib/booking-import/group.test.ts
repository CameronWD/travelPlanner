import { describe, expect, it } from "vitest";
import { groupProposals, proposalGroupKey, UNPLACED_GROUP } from "./group";
import type { ImportContext, ItemProposal, ProposalBase, StopProposal, TransportProposal } from "./types";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };
const CONTEXT: ImportContext = {
  homeName: "Brisbane",
  homeTimezone: "Australia/Brisbane",
  homeCurrency: "AUD",
  stops: [
    { id: "s-lis", name: "Lisbon", country: "Portugal", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-04", sortOrder: 0 },
    { id: "s-rough", name: "Coast", country: null, timezone: null, arriveDate: null, departDate: null, sortOrder: 1 },
    { id: "s-opo", name: "Porto", country: "Portugal", timezone: "Europe/Lisbon", arriveDate: "2026-12-08", departDate: "2026-12-15", sortOrder: 2 },
  ],
};
const item = (clientId: string, stopId?: string): ItemProposal => ({ ...BASE, clientId, kind: "item", input: { title: clientId, category: "OTHER", stopId } });
const madrid: StopProposal = { ...BASE, clientId: "s1", kind: "stop", input: { mode: "scheduled", name: "Madrid", timezone: "Europe/Madrid", arriveDate: "2026-12-05", departDate: "2026-12-07" } };
const outbound: TransportProposal = { ...BASE, clientId: "p9", kind: "transport", input: { mode: "FLIGHT", depIsHome: true, toStopId: "s-lis" } };
const home: TransportProposal = { ...BASE, clientId: "p8", kind: "transport", input: { mode: "FLIGHT", fromStopId: "s-opo", arrIsHome: true } };

describe("proposalGroupKey", () => {
  it("files a leg under where it arrives, a return home under where it leaves, the rest under their Stop", () => {
    expect(proposalGroupKey(outbound)).toBe("s-lis");
    expect(proposalGroupKey(home)).toBe("s-opo");
    expect(proposalGroupKey(madrid)).toBe("proposed:s1");
    expect(proposalGroupKey(item("p1"))).toBe(UNPLACED_GROUP);
  });
});

describe("groupProposals", () => {
  it("orders Stops as on the plan, slots proposed Stops in by date, and puts the unplaced last", () => {
    const groups = groupProposals([item("p1", "s-opo"), item("p2", "proposed:s1"), madrid, item("p3", "s-lis"), item("p4"), item("p5", "s-rough")], CONTEXT);
    expect(groups.map((g) => g.title)).toEqual(["Lisbon", "Coast", "New stop: Madrid", "Porto", "Not on a Stop"]);
    expect(groups[2]).toMatchObject({ key: "proposed:s1", isNew: true, stop: madrid });
    expect(groups[2].proposals.map((p) => p.clientId)).toEqual(["p2"]);
  });
});
