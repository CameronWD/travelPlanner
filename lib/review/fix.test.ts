import { describe, expect, it } from "vitest";
import type { SuggestedFix } from "./types";
import { appendedNote, fixTarget, parseUndoPayload, sameSnapshot, snapshotFor, REVIEW_ACTION_COPY } from "./fix";

const ROW = {
  date: "2027-06-02", startTime: "10:00", endTime: null, notes: "Cash only.", openingHours: null,
  bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null,
};

describe("fixTarget", () => {
  it.each<[SuggestedFix, string, string]>([
    [{ kind: "item.times", itemId: "i1", startTime: "11:00" }, "item", "i1"],
    [{ kind: "item.note", itemId: "i2", append: "x" }, "item", "i2"],
    [{ kind: "item.bookingState", id: "i3", bookingState: "BOOKED" }, "item", "i3"],
    [{ kind: "transport.bookingState", id: "t1", bookingState: "BOOKED" }, "transport", "t1"],
    [{ kind: "accommodation.bookingState", id: "a1", bookingState: "BOOKED" }, "accommodation", "a1"],
  ])("%o targets %s %s", (fix, kind, id) => {
    expect(fixTarget(fix)).toEqual({ kind, id });
  });
});

describe("snapshotFor (what a fix touches, so Undo can put it back)", () => {
  it("times: the day, start and end", () => {
    expect(snapshotFor({ kind: "item.times", itemId: "i1", startTime: "11:00" }, ROW)).toEqual({ kind: "times", date: "2027-06-02", startTime: "10:00", endTime: null });
  });
  it("booking: the state, whether it was chosen, and the book-by date", () => {
    expect(snapshotFor({ kind: "transport.bookingState", id: "t1", bookingState: "BOOKED" }, ROW)).toEqual({ kind: "booking", bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null });
  });
  it("notes and opening hours", () => {
    expect(snapshotFor({ kind: "item.note", itemId: "i1", append: "x" }, ROW)).toEqual({ kind: "note", notes: "Cash only." });
    expect(snapshotFor({ kind: "item.openingHours", itemId: "i1", hours: { week: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }, seasons: [], closed: [] } }, ROW)).toEqual({ kind: "openingHours", openingHours: null });
  });
  it("sameSnapshot compares field by field", () => {
    expect(sameSnapshot({ kind: "note", notes: "a" }, { kind: "note", notes: "a" })).toBe(true);
    expect(sameSnapshot({ kind: "note", notes: "a" }, { kind: "note", notes: "b" })).toBe(false);
    expect(sameSnapshot({ kind: "note", notes: null }, { kind: "openingHours", openingHours: null })).toBe(false);
  });
});

describe("appendedNote", () => {
  it("adds the text as its own paragraph, or is the whole note when there was none", () => {
    expect(appendedNote("Cash only.  ", "Closed Mondays.")).toBe("Cash only.\n\nClosed Mondays.");
    expect(appendedNote(null, "Closed Mondays.")).toBe("Closed Mondays.");
    expect(appendedNote("   ", "Closed Mondays.")).toBe("Closed Mondays.");
  });
});

describe("parseUndoPayload", () => {
  const payload = {
    fix: { kind: "item.note", itemId: "i1", append: "Closed Mondays." },
    before: { kind: "note", notes: "Cash only." },
    after: { kind: "note", notes: "Cash only.\n\nClosed Mondays." },
  };
  it("round-trips a stored payload", () => {
    expect(parseUndoPayload(JSON.stringify(payload))).toEqual(payload);
  });
  it("anything else is no payload", () => {
    expect(parseUndoPayload(null)).toBeNull();
    expect(parseUndoPayload("{")).toBeNull();
    expect(parseUndoPayload(JSON.stringify({ ...payload, before: { kind: "note" } }))).toBeNull();
  });
});

it("action copy never uses an em-dash", () => {
  for (const text of Object.values(REVIEW_ACTION_COPY)) expect(text).not.toMatch(/\u2014/);
});
