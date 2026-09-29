/** Pure carousel arithmetic (ADR 0065), testable without layout. */

export const DAY_GLIDE_MS = 220;

/** Ease-out cubic: the app's day-motion feel, near enough cubic-bezier(0.32, 0.72, 0, 1). */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** The panel index a scroller is resting on, or null while it sits between two. */
export function settledPanel(scrollLeft: number, panelWidth: number, tolerancePx = 1): number | null {
  if (panelWidth <= 0) return null;
  const idx = Math.round(scrollLeft / panelWidth);
  return Math.abs(scrollLeft - idx * panelWidth) <= tolerancePx ? idx : null;
}

/** How far the body has moved from the day shown, in panels: −1 (previous fully in view) … 0 … +1 (next). */
export function panelProgress(scrollLeft: number, shownIndex: number, panelWidth: number): number {
  if (panelWidth <= 0) return 0;
  return (scrollLeft - shownIndex * panelWidth) / panelWidth;
}
