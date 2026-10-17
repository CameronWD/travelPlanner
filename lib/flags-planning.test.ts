import { describe, expect, it } from "vitest";
import { detectFlags, flagClosedOnDay, flagLateForSlot, flagOutsideOpeningHours, type FlagItem, type FlagStop } from "./flags";
import type { OpeningHours } from "@/lib/opening-hours";

// ---------------------------------------------------------------------------
// Fixtures (spec 2026-10-17 R7). 2026-12-08 is a Tuesday; 2026-12-24 a Thursday.
// ---------------------------------------------------------------------------

type Spans = [string, string][];
const everyDay = (spans: Spans) => ({ sun: spans, mon: spans, tue: spans, wed: spans, thu: spans, fri: spans, sat: spans });
const hours = (o: Partial<OpeningHours>): OpeningHours => ({ week: {}, seasons: [], closed: [], ...o });
const item = (o: Partial<FlagItem> & { id: string }): FlagItem => ({
  stopId: "nbg", date: "2026-12-08", startTime: null, endTime: null, lat: null, lng: null, title: o.id, ...o,
});
const stop = (o: Partial<FlagStop> & Pick<FlagStop, "id" | "arriveDate" | "departDate">): FlagStop => ({
  name: o.id, timezone: "Europe/Berlin", sortOrder: 0, lat: null, lng: null, ...o,
});

describe("flagClosedOnDay (Closed that day, warning)", () => {
  it("an Item on a weekday its usual week marks closed", () => {
    const flags = flagClosedOnDay([
      item({ id: "i1", title: "Memorium Nuremberg Trials", openingHours: hours({ week: { ...everyDay([["09:00", "18:00"]]), tue: [] } }) }),
    ]);
    expect(flags).toEqual([
      {
        id: "item-closed-i1", severity: "warning", message: "Memorium Nuremberg Trials is closed on Tuesdays.",
        targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "nbg",
      },
    ]);
  });

  it("a closed date names the day", () => {
    const [f] = flagClosedOnDay([item({ id: "i1", title: "Albrecht Dürer's House", date: "2026-12-24", openingHours: hours({ week: everyDay([["10:00", "17:00"]]), closed: ["12-24"] }) })]);
    expect(f.message).toBe("Albrecht Dürer's House is closed on Thu 24 Dec.");
  });

  it("a season's closed weekday says which season", () => {
    const winter = { label: "Winter", from: "11-01", to: "03-31", week: { ...everyDay([["10:00", "16:00"]]), tue: [] } };
    const [f] = flagClosedOnDay([item({ id: "i1", title: "Kaiserburg", openingHours: hours({ week: everyDay([["09:00", "18:00"]]), seasons: [winter] }) })]);
    expect(f.message).toBe("Kaiserburg is closed on Tuesdays (Winter).");
    const [g] = flagClosedOnDay([item({ id: "i2", title: "Kaiserburg", openingHours: hours({ week: everyDay([["09:00", "18:00"]]), seasons: [{ ...winter, label: undefined }] }) })]);
    expect(g.message).toBe("Kaiserburg is closed on Tuesdays at that time of year.");
  });

  it("silent when the data is missing: no hours, the weekday not known, no date, or open that day", () => {
    expect(flagClosedOnDay([
      item({ id: "a" }),
      item({ id: "b", openingHours: hours({ week: { mon: [] } }) }), // Tuesday not entered: not known
      item({ id: "c", date: null, openingHours: hours({ week: everyDay([]) }) }),
      item({ id: "d", openingHours: hours({ week: everyDay([["09:00", "18:00"]]) }) }),
    ])).toEqual([]);
  });

  it("an untitled Item still reads as a sentence", () => {
    const [f] = flagClosedOnDay([item({ id: "i1", title: null, openingHours: hours({ week: everyDay([]) }) })]);
    expect(f.message).toBe("This thing to do is closed on Tuesdays.");
  });
});

describe("detectFlags: the planning Flags are Surprise-aware and plan-only (R7)", () => {
  const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-08", sortOrder: 0 });
  const secret = stop({ id: "secret", name: "Secret", arriveDate: "2026-12-08", departDate: "2026-12-10", sortOrder: 1 });
  const closedTue = hours({ week: everyDay([]) });
  const base = { stops: [nbg, secret], transports: [], accommodations: [], tripStart: "2026-12-06", tripEnd: "2026-12-10" };
  const closedIds = (flags: { id: string }[]) => flags.map((f) => f.id).filter((id) => id.startsWith("item-closed-"));

  it("no Flag for an Item the viewer cannot see, nor for one inside a hidden Stop", () => {
    const items = [
      item({ id: "hidden-root", openingHours: closedTue }),
      item({ id: "in-secret", stopId: "secret", openingHours: closedTue }),
      item({ id: "visible", openingHours: closedTue }),
    ];
    expect(closedIds(detectFlags({ ...base, items, hiddenStopIds: ["secret"], hiddenItemIds: ["hidden-root"] }))).toEqual(["item-closed-visible"]);
    // Without the inputs, all three flag.
    expect(closedIds(detectFlags({ ...base, items }))).toHaveLength(3);
  });

  it("an Item of a visible Stop on the Changeover day it shares with a hidden Stop still flags", () => {
    const items = [item({ id: "visible", stopId: "nbg", date: "2026-12-08", openingHours: closedTue })];
    expect(closedIds(detectFlags({ ...base, items, hiddenStopIds: ["secret"] }))).toEqual(["item-closed-visible"]);
  });
});

