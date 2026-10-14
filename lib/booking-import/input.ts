import "server-only";
import PostalMime from "postal-mime";
import { MAX_BOOKING_TEXT_CHARS } from "@/lib/ai-limits";
import { htmlToText } from "./html-to-text";
import { checkBookingFile, imageTypeOf, MAX_EML_ATTACHMENTS, MAX_EML_TEXT_CHARS, MAX_PDF_PAGES } from "./limits";
import { BOOKING_IMPORT_MESSAGES as M } from "./messages";
import type { BookingPart } from "./types";

/**
 * Booking import input (spec 2026-10-14 "Input"): checks a file or pasted
 * text before any API call and turns it into the parts sent to Claude. A
 * `.eml` becomes its body text plus any attached PDFs and images. Never logs
 * content or filenames.
 */

export type PreparedInput =
  | { ok: true; source: "pdf" | "image" | "eml" | "text"; parts: BookingPart[] }
  | { ok: false; reason: "invalid_file" | "unreadable"; message: string };

const invalid = (message: string): PreparedInput => ({ ok: false, reason: "invalid_file", message });
const UNREADABLE: PreparedInput = { ok: false, reason: "unreadable", message: M.unreadable };
const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Page count, or null when pdf.js can't open it (encrypted or corrupt). */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    // A copy: pdf.js may transfer (detach) the buffer it is handed.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    return pdf.numPages;
  } catch {
    return null;
  }
}

export async function prepareBookingInput(input: { file: File | null; text: string | null }): Promise<PreparedInput> {
  if (input.file) return prepareFile(input.file);
  const text = (input.text ?? "").trim();
  if (!text) return invalid(M.emptyText);
  if (text.length > MAX_BOOKING_TEXT_CHARS) return invalid(M.textTooLong(text.length));
  return { ok: true, source: "text", parts: [{ type: "text", text }] };
}

async function prepareFile(file: File): Promise<PreparedInput> {
  const check = checkBookingFile({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) return invalid(check.message);
  if (file.size === 0) return UNREADABLE;
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (check.kind === "pdf") {
    const pages = await pdfPageCount(bytes);
    if (!pages) return UNREADABLE;
    if (pages > MAX_PDF_PAGES) return invalid(M.tooManyPages);
    return { ok: true, source: "pdf", parts: [{ type: "pdf", base64: toBase64(bytes) }] };
  }
  if (check.kind === "image") {
    return { ok: true, source: "image", parts: [{ type: "image", mediaType: check.mediaType, base64: toBase64(bytes) }] };
  }
  return prepareEml(bytes);
}

async function prepareEml(bytes: Uint8Array): Promise<PreparedInput> {
  let email: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    email = await PostalMime.parse(bytes, { attachmentEncoding: "base64" });
  } catch {
    return UNREADABLE;
  }

  const parts: BookingPart[] = [];
  for (const a of email.attachments) {
    if (parts.length >= MAX_EML_ATTACHMENTS) break;
    if (a.related || typeof a.content !== "string") continue;
    if (a.mimeType === "application/pdf") {
      const pages = await pdfPageCount(Buffer.from(a.content, "base64"));
      if (!pages) continue; // an encrypted or broken attachment: the body may still carry the booking
      if (pages > MAX_PDF_PAGES) return invalid(M.tooManyPages);
      parts.push({ type: "pdf", base64: a.content });
      continue;
    }
    // Inline images are logos and spacers; only attached images are bookings.
    const image = imageTypeOf(a.mimeType);
    if (image && a.disposition === "attachment") parts.push({ type: "image", mediaType: image, base64: a.content });
  }

  const body = (email.text?.trim() || htmlToText(email.html ?? "")).slice(0, MAX_EML_TEXT_CHARS);
  const header = [
    email.from?.name ? `From: ${email.from.name}` : null,
    email.subject ? `Subject: ${email.subject}` : null,
    email.date ? `Date: ${email.date}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const text = [header, body].filter(Boolean).join("\n\n").trim();
  if (text) parts.push({ type: "text", text });
  return parts.length > 0 ? { ok: true, source: "eml", parts } : UNREADABLE;
}
