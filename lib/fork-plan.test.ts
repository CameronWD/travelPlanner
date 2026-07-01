// lib/fork-plan.test.ts
import { describe, it, expect } from "vitest";
import { buildForkPlan } from "./fork-plan";

const source = {
  chapters: [{ id: "c1", name: "Italy", colour: "#f00", startDate: "2026-07-01", endDate: "2026-07-10", sortOrder: 0 }],
  stops: [{ id: "s1", chapterId: "c1", name: "Rome", country: "IT", lat: 1, lng: 2, timezone: "Europe/Rome",
            arriveDate: "2026-07-01", departDate: "2026-07-04", nights: 3, pinned: true, sortOrder: 0,
            chapterSortOrder: 0, notes: "n" }],
  transports: [{ id: "t1", fromStopId: "s1", toStopId: null, mode: "TRAIN", depPlace: "Rome", arrPlace: "Florence",
                 depAt: new Date("2026-07-04T09:00:00Z"), arrAt: new Date("2026-07-04T11:00:00Z"),
                 depLat: null, depLng: null, arrLat: null, arrLng: null, reference: "TR1", notes: null, sortOrder: 0 }],
  accommodations: [{ id: "a1", stopId: "s1", name: "Hotel", address: "Via X", checkIn: "2026-07-01",
                     checkOut: "2026-07-04", confirmation: "ABC", notes: null, lat: null, lng: null }],
  items: [{ id: "i1", stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-02",
            startTime: "10:00", endTime: null, lat: null, lng: null, address: null, link: null,
            booking: "BK1", notes: null, sortOrder: 0 }],
  costs: [{ id: "co1", estimatedMinor: 5000, actualMinor: 4000, currency: "EUR", rateToHome: 1.6,
            paidAt: new Date("2026-06-01T00:00:00Z"), ownerType: "ACCOMMODATION", ownerId: "a1",
            label: null, category: null }],
};

it("keeps dates, pinned, accommodation and estimated cost; drops paid/actual", () => {
  const plan = buildForkPlan(source);
  expect(plan.stops[0].data.arriveDate).toBe("2026-07-01");
  expect(plan.stops[0].data.pinned).toBe(true);
  expect(plan.accommodations[0].data.confirmation).toBe("ABC");
  expect(plan.costs[0].data.estimatedMinor).toBe(5000);
  expect(plan.costs[0].data.actualMinor).toBeNull();   // dropped
  expect(plan.costs[0].data.paidAt).toBeNull();         // dropped
  expect(plan.costs[0].data.rateToHome).toBe(1.6);      // kept for conversion
});

it("preserves source ids for FK remapping", () => {
  const plan = buildForkPlan(source);
  expect(plan.stops[0].sourceId).toBe("s1");
  expect(plan.stops[0].sourceChapterId).toBe("c1");
  expect(plan.transports[0].sourceFromStopId).toBe("s1");
  expect(plan.accommodations[0].sourceStopId).toBe("s1");
  expect(plan.items[0].sourceStopId).toBe("s1");
  expect(plan.costs[0].sourceOwnerType).toBe("ACCOMMODATION");
  expect(plan.costs[0].sourceOwnerId).toBe("a1");
});
