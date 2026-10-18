import { describe, expect, it } from "vitest";
import {
  BOOK_BY_SOON_DAYS,
  CLOSING_SOON_MIN,
  detectFlags,
  flagBookByDates,
  flagClosedOnDay,
  flagLateForSlot,
  flagOutsideOpeningHours,
  flagStillToBookSoon,
  STILL_TO_BOOK_WITHIN_DAYS,
  type FlagAccommodation,
  type FlagItem,
  type FlagStop,
  type FlagTransport,
} from "./flags";
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
    expect(CLOSING_SOON_MIN).toBe(30); // pins the "within 30 minutes" window the literals below exercise
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

describe("flagBookByDates (Book by soon, info / Overdue, warning)", () => {
  const today = "2026-12-01";
  const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-09", sortOrder: 0 });
  const munich = stop({ id: "munich", name: "Munich", arriveDate: "2026-12-09", departDate: "2026-12-12", sortOrder: 1 });
  const toBook = { bookingState: "TO_BOOK" };
  const leg = (o: Partial<FlagTransport> & { id: string }): FlagTransport => ({ mode: "TRAIN", fromStopId: "nbg", toStopId: "munich", depAt: null, arrAt: null, ...o });
  const stay = (o: Partial<FlagAccommodation> & { id: string }): FlagAccommodation => ({ stopId: "nbg", name: "Hotel Victoria", checkIn: "2026-12-06", checkOut: "2026-12-09", ...o });
  const run = (o: { items?: FlagItem[]; transports?: FlagTransport[]; accommodations?: FlagAccommodation[]; home?: { name: string; lat: number; lng: number; countryCode: string | null } }) =>
    flagBookByDates({ items: [], transports: [], accommodations: [], today, stops: [nbg, munich], ...o });

  it("an Item To book within the next 7 days", () => {
    expect(BOOK_BY_SOON_DAYS).toBe(7); // pins the "soon" window the day-count literals below exercise
    const at = (bookBy: string) => run({ items: [item({ id: "i1", title: "Neues Museum tour", date: "2026-12-08", ...toBook, bookBy })] });
    expect(at("2026-12-04")).toEqual([
      { id: "book-by-soon-i1", severity: "info", message: "Book Neues Museum tour by Fri 4 Dec, in 3 days.", targetType: "ITEM", targetId: "i1", date: "2026-12-08", stopId: "nbg" },
    ]);
    expect(at("2026-12-01")[0].message).toBe("Book Neues Museum tour today: it's the book-by date.");
    expect(at("2026-12-02")[0].message).toBe("Book Neues Museum tour by tomorrow (Wed 2 Dec).");
    expect(at("2026-12-08")).toHaveLength(1); // 7 days: still soon
    expect(at("2026-12-09")).toEqual([]); // 8 days: not yet
  });

  it("a book-by date already past is overdue", () => {
    expect(run({ accommodations: [stay({ id: "a1", ...toBook, bookBy: "2026-11-30" })] })).toEqual([
      { id: "book-by-overdue-a1", severity: "warning", message: "Book Hotel Victoria now: its book-by date (Mon 30 Nov) has passed.", targetType: "ACCOMMODATION", targetId: "a1", stopId: "nbg" },
    ]);
  });

  it("a leg names its mode and ends; a Home end is the Home base", () => {
    const [f] = run({ transports: [leg({ id: "t1", ...toBook, bookBy: "2026-12-03" })] });
    expect(f).toEqual({ id: "book-by-soon-t1", severity: "info", message: "Book the train from Nuremberg to Munich by Thu 3 Dec, in 2 days.", targetType: "TRANSPORT", targetId: "t1", stopId: "nbg" });
    const [g] = run({
      transports: [leg({ id: "t2", mode: "FLIGHT", fromStopId: null, depIsHome: true, toStopId: "nbg", ...toBook, bookBy: "2026-11-28" })],
      home: { name: "Sydney", lat: -33.9, lng: 151.2, countryCode: "AU" },
    });
    expect(g.message).toBe("Book the flight from Sydney to Nuremberg now: its book-by date (Sat 28 Nov) has passed.");
    expect(g.stopId).toBe("nbg");
  });

  it("only while To book: a stale book-by on a Booked row says nothing", () => {
    expect(run({ items: [item({ id: "i1", bookingState: "BOOKED", bookBy: "2026-11-28" })] })).toEqual([]);
    expect(run({ items: [item({ id: "i2", bookingState: "TO_BOOK", bookBy: null })] })).toEqual([]);
  });

  it("nothing to book once the thing itself has happened", () => {
    expect(run({ items: [item({ id: "i1", date: "2026-11-30", ...toBook, bookBy: "2026-11-25" })] })).toEqual([]);
    expect(run({ transports: [leg({ id: "t1", depAt: "2026-11-30T08:00:00Z", ...toBook, bookBy: "2026-11-25" })] })).toEqual([]);
  });

  it("detectFlags: needs today; skips Wishlist ideas, hidden Items and stays in hidden Stops; names rough Stops", () => {
    const base = { stops: [nbg, munich], tripStart: "2026-12-06", tripEnd: "2026-12-12" };
    const items = [
      item({ id: "idea", stopId: null, date: null, ...toBook, bookBy: "2026-11-28" }),
      item({ id: "gift", ...toBook, bookBy: "2026-11-28" }),
      item({ id: "pass", stopId: "nbg", date: null, title: "Tram pass", ...toBook, bookBy: "2026-12-03" }),
    ];
    const accommodations = [stay({ id: "a-secret", stopId: "munich", ...toBook, bookBy: "2026-11-28" })];
    const transports = [leg({ id: "t-rough", toStopId: "rough", ...toBook, bookBy: "2026-12-03" })];
    const bookIds = (flags: { id: string }[]) => flags.map((f) => f.id).filter((id) => id.startsWith("book-by-"));
    expect(bookIds(detectFlags({ ...base, items, accommodations, transports }))).toEqual([]); // no today
    const flags = detectFlags({
      ...base, items, accommodations, transports, today,
      hiddenItemIds: ["gift"], hiddenStopIds: ["munich"], stopNames: new Map([["nbg", "Nuremberg"], ["munich", "Munich"], ["rough", "Somewhere"]]),
    });
    expect(bookIds(flags)).toEqual(["book-by-soon-pass", "book-by-soon-t-rough"]);
    expect(flags.find((f) => f.id === "book-by-soon-t-rough")?.message).toBe("Book the train from Nuremberg to Somewhere by Thu 3 Dec, in 2 days.");
  });
});

