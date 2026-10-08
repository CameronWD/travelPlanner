import sharp from "sharp";
import { COVER_SMALL_WIDTH } from "./cover";

/** Spec 2026-10-08 §E: the operator backfill's twin of lib/image-compress.ts compressCoverSmall. */
const QUALITY = 82;

/** True for the "GIF8" magic bytes — an animated-GIF cover gets no small copy (animation would be lost). */
export function isGif(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).toString("latin1") === "GIF8";
}

/**
 * Make a ~480px-wide WebP copy of a cover image, server-side, for the
 * one-off operator backfill (`scripts/backfill-cover-small-run.ts`). The
 * browser-side equivalent is `lib/image-compress.ts`'s `compressCoverSmall`.
 *
 * Returns null for a GIF (`isGif` — animation would be lost) or bytes sharp
 * can't decode at all; never throws. `width`/`height` are the **displayed**
 * (EXIF-rotated) dimensions of the original — orientation >= 5 swaps
 * sharp's raw width/height, matching what every other reader of
 * `coverAspect` expects (see `lib/image-size.ts`). Metadata is read off the
 * same `.rotate()`-chained pipeline used for the resize, rather than a
 * second `sharp(bytes)` instance — `metadata()` reads the source header
 * (orientation, raw width/height) regardless of queued pipeline operations,
 * confirmed against the orientation-6 test below, so this doesn't decode
 * the image twice.
 */
export async function makeCoverSmall(bytes: Buffer): Promise<{ webp: Buffer; width: number; height: number } | null> {
  if (isGif(bytes)) return null;
  try {
    const img = sharp(bytes).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;
    const webp = await img
      .resize({ width: COVER_SMALL_WIDTH, height: COVER_SMALL_WIDTH, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return { webp, width, height };
  } catch {
    return null;
  }
}
