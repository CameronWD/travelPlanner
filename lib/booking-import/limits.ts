/**
 * Booking import limits and the file-type check (spec 2026-10-14 "Input").
 * Zod-free and server-free: the sheet checks a file before sending it, and
 * the server checks it again before any API call.
 */
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { BookingImageType } from "./types";

/** Same ceiling as validateUpload (lib/storage.ts). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
export const MAX_IMPORTS_PER_HOUR = 20;
/** An email body is cut here before it is sent (a long thread costs tokens, not accuracy). */
export const MAX_EML_TEXT_CHARS = 60_000;
/** PDFs and images taken from one email. */
export const MAX_EML_ATTACHMENTS = 5;

export const BOOKING_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.eml,application/pdf,image/png,image/jpeg,image/webp,image/gif,message/rfc822";

export type BookingFileCheck =
  | { ok: true; kind: "pdf" }
  | { ok: true; kind: "image"; mediaType: BookingImageType }
  | { ok: true; kind: "eml" }
  | { ok: false; message: string };

const IMAGE_BY_EXT: Record<string, BookingImageType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function imageTypeOf(mime: string): BookingImageType | null {
  const m = mime.toLowerCase();
  return m === "image/png" || m === "image/jpeg" || m === "image/webp" || m === "image/gif" ? m : null;
}

export function checkBookingFile(file: { name: string; type: string; size: number }): BookingFileCheck {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();
  if (ext === "heic" || ext === "heif" || type === "image/heic" || type === "image/heif") return { ok: false, message: M.heic };
  if (ext === "msg" || type === "application/vnd.ms-outlook") return { ok: false, message: M.msg };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: M.tooBig };
  if (ext === "pdf" || type === "application/pdf") return { ok: true, kind: "pdf" };
  const image = IMAGE_BY_EXT[ext] ?? imageTypeOf(type);
  if (image) return { ok: true, kind: "image", mediaType: image };
  if (ext === "eml" || type === "message/rfc822") return { ok: true, kind: "eml" };
  return { ok: false, message: M.wrongType };
}
