/**
 * `get_attachment`'s loader (spec 2026-10-11 Task 4): one Attachment's
 * contents for the Claude connection. Images come back as image content (up
 * to MAX_IMAGE_BYTES — Vercel's ~4.5 MB response cap, less base64's third);
 * PDFs come back as their extracted text (up to MAX_PDF_BYTES, text capped at
 * MAX_TEXT_CHARS with a truncation note). Every other type returns its
 * details and says it can't be read here.
 *
 * Access goes through the Attachment's own `tripId`: a missing row and a
 * Globe-owned one (`tripId` null) both read as not found, as does a file on a
 * What-if plan (Fork) owner (Review Focus 4). A file whose owner was deleted
 * is still readable — it still belongs to the trip. Bytes come from
 * `storageKey` only, like the app's own serve route
 * (`lib/attachment-serve.ts`): `url` is just the public serve path, so a row
 * with no key, or a key whose object is gone, returns a clear message rather
 * than throwing (Review Focus 5).
 */
import { notFound } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { getStorage } from "@/lib/storage";
import { formatBytes } from "@/lib/format-bytes";
import type { TargetType } from "@/lib/enum-values";
import type { ToolContent } from "../run-tool";
import { OWNER_KIND_BY_TARGET_TYPE } from "./attachments";
import { loadOwners, ownerKey } from "./owners";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;

const textContent = (text: string): ToolContent[] => [{ type: "text", text }];

export async function loadAttachmentContentForMcp(attachmentId: string): Promise<ToolContent[]> {
  const a = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      tripId: true,
      mime: true,
      size: true,
      storageKey: true,
      title: true,
      filename: true,
      targetType: true,
      targetId: true,
    },
  });
  // Globe files and missing rows look the same.
  if (!a || !a.tripId) notFound();
  await requireTripAccess(a.tripId);

  // Only the four plan-entity kinds can be on a What-if plan; TRIP / JOURNAL / … can't.
  const kind = OWNER_KIND_BY_TARGET_TYPE[a.targetType as TargetType];
  if (kind && a.targetId) {
    const { forkOwned } = await loadOwners(a.tripId, [{ kind, id: a.targetId }]);
    if (forkOwned.has(ownerKey(kind, a.targetId))) notFound();
  }

  const name = a.title ?? a.filename;
  const header = `${name} (${a.filename}, ${a.mime}, ${formatBytes(a.size)})`;
  const isPdf = a.mime === "application/pdf";
  const isImage = a.mime.startsWith("image/");

  if (!isPdf && !isImage) return textContent(`${header}\nThis file type can't be read here — open it in the app.`);
  const imageTooLarge = textContent(`${header}\nThis image is too large to send here (over 3 MB) — open it in the app.`);
  if (isImage && a.size > MAX_IMAGE_BYTES) return imageTooLarge;
  if (isPdf && a.size > MAX_PDF_BYTES) {
    return textContent(`${header}\nThis PDF is too large to read here (over 10 MB) — open it in the app.`);
  }

  const bytes = a.storageKey ? await getStorage().read(a.storageKey) : null;
  if (!bytes) {
    return textContent(`${header}\nThe file's contents couldn't be found in storage — try opening it in the app.`);
  }

  if (isImage) {
    // The recorded size is the client's claim at upload; the bytes are the truth.
    if (bytes.length > MAX_IMAGE_BYTES) return imageTooLarge;
    return [
      { type: "text", text: header },
      { type: "image", data: bytes.toString("base64"), mimeType: a.mime },
    ];
  }

  let totalPages: number;
  let text: string | string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    ({ totalPages, text } = await extractText(pdf, { mergePages: true }));
  } catch {
    // Malformed or password-protected: a property of the file, not a fault to report.
    return textContent(`${header}\nThis PDF couldn't be read here — open it in the app.`);
  }
  const body = (Array.isArray(text) ? text.join("\n") : text).trim();
  if (!body) {
    return textContent(`${header}\nThis PDF is a scan with no readable text — open it in the app to see it.`);
  }
  const truncated = body.length > MAX_TEXT_CHARS;
  const shown = truncated ? body.slice(0, MAX_TEXT_CHARS) : body;
  const note = truncated ? `\n\n[Truncated: showing the first ${MAX_TEXT_CHARS.toLocaleString("en-AU")} characters.]` : "";
  return textContent(`${header} · ${totalPages} page${totalPages === 1 ? "" : "s"}\n\n${shown}${note}`);
}
