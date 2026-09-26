/**
 * How many collapsed-day-row titles fit in `widthPx` before showing "+N"
 * (task 3, 2026-09-26 beta feedback design lot). Pure and layout-free: the
 * component measures the real preview span via ResizeObserver and hands the
 * width in here — this just does the greedy arithmetic.
 *
 * Each title costs roughly `charPx` per character plus `gapPx` for the row
 * gap; while a later title would still be hidden, `overflowPx` is reserved
 * for the "+N" span so it doesn't get squeezed out once revealed. The first
 * title always shows, even at zero width — a bare "+N" row with nothing
 * named is worse than a truncated one.
 */
export function fitTitles(
  titles: string[],
  widthPx: number,
  opts?: { charPx?: number; gapPx?: number; overflowPx?: number },
): { shown: number } {
  const charPx = opts?.charPx ?? 6.5;
  const gapPx = opts?.gapPx ?? 8;
  const overflowPx = opts?.overflowPx ?? 32;

  if (titles.length === 0) return { shown: 0 };

  let used = 0;
  let shown = 0;
  for (let i = 0; i < titles.length; i++) {
    const titleWidth = titles[i].length * charPx + gapPx;
    const hasRemainder = i < titles.length - 1;
    const reserve = hasRemainder ? overflowPx : 0;
    if (shown === 0 || used + titleWidth + reserve <= widthPx) {
      used += titleWidth;
      shown++;
    } else {
      break;
    }
  }
  return { shown };
}
