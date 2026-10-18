import { describe, expect, it } from "vitest";
import type { Flag } from "@/lib/flags";
import { SAMPLE_PLAN, SAMPLE_TODAY } from "@/test/fixtures/review/sample-plan";
import { collectReviewTargets, reviewInputFromPlan, reviewPlanJson } from "./input-shape";

const FLAG: Flag = { id: "still-to-book-train", severity: "info", message: "The train from Kyoto to Hakone is still to book.", targetType: "TRANSPORT", targetId: "train" };

describe("reviewPlanJson (spec 2026-10-17 R9)", () => {
  const json = reviewPlanJson(SAMPLE_PLAN);
  const plan = JSON.parse(json);

  it("never sends booking references, confirmation numbers, Attachment titles or who is asking", () => {
    expect(json).not.toMatch(/YCH-55821|QF-ABC123|TEA-1182/);
    expect(json).not.toMatch(/"(booking|reference|confirmation|files|you)":/);
  });

  it("sends how many Travellers are going, never their names", () => {
    expect(plan.travellerCount).toBe(2);
    expect(plan).not.toHaveProperty("travellers");
    expect(json).not.toMatch(/Xanni|u-cam/);
  });

  it("marks a Surprise as surprise: true and says nothing else about it", () => {
    expect(plan.stops[1]).toMatchObject({ id: "secret", name: "Hakone", surprise: true, accommodations: [], days: [] });
    expect(plan.stops[0].days[1].items[1]).toMatchObject({ id: "gift", title: "Surprise", surprise: true });
    expect(plan.stops[0]).not.toHaveProperty("surprise");
    expect(json).not.toMatch(/plannedBy|youAreSurprised/);
  });

  it("keeps what a Review reads: notes, times, Booking state, slots, Try lists", () => {
    expect(json).toContain("Still waiting to hear back.");
    expect(plan.stops[0].days[2].items[0]).toMatchObject({ bookingState: "BOOKED", slotTime: "14:00", arriveByMinutes: 10, refundable: "NO" });
    expect(plan.transports[1]).toMatchObject({ id: "train", bookingState: "TO_BOOK" });
  });
});

describe("collectReviewTargets", () => {
  it("names every visible Stop, Item, leg and stay, and nothing that carries a live Surprise", () => {
    const t = collectReviewTargets(SAMPLE_PLAN);
    expect([...t.STOP]).toEqual(["kyoto"]);
    expect([...t.ITEM].sort()).toEqual(["kiyomizu", "museum", "nishiki", "tea"]);
    expect([...t.TRANSPORT].sort()).toEqual(["flight-in", "train"]);
    expect([...t.ACCOMMODATION]).toEqual(["ryokan"]);
  });

  it("counts a dated thing on no Stop's days", () => {
    const withUnplaced = { ...SAMPLE_PLAN, unplacedDatedItems: [{ ...SAMPLE_PLAN.stops[0].days[0].items[0], id: "osaka-day", date: "2026-11-06", stopId: null }] };
    expect(collectReviewTargets(withUnplaced).ITEM.has("osaka-day")).toBe(true);
  });
});

describe("reviewInputFromPlan", () => {
  it("carries the Trip's name, dates and today, the current Flags, the plan JSON and its targets", () => {
    const input = reviewInputFromPlan(SAMPLE_PLAN, [FLAG], SAMPLE_TODAY);
    expect(input).toMatchObject({ tripName: "Autumn in Kyoto", startDate: "2026-11-01", endDate: "2026-11-06", today: "2026-10-18", flags: [FLAG] });
    expect(input.plan).toBe(reviewPlanJson(SAMPLE_PLAN));
    expect(input.targets.ITEM.has("museum")).toBe(true);
  });
});
