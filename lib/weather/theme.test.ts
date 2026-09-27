import { describe, it, expect } from "vitest";
import { getWeatherTheme, themeFill } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";

function wx(over: Partial<DayWeather> = {}): DayWeather {
  return {
    source: "forecast", highC: 12, lowC: 4, code: 0, label: "Clear",
    precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null,
    current: null, fetchedAt: 1_000_000, stale: false, ...over,
  };
}
const base = { daysOut: 3, isToday: false, monthShort: "Dec", now: () => 1_000_000 + 2 * 3600 * 1000 };

describe("getWeatherTheme — code table (WEATHER_CARD §3.6)", () => {
  it.each([
    [0, "sunny", "Sunny"], [1, "sunny", "Sunny"], [2, "partly", "Partly cloudy"], [3, "overcast", "Overcast"],
    [45, "fog", "Fog"], [48, "fog", "Fog"],
    [51, "rain", "Drizzle"], [55, "rain", "Drizzle"], [61, "rain", "Rain"], [67, "rain", "Rain"], [80, "rain", "Showers"], [82, "rain", "Showers"],
    [71, "snow", "Light snow"], [75, "snow", "Snow"], [77, "snow", "Snow"], [85, "snow", "Light snow"], [86, "snow", "Snow"],
    [95, "storm", "Storms"], [99, "storm", "Storms"],
  ])("code %i → %s / %s", (code, key, condition) => {
    const t = getWeatherTheme({ ...base, day: wx({ code }) })!;
    expect(t.key).toBe(key);
    expect(t.scene).toBe(key);
    expect(t.condition).toBe(condition);
  });
  it("an unknown gap code (e.g. 30) falls back to overcast", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 30 }) })!.key).toBe("overcast");
  });
});

describe("overrides, in priority order (§3.1–3.5)", () => {
  it("stale → keeps the theme, drops the scene, offline chip with the age", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 3, stale: true }) })!;
    expect(t).toMatchObject({ key: "overcast", scene: null, offline: "Offline · updated 2h ago", chip: null });
  });
  it("beyond 16 days with no reading → too-far", () => {
    const t = getWeatherTheme({ ...base, daysOut: 40, day: null })!;
    expect(t).toMatchObject({ key: "too-far", scene: null, condition: "", chip: null });
  });
  it("beyond 16 days with a typical reading → themed card with the typical chip", () => {
    const t = getWeatherTheme({ ...base, daysOut: 40, day: wx({ source: "typical", code: 3 }) })!;
    expect(t).toMatchObject({ key: "overcast", typical: true, chip: "Typical for Dec" });
  });
  it("inside the window with no reading → null (no card)", () => {
    expect(getWeatherTheme({ ...base, day: null })).toBeNull();
  });
  it("night: today only, is_day 0, code 0–2", () => {
    const night = wx({ code: 1, current: { tempC: -2, isDay: false } });
    expect(getWeatherTheme({ ...base, isToday: true, day: night })!.key).toBe("night");
    expect(getWeatherTheme({ ...base, isToday: false, day: night })!.key).toBe("sunny");
    expect(getWeatherTheme({ ...base, isToday: true, day: wx({ code: 3, current: { tempC: -2, isDay: false } }) })!.key).toBe("overcast");
  });
  it("heat: max ≥ 35 and code 0–2, beats wind", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 1, highC: 36, gustsKph: 60 }) })!;
    expect(t).toMatchObject({ key: "heat", condition: "Scorcher", chip: "Heat warning · shade 12–3pm" });
    expect(getWeatherTheme({ ...base, day: wx({ code: 3, highC: 36 }) })!.key).toBe("overcast");
  });
  it("wind: gusts ≥ 40 and code 0–3", () => {
    const t = getWeatherTheme({ ...base, day: wx({ code: 3, gustsKph: 55 }) })!;
    expect(t).toMatchObject({ key: "wind", condition: "Windy", chip: "Gusts 55 km/h" });
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, gustsKph: 55 }) })!.key).toBe("rain");
  });
});

describe("chip (§4)", () => {
  it("rain/storm show the probability; omitted when unknown (review focus 4)", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, precipProbMax: 70 }) })!.chip).toBe("Rain 70%");
    expect(getWeatherTheme({ ...base, day: wx({ code: 95, precipProbMax: 40 }) })!.chip).toBe("Rain 40%");
    expect(getWeatherTheme({ ...base, day: wx({ code: 61, precipProbMax: null }) })!.chip).toBeNull();
  });
  it("sunny shows UV only from 8", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 0, uvMax: 11 }) })!.chip).toBe("UV 11 · pack sunscreen");
    expect(getWeatherTheme({ ...base, day: wx({ code: 0, uvMax: 5 }) })!.chip).toBeNull();
  });
  it("snow shows the amount when > 0", () => {
    expect(getWeatherTheme({ ...base, day: wx({ code: 73, snowfallCm: 2 }) })!.chip).toBe("2 cm · icy paths");
    expect(getWeatherTheme({ ...base, day: wx({ code: 73, snowfallCm: 0 }) })!.chip).toBeNull();
  });
  it("a typical reading always shows the typical chip, even with a themed fact", () => {
    expect(getWeatherTheme({ ...base, daysOut: 30, day: wx({ source: "typical", code: 73, snowfallCm: 3 }) })!.chip).toBe("Typical for Dec");
    expect(getWeatherTheme({ ...base, daysOut: 30, day: wx({ source: "typical", code: 0 }) })!.chip).toBe("Typical for Dec");
  });
});

describe("themeFill", () => {
  it.each([
    ["sunny", "bg-wx-sunny"], ["night", "bg-wx-night"], ["too-far", "bg-background"],
  ])("%s → %s", (key, cls) => expect(themeFill(key as never)).toBe(cls));
});
