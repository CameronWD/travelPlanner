import { describe, expect, it } from "vitest";
import { stopSchema } from "./stop";

const VALID = {
  name: "London",
  country: "United Kingdom",
  timezone: "Europe/London",
  arriveDate: "2026-07-01",
  departDate: "2026-07-05",
};

describe("stopSchema", () => {
  it("accepts valid input", () => {
    const result = stopSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("trims name whitespace", () => {
    const result = stopSchema.safeParse({ ...VALID, name: "  London  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("London");
    }
  });

  it("rejects empty name", () => {
    const result = stopSchema.safeParse({ ...VALID, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.name).toBeDefined();
    }
  });

  it("rejects name exceeding 120 chars", () => {
    const result = stopSchema.safeParse({ ...VALID, name: "A".repeat(121) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.name).toBeDefined();
    }
  });

  it("rejects empty timezone", () => {
    const result = stopSchema.safeParse({ ...VALID, timezone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.timezone).toBeDefined();
    }
  });

  it("rejects invalid arriveDate format", () => {
    const result = stopSchema.safeParse({ ...VALID, arriveDate: "01-07-2026" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.arriveDate).toBeDefined();
    }
  });

  it("rejects invalid departDate format", () => {
    const result = stopSchema.safeParse({ ...VALID, departDate: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.departDate).toBeDefined();
    }
  });

  it("rejects departDate before arriveDate", () => {
    const result = stopSchema.safeParse({
      ...VALID,
      arriveDate: "2026-07-10",
      departDate: "2026-07-05",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.departDate).toBeDefined();
    }
  });

  it("accepts departDate equal to arriveDate (same day)", () => {
    const result = stopSchema.safeParse({
      ...VALID,
      arriveDate: "2026-07-05",
      departDate: "2026-07-05",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields being absent", () => {
    const { country, lat, lng, notes, ...minimal } = {
      ...VALID,
      lat: 51.5,
      lng: -0.1,
      notes: "Great city",
    };
    void country; void lat; void lng; void notes;
    const result = stopSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("accepts optional lat/lng when provided", () => {
    const result = stopSchema.safeParse({ ...VALID, lat: 51.5, lng: -0.1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lat).toBe(51.5);
      expect(result.data.lng).toBe(-0.1);
    }
  });

  it("rejects non-numeric lat", () => {
    const result = stopSchema.safeParse({ ...VALID, lat: "not-a-number" });
    expect(result.success).toBe(false);
  });
});
