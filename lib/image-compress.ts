const MAX_DIMENSION = 2048;
const TARGET_MB = 1;
const QUALITY = 0.82;

/** Replace a filename's extension with `.webp` (or append if none). */
function toWebpName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "image"}.webp`;
}

/**
 * Downscale + compress an image `File` to WebP in the browser before upload.
 *
 * Non-images (PDF/text) and animated GIFs pass through untouched. Any failure
 * (decode error, unsupported format like HEIC, no Worker) falls back to the
 * original file — this never throws and never blocks an upload. The server's
 * `validateUpload` size/mime check remains the backstop.
 *
 * `browser-image-compression` is imported lazily (it touches window/Worker and
 * must not be evaluated during SSR/build).
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file; // PDFs, text, etc.
  if (file.type === "image/gif") return file; // preserve animation

  try {
    const imageCompression = (await import("browser-image-compression")).default;
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: MAX_DIMENSION,
      maxSizeMB: TARGET_MB,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: QUALITY,
    });
    const out = new File([compressed], toWebpName(file.name), { type: "image/webp" });
    return out.size > 0 && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
