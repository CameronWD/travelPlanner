import { describe, it, expect } from "vitest";
import { gradientPng } from "./cover-image";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("gradientPng", () => {
  it("returns a buffer that begins with the PNG magic number", () => {
    const png = gradientPng("#0ea5e9", "#6366f1", 8, 8);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
  it("encodes the requested dimensions in the IHDR chunk", () => {
    const png = gradientPng("#000000", "#ffffff", 12, 7);
    // IHDR width/height are big-endian uint32 at byte offsets 16 and 20.
    expect(png.readUInt32BE(16)).toBe(12);
    expect(png.readUInt32BE(20)).toBe(7);
  });
});
