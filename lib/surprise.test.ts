import { describe, expect, it } from "vitest";
import {
  autoRevealDate, isSurprisedBy, parseSurpriseFor, serializeSurpriseFor,
  surpriseLine, surpriseState, surpriseView,
} from "@/lib/surprise";

const live = { surprisePlannerId: "cam", surpriseForIds: '["sam"]', surpriseRevealedAt: null };
const members = [
  { id: "cam", name: "Cam Williams", image: null },
  { id: "sam", name: "Sam Jones", image: null },
  { id: "alex", name: null, image: null, displayName: "Alex P" },
];

describe("parse/serialize", () => {
  it("round-trips, dedupes and sorts", () => {
    expect(parseSurpriseFor(serializeSurpriseFor(["sam", "alex", "sam"]))).toEqual(["alex", "sam"]);
  });
  it("tolerates null, garbage and non-arrays", () => {
    expect(parseSurpriseFor(null)).toEqual([]);
    expect(parseSurpriseFor("not json")).toEqual([]);
    expect(parseSurpriseFor('{"a":1}')).toEqual([]);
    expect(parseSurpriseFor('[1, "sam"]')).toEqual(["sam"]);
  });
});

describe("surpriseState", () => {
  const over = { endDate: "2026-12-24", timezone: "Pacific/Auckland" };
  it("is none without a planner", () => {
    expect(surpriseState({ ...live, surprisePlannerId: null }, over, new Date("2026-01-01T00:00Z"))).toBe("none");
  });
  it("is revealed once revealedAt is set", () => {
    expect(surpriseState({ ...live, surpriseRevealedAt: new Date() }, over, new Date("2026-01-01T00:00Z"))).toBe("revealed");
  });
  it("is live until the end of the end date in the Stop's zone", () => {
    // 2026-12-24T23:00 Auckland = 2026-12-24T10:00Z
    expect(surpriseState(live, over, new Date("2026-12-24T10:00:00Z"))).toBe("live");
    // 2026-12-25T00:30 Auckland = 2026-12-24T11:30Z
    expect(surpriseState(live, over, new Date("2026-12-24T11:30:00Z"))).toBe("revealed");
  });
  it("falls back to UTC with no zone", () => {
    expect(surpriseState(live, { endDate: "2026-12-24", timezone: null }, new Date("2026-12-24T23:59:59Z"))).toBe("live");
    expect(surpriseState(live, { endDate: "2026-12-24", timezone: null }, new Date("2026-12-25T00:00:00Z"))).toBe("revealed");
  });
  it("stays live for ever with no end date (rough Stop, undated thing to do)", () => {
    expect(surpriseState(live, { endDate: null, timezone: null }, new Date("2099-01-01T00:00Z"))).toBe("live");
  });
  it("autoRevealDate is the day after", () => {
    expect(autoRevealDate(over)).toBe("2026-12-25");
    expect(autoRevealDate({ endDate: null, timezone: null })).toBeNull();
  });
});

describe("isSurprisedBy", () => {
  const over = { endDate: null, timezone: null };
  const now = new Date();
  it("is true for a named viewer while live", () => expect(isSurprisedBy(live, over, "sam", now)).toBe(true));
  it("is false for the planner and for anyone not named", () => {
    expect(isSurprisedBy(live, over, "cam", now)).toBe(false);
    expect(isSurprisedBy(live, over, "alex", now)).toBe(false);
  });
  it("treats a null viewer (share link, calendar feed) as surprised by every live Surprise", () => {
    expect(isSurprisedBy(live, over, null, now)).toBe(true);
  });
  it("is false once revealed", () => {
    expect(isSurprisedBy({ ...live, surpriseRevealedAt: new Date() }, over, "sam", now)).toBe(false);
  });
});

describe("surpriseView", () => {
  const over = { endDate: null, timezone: null };
  const now = new Date();
  it("is null when not a Surprise or revealed", () => {
    expect(surpriseView({ ...live, surprisePlannerId: null }, over, "sam", members, now)).toBeNull();
    expect(surpriseView({ ...live, surpriseRevealedAt: new Date() }, over, "sam", members, now)).toBeNull();
  });
  it("names the planner and the surprised by first name", () => {
    const v = surpriseView({ ...live, surpriseForIds: '["sam","alex"]' }, over, "cam", members, now)!;
    expect(v).toMatchObject({ plannerId: "cam", plannerName: "Cam", forIds: ["sam", "alex"], forNames: ["Sam", "Alex"], youAreSurprised: false });
    expect(surpriseLine(v)).toBe("Surprise for Sam and Alex");
  });
  it("reads as planned-by for the surprised", () => {
    const v = surpriseView(live, over, "sam", members, now)!;
    expect(v.youAreSurprised).toBe(true);
    expect(surpriseLine(v)).toBe("Surprise, planned by Cam");
  });
  it("falls back to 'a Traveller' when the planner has left the Trip", () => {
    const v = surpriseView({ ...live, surprisePlannerId: "gone" }, over, "sam", members, now)!;
    expect(surpriseLine(v)).toBe("Surprise, planned by a Traveller");
  });
});
