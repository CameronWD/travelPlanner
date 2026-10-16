import { describe, it, expect } from "vitest";
import { declValues } from "@/test/helpers/css";

const NAMES = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night", "sun-disc", "cloud", "cloud-back", "cloud-storm", "night-track", "night-text"];

describe("weather tokens (WEATHER_CARD §2)", () => {
  it.each(NAMES)("--wx-%s is defined twice (light + dark) and exposed as --color-wx-*", (n) => {
    expect(declValues(`--wx-${n}`)).toHaveLength(2);
    expect(declValues(`--color-wx-${n}`)).toContain(`hsl(var(--wx-${n}))`);
  });
  it("uses the same HSL in light and dark", () => {
    for (const n of NAMES) expect(new Set(declValues(`--wx-${n}`)).size).toBe(1);
  });
});
