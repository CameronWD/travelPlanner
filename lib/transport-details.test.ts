import { describe, expect, it } from "vitest";
import { pickTransportDetails, transportDetailFields, transportDetailsLine } from "@/lib/transport-details";

describe("transport details", () => {
  it("lists a mode's fields in form order with their labels", () => {
    expect(transportDetailFields("FLIGHT")).toEqual([
      { key: "carrier", label: "Airline" }, { key: "serviceNumber", label: "Flight number" }, { key: "seat", label: "Seat" },
      { key: "terminal", label: "Terminal" }, { key: "gate", label: "Gate" },
    ]);
    expect(transportDetailFields("TRAIN").map((f) => f.label)).toEqual(["Operator", "Train number", "Coach", "Seat", "Platform"]);
    expect(transportDetailFields("BUS").map((f) => f.label)).toEqual(["Operator", "Bus number", "Seat"]);
    expect(transportDetailFields("FERRY")).toEqual(transportDetailFields("OTHER"));
    expect(transportDetailFields("FERRY").map((f) => f.label)).toEqual(["Operator", "Service number", "Seat"]);
    expect(transportDetailFields("CAR")).toEqual([{ key: "carrier", label: "Hire company" }]);
  });
  it("writes the line in a fixed order with words on the short values", () => {
    expect(transportDetailsLine("TRAIN", { carrier: "DB", serviceNumber: "ICE 9572", coach: "7", seat: "42", platform: "12" })).toBe("DB · ICE 9572 · Coach 7 · Seat 42 · Platform 12");
    expect(transportDetailsLine("FLIGHT", { carrier: "Lufthansa", serviceNumber: "LH 2456", seat: "32A", terminal: "2", gate: "B14" })).toBe("LH 2456 · Seat 32A · Terminal 2 · Gate B14");
    expect(transportDetailsLine("FLIGHT", { carrier: "Lufthansa" })).toBe("Lufthansa");
  });
  it("does not repeat a word the Traveller typed", () => {
    expect(transportDetailsLine("TRAIN", { coach: "Coach 7", seat: "seat 42A" })).toBe("Coach 7 · seat 42A");
    expect(transportDetailsLine("FLIGHT", { gate: "Gateway 3" })).toBe("Gate Gateway 3");
    expect(transportDetailsLine("TRAIN", { seat: "Seating upper" })).toBe("Seat Seating upper");
    expect(transportDetailsLine("TRAIN", { seat: "Seat42" })).toBe("Seat42");
    expect(transportDetailsLine("TRAIN", { seat: "Seat" })).toBe("Seat");
  });
  it("leaves out what the mode does not show, and blanks", () => {
    expect(transportDetailsLine("CAR", { carrier: "Hertz", seat: "1", gate: "4" })).toBe("Hertz");
    expect(transportDetailsLine("BUS", { carrier: "  ", serviceNumber: null })).toBe("");
    expect(transportDetailsLine("FLIGHT", {})).toBe("");
  });
  it("picks all seven keys, trimmed, blank as null", () => {
    expect(pickTransportDetails({ carrier: " DB ", seat: "" })).toEqual({ carrier: "DB", serviceNumber: null, seat: null, terminal: null, gate: null, coach: null, platform: null });
  });
});
