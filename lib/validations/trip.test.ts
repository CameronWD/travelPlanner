import { describe, it, expect } from "vitest";
import { createTripSchema } from "./trip";

const VALID_INPUT = {
  name: "Europe Summer 2026",
  startDate: "2026-07-01",
  endDate: "2026-07-12",
  homeCurrency: "AUD",
};

describe("createTripSchema", () => {
  it("accepts a valid input", () => {
    const result = createTripSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Europe Summer 2026");
    }
  });

  it("trims the name", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      name: "  Trimmed  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Trimmed");
    }
  });

  it("rejects an empty name", () => {
    const result = createTripSchema.safeParse({ ...VALID_INPUT, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameErrors = result.error.flatten().fieldErrors.name;
      expect(nameErrors).toBeDefined();
      expect(nameErrors!.length).toBeGreaterThan(0);
    }
  });

  it("rejects a name longer than 120 chars", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      name: "A".repeat(121),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameErrors = result.error.flatten().fieldErrors.name;
      expect(nameErrors).toBeDefined();
    }
  });

  it("rejects endDate before startDate", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      startDate: "2026-07-12",
      endDate: "2026-07-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateErrors = result.error.flatten().fieldErrors.endDate;
      expect(endDateErrors).toBeDefined();
      expect(endDateErrors!.length).toBeGreaterThan(0);
    }
  });

  it("accepts endDate equal to startDate", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      startDate: "2026-07-01",
      endDate: "2026-07-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown currency code", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      homeCurrency: "XYZ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const currencyErrors = result.error.flatten().fieldErrors.homeCurrency;
      expect(currencyErrors).toBeDefined();
    }
  });

  it("accepts all known currency codes", () => {
    const codes = ["AUD", "NZD", "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "SGD", "THB"];
    for (const code of codes) {
      const result = createTripSchema.safeParse({
        ...VALID_INPUT,
        homeCurrency: code,
      });
      expect(result.success, `Expected ${code} to be valid`).toBe(true);
    }
  });
});

describe("createTripSchema optional dates", () => {
  it("accepts name + currency with no dates", () => {
    expect(createTripSchema.safeParse({ name: "Europe someday", homeCurrency: "AUD" }).success).toBe(true);
  });
  it("accepts a start date with no end date", () => {
    expect(createTripSchema.safeParse({ name: "Italy", homeCurrency: "AUD", startDate: "2026-07-03" }).success).toBe(true);
  });
  it("rejects end before start when both present", () => {
    expect(createTripSchema.safeParse({ name: "Italy", homeCurrency: "AUD", startDate: "2026-07-10", endDate: "2026-07-03" }).success).toBe(false);
  });
});

describe("createTripSchema hardEndDate", () => {
  it("accepts an optional hardEndDate on or after the start date", () => {
    const result = createTripSchema.safeParse({ ...VALID_INPUT, hardEndDate: "2026-07-20" });
    expect(result.success).toBe(true);
  });

  it("accepts input with no hardEndDate", () => {
    const result = createTripSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejects a hardEndDate before the start date", () => {
    const result = createTripSchema.safeParse({
      ...VALID_INPUT,
      startDate: "2026-07-01",
      hardEndDate: "2026-06-30",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.hardEndDate).toBeDefined();
    }
  });

  it("accepts a hardEndDate equal to the start date", () => {
    const result = createTripSchema.safeParse({ ...VALID_INPUT, startDate: "2026-07-01", hardEndDate: "2026-07-01" });
    expect(result.success).toBe(true);
  });

  it("accepts a hardEndDate when there is no start date", () => {
    const result = createTripSchema.safeParse({ ...VALID_INPUT, startDate: undefined, hardEndDate: "2026-07-20" });
    expect(result.success).toBe(true);
  });
});

import { tripSchema } from "./trip";

const base = { name: "Trip", homeCurrency: "AUD" };

describe("tripSchema — blank dates are optional", () => {
  it("accepts a blank hard end date (treats it as no date)", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hardEndDate).toBeUndefined();
  });

  it("accepts blank start and end dates (a date-less trip)", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "", endDate: "", hardEndDate: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startDate).toBeUndefined();
      expect(r.data.endDate).toBeUndefined();
    }
  });

  it("still accepts a real hard end date", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-01", endDate: "2026-07-10", hardEndDate: "2026-07-15" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hardEndDate).toBe("2026-07-15");
  });

  it("still rejects a malformed non-empty date", () => {
    const r = tripSchema.safeParse({ ...base, hardEndDate: "2026-7-1" });
    expect(r.success).toBe(false);
  });

  it("still enforces hard end date on or after start date", () => {
    const r = tripSchema.safeParse({ ...base, startDate: "2026-07-10", hardEndDate: "2026-07-01" });
    expect(r.success).toBe(false);
  });
});
