/**
 * Registry for the sidebar's inline search field, so ⌘K / Ctrl+K can focus
 * it where it is visible (≥1280px) instead of opening the full-screen
 * palette. Plain module state: at most a couple of fields are ever mounted.
 */

const SIDEBAR_SEARCH_QUERY = "(min-width: 1280px)";

const fields = new Set<HTMLInputElement>();

export function registerSearchField(el: HTMLInputElement): () => void {
  fields.add(el);
  return () => {
    fields.delete(el);
  };
}

/**
 * Focuses the mounted sidebar field when the sidebar is on screen.
 * Returns false when there is none to focus (Dock / phone widths), so the
 * caller can fall back to the palette dialog.
 */
export function focusSearchField(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!window.matchMedia(SIDEBAR_SEARCH_QUERY).matches) return false;
  const connected = [...fields].filter((el) => el.isConnected);
  const target = connected[connected.length - 1];
  if (!target) return false;
  target.focus();
  return true;
}
