import { describe, expect, it } from "vitest";
import { journalWritableDates, canWriteJournal, JOURNAL_NOTE_MAX } from "./journal-window";

describe("journalWritableDates", () => {
  it("opens on day 1 and never runs ahead of today", () => {
    expect(
      journalWritableDates({
        startDate: "2026-12-04",
        endDate: "2027-01-08",
        today: "2026-12-01",
      }),
    ).toEqual([]);
    expect(
      journalWritableDates({
        startDate: "2026-12-04",
        endDate: "2027-01-08",
        today: "2026-12-06",
      }),
    ).toEqual(["2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("date-less trips have no Journal days", () => {
    expect(
      journalWritableDates({ startDate: null, endDate: null, today: "2026-12-06" }),
    ).toEqual([]);
  });

  it("stops at the Trip's end even when today is later", () => {
    expect(
      journalWritableDates({
        startDate: "2026-12-04",
        endDate: "2026-12-06",
        today: "2027-02-01",
      }),
    ).toEqual(["2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("includes exactly day 1 on the Trip's first day", () => {
    expect(
      journalWritableDates({
        startDate: "2026-12-04",
        endDate: "2026-12-10",
        today: "2026-12-04",
      }),
    ).toEqual(["2026-12-04"]);
  });

  it("falls back to startDate as the end when endDate is null (soft end, per lib/trip-phase.ts convention)", () => {
    expect(
      journalWritableDates({
        startDate: "2026-12-04",
        endDate: null,
        today: "2026-12-10",
      }),
    ).toEqual(["2026-12-04"]);
  });
});

describe("canWriteJournal", () => {
  it("stays open after the Trip ends", () => {
    expect(
      canWriteJournal({
        startDate: "2026-12-04",
        endDate: "2026-12-06",
        today: "2027-02-01",
        date: "2026-12-05",
      }),
    ).toBe(true);
    expect(
      canWriteJournal({
        startDate: "2026-12-04",
        endDate: "2026-12-06",
        today: "2027-02-01",
        date: "2026-12-07",
      }),
    ).toBe(false);
  });

  it("refuses a day before the Trip starts", () => {
    expect(
      canWriteJournal({
        startDate: "2026-12-04",
        endDate: "2026-12-10",
        today: "2026-12-04",
        date: "2026-12-03",
      }),
    ).toBe(false);
  });

  it("refuses a day still ahead of today", () => {
    expect(
      canWriteJournal({
        startDate: "2026-12-04",
        endDate: "2026-12-10",
        today: "2026-12-05",
        date: "2026-12-06",
      }),
    ).toBe(false);
  });

  it("accepts today itself", () => {
    expect(
      canWriteJournal({
        startDate: "2026-12-04",
        endDate: "2026-12-10",
        today: "2026-12-05",
        date: "2026-12-05",
      }),
    ).toBe(true);
  });

  it("date-less trips are never writable", () => {
    expect(
      canWriteJournal({
        startDate: null,
        endDate: null,
        today: "2026-12-06",
        date: "2026-12-06",
      }),
    ).toBe(false);
  });
});

describe("JOURNAL_NOTE_MAX", () => {
  it("is 500", () => {
    expect(JOURNAL_NOTE_MAX).toBe(500);
  });
});
