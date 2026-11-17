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
  it("names the one reading it has, and never prints a dash", () => {
    expect(weatherStripSummary(theme("overcast", "Overcast"), day(null, 5))).toBe("Low 5° · Overcast");
    expect(weatherStripSummary(theme("overcast", "Overcast"), day(7, null))).toBe("High 7° · Overcast");
    expect(weatherStripSummary(theme("overcast", "Overcast"), day(null, null))).toBe("Overcast");
    expect(weatherStripSummary(theme("overcast", "Overcast"), null)).not.toContain("—");
  });
  it("says so when the day is too far out", () => {
    expect(weatherStripSummary(theme("too-far", "Too far out"), null)).toBe("Too far out for a forecast");
  });
});
