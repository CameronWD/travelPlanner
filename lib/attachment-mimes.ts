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
