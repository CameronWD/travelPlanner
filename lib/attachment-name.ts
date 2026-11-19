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

export function splitFileName(name: string): { head: string; tail: string } {
  const dot = name.lastIndexOf(".");
  const extLength = dot > 0 ? name.length - dot - 1 : 0;
  const ext = extLength >= 1 && extLength <= 5 ? name.slice(dot) : "";
  const stem = name.slice(0, name.length - ext.length);
  const keep = Math.min(6, stem.length);
  return { head: stem.slice(0, stem.length - keep), tail: stem.slice(stem.length - keep) + ext };
}
