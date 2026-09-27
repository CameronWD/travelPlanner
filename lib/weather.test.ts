import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("case 5: Feb 29 target date → previous year's archive date is Feb 28 (not non-existent Feb 29)", async () => {
    // 2028 is a leap year; 2027 is not — so 2028-02-29 must fall back to 2027-02-28.
    // today is far enough in the past that out > 16 → archive branch is used.
    const today = "2026-01-01";
    const dateISO = "2028-02-29";
    const payload = makePayload(5, -2, 71);
    global.fetch = makeFetchOk(payload);

    const { getDayWeather } = await import("./weather");
    const result = await getDayWeather({ lat: 60.0, lng: 24.0, dateISO, today });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    // Must use Feb 28 of the prior year, not Feb 29
    expect(calledUrl.searchParams.get("start_date")).toBe("2027-02-28");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("typical");
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

function richPayload(over: Partial<Record<string, unknown[]>> = {}, current?: { temperature_2m: number; is_day: number }) {
  return {
    daily: {
      temperature_2m_max: [9],
      temperature_2m_min: [5],
      weathercode: [3],
      precipitation_probability_max: [70],
      wind_gusts_10m_max: [55],
      uv_index_max: [2.4],
      snowfall_sum: [0],
      ...over,
    },
    ...(current ? { current } : {}),
  };
}

describe("getDayWeather — extended reading (handoff WEATHER_CARD §1)", () => {
  it("requests the extra daily fields and parses them", async () => {
    const fetchMock = makeFetchOk(richPayload());
    vi.stubGlobal("fetch", fetchMock);
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 48.58, lng: 7.75, dateISO: "2026-07-05", today: "2026-06-29" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const daily = url.searchParams.get("daily")!.split(",");
    for (const f of ["precipitation_probability_max", "wind_gusts_10m_max", "uv_index_max", "snowfall_sum"]) {
      expect(daily).toContain(f);
    }
    expect(url.searchParams.get("current")).toBeNull();
    expect(wx).toMatchObject({ precipProbMax: 70, gustsKph: 55, uvMax: 2.4, snowfallCm: 0, current: null, stale: false });
    expect(typeof wx!.fetchedAt).toBe("number");
  });

  it("with withCurrent, requests current temperature_2m,is_day and parses it", async () => {
    const fetchMock = makeFetchOk(richPayload({}, { temperature_2m: -2.3, is_day: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 47.55, lng: 7.59, dateISO: "2026-06-29", today: "2026-06-29", withCurrent: true });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("current")).toBe("temperature_2m,is_day");
    expect(wx!.current).toEqual({ tempC: -2.3, isDay: false });
  });

  it("a partial payload leaves missing fields null (review focus 4)", async () => {
    vi.stubGlobal("fetch", makeFetchOk({ daily: { temperature_2m_max: [9], temperature_2m_min: [5], weathercode: [3] } }));
    const { getDayWeather } = await import("@/lib/weather");
    const wx = await getDayWeather({ lat: 50.11, lng: 8.68, dateISO: "2026-07-06", today: "2026-06-29" });
    expect(wx).toMatchObject({ precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null });
  });

  it("serves the last cached reading flagged stale when a refetch fails after the TTL", async () => {
    let t = 1_000_000;
    const now = () => t;
    const ok = makeFetchOk(richPayload());
    vi.stubGlobal("fetch", ok);
    const { getDayWeather } = await import("@/lib/weather");
    const args = { lat: 51.5, lng: -0.12, dateISO: "2026-07-07", today: "2026-06-29", now };
    const first = await getDayWeather(args);
    expect(first!.stale).toBe(false);
    t += 2 * 3600 * 1000; // past the 1h forecast TTL
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const second = await getDayWeather(args);
    expect(second).toMatchObject({ highC: 9, stale: true, fetchedAt: 1_000_000 });
  });

  it("returns null when the fetch fails and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { getDayWeather } = await import("@/lib/weather");
    expect(await getDayWeather({ lat: 41.9, lng: 12.5, dateISO: "2026-07-08", today: "2026-06-29" })).toBeNull();
  });
});
