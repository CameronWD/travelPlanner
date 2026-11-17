import { describe, it, expect } from "vitest";
import { savedCopyState, savedCopyLineContent, isSavedCopyMessage, savedCopyAnswer } from "./saved-copy";

describe("savedCopyState", () => {
  const base = { renderedToday: "2026-12-10", zone: "Europe/Berlin", now: new Date("2026-12-11T06:00:00Z"), servedAsSavedCopy: false };

  it("is stale when the device's date in the zone is later than the rendered one", () => {
    expect(savedCopyState(base)).toEqual({ stale: true, deviceToday: "2026-12-11" });
  });

  it("is not stale on the same day", () => {
    expect(savedCopyState({ ...base, now: new Date("2026-12-10T20:00:00Z") })).toEqual({ stale: false, deviceToday: "2026-12-10" });
  });

  it("is stale on the same day when served as a saved copy", () => {
    expect(savedCopyState({ ...base, now: new Date("2026-12-10T20:00:00Z"), servedAsSavedCopy: true })).toEqual({
      stale: true,
      deviceToday: "2026-12-10",
    });
  });

  it("judges the date in the Stop's zone, not the device's", () => {
    const now = new Date("2026-12-10T23:30:00Z");
    expect(savedCopyState({ ...base, now }).deviceToday).toBe("2026-12-11");
    expect(savedCopyState({ ...base, zone: "America/New_York", now }).deviceToday).toBe("2026-12-10");
  });

  it("a device behind the server is not a saved copy", () => {
    expect(savedCopyState({ ...base, now: new Date("2026-12-09T12:00:00Z") }).stale).toBe(false);
  });
});

describe("savedCopyLineContent", () => {
  const trip = { tripRef: "munich", startDate: "2026-12-08", endDate: "2026-12-14", renderedToday: "2026-12-10" };

  it("links to the Day view for the device's today inside the Trip", () => {
    expect(savedCopyLineContent({ ...trip, deviceToday: "2026-12-12" })).toEqual({
      text: "Saved Thu 10 Dec.",
      linkText: "Open today",
      href: "/trips/munich/day/2026-12-12",
    });
  });

  it("links to Home when the device's today is after the Trip", () => {
    expect(savedCopyLineContent({ ...trip, deviceToday: "2026-12-15" }).href).toBe("/trips/munich");
  });

  it("links to Home for a Trip with no dates", () => {
    expect(savedCopyLineContent({ ...trip, startDate: null, endDate: null, deviceToday: "2026-12-11" }).href).toBe("/trips/munich");
  });

  it("a saved copy from the same day has no link", () => {
    expect(savedCopyLineContent({ ...trip, deviceToday: "2026-12-10" })).toEqual({
      text: "Saved copy. Reload when you're back online",
      linkText: null,
      href: null,
    });
  });
});

describe("worker messages", () => {
  it("recognises the pushed message and the pull answer", () => {
    expect(isSavedCopyMessage({ type: "SAVED_COPY", url: "/x" })).toBe(true);
    expect(isSavedCopyMessage({ type: "LAST_TRIP" })).toBe(false);
    expect(isSavedCopyMessage(null)).toBe(false);
    expect(savedCopyAnswer({ savedCopy: true })).toBe(true);
    expect(savedCopyAnswer({ savedCopy: false })).toBe(false);
    expect(savedCopyAnswer(undefined)).toBe(false);
  });
});
