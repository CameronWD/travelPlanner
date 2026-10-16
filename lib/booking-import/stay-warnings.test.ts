import { describe, expect, it } from "vitest";
import { formatDayLabel } from "@/lib/dates";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { PreviewStop } from "./preview";
import { refreshStayWarnings, stayWarnings } from "./stay-warnings";
import type { ItemProposal, Proposal, ProposalBase, TransportProposal } from "./types";

const BASE: Omit<ProposalBase, "clientId"> = { confidence: "high", doubleCheck: [], warnings: [], highlight: [], missing: [], duplicateOf: null, blocked: null };

const LISBON: PreviewStop = { id: "s-lis", name: "Lisbon", timezone: "Europe/Lisbon", arriveDate: "2026-12-02", departDate: "2026-12-08" };
const PORTO: PreviewStop = { id: "s-opo", name: "Porto", timezone: "Europe/Lisbon", arriveDate: "2026-12-08", departDate: "2026-12-15" };
const STOPS = new Map([
  [LISBON.id, LISBON],
  [PORTO.id, PORTO],
]);

const flight = (depAt: string, toStopId: string, arrAt: string, warnings: string[] = []): TransportProposal => ({
  ...BASE,
  warnings,
  clientId: "p1",
  kind: "transport",
  input: { mode: "FLIGHT", toStopId, arrAt, depIsHome: true, depAt },
});

const item = (date: string, stopId: string, warnings: string[] = []): ItemProposal => ({
  ...BASE,
  warnings,
  clientId: "p2",
  kind: "item",
  input: { title: "Ticket", category: "SIGHTSEEING", stopId, date },
});

describe("stayWarnings", () => {
  it("warns a Transport arriving outside its Stop's stay", () => {
    expect(stayWarnings(flight("2026-12-01T10:00", "s-lis", "2026-12-20T07:15"), STOPS)).toEqual([M.arrivesOutsideStay("Lisbon")]);
  });

  it("is silent once the Transport's arrival date is back inside the stay", () => {
    expect(stayWarnings(flight("2026-12-01T10:00", "s-lis", "2026-12-03T07:15"), STOPS)).toEqual([]);
  });

  it("warns an Item outside its Stop's stay", () => {
    expect(stayWarnings(item("2026-12-20", "s-lis"), STOPS)).toEqual([M.itemOutsideStay("Lisbon", formatDayLabel("2026-12-20"))]);
  });

  it("is silent once the Item's date is back inside the stay", () => {
    expect(stayWarnings(item("2026-12-04", "s-lis"), STOPS)).toEqual([]);
  });

  it("never warns about a rough Stop (no dates yet)", () => {
    const rough = new Map([["s-rough", { id: "s-rough", name: "Rough", timezone: null, arriveDate: null, departDate: null }]]);
    expect(stayWarnings(item("2026-12-20", "s-rough"), rough)).toEqual([]);
  });

  it("is a no-op for kinds the stay check doesn't own (accommodation, stop)", () => {
    const stay: Proposal = { ...BASE, clientId: "p3", kind: "accommodation", input: { stopId: "s-lis", name: "Casa", checkIn: "2026-12-20", checkOut: "2026-12-21" } };
    expect(stayWarnings(stay, STOPS)).toEqual([]);
  });
});

describe("refreshStayWarnings", () => {
  it("drops a Transport's stay warning once it's moved back inside Lisbon's stay", () => {
    const prev = flight("2026-12-01T10:00", "s-lis", "2026-12-20T07:15", [M.arrivesOutsideStay("Lisbon")]);
    const next = flight("2026-12-01T10:00", "s-lis", "2026-12-03T07:15", [M.arrivesOutsideStay("Lisbon")]);
    expect(refreshStayWarnings(prev, next, STOPS).warnings).toEqual([]);
  });

  it("adds an Item's stay warning once it's moved outside its Stop's stay", () => {
    const prev = item("2026-12-04", "s-lis");
    const next = item("2026-12-20", "s-lis");
    expect(refreshStayWarnings(prev, next, STOPS).warnings).toEqual([M.itemOutsideStay("Lisbon", formatDayLabel("2026-12-20"))]);
  });

  it("keeps a duplicate warning through a refresh that changes the stay warning", () => {
    const dup = M.duplicate("Casa do Rio Lisboa");
    const prev = flight("2026-12-01T10:00", "s-lis", "2026-12-20T07:15", [M.arrivesOutsideStay("Lisbon"), dup]);
    const next = flight("2026-12-01T10:00", "s-lis", "2026-12-03T07:15", [M.arrivesOutsideStay("Lisbon"), dup]);
    expect(refreshStayWarnings(prev, next, STOPS).warnings).toEqual([dup]);
  });

  it("replaces a date-only departure's stay warning once the edit gives it a wall time (BI-04 fix round 1)", () => {
    // build.ts earns this warning from `end.date` alone, with no `depAt` yet
    // (no wall time printed in the booking) — stayWarnings(prev) can't see
    // that from prev.input, so the drop must go by message shape, not replay.
    const dateOnlyDep: TransportProposal = {
      ...BASE,
      warnings: [M.departsOutsideStay("Lisbon")],
      clientId: "p1",
      kind: "transport",
      input: { mode: "FLIGHT", fromStopId: "s-lis", arrIsHome: true },
    };
    expect(dateOnlyDep.input).not.toHaveProperty("depAt");

    const backInside = { ...dateOnlyDep, input: { ...dateOnlyDep.input, depAt: "2026-12-03T10:00" } };
    expect(refreshStayWarnings(dateOnlyDep, backInside, STOPS).warnings).toEqual([]);

    const stillOutside = { ...dateOnlyDep, input: { ...dateOnlyDep.input, depAt: "2026-12-20T10:00" } };
    expect(refreshStayWarnings(dateOnlyDep, stillOutside, STOPS).warnings).toEqual([M.departsOutsideStay("Lisbon")]);
  });
});
