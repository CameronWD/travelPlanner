/** Rounded whole-MB display for a byte count, e.g. the Files page's "Used X of 500 MB". */
export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
