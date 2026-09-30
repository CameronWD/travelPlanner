import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayPlan } from "@/lib/itinerary";
import { buildShareRows, ShareRow } from "./share-rows";

const day = {
  dateISO: "2026-12-12",
  stop: null,
  timedItems: [
    { kind: "item", item: { id: "i1", title: "RER to Versailles", category: "GETTING_AROUND", startTime: "08:40", endTime: "09:10", address: null } },
    { kind: "item", item: { id: "i2", title: "Palace + gardens", category: "SIGHTSEEING", startTime: "09:30", endTime: null, address: "Place d'Armes" } },
  ],
  untimedItems: [{ kind: "item", item: { id: "i3", title: "Free wander", category: "OTHER", startTime: null, endTime: null } }],
  transportEntries: [
    { kind: "transport-departure", transport: { id: "t1", mode: "FLIGHT", depPlace: "CDG", arrPlace: "FCO", reference: "PNR-ABC123" }, arrivesSameDay: true, depTimeLabel: "10:05", arrTimeLabel: "12:15" },
  ],
  accommodationEntries: [
    { kind: "accommodation-checkin", accommodation: { id: "a1", stopId: "s", name: "Hôtel Grands Boulevards", checkIn: "2026-12-12", checkOut: "2026-12-15", checkInTime: "15:00", address: "17 Bd Poissonnière", confirmation: "CONF-999" } },
  ],
} as unknown as DayPlan;

describe("buildShareRows", () => {
  it("interleaves items, transport and stays in orderDayEntries order, anytime last", () => {
    const rows = buildShareRows(day, { nowHHMM: null, withAddress: true });
    expect(rows.map((r) => r.title)).toEqual([
      "RER to Versailles", "Palace + gardens", "Flight to FCO", "Check in, Hôtel Grands Boulevards", "Free wander",
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["item", "item", "transport", "stay", "item"]);
  });
  it("marks rows done against the local clock", () => {
    const rows = buildShareRows(day, { nowHHMM: "09:20", withAddress: false });
    expect(rows.find((r) => r.title === "RER to Versailles")!.done).toBe(true);
    expect(rows.find((r) => r.title === "Palace + gardens")!.done).toBe(false);
    expect(rows.find((r) => r.title === "Free wander")!.done).toBe(false);
  });
  it("carries addresses only when asked, and never a reference or confirmation", () => {
    expect(buildShareRows(day, { nowHHMM: null, withAddress: false }).every((r) => r.sub === null)).toBe(true);
    const json = JSON.stringify(buildShareRows(day, { nowHHMM: null, withAddress: true }));
    expect(json).toContain("17 Bd Poissonnière");
    expect(json).not.toMatch(/PNR-ABC123|CONF-999|reference|confirmation/);
  });
});

describe("ShareRow", () => {
  it("strikes a done row and uses a mode icon for transport", () => {
    const rows = buildShareRows(day, { nowHHMM: "09:20", withAddress: false });
    const { container, rerender } = render(<ShareRow row={rows[0]} />);
    expect(screen.getByText("RER to Versailles").className).toMatch(/line-through/);
    expect(container.textContent).toContain("08:40");
    rerender(<ShareRow row={rows[2]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
