import { describe, it, expect } from "vitest";
import { weatherTone } from "./weather-tone";

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

  it("≥95 → indigo/cloud-lightning (thunderstorm)", () => {
    expect(weatherTone(95)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
    expect(weatherTone(99)).toEqual({ tone: "hue-indigo", icon: "cloud-lightning" });
  });

  it("null → sky/sun (no data)", () => {
    expect(weatherTone(null)).toEqual({ tone: "hue-sky", icon: "sun" });
  });
});
