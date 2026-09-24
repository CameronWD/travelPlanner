/**
 * Layout audit classifiers: turn the raw geometry COLLECTOR_SCRIPT gathers
 * in-page (see ./collector.ts) into findings, one per hit.
 *
 * Pure — no DOM, no Playwright. Every threshold lives here rather than in the
 * collector, so the collector only has to gather raw geometry and these rules
 * stay unit-testable. See docs/specs/2026-09-24-layout-audit.md §3 for what
 * each check means; the thresholds below are that section made exact.
 */

import type { RawCollect, Rect } from "./collector";

export type CheckName =
  | "sideways-scroll"
  | "spill"
  | "clipped-text"
  | "overlap"
  | "small-target"
  | "hidden-behind-chrome"
  | "line-too-long";

export interface AutoFinding {
  /** `${captureId}#${check}#${selector}` — stable across runs so Stage 2 can
   * diff one audit against the next. See classify() for the collision rule. */
  id: string;
  check: CheckName;
  captureId: string;
  selector: string;
  text?: string;
  rect: Rect;
  detail: string;
}

type Hit = Omit<AutoFinding, "id" | "captureId">;

/** Sub-pixel noise guard for "is it wider/taller than its box". */
const ROUNDING_PX = 1;
/** How far an element may poke past its clipping container before it counts. */
const SPILL_PX = 2;
/** Minimum intersection depth for overlap / hidden-behind-chrome. */
const OVERLAP_PX = 4;
/** WCAG 2.5.5 (AAA) target size, and the width at or below which it applies. */
const TARGET_PX = 44;
const PHONE_MAX_W = 430;
/** Upper bound of a comfortable measure, in characters per line. */
const MAX_MEASURE_CH = 80;

const r1 = (n: number) => Math.round(n * 10) / 10;
const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;

/** Depth of the intersection of two 1-D spans (negative/zero = no overlap). */
function spanOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(right(a), right(b)) - x, h: Math.max(bottom(a), bottom(b)) - y };
}

function hit(check: CheckName, selector: string, text: string | undefined, rect: Rect, detail: string): Hit {
  return text ? { check, selector, text, rect, detail } : { check, selector, rect, detail };
}

// --------------------------------------------------------------------------
// 1. Page scrolls sideways
// --------------------------------------------------------------------------

export function checkSideways(raw: RawCollect): Hit[] {
  const { scrollW, scrollH } = raw.doc;
  const w = raw.viewport.w;
  if (scrollW <= w + ROUNDING_PX) return [];
  const first = raw.widest[0];
  const widest = raw.widest.length
    ? raw.widest.map((e) => `${e.sel} (right edge ${r1(right(e.rect))})`).join(", ")
    : "none found";
  return [
    hit(
      "sideways-scroll",
      first?.sel ?? "html",
      first?.text,
      first?.rect ?? { x: 0, y: 0, w: scrollW, h: scrollH },
      `scrollWidth ${scrollW} > ${w}; widest: ${widest}`,
    ),
  ];
}

// --------------------------------------------------------------------------
// 2. Spills out of its clipping container (horizontal only)
// --------------------------------------------------------------------------

export function checkSpill(raw: RawCollect): Hit[] {
  const out: Hit[] = [];
  for (const s of raw.spills) {
    if (s.inHScroller || s.inLeaflet) continue;
    const left = s.containerRect.x - s.rect.x;
    const rightOver = right(s.rect) - right(s.containerRect);
    if (left <= SPILL_PX && rightOver <= SPILL_PX) continue;
    const sides = [left > SPILL_PX ? `${r1(left)}px left` : "", rightOver > SPILL_PX ? `${r1(rightOver)}px right` : ""]
      .filter(Boolean)
      .join(" and ");
    out.push(hit("spill", s.sel, s.text, s.rect, `extends ${sides} beyond ${s.containerSel}`));
  }
  return out;
}

// --------------------------------------------------------------------------
// 3. Clipped text with no way to read it
// --------------------------------------------------------------------------

export function checkClipped(raw: RawCollect): Hit[] {
  const out: Hit[] = [];
  for (const c of raw.clipped) {
    const overX = c.scrollW > c.clientW + ROUNDING_PX;
    const overY = c.scrollH > c.clientH + ROUNDING_PX;
    if (!(overX || overY) || c.hasLabel) continue;
    out.push(
      hit(
        "clipped-text",
        c.sel,
        c.text,
        c.rect,
        `content ${c.scrollW}×${c.scrollH} clipped to ${c.clientW}×${c.clientH}; no title, aria-label or aria-describedby`,
      ),
    );
  }
  return out;
}

// --------------------------------------------------------------------------
// 4. Overlap between unrelated interactive elements / text blocks
// --------------------------------------------------------------------------

