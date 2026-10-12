import { describe, expect, it } from "vitest";
import { surprisesToReveal } from "./next-steps-builder";
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
