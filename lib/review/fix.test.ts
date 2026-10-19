import { describe, expect, it } from "vitest";
import type { RowFix, SuggestedFix } from "./types";
import { appendedNote, fixFitsTarget, fixTarget, parseUndoPayload, sameSnapshot, snapshotFor, REVIEW_ACTION_COPY } from "./fix";

const ROW = {
  date: "2027-06-02", startTime: "10:00", endTime: null, notes: "Cash only.", openingHours: null,
  bookingState: "TO_BOOK", bookingStateSet: false, bookBy: null,
};

describe("fixTarget", () => {
  it.each<[RowFix, string, string]>([
    [{ kind: "item.times", itemId: "i1", startTime: "11:00" }, "item", "i1"],
    [{ kind: "item.note", itemId: "i2", append: "x" }, "item", "i2"],
    [{ kind: "item.bookingState", id: "i3", bookingState: "BOOKED" }, "item", "i3"],
    [{ kind: "transport.bookingState", id: "t1", bookingState: "BOOKED" }, "transport", "t1"],
    [{ kind: "accommodation.bookingState", id: "a1", bookingState: "BOOKED" }, "accommodation", "a1"],
  ])("%o targets %s %s", (fix, kind, id) => {
    expect(fixTarget(fix)).toEqual({ kind, id });
  });
});

describe("fixFitsTarget (final wave I1: a fix only touches its Finding's own row)", () => {
  it("fits only the same type and id, never a TRIP or DAY Finding", () => {
    const note: SuggestedFix = { kind: "item.note", itemId: "i1", append: "x" };
    const train: SuggestedFix = { kind: "transport.bookingState", id: "tr1", bookingState: "BOOKED" };
    const stay: SuggestedFix = { kind: "accommodation.bookingState", id: "a1", bookingState: "BOOKED" };
    expect(fixFitsTarget(note, { targetType: "ITEM", targetId: "i1" })).toBe(true);
    expect(fixFitsTarget(train, { targetType: "TRANSPORT", targetId: "tr1" })).toBe(true);
    expect(fixFitsTarget(stay, { targetType: "ACCOMMODATION", targetId: "a1" })).toBe(true);
    expect(fixFitsTarget(train, { targetType: "ITEM", targetId: "i1" })).toBe(false);
    expect(fixFitsTarget(note, { targetType: "ITEM", targetId: "i2" })).toBe(false);
    expect(fixFitsTarget(note, { targetType: "TRIP", targetId: null })).toBe(false);
    expect(fixFitsTarget(note, { targetType: "DAY", targetId: null })).toBe(false);
  });

  it("a checklist fix fits any Finding, the Trip included, since it adds to a list rather than touching a row", () => {
    const checklist: SuggestedFix = { kind: "checklist.add", list: "PRETRIP", text: "Buy pass" };
    expect(fixFitsTarget(checklist, { targetType: "TRIP", targetId: null })).toBe(true);
    expect(fixFitsTarget(checklist, { targetType: "STOP", targetId: "s1" })).toBe(true);
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
  it("round-trips a checklist fix's payload, and keeps the two shapes apart (spec 2026-10-18 A2)", () => {
    const checklist = {
      fix: { kind: "checklist.add", list: "PACKING", text: "Umbrella" },
      done: "added",
      itemId: "c9",
      after: { text: "Umbrella", done: false, buy: "NEEDED" },
    };
    expect(parseUndoPayload(JSON.stringify(checklist))).toEqual(checklist);
    expect(parseUndoPayload(JSON.stringify({ ...checklist, done: "none", itemId: "c1", after: null }))).toEqual({ ...checklist, done: "none", itemId: "c1", after: null });
    expect(parseUndoPayload(JSON.stringify({ ...checklist, done: "eaten" }))).toBeNull();
    expect(parseUndoPayload(JSON.stringify({ ...checklist, fix: payload.fix }))).toBeNull();
    expect(parseUndoPayload(JSON.stringify({ ...payload, fix: checklist.fix }))).toBeNull();
  });
});

it("action copy never uses an em-dash", () => {
  for (const text of Object.values(REVIEW_ACTION_COPY)) expect(text).not.toMatch(/\u2014/);
});