describe("flagStillToBookSoon (Still to book close to the day, info)", () => {
  const today = "2026-12-01";
  const nbg = stop({ id: "nbg", name: "Nuremberg", arriveDate: "2026-12-06", departDate: "2026-12-09", sortOrder: 0 });
  const munich = stop({ id: "munich", name: "Munich", arriveDate: "2026-12-09", departDate: "2026-12-12", sortOrder: 1 });
  const leg = (o: Partial<FlagTransport> & { id: string }): FlagTransport => ({ mode: "TRAIN", fromStopId: "nbg", toStopId: "munich", arrAt: null, bookingState: "TO_BOOK", bookBy: null, depAt: null, ...o });
  const stay = (o: Partial<FlagAccommodation> & { id: string }): FlagAccommodation => ({ stopId: "nbg", name: "Hotel Victoria", checkIn: "2026-12-06", checkOut: "2026-12-09", bookingState: "TO_BOOK", bookBy: null, ...o });
  const run = (o: { transports?: FlagTransport[]; accommodations?: FlagAccommodation[] }) =>
    flagStillToBookSoon({ transports: [], accommodations: [], today, stops: [nbg, munich], ...o });

  it("a To book leg within 14 days, with no book-by date", () => {
    expect(STILL_TO_BOOK_WITHIN_DAYS).toBe(14); // pins the window the day-count literals below exercise
    expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-09T08:00:00Z" })] })).toEqual([
      { id: "still-to-book-t1", severity: "info", message: "The train from Nuremberg to Munich is still to book and leaves in 8 days (Wed 9 Dec).", targetType: "TRANSPORT", targetId: "t1", stopId: "nbg" },
    ]);
    expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-15T08:00:00Z" })] })[0].message).toContain("in 14 days (Tue 15 Dec)");
    expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-16T08:00:00Z" })] })).toEqual([]);
  });

  it("reads the leg's day in its own zone", () => {
    // 23:30Z on 1 Dec is 00:30 on 2 Dec in Nuremberg.
    expect(run({ transports: [leg({ id: "t1", depAt: "2026-12-01T23:30:00Z" })] })[0].message)
      .toBe("The train from Nuremberg to Munich is still to book and leaves tomorrow.");
  });

  it("a To book stay checking in within 14 days", () => {
    expect(run({ accommodations: [stay({ id: "a1", checkIn: "2026-12-01" })] })).toEqual([
      { id: "still-to-book-a1", severity: "info", message: "Hotel Victoria is still to book and you check in today.", targetType: "ACCOMMODATION", targetId: "a1", stopId: "nbg" },
    ]);
  });

  it("silent with a book-by date (Book by's job), when Booked, with no date, or once past", () => {
    expect(run({
      transports: [
        leg({ id: "a", depAt: "2026-12-05T08:00:00Z", bookBy: "2026-12-03" }),
        leg({ id: "b", depAt: "2026-12-05T08:00:00Z", bookingState: "BOOKED" }),
        leg({ id: "c", depAt: null }),
        leg({ id: "d", depAt: "2026-11-30T08:00:00Z" }),
      ],
      accommodations: [stay({ id: "e", checkIn: "2026-11-29" })],
    })).toEqual([]);
  });

  it("detectFlags: never an Item; never a stay inside a hidden Stop", () => {
    const flags = detectFlags({
      stops: [nbg, munich], tripStart: "2026-12-06", tripEnd: "2026-12-12", today, hiddenStopIds: ["munich"], transports: [],
      items: [item({ id: "i1", date: "2026-12-07", bookingState: "TO_BOOK" })],
      accommodations: [stay({ id: "a-nbg" }), stay({ id: "a-secret", stopId: "munich", checkIn: "2026-12-09", checkOut: "2026-12-12" })],
    });
    expect(flags.map((f) => f.id).filter((id) => id.startsWith("still-to-book-"))).toEqual(["still-to-book-a-nbg"]);
  });
});
