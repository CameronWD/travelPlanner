import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
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
  it("produces a structurally valid PNG (chunk framing + inflatable IDAT with a filter byte)", () => {
    const png = gradientPng("#ff0000", "#0000ff", 4, 4);
    // IHDR chunk immediately follows the 8-byte signature: length 13, type "IHDR".
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    // Final chunk is IEND: length 0, type "IEND".
    const iend = png.subarray(png.length - 12);
    expect(iend.readUInt32BE(0)).toBe(0);
    expect(iend.subarray(4, 8).toString("ascii")).toBe("IEND");
    // IDAT chunk follows IHDR (signature 8 + IHDR chunk 12+13 = 33): inflate it and check the row-0 filter byte.
    const idatStart = 8 + 12 + 13;
    const idatLen = png.readUInt32BE(idatStart);
    expect(png.subarray(idatStart + 4, idatStart + 8).toString("ascii")).toBe("IDAT");
    const idatData = png.subarray(idatStart + 8, idatStart + 8 + idatLen);
    const raw = zlib.inflateSync(idatData);
    expect(raw[0]).toBe(0); // filter byte for the first scanline
  });
});
