import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { STARTUP_SIZES, startupImageName, startupImages } from "./startup-images";

const SPLASH = join(process.cwd(), "public", "splash");

describe("startup image sizes", () => {
  it("lists 11 distinct sizes", () => {
    expect(STARTUP_SIZES).toHaveLength(11);
    const keys = STARTUP_SIZES.map((s) => startupImageName(s, "light"));
    expect(new Set(keys).size).toBe(11);
  });

  it("names every file by its CSS size and ratio", () => {
    expect(startupImageName({ width: 402, height: 874, ratio: 3, safeTop: 62 }, "dark")).toBe("iphone-402x874@3x-dark.png");
  });
});

describe("startup image media queries", () => {
  const images = startupImages();

  it("has a light and a dark entry for every size", () => {
    expect(images).toHaveLength(22);
    for (const size of STARTUP_SIZES) {
      for (const theme of ["light", "dark"] as const) {
        const hits = images.filter((i) => i.url === `/splash/${startupImageName(size, theme)}`);
        expect(hits).toHaveLength(1);
        expect(hits[0].media).toContain(`(prefers-color-scheme: ${theme})`);
      }
    }
  });

  it("pins the device exactly and names exactly one colour scheme", () => {
    for (const { media } of images) {
      expect(media).toMatch(/\(device-width: \d+px\)/);
      expect(media).toMatch(/\(device-height: \d+px\)/);
      expect(media).toMatch(/\(-webkit-device-pixel-ratio: \d\)/);
      expect(media).toContain("(orientation: portrait)");
      expect(media.match(/prefers-color-scheme/g)).toHaveLength(1);
    }
  });

  it("points at files that exist, with the pixel size the name promises", () => {
    for (const size of STARTUP_SIZES) {
      for (const theme of ["light", "dark"] as const) {
        const file = join(SPLASH, startupImageName(size, theme));
        expect(existsSync(file), file).toBe(true);
        const png = readFileSync(file);
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect(png.readUInt32BE(16)).toBe(size.width * size.ratio);
        expect(png.readUInt32BE(20)).toBe(size.height * size.ratio);
      }
    }
  });
});
