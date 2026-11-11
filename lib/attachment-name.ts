/** The name a file is shown by: its title when set, else its filename (CONTEXT.md "Attachment"). */
export function attachmentName(att: { filename: string; title?: string | null }): string {
  const title = att.title?.trim();
  return title ? title : att.filename;
}

export const ATTACHMENT_TITLE_MAX = 120;

export function normalizeAttachmentTitle(
  raw: unknown,
): { ok: true; title: string | null } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: true, title: null };
  const trimmed = raw.trim();
  if (trimmed.length > ATTACHMENT_TITLE_MAX) {
    return { ok: false, error: `Title must be ${ATTACHMENT_TITLE_MAX} characters or fewer.` };
  }
  return { ok: true, title: trimmed.length === 0 ? null : trimmed };
}
