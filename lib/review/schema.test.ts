import { describe, expect, it } from "vitest";
import type { SuggestedFix } from "./types";
import { MAX_NOTE_APPEND, parseSuggestedFix, serializeSuggestedFix, suggestedFixSchema } from "./schema";

const span = [["10:00", "18:00"]] as [string, string][];
const HOURS = { week: { sun: [], mon: span, tue: span, wed: span, thu: span, fri: span, sat: span }, seasons: [], closed: [] };

const VALID: SuggestedFix[] = [
  { kind: "item.times", itemId: "i1", startTime: "10:30" },
  { kind: "item.times", itemId: "i1", endTime: null, date: "2027-06-04" },
  { kind: "item.bookingState", id: "i1", bookingState: "TO_BOOK", bookBy: "2027-05-20" },
  { kind: "transport.bookingState", id: "t1", bookingState: "BOOKED" },
  { kind: "accommodation.bookingState", id: "a1", bookingState: "TO_BOOK", bookBy: null },
  { kind: "item.openingHours", itemId: "i1", hours: HOURS },
  { kind: "item.note", itemId: "i1", append: "Closed on the first Monday of the month." },
];

describe("suggestedFixSchema (R8: each kind maps to an existing action)", () => {
  it.each(VALID)("accepts and round-trips %o", (fix) => {
    expect(parseSuggestedFix(serializeSuggestedFix(fix))).toEqual(fix);
  });

  it.each([
    ["an unknown kind", { kind: "stop.delete", id: "s1" }],
    ["an extra key", { kind: "item.note", itemId: "i1", append: "x", by: "me" }],
    ["a times fix that changes nothing", { kind: "item.times", itemId: "i1" }],
    ["a time that isn't one", { kind: "item.times", itemId: "i1", startTime: "25:00" }],
    ["a date that isn't one", { kind: "item.times", itemId: "i1", date: "2027-02-30" }],
    ["a book-by date on Booked", { kind: "transport.bookingState", id: "t1", bookingState: "BOOKED", bookBy: "2027-05-20" }],
    ["an unknown booking state", { kind: "item.bookingState", id: "i1", bookingState: "MAYBE" }],
    ["an empty note", { kind: "item.note", itemId: "i1", append: "   " }],
    ["a note too long", { kind: "item.note", itemId: "i1", append: "x".repeat(MAX_NOTE_APPEND + 1) }],
    ["hours that don't parse", { kind: "item.openingHours", itemId: "i1", hours: { week: { funday: [] } } }],
    ["no target id", { kind: "item.note", itemId: "", append: "x" }],
  ])("refuses %s", (_label, value) => {
    expect(suggestedFixSchema.safeParse(value).success).toBe(false);
    expect(parseSuggestedFix(JSON.stringify(value))).toBeNull();
  });

  it("an absent, empty or unreadable stored value is no fix", () => {
    expect(parseSuggestedFix(null)).toBeNull();
    expect(parseSuggestedFix("")).toBeNull();
    expect(parseSuggestedFix("{")).toBeNull();
  });

  it("serialising no fix, or an invalid one, stores null", () => {
    expect(serializeSuggestedFix(undefined)).toBeNull();
    expect(serializeSuggestedFix({ kind: "item.note", itemId: "i1", append: "" })).toBeNull();
  });

  it("trims a note before storing it", () => {
    expect(parseSuggestedFix(serializeSuggestedFix({ kind: "item.note", itemId: "i1", append: "  Cash only.  " }))).toEqual({ kind: "item.note", itemId: "i1", append: "Cash only." });
  });
});
