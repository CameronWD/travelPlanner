/** Carousel arithmetic and the one width it is done in (ADR 0065), testable without layout. */

export const DAY_GLIDE_MS = 220;

/** Ease-out cubic: the app's day-motion feel, near enough cubic-bezier(0.32, 0.72, 0, 1). */
export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * One panel's width, as the snap points are spaced: fractional on a viewport
 * that is (411.43 px), where the scroller's clientWidth is rounded to an
 * integer and drifts a pixel further from the real snap point with every slot.
 */
export function panelWidth(scroller: Element): number {
  return scroller.firstElementChild?.getBoundingClientRect().width ?? 0;
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

/** Further than one slot from the day in view: its animations pause and nothing in it is reachable. */
export function isFar(index: number, viewIndex: number): boolean {
  return Math.abs(index - viewIndex) > 1;
}

/** The day the body mostly shows: it changes as the body crosses halfway. */
export function nearestIndex(viewIndex: number, progress: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.round(viewIndex + progress)));
}

/** The day the body is moving towards, or null at rest or past either end. */
export function neighbourIndex(viewIndex: number, progress: number, count: number): number | null {
  if (progress === 0) return null;
  const i = progress > 0 ? viewIndex + 1 : viewIndex - 1;
  return i >= 0 && i < count ? i : null;
}

export function lerpHeight(from: number, to: number, progress: number): number {
  return from + (to - from) * Math.min(1, Math.abs(progress));
}
