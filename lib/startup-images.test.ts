import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { STARTUP_SIZES, startupImageName, startupImages } from "./startup-images";

const SPLASH = join(process.cwd(), "public", "splash");

describe("startup image sizes", () => {
  it("lists 11 distinct sizes", () => {
    expect(STARTUP_SIZES).toHaveLength(11);
    expect(new Set(STARTUP_SIZES.map(startupImageName)).size).toBe(11);
  });

  it("names every file by its CSS size and ratio", () => {
    expect(startupImageName({ width: 402, height: 874, ratio: 3, safeTop: 62 })).toBe("iphone-402x874@3x.png");
  });
});

describe("startup image media queries", () => {
  const images = startupImages();

  it("declares one image per size, whatever the phone's colour scheme", () => {
    expect(images).toHaveLength(11);
    for (const size of STARTUP_SIZES) {
      expect(images.filter((i) => i.url === `/splash/${startupImageName(size)}`)).toHaveLength(1);
    }
  });

  it("pins the device exactly and names no colour scheme", () => {
    for (const { media } of images) {
      expect(media).toMatch(/\(device-width: \d+px\)/);
      expect(media).toMatch(/\(device-height: \d+px\)/);
      expect(media).toMatch(/\(-webkit-device-pixel-ratio: \d\)/);
      expect(media).toContain("(orientation: portrait)");
      expect(media).not.toContain("prefers-color-scheme");
    }
  });

  it("points at files that exist, with the pixel size the name promises, and leaves no other file behind", () => {
    for (const size of STARTUP_SIZES) {
      const file = join(SPLASH, startupImageName(size));
      expect(existsSync(file), file).toBe(true);
      const png = readFileSync(file);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(size.width * size.ratio);
      expect(png.readUInt32BE(20)).toBe(size.height * size.ratio);
    }
    expect(readdirSync(SPLASH).sort()).toEqual(images.map((i) => i.url.replace("/splash/", "")).sort());
  });
});
