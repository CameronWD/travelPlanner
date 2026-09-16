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

/**
 * Practical ceiling for a browser upload. Vercel serverless functions reject
 * request bodies over ~4.5 MB regardless of the app's own 10 MB
 * `validateUpload` cap, so a bigger FormData never reaches the server action —
 * it dies at the platform edge as an opaque thrown error. Checking here, after
 * compression, turns that into an accurate message instead of a doomed request.
 */
export const MAX_BROWSER_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Accurate "too big to upload" copy for a file that is about to be sent, or
 * null when it fits. Call AFTER compressImage — an image that reaches here
 * oversize is one the browser could not decode/shrink (e.g. HEIC outside
 * Safari), which is exactly what the image wording explains.
 */
export function oversizeUploadMessage(file: File): string | null {
  if (file.size <= MAX_BROWSER_UPLOAD_BYTES) return null;
  const mb = (file.size / 1024 / 1024).toFixed(1);
  return file.type.startsWith("image/")
    ? `This image is ${mb} MB and couldn't be shrunk in this browser — more than the ~4 MB the app can upload. Try a smaller copy or a JPEG/PNG version.`
    : `This file is ${mb} MB — more than the ~4 MB the app can upload. Try a smaller copy.`;
}
