/**
 * How far the day strip should scroll so a slot is fully visible.
 * PLAN.md §4.2: scrollLeft maths, never scrollIntoView (which would also
 * scroll ancestor containers we don't want moved).
 */
export function stripScrollLeft({
  slotLeft,
  slotWidth,
  viewportWidth,
  scrollLeft,
  pad = 8,
}: {
  slotLeft: number;
  slotWidth: number;
  viewportWidth: number;
  scrollLeft: number;
  pad?: number;
}): number {
  if (slotLeft < scrollLeft) return Math.max(0, slotLeft - pad);
  if (slotLeft + slotWidth > scrollLeft + viewportWidth) return slotLeft + slotWidth - viewportWidth + pad;
  return scrollLeft;
}
