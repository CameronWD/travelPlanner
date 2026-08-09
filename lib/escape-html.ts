/**
 * Escape HTML-significant characters in user-controlled text.
 *
 * Leaflet popups are built as raw HTML strings (see the map components in
 * `components/trip/*-map.tsx` and `components/globe/globe-map.tsx`), so every
 * user-entered value interpolated into one MUST pass through here. This lived
 * as four identical private copies before; keep it as the single source.
 */
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
