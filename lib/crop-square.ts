/** Output side, in pixels, for a cropped Profile photo. */
const OUTPUT_SIZE = 512;

/**
 * Square centre-crop `file` to 512×512 in the browser, via a canvas, before
 * upload — the circular Profile photo avatar (Task 2) always gets a square
 * source instead of guessing which edge of a rectangular photo to clip.
 *
 * Any failure (decode error, unsupported format, no canvas support) falls
 * back to the original file — this never throws and never blocks an upload;
 * the server's `validateUpload` remains the backstop.
 */
export async function cropSquare(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type || "image/png"),
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type || file.type });
  } catch {
    return file;
  }
}
