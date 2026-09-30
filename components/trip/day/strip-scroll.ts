/**
 * Day strip scroll rules. Pure so they can be tested without layout.
 *
 * Desktop (lg+, spec 2026-09-29 D2): the strip stays where it is unless the
 * selected day — with one day's margin either side — would be out of view,
 * and then moves only as far as needed. A trip whose days all fit never
 * scrolls.
 *
 * Phone (< lg, ADR 0065): the selected day sits in the centre of the strip's
 * viewport. The scroller's end padding lets the first and last day centre
 * too, so the far end never needs clamping; 0 is clamped for safety.
 */
export const STRIP_CHIP_GAP_PX = 8;

export interface StripScrollInput {
  /** Where the strip starts from (desktop: where the Traveller left it). */
  scrollLeft: number;
  viewportWidth: number;
  contentWidth: number;
  /** The selected chip's left edge within the scroll content. */
  chipLeft: number;
  chipWidth: number;
  gap: number;
}

export function desktopStripScroll(i: StripScrollInput): number {
  const maxScroll = Math.max(0, i.contentWidth - i.viewportWidth);
  const stride = i.chipWidth + i.gap;
  const needLeft = i.chipLeft - stride;
  const needRight = i.chipLeft + i.chipWidth + stride;
  let next = i.scrollLeft;
  if (needLeft < next) next = needLeft;
  else if (needRight > next + i.viewportWidth) next = needRight - i.viewportWidth;
  return Math.min(maxScroll, Math.max(0, next));
}

export function phoneStripScroll(i: StripScrollInput): number {
  return Math.max(0, i.chipLeft - (i.viewportWidth - i.chipWidth) / 2);
}
