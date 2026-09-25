import { describe, expect, it } from "vitest";
import { cropOutsideImage, cropsPaths, paddedCrop, pngSize } from "./crops";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngHeader(w: number, h: number): Buffer {
  const buf = Buffer.alloc(24);
  PNG_SIGNATURE.copy(buf, 0);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

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
    expect(pngSize(pngHeader(390, 1600))).toEqual({ w: 390, h: 1600 });
  });

  // Fix round 1: pngSize is fed whatever `screenshot.file` a reviewer wrote
  // down — a wrong path that happens to resolve to some other (non-PNG or
  // truncated) file must throw a clear error rather than read four garbage
  // bytes as a "size".
  it("throws on a buffer too short for a signature + IHDR header", () => {
    expect(() => pngSize(Buffer.alloc(10))).toThrow(/too short/);
  });

  it("throws on a buffer with the wrong signature (not a PNG)", () => {
    const buf = pngHeader(390, 1600);
    buf[0] = 0; // corrupt the PNG signature's first byte
    expect(() => pngSize(buf)).toThrow(/not a PNG/);
  });
});

// Fix round 1: a crop with no overlap with its image must be treated as an
// error, not silently clamped to a 1px sliver by paddedCrop.
describe("cropOutsideImage", () => {
  it("false for a crop inside the image", () =>
    expect(cropOutsideImage({ x: 10, y: 10, w: 100, h: 50 }, { w: 400, h: 400 })).toBe(false));
  it("false for a crop that only partially overlaps", () =>
    expect(cropOutsideImage({ x: -20, y: 10, w: 50, h: 50 }, { w: 400, h: 400 })).toBe(false));
  it("true for a crop entirely to the right of the image", () =>
    expect(cropOutsideImage({ x: 500, y: 10, w: 50, h: 50 }, { w: 400, h: 400 })).toBe(true));
  it("true for a crop entirely below the image", () =>
    expect(cropOutsideImage({ x: 10, y: 500, w: 50, h: 50 }, { w: 400, h: 400 })).toBe(true));
  it("true for a crop entirely above the image (negative y)", () =>
    expect(cropOutsideImage({ x: 10, y: -100, w: 50, h: 50 }, { w: 400, h: 400 })).toBe(true));
});

// Final review: report-data.json was written into any out dir, including one inside the repo.
describe("cropsPaths", () => {
  it("refuses an out dir inside the repo before anything is read or written", () =>
    expect(() => cropsPaths("/work/tmp/audit", "/work")).toThrow(/inside the repo/));
  it("puts findings.json and report-data.json in an out dir outside it", () =>
    expect(cropsPaths("/tmp/layout-audit/x", "/work")).toEqual({
      findingsPath: "/tmp/layout-audit/x/findings.json",
      reportPath: "/tmp/layout-audit/x/report-data.json",
    }));
});
