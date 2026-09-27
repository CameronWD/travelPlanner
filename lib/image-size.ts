/**
 * Pure, dependency-free image dimension reader.
 *
 * Reads just enough of an image's header bytes to recover its pixel
 * dimensions, without decoding the image itself. Used for the cover aspect
 * ratio (deriving CSS `aspect-ratio` before the browser has decoded the
 * image), so it needs to work on a prefix of bytes fetched from storage.
 *
 * Supports:
 *   - PNG  (IHDR chunk)
 *   - JPEG (SOFn marker segments)
 *   - GIF  (logical screen descriptor)
 *   - WebP (VP8, VP8L, VP8X chunks)
 *
 * Returns null for anything else, and for truncated/malformed input — this
 * never throws.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** JPEG SOFn marker bytes that carry a frame header (excludes DHT/JPG/DAC). */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function readPng(view: DataView, bytes: Uint8Array): ImageSize | null {
  // 8-byte signature, then a 4-byte length + 4-byte "IHDR" type, then the
  // IHDR body: 4-byte width, 4-byte height (both big-endian).
  if (bytes.length < 24) return null;
  if (!asciiAt(bytes, 12, "IHDR")) return null;
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return { width, height };
}

function readGif(view: DataView, bytes: Uint8Array): ImageSize | null {
  // "GIF87a"/"GIF89a" (6 bytes), then logical screen width/height, 2 bytes
  // each, little-endian.
  if (bytes.length < 10) return null;
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  return { width, height };
}

function readWebp(view: DataView, bytes: Uint8Array): ImageSize | null {
  // "RIFF" + 4-byte size + "WEBP" (12 bytes), then the first chunk:
  // 4-byte fourCC + 4-byte little-endian chunk size, then chunk data at 20.
  if (bytes.length < 20) return null;
  const fourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (fourCC === "VP8X") {
    // Chunk data: 1 byte flags, 3 bytes reserved, then 24-bit little-endian
    // width-1 and height-1.
    if (bytes.length < 30) return null;
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return { width, height };
  }

  if (fourCC === "VP8 ") {
    // Lossy bitstream: 3-byte frame tag, 3-byte start code (0x9d 0x01 0x2a),
    // then 14-bit width/height (top 2 bits of each 16-bit LE field are a
    // scale factor, masked off).
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { width, height };
  }

  if (fourCC === "VP8L") {
    // Lossless bitstream: 1-byte signature (0x2f), then a 4-byte
    // little-endian bitfield: 14-bit width-1, 14-bit height-1, 1-bit alpha,
    // 3-bit version.
    if (bytes.length < 25) return null;
    if (bytes[20] !== 0x2f) return null;
    const bits =
      (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>>
      0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

function readJpeg(view: DataView, bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) return null; // not a marker — malformed

    let marker = bytes[offset + 1];
    offset += 2;
    // Fill bytes: a marker segment may be preceded by extra 0xff bytes.
    while (marker === 0xff) {
      if (offset >= bytes.length) return null;
      marker = bytes[offset];
      offset += 1;
    }

    // SOI, EOI, and RSTn markers carry no length field.
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;

    if (offset + 2 > bytes.length) return null;
    const segmentLength = view.getUint16(offset, false);

    if (JPEG_SOF_MARKERS.has(marker)) {
      // Segment body: 2-byte length, 1-byte precision, 2-byte height,
      // 2-byte width (all big-endian for the numeric fields).
      if (offset + 7 > bytes.length) return null;
      const height = view.getUint16(offset + 3, false);
      const width = view.getUint16(offset + 5, false);
      return { width, height };
    }

    if (segmentLength < 2) return null; // malformed — would not advance
    offset += segmentLength;
  }

  return null;
}

/**
 * Parse an image's pixel dimensions from its header bytes. Pure, bounds
 * checked, and side-effect free — never throws. Returns null for an
 * unsupported format or input truncated before the dimensions can be read.
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  try {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );

    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return readPng(view, bytes);
    }

    if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) {
      return readGif(view, bytes);
    }

    if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
      return readWebp(view, bytes);
    }

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return readJpeg(view, bytes);
    }

    return null;
  } catch {
    return null;
  }
}
