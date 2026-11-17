import { describe, it, expect } from "vitest";
import { weatherStripSummary } from "@/lib/weather/strip-summary";
import type { WeatherTheme } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";

const theme = (key: string, condition: string) => ({ key, condition }) as unknown as WeatherTheme;
const day = (highC: number | null, lowC: number | null) => ({ highC, lowC }) as DayWeather;

describe("weatherStripSummary", () => {
  it("is the high, low and condition on one line", () => {
    expect(weatherStripSummary(theme("rain", "Rain"), day(15.2, 8.6))).toBe("15° / 9° · Rain");
  });
  it("shows a dash for a missing reading", () => {
    expect(weatherStripSummary(theme("overcast", "Overcast"), day(null, 5))).toBe("— / 5° · Overcast");
  });
  it("says so when the day is too far out", () => {
    expect(weatherStripSummary(theme("too-far", "Too far out"), null)).toBe("Too far out for a forecast");
  });
});
