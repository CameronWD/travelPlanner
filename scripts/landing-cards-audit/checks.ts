/**
 * Pure checks for `npm run audit:landing-cards` (scripts/landing-cards-audit.ts).
 * Unit-tested in checks.test.ts; no browser needed.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** Tallest vertical run inside `area` where no piece covers any part of the
 * given half (left = x < middle, right = x ≥ middle). Pieces are clipped to
 * the area; the top and bottom edges count as boundaries. */
export function maxEmptyBand(area: Box, pieces: Box[], half: "left" | "right"): number {
  const mid = area.x + area.width / 2;
  const [lo, hi] = half === "left" ? [area.x, mid] : [mid, area.x + area.width];
  const top = area.y;
  const bottom = area.y + area.height;
  const spans = pieces
    .filter((p) => p.x < hi && p.x + p.width > lo)
    .map((p) => [Math.max(top, p.y), Math.min(bottom, p.y + p.height)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let cursor = top;
  let gap = 0;
  for (const [a, b] of spans) {
    gap = Math.max(gap, a - cursor);
    cursor = Math.max(cursor, b);
  }
  return Math.max(gap, bottom - cursor);
}