describe("flagOutsideOpeningHours (Before opening / After closing, warnings)", () => {
  const day = hours({ week: everyDay([["10:00", "18:00"]]) });
  const lunch = hours({ week: everyDay([["10:00", "12:00"], ["14:00", "18:00"]]) });
  const late = hours({ week: everyDay([["20:00", "24:00"]]) });
  const run = (o: Partial<FlagItem>) =>
    flagOutsideOpeningHours([item({ id: "i1", title: "Documentation Centre", openingHours: day, ...o })]).map((f) => [f.id, f.message]);

  it("a start before the first span opens says when it opens", () => {
    expect(run({ startTime: "09:45" })).toEqual([["item-before-open-i1", "Documentation Centre opens at 10:00; this starts 09:45."]]);
  });

  it("a start in a gap between spans says when it next opens", () => {
    expect(run({ openingHours: lunch, startTime: "13:15" })).toEqual([["item-before-open-i1", "Documentation Centre reopens at 14:00; this starts 13:15."]]);
  });

  it("an end after the governing span's close", () => {
    expect(run({ startTime: "16:00", endTime: "18:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this ends 18:30."]]);
    expect(run({ openingHours: lunch, startTime: "11:00", endTime: "15:00" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 12:00; this ends 15:00."]]);
  });

  it("with no end, a start within 30 minutes of closing (inclusive)", () => {
    expect(run({ startTime: "17:40" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 20 minutes after this starts."]]);
    expect(run({ startTime: "17:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 30 minutes after this starts."]]);
    expect(run({ startTime: "17:59" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00, 1 minute after this starts."]]);
    expect(run({ startTime: "17:29" })).toEqual([]);
  });

  it("a start at or after the last close is after closing, whatever the end", () => {
    expect(run({ startTime: "18:30" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this starts 18:30."]]);
    expect(run({ startTime: "18:00", endTime: "19:00" })).toEqual([["item-after-close-i1", "Documentation Centre closes at 18:00; this starts 18:00."]]);
  });

  it("starting before opening and ending after closing raises both", () => {
    expect(run({ startTime: "09:00", endTime: "19:00" }).map(([id]) => id)).toEqual(["item-before-open-i1", "item-after-close-i1"]);
  });

  it("a 24:00 close reads as midnight", () => {
    expect(run({ openingHours: late, startTime: "23:45" })).toEqual([["item-after-close-i1", "Documentation Centre closes at midnight, 15 minutes after this starts."]]);
  });

  it("inside the hours, no Flag; ending exactly at close, no Flag", () => {
    expect(run({ startTime: "10:00" })).toEqual([]);
    expect(run({ startTime: "16:00", endTime: "18:00" })).toEqual([]);
  });

  it("silent when the data is missing, closed (Closed that day's job) or overnight", () => {
    expect(run({ startTime: null })).toEqual([]);
    expect(run({ date: null, startTime: "09:00" })).toEqual([]);
    expect(run({ openingHours: null, startTime: "09:00" })).toEqual([]);
    expect(run({ openingHours: hours({ week: { mon: [["10:00", "18:00"]] } }), startTime: "09:00" })).toEqual([]); // Tuesday not known
    expect(run({ openingHours: hours({ week: everyDay([]) }), startTime: "09:00" })).toEqual([]);
    expect(run({ openingHours: late, startTime: "23:00", endTime: "01:00" })).toEqual([]); // ends the next day
  });
});

describe("flagLateForSlot (Late for the slot, warning)", () => {
  const run = (o: Partial<FlagItem>) =>
    flagLateForSlot([item({ id: "i1", title: "Neues Museum tour", slotTime: "12:00", arriveByMinutes: 15, ...o })]).map((f) => [f.id, f.message, f.targetType]);

  it("a start after slot − arrive-by", () => {
    expect(run({ startTime: "11:50" })).toEqual([["item-late-slot-i1", "Neues Museum tour starts 11:50, but the 12:00 slot needs you there by 11:45.", "ITEM"]]);
  });

  it("with no arrive-by, a start after the slot itself", () => {
    expect(run({ arriveByMinutes: null, startTime: "12:10" })).toEqual([["item-late-slot-i1", "Neues Museum tour starts 12:10, after its 12:00 slot.", "ITEM"]]);
    expect(run({ arriveByMinutes: 0, startTime: "12:00" })).toEqual([]);
  });

  it("on time or early, no Flag", () => {
    expect(run({ startTime: "11:45" })).toEqual([]);
    expect(run({ startTime: "11:00" })).toEqual([]);
  });

  it("silent with no slot or no start", () => {
    expect(run({ slotTime: null, startTime: "11:50" })).toEqual([]);
    expect(run({ startTime: null })).toEqual([]);
  });

  it("detectFlags leaves out an Item hidden by a Surprise", () => {
    const nbg = stop({ id: "nbg", arriveDate: "2026-12-06", departDate: "2026-12-09" });
    const items = [item({ id: "gift", slotTime: "12:00", arriveByMinutes: 15, startTime: "11:50" })];
    const ids = (hiddenItemIds?: string[]) =>
      detectFlags({ stops: [nbg], transports: [], accommodations: [], items, tripStart: "2026-12-06", tripEnd: "2026-12-09", hiddenItemIds })
        .map((f) => f.id).filter((id) => id.startsWith("item-late-slot-"));
    expect(ids()).toEqual(["item-late-slot-gift"]);
    expect(ids(["gift"])).toEqual([]);
  });
});
