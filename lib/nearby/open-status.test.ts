import { describe, expect, it } from "vitest";
import type { OpeningHours } from "@/lib/opening-hours";
import { openStatusAt } from "./open-status";

const hours = (week: OpeningHours["week"]): OpeningHours => ({ week, seasons: [], closed: [] });
const daily = (...spans: [string, string][]) => hours({ sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans });

describe("openStatusAt", () => {
  const lunchTilNight = daily(["12:00", "23:00"]);

  it("reads the same cached hours differently as the day goes on", () => {
    const morning = Date.UTC(2026, 10, 6, 9, 30);
    const evening = Date.UTC(2026, 10, 6, 20, 0);
    expect(openStatusAt(lunchTilNight, 60, morning)).toEqual({ openNow: false, closesAt: null });
    expect(openStatusAt(lunchTilNight, 60, evening)).toEqual({ openNow: true, closesAt: "23:00" });
    expect(openStatusAt(lunchTilNight, 60, Date.UTC(2026, 10, 6, 22, 30))).toEqual({ openNow: false, closesAt: null });
  });

  it("uses the place-local date for a positive offset past UTC midnight", () => {
    const fri = hours({ fri: [], sat: [["00:30", "02:00"]] });
    expect(openStatusAt(fri, 540, Date.UTC(2026, 10, 6, 16, 0))).toEqual({ openNow: true, closesAt: "02:00" });
  });

  it("uses the place-local date for a negative offset before UTC midnight", () => {
    const thu = hours({ thu: [["10:00", "18:00"]], fri: [] });
    expect(openStatusAt(thu, -300, Date.UTC(2026, 10, 6, 3, 0))).toEqual({ openNow: false, closesAt: null });
    expect(openStatusAt(thu, -300, Date.UTC(2026, 10, 6, 17, 0))).toEqual({ openNow: false, closesAt: null });
    expect(openStatusAt(hours({ thu: [["20:00", "23:00"]] }), -300, Date.UTC(2026, 10, 6, 2, 0))).toEqual({ openNow: true, closesAt: "23:00" });
  });

  it("runs a close across midnight into the next day's hours", () => {
    const late = hours({ fri: [["18:00", "24:00"]], sat: [["00:00", "02:00"], ["18:00", "24:00"]] });
    expect(openStatusAt(late, 0, Date.UTC(2026, 10, 6, 21, 0))).toEqual({ openNow: true, closesAt: "02:00" });
    expect(openStatusAt(late, 0, Date.UTC(2026, 10, 7, 1, 0))).toEqual({ openNow: true, closesAt: "02:00" });
  });

  it("closes at midnight when the next day does not open at 00:00", () => {
    const early = hours({ fri: [["18:00", "24:00"]], sat: [["10:00", "12:00"]] });
    expect(openStatusAt(early, 0, Date.UTC(2026, 10, 6, 21, 0))).toEqual({ openNow: true, closesAt: "00:00" });
  });

  it("is open with no close time when the place is open all week", () => {
    expect(openStatusAt(daily(["00:00", "24:00"]), 0, Date.UTC(2026, 10, 6, 12, 0))).toEqual({ openNow: true, closesAt: null });
  });

  it("knows nothing without hours, an offset, or the weekday's entry", () => {
    const now = Date.UTC(2026, 10, 6, 12, 0);
    expect(openStatusAt(null, 0, now)).toEqual({ openNow: null, closesAt: null });
    expect(openStatusAt(lunchTilNight, null, now)).toEqual({ openNow: null, closesAt: null });
    expect(openStatusAt(hours({ mon: [["09:00", "10:00"]] }), 0, now)).toEqual({ openNow: null, closesAt: null });
  });

  it("is closed on a closed day", () => {
    expect(openStatusAt(hours({ fri: [] }), 0, Date.UTC(2026, 10, 6, 12, 0))).toEqual({ openNow: false, closesAt: null });
  });
});
