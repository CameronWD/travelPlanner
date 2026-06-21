import { describe, expect, it } from "vitest";
import { haversineKm } from "./geo";

// Known reference distances for sanity checks.
// All tolerances are generous (2%) — the formula is exact; rounding in the
// reference values accounts for the slack.

describe("haversineKm", () => {
  it("London → Paris is ≈ 340 km", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const paris = { lat: 48.8566, lng: 2.3522 };
    const km = haversineKm(london, paris);
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(350);
  });

  it("New York → Los Angeles is ≈ 3940 km", () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const lax = { lat: 34.0522, lng: -118.2437 };
    const km = haversineKm(nyc, lax);
    expect(km).toBeGreaterThan(3850);
    expect(km).toBeLessThan(4050);
  });

  it("Sydney → Auckland is ≈ 2155 km", () => {
    const sydney = { lat: -33.8688, lng: 151.2093 };
    const auckland = { lat: -36.8485, lng: 174.7633 };
    const km = haversineKm(sydney, auckland);
    expect(km).toBeGreaterThan(2100);
    expect(km).toBeLessThan(2220);
  });

  it("is approximately symmetric (a→b ≈ b→a)", () => {
    const london = { lat: 51.5074, lng: -0.1278 };
    const tokyo = { lat: 35.6762, lng: 139.6503 };
    const ab = haversineKm(london, tokyo);
    const ba = haversineKm(tokyo, london);
    // Should be equal to floating-point tolerance
    expect(Math.abs(ab - ba)).toBeLessThan(0.001);
  });

  it("same point returns 0", () => {
    const p = { lat: 48.8566, lng: 2.3522 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it("handles negative lat/lng (southern hemisphere)", () => {
    const capeTown = { lat: -33.9249, lng: 18.4241 };
    const johannesburg = { lat: -26.2041, lng: 28.0473 };
    const km = haversineKm(capeTown, johannesburg);
    // Cape Town → Joburg is ≈ 1265 km
    expect(km).toBeGreaterThan(1200);
    expect(km).toBeLessThan(1320);
  });
});
