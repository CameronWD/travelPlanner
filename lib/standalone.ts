/**
 * Whether this page is running as an installed PWA rather than a browser tab.
 *
 * The distinction decides where an **Attachment** opens. ADR 0043 made
 * attachment links same-tab so a Traveller offline can open a cached ticket:
 * inside the installed app, a new tab is handed to an in-app browser the
 * service worker does not control, and the cached bytes are unreachable. In an
 * ordinary browser tab that does not apply — a new same-origin tab is
 * controlled by the *same* service worker — so there the link may open out.
 *
 * Browser-only: returns false during server rendering, which is also the
 * safe default (same-tab, today's behaviour).
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
