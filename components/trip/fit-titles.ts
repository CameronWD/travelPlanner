/**
 * How many collapsed-day-row titles fit in `widthPx` before showing "+N"
 * (task 3, 2026-09-26 beta feedback design lot; reserve formula corrected in
 * review). Pure and layout-free: the component measures the real preview
 * span via ResizeObserver and hands the width in here — this just does the
 * arithmetic.
 *
 * Each title costs roughly `charPx` per character; a `gapPx` row gap sits
 * between every child, "+N" included. First: if every title plus its gaps
 * (no "+N" needed) fits outright, show them all. Otherwise greedily add
 * titles while what's shown so far, PLUS a trailing "+N" (its own gap and
 * `overflowPx` width) would still fit — so the badge is never squeezed out
 * once revealed. The first title always shows, even at zero width — a bare
 * "+N" row with nothing named is worse than a truncated one.
 */
export function fitTitles(
  titles: string[],
  widthPx: number,
  opts?: { charPx?: number; gapPx?: number; overflowPx?: number; itemPx?: number },
): { shown: number } {
  const charPx = opts?.charPx ?? 6.5;
  const gapPx = opts?.gapPx ?? 8;
  const overflowPx = opts?.overflowPx ?? 32;
  const itemPx = opts?.itemPx ?? 0;

  const n = titles.length;
  if (n === 0) return { shown: 0 };

  const widths = titles.map((t) => t.length * charPx + itemPx);
  const totalAll = widths.reduce((sum, w) => sum + w, 0) + gapPx * (n - 1);
  if (totalAll <= widthPx) return { shown: n };

  let sumSoFar = 0;
  let shown = 0;
  for (let i = 0; i < n; i++) {
    const candidateSum = sumSoFar + widths[i];
    const candidateShown = shown + 1;
    // What's shown so far, its internal gaps, plus "+N"'s own leading gap
    // and width — the badge must fit beside whatever titles are revealed.
    const needed = candidateSum + gapPx * candidateShown + overflowPx;
    if (shown === 0 || needed <= widthPx) {
      sumSoFar = candidateSum;
      shown = candidateShown;
    } else {
      break;
    }
  }
  return { shown };
}

export function fitRows(
  titles: string[],
  widthPx: number,
  rows: number,
  opts?: { charPx?: number; gapPx?: number; overflowPx?: number; itemPx?: number; maxTextPx?: number },
): { shown: number } {
  const charPx = opts?.charPx ?? 6.5;
  const gapPx = opts?.gapPx ?? 8;
  const overflowPx = opts?.overflowPx ?? 32;
  const itemPx = opts?.itemPx ?? 0;
  const maxTextPx = opts?.maxTextPx ?? Infinity;

  const n = titles.length;
  if (n === 0) return { shown: 0 };

  const maxRows = Math.max(1, rows);
  const widths = titles.map((t) => Math.min(t.length * charPx, maxTextPx) + itemPx);

  const place = (reserve: number): number => {
    let row = 1;
    let used = 0;
    for (let i = 0; i < n; i++) {
      let nextUsed = used === 0 ? widths[i] : used + gapPx + widths[i];
      let nextRow = row;
      if (used > 0 && nextUsed > widthPx) {
        nextRow = row + 1;
        nextUsed = widths[i];
      }
      if (nextRow > maxRows) return i;
      if (nextRow === maxRows && reserve > 0 && nextUsed + gapPx + reserve > widthPx) return i;
      row = nextRow;
      used = nextUsed;
    }
    return n;
  };

  if (place(0) === n) return { shown: n };
  return { shown: Math.max(1, place(overflowPx)) };
}
