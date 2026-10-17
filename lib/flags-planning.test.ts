import { describe, expect, it } from "vitest";
import { detectFlags, flagClosedOnDay, type FlagItem, type FlagStop } from "./flags";
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
