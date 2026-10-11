/** Rounded whole-MB display for a byte count, e.g. the Files page's "Used X of 500 MB". */
export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** A file's size for listing it: bytes under 1 KB, whole KB under 1 MB, else MB to one decimal (e.g. "200 KB", "3.4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
