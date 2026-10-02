/** The name a file is shown by: its title when set, else its filename (CONTEXT.md "Attachment"). */
export function attachmentName(att: { filename: string; title?: string | null }): string {
  const title = att.title?.trim();
  return title ? title : att.filename;
}
