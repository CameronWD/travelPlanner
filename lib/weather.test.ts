import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayWeather } from "./weather";

// We build a fresh mock payload helper
function makePayload(high: number, low: number, code: number) {
  return {
    daily: {
      temperature_2m_max: [high],
      temperature_2m_min: [low],
      weathercode: [code],
    },
  };
}

function makeFetchOk(payload: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

// Each test uses distinct coords/dates so the module-level cache never bleeds
// between cases (cache key is rounded lat,lng,dateISO).

describe("getDayWeather", () => {
  // Fresh import of the module per test is NOT needed because we use distinct
  // (lat, lng, dateISO) tuples in each case — the cache key is different, so
  // cached entries from previous tests are never hit by subsequent ones.
  // The only exception is case 3 (cache hit), which deliberately reuses the
  // same coords/date and expects exactly 1 fetch call.

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("case 1: dateISO within 16 days → calls forecast endpoint, returns forecast result", async () => {
    // today = 2026-06-29, dateISO = 2026-07-05 (6 days out → within window)
    const today = "2026-06-29";
    const dateISO = "2026-07-05";
    const payload = makePayload(25, 14, 1);
    global.fetch = makeFetchOk(payload);

    const { getDayWeather } = await import("./weather");
    const result = await getDayWeather({ lat: 51.5, lng: -0.1, dateISO, today });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.host).toBe("api.open-meteo.com");
    expect(calledUrl.searchParams.get("latitude")).toBe("51.5");
    expect(calledUrl.searchParams.get("longitude")).toBe("-0.1");
    expect(calledUrl.searchParams.get("start_date")).toBe(dateISO);

    expect(result).not.toBeNull();
    expect(result!.source).toBe("forecast");
    expect(result!.highC).toBe(25);
    expect(result!.lowC).toBe(14);
    expect(result!.code).toBe(1);
    expect(result!.label).toBe("Partly cloudy");
  });

  it("case 2: dateISO > 16 days out → calls archive endpoint for previous year's same date", async () => {
    // today = 2026-06-29, dateISO = 2026-08-01 (33 days out → beyond window)
    const today = "2026-06-29";
    const dateISO = "2026-08-01";
    const payload = makePayload(30, 18, 0);
    global.fetch = makeFetchOk(payload);

    // Use different lat/lng from case 1 to avoid cache collision
    const { getDayWeather } = await import("./weather");
    const result = await getDayWeather({ lat: 48.8, lng: 2.3, dateISO, today });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.host).toBe("archive-api.open-meteo.com");
    expect(calledUrl.searchParams.get("latitude")).toBe("48.8");
    expect(calledUrl.searchParams.get("longitude")).toBe("2.3");
    // Previous year: 2025-08-01
    expect(calledUrl.searchParams.get("start_date")).toBe("2025-08-01");

    expect(result).not.toBeNull();
    expect(result!.source).toBe("typical");
    expect(result!.highC).toBe(30);
    expect(result!.lowC).toBe(18);
    expect(result!.label).toBe("Clear");
  });

  it("case 3: two identical calls → fetch called only once (cache hit)", async () => {
    // Use distinct coords from cases 1 & 2 to avoid stale cache entries
    // today = 2026-06-29, dateISO = 2026-07-03 (4 days → within window)
    const today = "2026-06-29";
    const dateISO = "2026-07-03";
    const payload = makePayload(20, 10, 3);
    global.fetch = makeFetchOk(payload);

    const { getDayWeather } = await import("./weather");

    const r1 = await getDayWeather({ lat: 40.7, lng: -74.0, dateISO, today });
    const r2 = await getDayWeather({ lat: 40.7, lng: -74.0, dateISO, today });

    // fetch should have been called exactly once; second call hits cache
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
    expect(r1!.source).toBe("forecast");
  });

  it("case 4: fetch rejects → returns null, never throws", async () => {
    const today = "2026-06-29";
    const dateISO = "2026-07-10";
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const { getDayWeather } = await import("./weather");
    // Use distinct coords to avoid cache collision
    const result = await getDayWeather({ lat: -33.8, lng: 151.2, dateISO, today });

    expect(result).toBeNull();
  });

  it("case 4b: fetch returns ok:false → returns null", async () => {
    const today = "2026-06-29";
    const dateISO = "2026-07-11";
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const { getDayWeather } = await import("./weather");
    // Distinct coords again
    const result = await getDayWeather({ lat: 35.6, lng: 139.7, dateISO, today });

    expect(result).toBeNull();
  });
});

describe("weatherLabel", () => {
  it("returns correct labels for known codes", async () => {
    const { weatherLabel } = await import("./weather");
    expect(weatherLabel(null)).toBe("—");
    expect(weatherLabel(0)).toBe("Clear");
    expect(weatherLabel(1)).toBe("Partly cloudy");
    expect(weatherLabel(3)).toBe("Overcast");
    expect(weatherLabel(45)).toBe("Fog");
    expect(weatherLabel(61)).toBe("Rain");
    expect(weatherLabel(71)).toBe("Snow");
    expect(weatherLabel(80)).toBe("Showers");
    expect(weatherLabel(85)).toBe("Snow showers");
    expect(weatherLabel(95)).toBe("Thunderstorm");
  });
});
