export const ATTACHMENT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
] as const;

const ALLOWED = new Set<string>(ATTACHMENT_MIMES);

export function isAttachmentMime(mime: string): boolean {
  return ALLOWED.has(mime);
}

export function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return "File";
}
