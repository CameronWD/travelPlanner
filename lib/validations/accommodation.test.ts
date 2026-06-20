import { describe, expect, it } from "vitest";
import { accommodationSchema, accommodationDateWarnings } from "./accommodation";

// ---------------------------------------------------------------------------
// accommodationSchema
// ---------------------------------------------------------------------------

const VALID = {
  stopId: "stop-1",
  name: "Travelodge Central",
  checkIn: "2026-07-01",
  checkOut: "2026-07-04",
};

describe("accommodationSchema", () => {
  it("accepts valid input", () => {
    expect(accommodationSchema.safeParse(VALID).success).toBe(true);
  });

  it("trims name whitespace", () => {
    const result = accommodationSchema.safeParse({ ...VALID, name: "  Hilton  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Hilton");
  });

  it("rejects empty name", () => {
    const result = accommodationSchema.safeParse({ ...VALID, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("rejects name over 120 chars", () => {
    const result = accommodationSchema.safeParse({
      ...VALID,
      name: "A".repeat(121),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name).toBeDefined();
    }
  });

  it("rejects empty stopId", () => {
    const result = accommodationSchema.safeParse({ ...VALID, stopId: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.stopId).toBeDefined();
    }
  });

  it("rejects checkOut before checkIn", () => {
    const result = accommodationSchema.safeParse({
      ...VALID,
      checkIn: "2026-07-05",
      checkOut: "2026-07-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.checkOut).toBeDefined();
    }
  });

  it("accepts checkOut equal to checkIn (same day)", () => {
    const result = accommodationSchema.safeParse({
      ...VALID,
      checkIn: "2026-07-01",
      checkOut: "2026-07-01",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields (address, confirmation, notes, lat, lng)", () => {
    const result = accommodationSchema.safeParse({
      ...VALID,
      address: "123 Main St",
      confirmation: "ABC123",
      notes: "Non-smoking room please",
      lat: 51.5,
      lng: -0.1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid checkIn date format", () => {
    const result = accommodationSchema.safeParse({ ...VALID, checkIn: "01-07-2026" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.checkIn).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// accommodationDateWarnings
// ---------------------------------------------------------------------------

const STOP = { arriveDate: "2026-07-01", departDate: "2026-07-07" };

describe("accommodationDateWarnings", () => {
  it("returns no warnings when dates are within the stop range", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-07-01", checkOut: "2026-07-05" },
      STOP,
    );
    expect(warnings).toHaveLength(0);
  });

  it("returns no warnings when dates exactly match the stop range", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-07-01", checkOut: "2026-07-07" },
      STOP,
    );
    expect(warnings).toHaveLength(0);
  });

  it("warns when checkIn is before the stop arrives", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-06-30", checkOut: "2026-07-05" },
      STOP,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/before you arrive/i);
  });

  it("warns when checkOut is after the stop departs", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-07-03", checkOut: "2026-07-09" },
      STOP,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/after you leave/i);
  });

  it("warns for both checkIn before and checkOut after", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-06-28", checkOut: "2026-07-10" },
      STOP,
    );
    expect(warnings).toHaveLength(2);
  });

  it("warns when checkIn is after stop departs", () => {
    const warnings = accommodationDateWarnings(
      { checkIn: "2026-07-10", checkOut: "2026-07-12" },
      STOP,
    );
    expect(warnings).toContainEqual(expect.stringMatching(/after you leave/i));
  });
});
