import { describe, expect, it, vi } from "vitest";

// Lets one case make the lookup return a zone this runtime rejects.
const override = vi.hoisted(() => ({ zone: null as string | null }));
vi.mock("@photostructure/tz-lookup", async (importOriginal) => {
  const real = ((await importOriginal()) as { default: (lat: number, lng: number) => string }).default;
  return { default: (lat: number, lng: number) => override.zone ?? real(lat, lng) };
});

import { pointTimezone, resolveStopTimezone, resolveHomeTimezone } from "./tz-point";

describe("pointTimezone (F3: the zone at a point)", () => {
  it("finds the zone inside a multi-zone country", () => {
    expect(pointTimezone(-27.47, 153.03)).toBe("Australia/Brisbane");
    expect(pointTimezone(-31.95, 115.86)).toBe("Australia/Perth");
    expect(pointTimezone(-33.87, 151.21)).toBe("Australia/Sydney");
  });
  it("a point at sea is no zone (the lookup's Etc/GMT±N), so the country decides", () => {
    expect(pointTimezone(0, -30)).toBeNull();
    expect(pointTimezone(1, 2)).toBeNull();
  });
  it("no point, or one the lookup refuses, is no zone", () => {
    expect(pointTimezone(null, 153.03)).toBeNull();
    expect(pointTimezone(-27.47, undefined)).toBeNull();
    expect(pointTimezone(100, 0)).toBeNull();
    expect(pointTimezone(Number.NaN, 0)).toBeNull();
  });
  it("a zone this runtime does not accept is no zone", () => {
    override.zone = "Mars/Olympus_Mons";
    try {
      expect(pointTimezone(-27.47, 153.03)).toBeNull();
    } finally {
      override.zone = null;
    }
  });
});

describe("resolveStopTimezone (server: the rule with the lookup)", () => {
  it("chosen zone, else the point's, else the country's, else UTC", () => {
    expect(resolveStopTimezone({ timezone: "Australia/Sydney", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Sydney");
    expect(resolveStopTimezone({ timezone: "UTC", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Brisbane");
    expect(resolveStopTimezone({ countryCode: "au", lat: -31.95, lng: 115.86 })).toBe("Australia/Perth");
    expect(resolveStopTimezone({ countryCode: "au", lat: 0, lng: -30 })).toBe("Australia/Sydney");
    expect(resolveStopTimezone({ country: "Italy", lat: null, lng: null })).toBe("Europe/Rome");
    expect(resolveStopTimezone({})).toBe("UTC");
  });
});

describe("resolveHomeTimezone", () => {
  it("sent zone, else the point's, else the country's, else null", () => {
    expect(resolveHomeTimezone({ timezone: "Australia/Sydney", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Sydney");
    expect(resolveHomeTimezone({ timezone: "", countryCode: "au", lat: -27.47, lng: 153.03 })).toBe("Australia/Brisbane");
    expect(resolveHomeTimezone({ countryCode: "au" })).toBe("Australia/Sydney");
    expect(resolveHomeTimezone({})).toBeNull();
  });
});
