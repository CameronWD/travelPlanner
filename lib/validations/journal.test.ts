import { describe, expect, it } from "vitest";
import { saveJournalEntrySchema, journalBodyExceedsLimit } from "./journal";
import { JOURNAL_NOTE_MAX } from "@/lib/journal-window";

describe("saveJournalEntrySchema", () => {
  it("accepts a valid date and non-empty body", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "Had an amazing day exploring the city!",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("Had an amazing day exploring the city!");
      expect(result.data.date).toBe("2026-07-15");
    }
  });

  it("accepts an empty body (signals delete)", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("");
    }
  });

  it("trims whitespace-only body to empty string", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("");
    }
  });

  it("does not itself reject a body over JOURNAL_NOTE_MAX — that's journalBodyExceedsLimit's job, which needs the existing row", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "x".repeat(5001),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a date without YYYY-MM-DD format", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "15-07-2026",
      body: "Some entry",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.flatten().fieldErrors.date ?? [];
      expect(messages.length).toBeGreaterThan(0);
    }
  });

  it("rejects a completely invalid date string", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "not-a-date",
      body: "Some entry",
    });
    expect(result.success).toBe(false);
  });
});

describe("journalBodyExceedsLimit", () => {
  it("accepts a new body at or under the cap", () => {
    expect(journalBodyExceedsLimit("x".repeat(JOURNAL_NOTE_MAX), "")).toBe(false);
  });

  it("refuses a new body over the cap", () => {
    expect(journalBodyExceedsLimit("x".repeat(JOURNAL_NOTE_MAX + 1), "")).toBe(true);
  });

  it("accepts a legacy long body resaved byte-for-byte unchanged", () => {
    const legacy = "y".repeat(900);
    expect(journalBodyExceedsLimit(legacy, legacy)).toBe(false);
  });

  it("refuses a legacy long body that was edited and is still over the cap", () => {
    const legacy = "y".repeat(900);
    const edited = legacy.slice(0, -1) + "z"; // one char different, still 900 long
    expect(journalBodyExceedsLimit(edited, legacy)).toBe(true);
  });

  it("accepts a legacy long body shortened to under the cap", () => {
    const legacy = "y".repeat(900);
    const shortened = "y".repeat(400);
    expect(journalBodyExceedsLimit(shortened, legacy)).toBe(false);
  });
});
