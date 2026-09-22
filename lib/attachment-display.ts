/**
 * Whether the browser will render this attachment in place rather than
 * downloading it.
 *
 * This single predicate decides two things that must never disagree:
 *
 *   1. the `Content-Disposition` the serve route sends
 *      (`inline` vs `attachment`), and
 *   2. whether an attachment link opens in a new tab.
 *
 * If they drift, a file the browser *downloads* gets `target="_blank"` and
 * the Traveller is handed a blank tab that never navigates anywhere. Keeping
 * both callers on one expression is the entire reason this module exists —
 * do not re-derive the condition at a call site.
 */
export function rendersInline(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}
