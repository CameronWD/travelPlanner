import { describe, it, expect } from "vitest";
import { readImageSize } from "./image-size";

/** Build a minimal valid PNG header: signature + IHDR chunk with given dims. */
function pngFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  // 8-byte PNG signature.
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // Chunk length (13, big-endian) at offset 8.
  view.setUint32(8, 13, false);
  // Chunk type "IHDR" at offset 12.
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width, height (big-endian) at offsets 16, 20.
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  // Remaining IHDR fields (bit depth, color type, compression, filter,
  // interlace) + CRC placeholder — values don't matter for parsing.
  return bytes;
}

/** Build a minimal GIF header with the given logical screen dimensions. */
function gifFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  const view = new DataView(bytes.buffer);
  bytes.set(
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // "GIF89a"
    0,
  );
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** Build a WebP VP8X (extended) fixture with the given canvas dimensions. */
function webpVp8xFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 22, true); // RIFF size (not validated by the parser)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  view.setUint32(16, 10, true); // chunk size
  // data[0] = flags (unused), data[1..3] reserved, then width-1/height-1 as
  // 24-bit little-endian values at absolute bytes 24-26 / 27-29.
  const w1 = width - 1;
  const h1 = height - 1;
  bytes[24] = w1 & 0xff;
  bytes[25] = (w1 >> 8) & 0xff;
  bytes[26] = (w1 >> 16) & 0xff;
  bytes[27] = h1 & 0xff;
  bytes[28] = (h1 >> 8) & 0xff;
  bytes[29] = (h1 >> 16) & 0xff;
  return bytes;
}

/** Build a minimal JPEG: SOI, an APP0 (JFIF) segment, then an SOF0 segment. */
function jpegFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(2 + 2 + 2 + 14 + 2 + 2 + 15);
  const view = new DataView(bytes.buffer);
  let o = 0;
  bytes[o++] = 0xff;
  bytes[o++] = 0xd8; // SOI

  // APP0 (JFIF) segment: length 16 (2-byte length field + 14 bytes payload).
  bytes[o++] = 0xff;
  bytes[o++] = 0xe0;
  view.setUint16(o, 16, false);
  o += 2;
  const jfif = "JFIF\0";
  for (let i = 0; i < jfif.length; i++) bytes[o + i] = jfif.charCodeAt(i);
  o += 14; // skip rest of the 14-byte APP0 payload (version/units/density/thumb)

  // SOF0 segment: length 17 (2 + 1 precision + 2 height + 2 width + 1 numComp + 9 component bytes).
  bytes[o++] = 0xff;
  bytes[o++] = 0xc0;
  view.setUint16(o, 17, false);
  o += 2;
  bytes[o++] = 0x08; // precision
  view.setUint16(o, height, false);
  o += 2;
  view.setUint16(o, width, false);
  o += 2;
  bytes[o++] = 0x03; // 3 components
  // 9 bytes of component data — values unused by the parser.

  return bytes;
}

describe("readImageSize", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    expect(readImageSize(pngFixture(300, 400))).toEqual({
      width: 300,
      height: 400,
    });
  });

  it("reads GIF89a logical screen dimensions", () => {
    expect(readImageSize(gifFixture(10, 20))).toEqual({
      width: 10,
      height: 20,
    });
  });

  it("reads WebP VP8X canvas dimensions", () => {
    expect(readImageSize(webpVp8xFixture(1200, 1600))).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("reads JPEG SOF0 dimensions after skipping an APP0 segment", () => {
    expect(readImageSize(jpegFixture(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("returns null for random bytes", () => {
    const random = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(readImageSize(random)).toBeNull();
  });

  it("returns null for a truncated PNG", () => {
    const truncated = pngFixture(300, 400).slice(0, 18);
    expect(readImageSize(truncated)).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(readImageSize(new Uint8Array(0))).toBeNull();
  });

  it("returns null for a truncated JPEG (cut mid-SOF0 segment)", () => {
    const truncated = jpegFixture(640, 480).slice(0, 22);
    expect(readImageSize(truncated)).toBeNull();
  });

  it("returns null for a truncated GIF", () => {
    const truncated = gifFixture(10, 20).slice(0, 7);
    expect(readImageSize(truncated)).toBeNull();
  });

  it("returns null for a truncated WebP VP8X", () => {
    const truncated = webpVp8xFixture(1200, 1600).slice(0, 25);
    expect(readImageSize(truncated)).toBeNull();
  });
});
