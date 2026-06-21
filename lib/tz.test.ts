import { describe, expect, it } from "vitest";
import {
  TIMEZONES,
  guessTimezoneForCountry,
  instantToZonedDateISO,
  instantToZonedTime,
  zonedWallTimeToInstant,
} from "./tz";

describe("TIMEZONES", () => {
  it("is a non-empty array", () => {
    expect(TIMEZONES.length).toBeGreaterThan(0);
  });

  it("contains required common timezones", () => {
    const values = TIMEZONES.map((t) => t.value);
    expect(values).toContain("Europe/London");
    expect(values).toContain("Europe/Paris");
    expect(values).toContain("Europe/Rome");
    expect(values).toContain("Europe/Berlin");
    expect(values).toContain("Europe/Madrid");
    expect(values).toContain("Australia/Sydney");
    expect(values).toContain("Pacific/Auckland");
    expect(values).toContain("America/New_York");
    expect(values).toContain("America/Los_Angeles");
    expect(values).toContain("Asia/Tokyo");
    expect(values).toContain("Asia/Singapore");
    expect(values).toContain("Asia/Bangkok");
    expect(values).toContain("UTC");
  });

  it("all entries have non-empty value and label", () => {
    for (const tz of TIMEZONES) {
      expect(tz.value).toBeTruthy();
      expect(tz.label).toBeTruthy();
    }
  });
});

describe("guessTimezoneForCountry", () => {
  it("maps UK to Europe/London", () => {
    expect(guessTimezoneForCountry("UK")).toBe("Europe/London");
  });

  it("maps 'United Kingdom' to Europe/London (case-insensitive)", () => {
    expect(guessTimezoneForCountry("United Kingdom")).toBe("Europe/London");
    expect(guessTimezoneForCountry("united kingdom")).toBe("Europe/London");
  });

  it("maps France to Europe/Paris", () => {
    expect(guessTimezoneForCountry("France")).toBe("Europe/Paris");
    expect(guessTimezoneForCountry("fr")).toBe("Europe/Paris");
  });

  it("maps Italy to Europe/Rome", () => {
    expect(guessTimezoneForCountry("Italy")).toBe("Europe/Rome");
    expect(guessTimezoneForCountry("IT")).toBe("Europe/Rome");
  });

  it("maps Australia to Australia/Sydney", () => {
    expect(guessTimezoneForCountry("Australia")).toBe("Australia/Sydney");
    expect(guessTimezoneForCountry("au")).toBe("Australia/Sydney");
  });

  it("maps Japan to Asia/Tokyo", () => {
    expect(guessTimezoneForCountry("Japan")).toBe("Asia/Tokyo");
  });

  it("maps Thailand to Asia/Bangkok", () => {
    expect(guessTimezoneForCountry("Thailand")).toBe("Asia/Bangkok");
  });

  it("falls back to UTC for unknown country", () => {
    expect(guessTimezoneForCountry("Atlantis")).toBe("UTC");
    expect(guessTimezoneForCountry("XYZ")).toBe("UTC");
  });

  it("falls back to UTC when called without argument", () => {
    expect(guessTimezoneForCountry()).toBe("UTC");
    expect(guessTimezoneForCountry(null)).toBe("UTC");
    expect(guessTimezoneForCountry("")).toBe("UTC");
  });

  it("trims whitespace before matching", () => {
    expect(guessTimezoneForCountry("  France  ")).toBe("Europe/Paris");
  });
});

describe("instantToZonedDateISO", () => {
  // 2026-07-01T23:30:00Z is still 2026-07-01 in UTC but already 2026-07-02 in Europe/Paris (UTC+2)
  const instant = new Date("2026-07-01T23:30:00Z");

  it("returns the correct calendar date in Europe/Paris (UTC+2 in summer)", () => {
    expect(instantToZonedDateISO(instant, "Europe/Paris")).toBe("2026-07-02");
  });

  it("returns the correct calendar date in UTC", () => {
    expect(instantToZonedDateISO(instant, "UTC")).toBe("2026-07-01");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(instantToZonedDateISO("2026-07-01T23:30:00Z", "Europe/Paris")).toBe(
      "2026-07-02",
    );
  });

  it("falls back to UTC for an invalid timezone", () => {
    // Should not throw; should return the UTC date
    expect(instantToZonedDateISO(instant, "Not/A/Zone")).toBe("2026-07-01");
  });

  it("handles Asia/Tokyo (UTC+9)", () => {
    // 2026-07-01T23:30:00Z → 2026-07-02T08:30:00+09:00 → date 2026-07-02
    expect(instantToZonedDateISO(instant, "Asia/Tokyo")).toBe("2026-07-02");
  });

  it("handles America/New_York (UTC-4 in summer, EDT)", () => {
    // 2026-07-01T23:30:00Z → 2026-07-01T19:30:00-04:00 → date 2026-07-01
    expect(instantToZonedDateISO(instant, "America/New_York")).toBe(
      "2026-07-01",
    );
  });
});

describe("instantToZonedTime", () => {
  const instant = new Date("2026-07-01T23:30:00Z");

  it("returns 01:30 in Europe/Paris (UTC+2 in summer)", () => {
    expect(instantToZonedTime(instant, "Europe/Paris")).toBe("01:30");
  });

  it("returns 23:30 in UTC", () => {
    expect(instantToZonedTime(instant, "UTC")).toBe("23:30");
  });

  it("accepts an ISO string", () => {
    expect(instantToZonedTime("2026-07-01T23:30:00Z", "UTC")).toBe("23:30");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(instantToZonedTime(instant, "Not/A/Zone")).toBe("23:30");
  });

  it("returns 08:30 in Asia/Tokyo (UTC+9)", () => {
    expect(instantToZonedTime(instant, "Asia/Tokyo")).toBe("08:30");
  });
});

describe("zonedWallTimeToInstant", () => {
  it("converts a UTC wall time to the same instant", () => {
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "UTC");
    expect(d.toISOString()).toBe("2026-07-09T10:00:00.000Z");
  });

  it("converts a summer Paris wall time (UTC+2) back to UTC", () => {
    // 10:00 in Paris in July = 08:00 UTC.
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "Europe/Paris");
    expect(d.toISOString()).toBe("2026-07-09T08:00:00.000Z");
  });

  it("converts a winter Paris wall time (UTC+1) back to UTC", () => {
    // 10:00 in Paris in January = 09:00 UTC.
    const d = zonedWallTimeToInstant("2026-01-09", "10:00", "Europe/Paris");
    expect(d.toISOString()).toBe("2026-01-09T09:00:00.000Z");
  });

  it("converts a New York summer wall time (UTC-4) to UTC", () => {
    const d = zonedWallTimeToInstant("2026-07-09", "10:00", "America/New_York");
    expect(d.toISOString()).toBe("2026-07-09T14:00:00.000Z");
  });
});