export function checkOverlap(raw: RawCollect): Hit[] {
  const out: Hit[] = [];
  const boxes = raw.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.stackOk || a.inLeaflet) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (b.stackOk || b.inLeaflet) continue;
      if (a.ancestorIdx.includes(j) || b.ancestorIdx.includes(i)) continue;
      const ox = spanOverlap(a.rect.x, right(a.rect), b.rect.x, right(b.rect));
      if (ox <= OVERLAP_PX) continue;
      const oy = spanOverlap(a.rect.y, bottom(a.rect), b.rect.y, bottom(b.rect));
      if (oy <= OVERLAP_PX) continue;
      const text = [a.text, b.text].filter(Boolean).join(" ⟂ ") || undefined;
      out.push(
        hit(
          "overlap",
          `${a.sel} ⟂ ${b.sel}`,
          text,
          union(a.rect, b.rect),
          `${a.kind} and ${b.kind} overlap by ${r1(ox)}×${r1(oy)}px`,
        ),
      );
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// 5. Small tap target (phones only)
// --------------------------------------------------------------------------

export function checkTargets(raw: RawCollect): Hit[] {
  if (raw.viewport.w > PHONE_MAX_W) return [];
  const out: Hit[] = [];
  for (const t of raw.targets) {
    if (t.ancestorTargetOk) continue;
    if (t.rect.w >= TARGET_PX && t.rect.h >= TARGET_PX) continue;
    out.push(
      hit("small-target", t.sel, t.text, t.rect, `${r1(t.rect.w)}×${r1(t.rect.h)}px < ${TARGET_PX}×${TARGET_PX}px`),
    );
  }
  return out;
}

// --------------------------------------------------------------------------
// 6. Last content hidden behind fixed bottom chrome
// --------------------------------------------------------------------------

export function checkChrome(raw: RawCollect): Hit[] {
  const { fixedBottom, lastContent, safeAreaBottom } = raw.chrome;
  if (!lastContent || fixedBottom.length === 0) return [];
  const lc = lastContent.rect;
  for (const f of fixedBottom) {
    if (spanOverlap(lc.x, right(lc), f.x, right(f)) <= 0) continue;
    const oy = spanOverlap(lc.y, bottom(lc), f.y, bottom(f));
    if (oy > OVERLAP_PX) {
      return [
        hit(
          "hidden-behind-chrome",
          lastContent.sel,
          lastContent.text,
          lc,
          `last content (bottom ${r1(bottom(lc))}) is ${r1(oy)}px under fixed chrome at ${r1(f.y)}–${r1(bottom(f))}`,
        ),
      ];
    }
  }
  // Rects were taken scrolled to the end, so the viewport's bottom edge in
  // document coordinates is the document's own bottom.
  const viewportBottom = Math.max(raw.doc.scrollH, raw.viewport.h);
  if (safeAreaBottom > 0 && bottom(lc) > viewportBottom - safeAreaBottom) {
    return [
      hit(
        "hidden-behind-chrome",
        lastContent.sel,
        lastContent.text,
        lc,
        `last content (bottom ${r1(bottom(lc))}) is inside the ${r1(safeAreaBottom)}px bottom safe area`,
      ),
    ];
  }
  return [];
}

// --------------------------------------------------------------------------
// 7. Line too long
// --------------------------------------------------------------------------

export function checkLines(raw: RawCollect): Hit[] {
  const out: Hit[] = [];
  for (const l of raw.lines) {
    if (l.chars < MAX_MEASURE_CH || !(l.avgGlyph > 0)) continue;
    const measure = l.rect.w / l.avgGlyph;
    if (measure <= MAX_MEASURE_CH) continue;
    out.push(
      hit(
        "line-too-long",
        l.sel,
        l.text,
        l.rect,
        `~${Math.round(measure)} characters per line (${r1(l.rect.w)}px ÷ ${r1(l.avgGlyph)}px) > ${MAX_MEASURE_CH}`,
      ),
    );
  }
  return out;
}

// --------------------------------------------------------------------------
// All checks
// --------------------------------------------------------------------------

const CHECKS: ((raw: RawCollect) => Hit[])[] = [
  checkSideways,
  checkSpill,
  checkClipped,
  checkOverlap,
  checkTargets,
  checkChrome,
  checkLines,
];

/** Run every check against one capture's raw geometry. Each finding's id is
 * `${captureId}#${check}#${selector}`; if two findings in the same capture
 * share that id (two elements the short selector can't tell apart), the
 * second and later get a `#2`, `#3`… suffix in collector (DOM) order, so ids
 * stay unique within a run and stable across runs of an unchanged page. */
export function classify(raw: RawCollect, captureId: string): AutoFinding[] {
  const seen = new Map<string, number>();
  const out: AutoFinding[] = [];
  for (const check of CHECKS) {
    for (const h of check(raw)) {
      const base = `${captureId}#${h.check}#${h.selector}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push({ id: n === 1 ? base : `${base}#${n}`, captureId, ...h });
    }
  }
  return out;
}
