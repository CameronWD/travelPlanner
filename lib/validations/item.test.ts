import { describe, expect, it } from "vitest";
import { itemSchema, isScheduled } from "./item";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SCHEDULED = {
  title: "Visit the Eiffel Tower",
  category: "SIGHTSEEING",
  date: "2026-07-15",
  startTime: "09:00",
  endTime: "11:00",
};

const VALID_UNSCHEDULED = {
  title: "Try the local market",
  category: "FOOD",
};

// ---------------------------------------------------------------------------
// itemSchema — valid cases
// ---------------------------------------------------------------------------

describe("itemSchema — valid inputs", () => {
  it("accepts a valid scheduled item with all time fields", () => {
    const result = itemSchema.safeParse(VALID_SCHEDULED);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBe("2026-07-15");
      expect(result.data.startTime).toBe("09:00");
      expect(result.data.endTime).toBe("11:00");
    }
  });

  it("accepts a valid unscheduled item (no date)", () => {
    const result = itemSchema.safeParse(VALID_UNSCHEDULED);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeUndefined();
      expect(result.data.startTime).toBeUndefined();
    }
  });

  it("accepts scheduled item with no times", () => {
    const result = itemSchema.safeParse({
      title: "Open day",
      category: "ACTIVITY",
      date: "2026-07-20",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = itemSchema.safeParse({
      ...VALID_SCHEDULED,
      stopId: "stop-abc",
      address: "Champ de Mars, Paris",
      link: "https://example.com",
      booking: "REF123",
      notes: "Book tickets in advance",
      lat: 48.8584,
      lng: 2.2945,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a javascript: link (stored XSS vector)", () => {
    const result = itemSchema.safeParse({
      ...VALID_SCHEDULED,
      link: "javascript:alert(document.cookie)",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a scheme-less link", () => {
    const result = itemSchema.safeParse({
      ...VALID_SCHEDULED,
      link: "example.com/tickets",
    });
    expect(result.success).toBe(true);
  });

  it("coerces empty stopId to undefined", () => {
    const result = itemSchema.safeParse({ ...VALID_UNSCHEDULED, stopId: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stopId).toBeUndefined();
    }
  });

  it("coerces empty date to undefined", () => {
    const result = itemSchema.safeParse({ ...VALID_UNSCHEDULED, date: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.date).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// itemSchema — rejection cases
// ---------------------------------------------------------------------------

describe("itemSchema — validation rejections", () => {
  it("rejects empty title", () => {
    const result = itemSchema.safeParse({ ...VALID_UNSCHEDULED, title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it("rejects title over 140 characters", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      title: "A".repeat(141),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it("rejects unknown category", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      category: "UNKNOWN_CATEGORY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.category).toBeDefined();
    }
  });

  it("rejects endTime without startTime", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      date: "2026-07-15",
      endTime: "11:00",
      // no startTime
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.startTime).toBeDefined();
    }
  });

  it("rejects endTime < startTime", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      date: "2026-07-15",
      startTime: "14:00",
      endTime: "11:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.endTime).toBeDefined();
    }
  });

  it("accepts endTime equal to startTime (same-time block)", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      date: "2026-07-15",
      startTime: "09:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Time-dropping behaviour
// ---------------------------------------------------------------------------

describe("itemSchema — times dropped when no date", () => {
  it("silently drops startTime and endTime when no date is provided", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      // No date
      startTime: "10:00",
      endTime: "12:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeUndefined();
      expect(result.data.endTime).toBeUndefined();
    }
  });

  it("drops startTime when date is empty string", () => {
    const result = itemSchema.safeParse({
      ...VALID_UNSCHEDULED,
      date: "",
      startTime: "08:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// isScheduled
// ---------------------------------------------------------------------------

describe("isScheduled", () => {
  it("returns true for an item with a date", () => {
    expect(isScheduled({ date: "2026-07-15" })).toBe(true);
  });

  it("returns false for an item with null date", () => {
    expect(isScheduled({ date: null })).toBe(false);
  });

  it("returns false for an item with undefined date", () => {
    expect(isScheduled({ date: undefined })).toBe(false);
  });

  it("returns false for an item with empty string date", () => {
    expect(isScheduled({ date: "" })).toBe(false);
  });
});
