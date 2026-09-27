import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const NAMES = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night", "sun-disc", "cloud", "cloud-back", "cloud-storm", "night-track", "night-text"];

describe("weather tokens (WEATHER_CARD §2)", () => {
  it.each(NAMES)("--wx-%s is defined twice (light + dark) and exposed as --color-wx-*", (n) => {
    const defs = css.match(new RegExp(`^\\s*--wx-${n}:`, "gm")) ?? [];
    expect(defs.length).toBe(2);
    expect(css).toMatch(new RegExp(`--color-wx-${n}: hsl\\(var\\(--wx-${n}\\)\\);`));
  });
  it("uses the same HSL in light and dark", () => {
    for (const n of NAMES) {
      const vals = [...css.matchAll(new RegExp(`--wx-${n}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
      expect(new Set(vals).size).toBe(1);
    }
  });
});
