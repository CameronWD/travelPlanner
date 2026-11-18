/**
 * Day strip scroll rules. Pure so they can be tested without layout.
 *
 * Wide screen (lg+, spec 2026-11-18 D2): the selected day holds the centre,
 * under a fixed frame, and the strip slides beneath it in one glide. A look
 * around by hand glides back to it after a quiet moment.
 *
 * Phone (< lg, ADR 0065): the selected day sits in the centre of the strip's
 * viewport. The scroller's end padding lets the first and last day centre
 * too, so the far end never needs clamping; 0 is clamped for safety.
 */
export const STRIP_CHIP_GAP_PX = 8;
export const STRIP_GLIDE_WIDE_MS = 250;
export const STRIP_RETURN_AFTER_MS = 1500;

export interface StripScrollInput {
  scrollLeft: number;
  viewportWidth: number;
  contentWidth: number;
  /** The selected chip's left edge within the scroll content. */
  chipLeft: number;
  chipWidth: number;
  gap: number;
}

// Assumes the strip's `lg:px-[calc(50%-1.75rem)]`: (viewportWidth - chipWidth) / 2 at each end.
export function centredScrollLeft(index: number, chipWidth: number, gap: number, viewportWidth: number): number {
  const chipCentre = (viewportWidth - chipWidth) / 2 + index * (chipWidth + gap) + chipWidth / 2;
  return Math.max(0, chipCentre - viewportWidth / 2);
}

export function phoneStripScroll(i: StripScrollInput): number {
  return Math.max(0, i.chipLeft - (i.viewportWidth - i.chipWidth) / 2);
}
