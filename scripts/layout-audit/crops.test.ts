import { describe, expect, it } from "vitest";
import { paddedCrop, pngSize } from "./crops";

describe("paddedCrop", () => {
  it("pads and clamps to the image", () =>
    expect(paddedCrop({ x: 10, y: 10, w: 100, h: 50 }, { w: 400, h: 400 })).toEqual({ x: 0, y: 0, w: 158, h: 108, scale: 1 }));
  it("scales wide crops down to maxW", () => {
    const c = paddedCrop({ x: 0, y: 0, w: 2560, h: 400 }, { w: 2560, h: 2000 });
    expect(c.w).toBe(2560);
    expect(c.scale).toBeCloseTo(1200 / 2560);
  });
});

describe("pngSize", () => {
  it("reads width/height from the IHDR header", () => {
    const buf = Buffer.alloc(24);
    buf.writeUInt32BE(390, 16);
    buf.writeUInt32BE(1600, 20);
    expect(pngSize(buf)).toEqual({ w: 390, h: 1600 });
  });
});
