import { describe, expect, it } from "vitest";
import { saveJournalEntrySchema } from "./journal";

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

  it("rejects a body that exceeds 5000 characters", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.flatten().fieldErrors.body ?? [];
      expect(messages.some((m) => m.includes("5000"))).toBe(true);
    }
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

  it("accepts a body of exactly 5000 characters", () => {
    const result = saveJournalEntrySchema.safeParse({
      date: "2026-07-15",
      body: "x".repeat(5000),
    });
    expect(result.success).toBe(true);
  });
});
