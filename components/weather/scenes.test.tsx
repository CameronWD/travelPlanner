import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Scene } from "@/components/weather/scenes";
import type { SceneKey } from "@/lib/weather/theme";
import { CARD_WIDTHS, canvasUnits, sceneClip, sceneFade, STRIP_TOP, TEXT_MARGIN, textZones, wordsReach, type CardSize } from "@/lib/weather/scene-math";

const SCENES: SceneKey[] = ["sunny", "partly", "overcast", "fog", "rain", "snow", "storm", "wind", "heat", "night"];
const SIZES: CardSize[] = ["regular", "compact"];
const ANIMATED = ".wx-pan, .wx-bob, .wx-fall, .wx-sway, .wx-turn, .wx-breathe, .wx-splash, .wx-flash, .wx-twinkle";
const DRAWN = "circle, rect, path, polygon, line, ellipse";

function scene(key: SceneKey, size: CardSize) {
  cleanup();
  const { container } = render(<Scene scene={key} isDay gustsKph={60} size={size} />);
  return container.querySelector<HTMLElement>("[data-scene]")!;
}

// What the browser measured (Chromium and WebKit, the app's fonts, each
// scene's widest words), in scene units: the zones must cover it with room
// for an outline.
const MEASURED: Record<CardSize, { label: number | null; temp: [number, number, number]; cond: [number, number] }> = {
  regular: { label: 35, temp: [45, 99, 200], cond: [103, 132] },
  compact: { label: null, temp: [34, 100, 261], cond: [107, 148] },
};
const MEASURED_COND_RIGHT: Record<CardSize, Partial<Record<SceneKey, number>>> = {
  regular: { snow: 254, overcast: 219, rain: 198, fog: 168, partly: 299, heat: 298 },
  compact: { snow: 381, overcast: 329, rain: 298, fog: 254, partly: 448, heat: 450 },
};

describe("weather scenes never reach the words", () => {
  it.each(SIZES)("%s: the text zones cover the measured words with a margin", (size) => {
    const m = MEASURED[size];
    for (const key of SCENES) {
      const zones = textZones(key, size);
      if (m.label != null) expect(wordsReach(zones, 0, m.label + 6)).toBe(Number.POSITIVE_INFINITY);
      expect(wordsReach(zones, m.temp[0] - 6, m.temp[1] + 6)).toBeGreaterThanOrEqual(key === "heat" || key === "night" ? 0 : m.temp[2] + 6);
      expect(wordsReach(zones, m.cond[0] - 6, m.cond[1] + 6)).toBeGreaterThanOrEqual((MEASURED_COND_RIGHT[size][key] ?? 0) + 6);
      expect(wordsReach(zones, STRIP_TOP, 236)).toBe(Number.POSITIVE_INFINITY);
    }
    expect(TEXT_MARGIN).toBeGreaterThanOrEqual(6);
  });

  for (const key of SCENES) {
    for (const size of SIZES) {
      describe(`${key}, ${size}`, () => {
        it("clips every moving layer to the part of the card the words leave free", () => {
          const root = scene(key, size);
          expect(root.style.getPropertyValue("--wx-clip")).toBe(sceneClip(key, size));
          expect(root.style.getPropertyValue("--wx-fade")).toBe(sceneFade(key, size));
          const clips = [...root.querySelectorAll<HTMLElement>("[data-clip]")];
          for (const clip of clips) expect(clip.getAttribute("style")).toMatch(/clip-path: var\(--wx-clip\);.*mask-image: var\(--wx-fade\)/);
          for (const el of root.querySelectorAll(ANIMATED)) {
            expect(el.closest("[data-clip], [data-box]"), `${el.getAttribute("class")} is neither clipped nor placed`).not.toBeNull();
          }
        });

        it("every drawn piece outside the sky is either clipped or placed", () => {
          const root = scene(key, size);
          const loose = [...root.querySelectorAll(DRAWN)].filter((el) => !el.closest('[data-layer="sky"]') && !el.closest("[data-clip], [data-box]"));
          expect(loose.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
        });

        it("every placed piece stays clear of the words and the daylight strip on the narrowest and widest card", () => {
          const root = scene(key, size);
          const zones = textZones(key, size);
          const placed = [...root.querySelectorAll<SVGGElement>("[data-box]")].filter((el) => !el.closest("[data-clip]"));
          expect(placed.length).toBeGreaterThan(0);
          for (const cardPx of [CARD_WIDTHS[size].narrowest, CARD_WIDTHS[size].widest]) {
            const width = canvasUnits(size, cardPx);
            for (const el of placed) {
              const anchor = el.closest("svg[data-layer]")!.getAttribute("data-anchor");
              for (const part of el.getAttribute("data-box")!.split(";")) {
                const [x, y, , h] = part.split(" ").map(Number);
                const left = anchor === "right" ? width - 240 + x : x;
                const where = `${el.closest("svg[data-layer]")!.getAttribute("data-layer")} box ${part} at ${cardPx}px`;
                expect(y, where).toBeGreaterThanOrEqual(0);
                expect(y + h, where).toBeLessThanOrEqual(STRIP_TOP);
                expect(left, where).toBeGreaterThanOrEqual(wordsReach(zones, y, y + h));
              }
            }
          }
        });
      });
    }
  }
});
