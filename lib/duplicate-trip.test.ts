import { describe, it, expect } from "vitest";
import { buildDuplicatePlan, type DuplicateSource } from "./duplicate-trip";

const SOURCE: DuplicateSource = {
  name: "Europe 2026",
  homeCurrency: "AUD",
  drivingWindingFactor: 1.4,
  drivingAvgSpeedKph: 90,
  chapters: [
    { id: "ch1", name: "Italy", colour: "rose", startDate: "2026-08-01", endDate: "2026-08-10", sortOrder: 0 },
  ],
  stops: [
    // scheduled stop — should become rough, nights derived from dates
    { id: "s1", name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
      arriveDate: "2026-08-01", departDate: "2026-08-04", nights: null, pinned: true,
      sortOrder: 0, chapterId: "ch1", chapterSortOrder: 0, notes: "near station" },
    // rough stop — keep its nights
    { id: "s2", name: "Florence", country: "Italy", lat: null, lng: null, timezone: null,
      arriveDate: null, departDate: null, nights: 2, pinned: false,
      sortOrder: 1, chapterId: "ch1", chapterSortOrder: 1, notes: null },
  ],
  items: [
    { stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-08-02",
      startTime: "09:00", endTime: "11:00", lat: 41.89, lng: 12.49, address: "Rome", link: "x", booking: "BK1", notes: "n" },
    { stopId: null, title: "Gelato somewhere", category: "FOOD", date: null,
      startTime: null, endTime: null, lat: null, lng: null, address: null, link: null, booking: null, notes: null },
  ],
  transports: [
    { fromStopId: "s1", toStopId: "s2", mode: "TRAIN", depPlace: "Roma Termini", arrPlace: "Firenze",
      depAt: new Date("2026-08-04T08:00:00Z"), arrAt: new Date("2026-08-04T09:30:00Z"),
      reference: "FR9521", notes: "platform 5", depLat: 41.9, depLng: 12.5, arrLat: 43.7, arrLng: 11.2 },
  ],
  checklistItems: [
    { kind: "PRETRIP", text: "Renew passport", dueDate: "2026-07-01" },
    { kind: "PACKING", text: "Chargers", dueDate: null },
  ],
};

describe("buildDuplicatePlan", () => {
  it("sets trip name + copies currency and driving settings, no dates", () => {
    const plan = buildDuplicatePlan(SOURCE, "Copy of Europe 2026");
    expect(plan.trip).toEqual({
      name: "Copy of Europe 2026",
      homeCurrency: "AUD",
      drivingWindingFactor: 1.4,
      drivingAvgSpeedKph: 90,
    });
  });

  it("carries chapters but resets their dates (rough)", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.chapters).toEqual([
      { sourceId: "ch1", data: { name: "Italy", colour: "rose", startDate: null, endDate: null, sortOrder: 0 } },
    ]);
  });

  it("makes every stop rough: clears dates, clears pin, derives nights for scheduled stops, keeps place facts", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    const rome = plan.stops.find((s) => s.sourceId === "s1")!;
    expect(rome.data).toEqual({
      name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
      arriveDate: null, departDate: null, nights: 3, pinned: false,
      sortOrder: 0, chapterSortOrder: 0, notes: "near station",
    });
    expect(rome.sourceChapterId).toBe("ch1");
    const flor = plan.stops.find((s) => s.sourceId === "s2")!;
    expect(flor.data.nights).toBe(2); // rough stop keeps its nights
  });

  it("turns all items into unscheduled wishlist items, clearing date/time/booking, keeping research", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    const col = plan.items[0];
    expect(col.sourceStopId).toBe("s1");
    expect(col.data).toEqual({
      title: "Colosseum", category: "SIGHTSEEING",
      date: null, startTime: null, endTime: null, booking: null,
      lat: 41.89, lng: 12.49, address: "Rome", link: "x", notes: "n",
      sortOrder: 0,
    });
  });

  it("keeps transport connections but strips times/reference/notes/cost-bearing fields", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.transports).toHaveLength(1);
    const t = plan.transports[0];
    expect(t.sourceFromStopId).toBe("s1");
    expect(t.sourceToStopId).toBe("s2");
    expect(t.data).toEqual({
      mode: "TRAIN", depPlace: "Roma Termini", arrPlace: "Firenze",
      depAt: null, arrAt: null, reference: null, notes: null,
      depLat: 41.9, depLng: 12.5, arrLat: 43.7, arrLng: 11.2, sortOrder: 0,
    });
  });

  it("copies checklist text, unticked, clearing due date and assignee", () => {
    const plan = buildDuplicatePlan(SOURCE, "x");
    expect(plan.checklistItems).toEqual([
      { data: { kind: "PRETRIP", text: "Renew passport", done: false, dueDate: null, assignedToId: null, sortOrder: 0 } },
      { data: { kind: "PACKING", text: "Chargers", done: false, dueDate: null, assignedToId: null, sortOrder: 1 } },
    ]);
  });
});
