import { describe, it, expect } from "vitest";
import { weatherTone } from "./weather-tone";
import { weatherLabel } from "@/lib/weather";

describe("weatherTone", () => {
  it("0 → sun/sun (clear)", () => {
    expect(weatherTone(0)).toEqual({ tone: "hue-sun", icon: "sun" });
  });

  it("1-3 → stone/cloud (cloudy)", () => {
    expect(weatherTone(1)).toEqual({ tone: "hue-stone", icon: "cloud" });
    expect(weatherTone(2)).toEqual({ tone: "hue-stone", icon: "cloud" });
    expect(weatherTone(3)).toEqual({ tone: "hue-stone", icon: "cloud" });
  });

  it("45-48 → stone/cloud-fog (fog)", () => {
    expect(weatherTone(45)).toEqual({ tone: "hue-stone", icon: "cloud-fog" });
    expect(weatherTone(48)).toEqual({ tone: "hue-stone", icon: "cloud-fog" });
  });

  it("51-67 → sky/cloud-rain (drizzle/rain)", () => {
    expect(weatherTone(51)).toEqual({ tone: "hue-sky", icon: "cloud-rain" });
    expect(weatherTone(61)).toEqual({ tone: "hue-sky", icon: "cloud-rain" });
    expect(weatherTone(67)).toEqual({ tone: "hue-sky", icon: "cloud-rain" });
  });

  it("80-82 → sky/cloud-rain (showers)", () => {
    expect(weatherTone(80)).toEqual({ tone: "hue-sky", icon: "cloud-rain" });
    expect(weatherTone(82)).toEqual({ tone: "hue-sky", icon: "cloud-rain" });
  });

  it("71-77 → lilac/snowflake (snow)", () => {
    expect(weatherTone(71)).toEqual({ tone: "hue-lilac", icon: "snowflake" });
    expect(weatherTone(77)).toEqual({ tone: "hue-lilac", icon: "snowflake" });
  });

  it("85-86 → lilac/snowflake (snow showers)", () => {
    expect(weatherTone(85)).toEqual({ tone: "hue-lilac", icon: "snowflake" });
    expect(weatherTone(86)).toEqual({ tone: "hue-lilac", icon: "snowflake" });
  });

  it("87 and above → indigo/cloud-lightning (thunderstorm — the ladder's final, unbounded rung)", () => {
    expect(weatherTone(87)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
    expect(weatherTone(95)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
    expect(weatherTone(99)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
  });

  it("null → sky/sun (no data)", () => {
    expect(weatherTone(null)).toEqual({ tone: "hue-sky", icon: "sun" });
  });

  // Codes the WMO table itself skips (never returned by the API, but not
  // excluded by the cascading `<=` ladder either) — weatherTone must follow
  // the same rung weatherLabel would land on for these, not a hardcoded
  // "no match" default. Regression coverage for the bug where `weatherTone`
  // ran its own explicit-range lookup instead of this shared ladder, so a
  // gap code like 90 fell through to the null-case default (sun look) while
  // weatherLabel(90) already said "Thunderstorm".
  describe("gap codes (unassigned by WMO, still covered by the ladder)", () => {
    it("20 → stone/cloud-fog, the <=48 rung", () => {
      expect(weatherTone(20)).toEqual({ tone: "hue-stone", icon: "cloud-fog" });
    });

    it("70 → lilac/snowflake, the <=77 rung", () => {
      expect(weatherTone(70)).toEqual({ tone: "hue-lilac", icon: "snowflake" });
    });

    it("90 → indigo/cloud-lightning, the final rung", () => {
      expect(weatherTone(90)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
    });
  });

  it("agrees with weatherLabel's wording for every code 0..99 (property: same bucket, never disagree)", () => {
    const iconByLabel: Record<string, string> = {
      Clear: "sun",
      "Partly cloudy": "cloud",
      Overcast: "cloud",
      Fog: "cloud-fog",
      Rain: "cloud-rain",
      Showers: "cloud-rain",
      Snow: "snowflake",
      "Snow showers": "snowflake",
      Thunderstorm: "cloud-lightning",
    };
    for (let code = 0; code <= 99; code++) {
      const label = weatherLabel(code);
      const { icon } = weatherTone(code);
      expect(iconByLabel[label], `code ${code}: label "${label}" vs icon "${icon}"`).toBe(icon);
    }
  });
});
