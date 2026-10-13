/**
 * How many trip chips fit in `availablePx` before the rest collapse into
 * "+N" (spec 2026-10-12 W18, LA-151). Pure: the card measures the real
 * widths with ResizeObserver and hands them in. If every chip fits, show
 * them all (capped at `max`); otherwise add chips while what is shown plus a
 * trailing "+N" (`gapPx` + `overflowPx`) still fits. Widths of 0 mean "not
 * measured" (server, happy-dom, first paint): fall back to `max`.
 */
export function fitChips(chipWidths: number[], availablePx: number, opts: { gapPx: number; overflowPx: number; max: number }): number {
  const n = Math.min(chipWidths.length, opts.max);
  if (n === 0) return 0;
  if (availablePx <= 0 || chipWidths.every((w) => w === 0)) return n;
  const all = chipWidths.slice(0, n);
  const total = all.reduce((s, w) => s + w, 0) + opts.gapPx * (all.length - 1);
  if (total <= availablePx && chipWidths.length <= opts.max) return n;
  let shown = 0;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const next = used + chipWidths[i] + (shown > 0 ? opts.gapPx : 0);
    if (next + opts.gapPx + opts.overflowPx > availablePx) break;
    used = next;
    shown++;
  }
  return shown;
}
