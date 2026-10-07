/**
 * A Share link's public URL (CONTEXT.md "Share link"). Absolute in the
 * browser, path-only on the server. Kept free of React and server imports so
 * the Trip header's Share chooser doesn't pull in the Settings panel.
 */
export function shareUrl(token: string): string {
  const path = `/share/${token}`;
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
}
