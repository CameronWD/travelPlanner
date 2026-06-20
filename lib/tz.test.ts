import { describe, expect, it } from "vitest";
import { TIMEZONES, guessTimezoneForCountry } from "./tz";

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
