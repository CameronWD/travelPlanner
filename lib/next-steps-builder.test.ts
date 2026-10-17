import { describe, expect, it } from "vitest";
import { surprisesToReveal, buildTripNextSteps } from "./next-steps-builder";
import type { SurpriseView } from "@/lib/surprise";

const view = (plannerId: string): SurpriseView => ({
  plannerId, plannerName: "P", forIds: ["other"], forNames: ["O"], youAreSurprised: false,
});

describe("surprisesToReveal (CONTEXT.md Surprise: the planner's Home nudge)", () => {
  const views = {
    stops: new Map([["s-due", view("me")], ["s-ahead", view("me")], ["s-rough", view("me")], ["s-theirs", view("them")]]),
    items: new Map([["i-due", view("me")], ["i-ahead", view("me")], ["i-undated", view("me")], ["i-theirs", view("them")]]),
  };
  const stops = [
    { id: "s-due", name: "Paris", arriveDate: "2026-07-01" },
    { id: "s-ahead", name: "Rome", arriveDate: "2026-07-03" },
    { id: "s-rough", name: "Somewhere", arriveDate: null },
    { id: "s-theirs", name: "Lyon", arriveDate: "2026-06-01" },
    { id: "s-plain", name: "Nice", arriveDate: "2026-06-01" },
  ];
  const items = [
    { id: "i-due", title: "Dinner", date: "2026-07-02", stopId: "s-ahead" },
    { id: "i-ahead", title: "Show", date: "2026-07-03", stopId: null },
    { id: "i-undated", title: "Picnic", date: null, stopId: null },
    { id: "i-theirs", title: "Cake", date: "2026-06-01", stopId: null },
    { id: "i-plain", title: "Lunch", date: "2026-06-01", stopId: null },
  ];

  it("only the viewer's own Surprises, on or after the Stop's arrive date or the Item's day", () => {
    expect(surprisesToReveal({ views, viewerId: "me", today: "2026-07-02", stops, items })).toEqual([
      { id: "s-due", kind: "STOP", label: "Paris", stopId: "s-due" },
      { id: "i-due", kind: "ITEM", label: "Dinner", stopId: "s-ahead" },
    ]);
  });

  it("the day before, nothing is due", () => {
    expect(surprisesToReveal({ views, viewerId: "me", today: "2026-06-30", stops, items })).toEqual([]);
  });

  it("the surprised (or anyone not the planner) is never nudged", () => {
    expect(surprisesToReveal({ views, viewerId: "other", today: "2026-12-31", stops, items })).toEqual([]);
  });
});

describe("buildTripNextSteps: the planning Flags (spec 2026-10-17 R7)", () => {
  const base = {
    tripBasePath: "/trips/t", phase: "planning" as const, tripStart: "2026-12-06", tripEnd: "2026-12-12", roundTrip: false, home: null,
    datedStops: [{ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-12", timezone: "Europe/Berlin", sortOrder: 0, lat: null, lng: null }],
    roughStopCount: 0, allStops: [{ id: "nbg", name: "Nuremberg" }], transports: [], accommodations: [],
    projectedEnd: null, hardEndDate: null, undatedChapterCount: 0, hasPackingList: true, hasPretripList: true, limit: Number.POSITIVE_INFINITY,
  };
  const closedTue = { week: { tue: [] }, seasons: [], closed: [] };
  const museum = { id: "i1", stopId: "nbg", date: "2026-12-08", title: "Memorium Nuremberg Trials", openingHours: closedTue };
  const pass = { id: "i2", stopId: "nbg", date: null, title: "Tram pass", bookingState: "TO_BOOK", bookBy: "2026-12-03" };

  it("a closed day and a booking due become ranked steps that open where they are fixed", () => {
    const steps = buildTripNextSteps({ ...base, items: [museum, pass], today: "2026-12-01" });
    expect(steps.find((s) => s.id === "item-closed-i1")).toMatchObject({ severity: "warning", source: "flag", href: "/trips/t/day/2026-12-08", title: "Memorium Nuremberg Trials is closed on Tuesdays." });
    expect(steps.find((s) => s.id === "book-by-soon-i2")).toMatchObject({ severity: "info", href: "/trips/t/plan?stop=nbg" });
  });

  it("nothing about an Item hidden from the viewer", () => {
    const steps = buildTripNextSteps({ ...base, items: [museum], today: "2026-12-01", hiddenItemIds: ["i1"] });
    expect(steps.map((s) => s.id)).not.toContain("item-closed-i1");
  });
});
