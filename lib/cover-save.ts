import "server-only";
import { getStorage, generateKey } from "@/lib/storage";
import { reportError } from "@/lib/error-sink";
import { readImageSize } from "@/lib/image-size";
import { coverSmallKeyFor } from "@/lib/cover";

/** The small copy is a browser-made ~480px WebP (lib/image-compress.ts compressCoverSmall); anything bigger isn't one. */
export const MAX_SMALL_COVER_BYTES = 512 * 1024;

/** "RIFF" at bytes 0–3 and "WEBP" at bytes 8–11: the WebP container header. */
export function isWebpBytes(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP";
}

/**
 * Validate a cover request's "small copy" FormData entry and return its
 * bytes, or null when there isn't a usable one. The declared type is the
 * client's word; the small copy is accepted only when its bytes really are a
 * WebP (RIFF….WEBP), it's a non-empty File, and it's at or under
 * MAX_SMALL_COVER_BYTES.
 */
export async function acceptSmallCover(entry: unknown): Promise<Buffer | null> {
  if (!(entry instanceof File)) return null;
  if (entry.type !== "image/webp" || entry.size <= 0 || entry.size > MAX_SMALL_COVER_BYTES) return null;
  const bytes = Buffer.from(await entry.arrayBuffer());
  return isWebpBytes(bytes) ? bytes : null;
}

/** The file extension a cover's blob key is saved under, by declared mime. */
export function coverExt(mime: string): "png" | "webp" | "gif" | "jpg" {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
}

/**
 * Spec F: width/height, read from the image's header bytes — never a full
 * decode. Null when the format/bytes can't be parsed; callers fall back to
 * their own detection.
 */
export function coverAspectOf(bytes: Buffer): number | null {
  const size = readImageSize(bytes);
  return size ? size.width / size.height : null;
}

/**
 * Save a cover's large blob (throws on failure — nothing has been written to
 * the Trip row yet, so the caller can bail out cleanly) and, best-effort, its
 * small WebP copy at `coverSmallKeyFor(key)`. A failed small save is reported
 * (never thrown) and comes back as a null smallKey — spec 2026-10-06 §H: the
 * small copy is best-effort, so without it the route just serves the large
 * one.
 */
export async function saveCoverFiles(opts: {
  tripId: string;
  bytes: Buffer;
  mime: string;
  small: Buffer | null;
  route: string;
}): Promise<{ key: string; smallKey: string | null }> {
  const { tripId, bytes, mime, small, route } = opts;
  const storage = getStorage();
  const key = generateKey({ trip: tripId }, crypto.randomUUID(), `cover.${coverExt(mime)}`);

  await storage.save(key, bytes, mime);

  let smallKey: string | null = null;
  if (small) {
    const k = coverSmallKeyFor(key);
    try {
      await storage.save(k, small, "image/webp");
      smallKey = k;
    } catch (err) {
      await reportError(err, { route, source: "server" });
    }
  }

  return { key, smallKey };
}
