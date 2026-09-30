/** How long a jumped-to card's ring stays on; mirrors the `tp-stop-highlight` animation in app/globals.css. */
export const HIGHLIGHT_MS = 1600;

/**
 * Scrolls the window, not the nearest scroller, so the sticky rail and the
 * day strip's own overflow never swallow the jump (PLAN.md §6.3 replaces
 * `scrollIntoView`).
 */
export function scrollToId(id: string, opts: { reduced?: boolean; offset?: number } = {}): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - (opts.offset ?? 24);
  window.scrollTo({ top, behavior: opts.reduced ? "auto" : "smooth" });
}

export function ringId(id: string, ms: number = HIGHLIGHT_MS): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute("data-highlight", "true");
  window.setTimeout(() => el.removeAttribute("data-highlight"), ms);
}
