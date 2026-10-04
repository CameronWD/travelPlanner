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

/**
 * Runs `fn` once a smooth window scroll has settled: on `scrollend`, after
 * 600ms where the browser never fires it (no scroll was needed, or an older
 * Safari), or at once under reduced motion (the scroll was instant).
 */
export function whenScrollSettles(reduced: boolean, fn: () => void): void {
  if (reduced) {
    fn();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    window.clearTimeout(timer);
    fn();
  };
  window.addEventListener("scrollend", finish);
  const timer = window.setTimeout(finish, 600);
}
