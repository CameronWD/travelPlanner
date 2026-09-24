/**
 * Layout audit in-page collector: one plain-JS string that, evaluated in a
 * loaded page, gathers the raw geometry the seven checks in ./checks.ts need.
 *
 * The collector only *gathers*; every pass/fail threshold lives in
 * ./checks.ts so it stays pure and unit-testable. The collector does do
 * candidate filtering — which elements are worth measuring at all — because
 * that needs the live DOM (computed styles, ancestry, layering). Each filter
 * is commented where it happens, with the false positive it exists to stop.
 */

/** Document coordinates: the client rect plus the scroll offset at the time
 * it was measured. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RawEl {
  /** Short path: nearest `[data-testid]` ancestor-or-self, then up to three
   * levels of `tag.firstClass:nth-of-type(n)`. */
  sel: string;
  /** The `data-testid` that anchors `sel`, when there is one. */
  testid?: string;
  /** First 60 characters of innerText, whitespace collapsed. */
  text?: string;
  rect: Rect;
}

export interface RawCollect {
  viewport: { w: number; h: number };
  doc: { scrollW: number; scrollH: number };
  /** All visible elements in body — zero ⇒ broken probe. */
  elementCount: number;
  /** Up to 5 elements with the largest right edge beyond viewport.w. */
  widest: RawEl[];
  spills: (RawEl & { containerSel: string; containerRect: Rect; inHScroller: boolean; inLeaflet: boolean })[];
  /** Text clipped with no way to read it. Two sources:
   * - own box: an element with text whose own overflow / ellipsis /
   *   line-clamp cuts it (scroll* and client* are its own);
   * - clipping ancestor (containerSel set): a text block running more than 2px
   *   above or below its nearest `overflow-y: hidden|clip` ancestor
   *   (clientH = the container's height, scrollH = clientH + the overrun;
   *   scrollW = clientW, since this entry is only about the vertical cut). */
  clipped: (RawEl & {
    scrollW: number;
    clientW: number;
    scrollH: number;
    clientH: number;
    hasLabel: boolean;
    containerSel?: string;
  })[];
  /** ancestorIdx = indexes into boxes[] of its ancestors. layer: boxes in
   * different layers are never compared — "flow" (the page), "fixed" (all
   * fixed chrome together, so the tab bar vs a floating button still counts)
   * or "overlay:<n>" (the nth open overlay). Absent = one shared layer. */
  boxes: (RawEl & {
    kind: "interactive" | "text";
    ancestorIdx: number[];
    stackOk: boolean;
    inLeaflet: boolean;
    layer?: string;
  })[];
  /** Only filled when viewport.w <= 430. */
  targets: (RawEl & { ancestorTargetOk: boolean })[];
  /** Measured after scrolling to the end of the document. */
  chrome: { fixedBottom: Rect[]; lastContent: RawEl | null; safeAreaBottom: number };
  /** p, li, dd, blockquote, figcaption with ≥ 2 rendered lines. */
  lines: (RawEl & { chars: number; avgGlyph: number })[];
}

/** In-page predicate (plain JS source, spliced into COLLECTOR_SCRIPT and
 * exported so it can be unit-tested on its own): does this computed style
 * paint a background? Anything it can't positively read as fully transparent
 * counts as painting — Chromium serialises Tailwind v4's `bg-x/95`
 * (color-mix) as `oklab(… / 0.95)` and keeps `oklch(…)` as is, and a parser
 * that only knew rgb()/rgba() read both as "no background", which emptied
 * fixedBottom and let the hidden-behind-chrome check report clean. */
export const PAINTS_BACKGROUND_JS = `(cs) => {
  if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
  const c = String(cs.backgroundColor || "").trim().toLowerCase();
  if (!c || c === "transparent") return false;
  const open = c.indexOf("(");
  const close = c.lastIndexOf(")");
  if (open < 0 || close < open) return true;
  const inner = c.slice(open + 1, close);
  if (inner.indexOf("(") >= 0) return true;
  let a;
  const slash = inner.lastIndexOf("/");
  if (slash >= 0) a = inner.slice(slash + 1).trim();
  else {
    const parts = inner.split(",");
    if (parts.length === 4) a = parts[3].trim();
  }
  if (a === undefined) return true;
  const n = a.slice(-1) === "%" ? parseFloat(a) / 100 : parseFloat(a);
  return n !== 0;
}`;

// IMPORTANT: this is a plain JS *string*, not a TypeScript function, for the
// same reason as PROBE_SCRIPT in scripts/contrast-audit.ts (read the comment
// above it): tsx/esbuild wraps named bindings in a `__name(...)` helper that
// only exists in the compiled module, so a function reference handed to
// page.evaluate() throws `ReferenceError: __name is not defined` in the page.
// Nothing in this string is compiled by esbuild; the browser is the first
// thing to parse it.
//
// Two rules for editing it:
//   - Regexes stay single-escaped: write "\\s" in this file so the page sees
//     "\s". Double-escaping still parses, silently matches nothing, and the
//     affected check reports clean.
//   - No template literals or "${" inside it — this whole string is itself a
//     template literal. Use string concatenation. The one deliberate "${" is
//     the PAINTS_BACKGROUND_JS splice, which is itself plain JS source.
export const COLLECTOR_SCRIPT = `
(() => {
  const html = document.documentElement;
  const body = document.body;
  const LIST_CAP = 400;
  const BOX_CAP = 1500;
  const INTERACTIVE = "a[href], button, input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=link]";
  const TEXT = "p, h1, h2, h3, h4, h5, h6, li, label, dt, dd";
  const LINES = "p, li, dd, blockquote, figcaption";
  // Open overlays form their own layer (see isOpenOverlay under "boxes").
  const OVERLAY = "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-radix-popper-content-wrapper]";

  // Measure from the top: sticky elements then sit at their in-flow position
  // instead of floating over whatever the page was scrolled to.
  const scrollToY = (y) => {
    try { window.scrollTo({ top: y, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, y); }
  };
  scrollToY(0);

  // The initial containing block, not innerWidth/innerHeight: when a phone
  // page overflows sideways, Chromium's mobile emulation zooms out to fit and
  // innerWidth/innerHeight grow to the content size (390x800 becomes
  // 1200x2462), while clientWidth/clientHeight stay the device's 390x800.
  const vw = html.clientWidth || window.innerWidth;
  const vh = html.clientHeight || window.innerHeight;

  const styleMemo = new Map();
  const style = (el) => {
    let cs = styleMemo.get(el);
    if (!cs) { cs = getComputedStyle(el); styleMemo.set(el, cs); }
    return cs;
  };

  const round = (n) => Math.round(n * 10) / 10;
  const docRect = (r) => ({ x: round(r.left + window.scrollX), y: round(r.top + window.scrollY), w: round(r.width), h: round(r.height) });

  const classNameOf = (el) => {
    const cn = el.className;
    if (cn && typeof cn === "object" && "baseVal" in cn) return String(cn.baseVal);
    return typeof cn === "string" ? cn : "";
  };
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
  const segment = (el) => {
    const tag = el.tagName.toLowerCase();
    const first = classNameOf(el).trim().split(/\\s+/)[0];
    let n = 1;
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      if (sib.tagName === el.tagName) n++;
    }
    return tag + (first ? "." + esc(first) : "") + ":nth-of-type(" + n + ")";
  };
  const testidSel = (el) => '[data-testid="' + String(el.getAttribute("data-testid")).replace(/"/g, '\\\\"') + '"]';
  const selOf = (el) => {
    const anchor = el.closest("[data-testid]");
    if (anchor === el) return testidSel(el);
    const parts = [];
    let node = el;
    while (node && parts.length < 3 && node !== anchor && node !== body && node !== html) {
      parts.unshift(segment(node));
      node = node.parentElement;
    }
    if (parts.length === 0) return el.tagName.toLowerCase();
    const path = parts.join(" > ");
    if (!anchor) return path;
    return testidSel(anchor) + (node === anchor ? " > " : " ") + path;
  };
  const textOf = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 60);
  const rawEl = (el, rect) => {
    const out = { sel: selOf(el), rect: rect || docRect(el.getBoundingClientRect()) };
    const anchor = el.closest("[data-testid]");
    if (anchor) out.testid = anchor.getAttribute("data-testid");
    const t = textOf(el);
    if (t) out.text = t;
    return out;
  };

  // ---- Visibility ---------------------------------------------------------
  // An element is invisible if it has no boxes, is visibility:hidden, has a
  // zero-size rect, or it or any ancestor is opacity:0, [hidden],
  // [aria-hidden="true"] (which also drops the page behind an open Radix
  // modal — Radix aria-hides everything outside the portal), visually hidden
  // (Tailwind sr-only: clip-path inset(50%) / clip rect(0 0 0 0)), or a
  // closed Radix overlay still mounted for its exit animation.
  const isClosedOverlay = (el) => {
    if (el.getAttribute("data-state") !== "closed") return false;
    // A trigger also carries data-state="closed" — only overlay content counts.
    if (/^(dialog|alertdialog|menu|listbox|tooltip)$/.test(el.getAttribute("role") || "")) return true;
    const p = el.parentElement;
    return !!(p && p.hasAttribute("data-radix-popper-content-wrapper"));
  };
  const hiddenMemo = new Map();
  const hiddenByTree = (el) => {
    if (!el || el === html) return false;
    if (hiddenMemo.has(el)) return hiddenMemo.get(el);
    let h = el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true" || isClosedOverlay(el);
    if (!h) {
      const cs = style(el);
      h = cs.display === "none" || cs.opacity === "0" ||
        (cs.clipPath || "").indexOf("inset(50%") === 0 ||
        /^rect\\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\\)$/.test(cs.clip || "");
    }
    if (!h) h = hiddenByTree(el.parentElement);
    hiddenMemo.set(el, h);
    return h;
  };

  const vis = [];
  const visSet = new Set();
  for (const el of Array.from(body.querySelectorAll("*"))) {
    if (el.getClientRects().length === 0) continue;
    // Content of a closed <details> (and any content-visibility:hidden
    // subtree) keeps reporting its last layout's rects although nothing is
    // painted — /help's collapsed answers "overlapped" each other hundreds of
    // times. checkVisibility() knows; the walk below doesn't.
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const cs = style(el);
    if (cs.visibility === "hidden" || cs.visibility === "collapse") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (hiddenByTree(el)) continue;
    vis.push({ el: el, r: r, rect: docRect(r), cs: cs });
    visSet.add(el);
  }

  // ---- Ancestry helpers (memoised: each walks up the tree) --------------------
  const fixedMemo = new Map();
  const fixedRoot = (el) => {
    if (!el || el === body || el === html) return null;
    if (fixedMemo.has(el)) return fixedMemo.get(el);
    const f = style(el).position === "fixed" ? el : fixedRoot(el.parentElement);
    fixedMemo.set(el, f);
    return f;
  };
  const pinnedMemo = new Map();
  const pinned = (el) => {
    if (!el || el === body || el === html) return false;
    if (pinnedMemo.has(el)) return pinnedMemo.get(el);
    const pos = style(el).position;
    const p = pos === "fixed" || pos === "sticky" || pinned(el.parentElement);
    pinnedMemo.set(el, p);
    return p;
  };
  const hscrollMemo = new Map();
  const inHScroller = (el) => {
    if (!el || el === body || el === html) return false;
    if (hscrollMemo.has(el)) return hscrollMemo.get(el);
    const ox = style(el).overflowX;
    const s = ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth) || inHScroller(el.parentElement);
    hscrollMemo.set(el, s);
    return s;
  };

  // The nearest ancestor that actually clips el on an axis ("x" or "y"), or
  // null for the viewport. Containing-block aware: an absolutely positioned box is not
  // clipped by an overflow ancestor that sits between it and its containing
  // block, and nothing but the viewport clips a fixed box — reporting those
  // as spills would flag every intentionally-escaping popover and badge.
  const makesContainingBlock = (cs) =>
    cs.position !== "static" || cs.transform !== "none" || cs.filter !== "none" ||
    /paint|layout|strict|content/.test(cs.contain || "");
  const clipMemo = { x0: new Map(), x1: new Map(), y0: new Map(), y1: new Map() };
  const clipFrom = (node, needCB, axis) => {
    if (!node || node === body || node === html) return null;
    const memo = clipMemo[axis + (needCB ? "1" : "0")];
    if (memo.has(node)) return memo.get(node);
    const cs = style(node);
    let c;
    if (needCB && !makesContainingBlock(cs)) c = clipFrom(node.parentElement, true, axis);
    else if ((axis === "x" ? cs.overflowX : cs.overflowY) !== "visible") c = node;
    else if (cs.position === "fixed") c = null;
    else c = clipFrom(node.parentElement, cs.position === "absolute", axis);
    memo.set(node, c);
    return c;
  };
  const clipContainerOf = (el, cs, axis) =>
    cs.position === "fixed" ? null : clipFrom(el.parentElement, cs.position === "absolute", axis);

  const depthOf = (el) => { let d = 0; for (let n = el; n; n = n.parentElement) d++; return d; };
  const ownText = (el) => {
    let t = "";
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) t += n.textContent || "";
    return t.trim();
  };

  // ---- widest + spills --------------------------------------------------------
  const scrollW = html.scrollWidth;
  const scrollH = html.scrollHeight;
  const viewportRect = { x: 0, y: 0, w: vw, h: Math.max(scrollH, vh) };
  // Fixed boxes are laid out against the fixed-position viewport, which is
  // innerWidth x innerHeight — larger than the ICB in the zoomed-out state
  // above, where comparing a left:0/right:0 tab bar to the ICB would report
  // it as spilling by the page's whole overflow.
  const fixedViewportRect = { x: round(window.scrollX), y: round(window.scrollY), w: window.innerWidth, h: window.innerHeight };
  const widestAll = [];
  const spills = [];
  // Only the outermost spilling element per container is kept: once a row
  // spills, every descendant in its overflowing part spills past the same
  // container too, and one root cause would otherwise fill the whole list.
  const spilledFor = new Map();
  for (const v of vis) {
    const el = v.el;
    const container = clipContainerOf(el, v.cs, "x");
    const cRect = container ? docRect(container.getBoundingClientRect()) : fixedRoot(el) ? fixedViewportRect : viewportRect;
    const rightEdge = v.rect.x + v.rect.w;
    if (!container && !fixedRoot(el) && rightEdge > vw + 0.5) widestAll.push({ v: v, right: rightEdge, depth: depthOf(el) });
    const over = Math.max(cRect.x - v.rect.x, rightEdge - (cRect.x + cRect.w));
    if (over <= 0.5) continue;
    // Text truncated with an ellipsis / line clamp overflows its box by
    // design; that is the clipped-text check's call, not a spill.
    if (container) {
      const ccs = style(container);
      if (ccs.textOverflow === "ellipsis" || (ccs.getPropertyValue("-webkit-line-clamp") || "none") !== "none") continue;
    }
    const parent = el.parentElement;
    if (parent && spilledFor.get(parent) === container) { spilledFor.set(el, container); continue; }
    spilledFor.set(el, container);
    if (spills.length >= LIST_CAP) continue;
    spills.push(Object.assign(rawEl(el, v.rect), {
      containerSel: container ? selOf(container) : "viewport",
      containerRect: cRect,
      inHScroller: inHScroller(el.parentElement),
      inLeaflet: !!el.closest(".leaflet-container"),
    }));
  }
  widestAll.sort((a, b) => b.right - a.right || b.depth - a.depth);
  const widest = widestAll.slice(0, 5).map((w) => rawEl(w.v.el, w.v.rect));

  // ---- clipped ------------------------------------------------------------------
  const labelled = (el) => {
    let n = el;
    for (let i = 0; n && i <= 3; i++, n = n.parentElement) {
      if (n.hasAttribute("title") || n.hasAttribute("aria-label") || n.hasAttribute("aria-describedby")) return true;
    }
    return false;
  };
  const clipped = [];
  const clippedEls = new Set();
  for (const v of vis) {
    if (clipped.length >= LIST_CAP) break;
    const el = v.el;
    const cs = v.cs;
    if (cs.display === "inline") continue; // overflow does not apply to inline boxes
    const clips = /hidden|clip/.test(cs.overflow + " " + cs.overflowX + " " + cs.overflowY);
    const ellipsis = cs.textOverflow === "ellipsis";
    const clamp = (cs.getPropertyValue("-webkit-line-clamp") || "none") !== "none";
    if (!clips && !ellipsis && !clamp) continue;
    // Own text nodes, or (for ellipsis / line-clamp) text in inline children —
    // <p class="truncate"><span>…</span></p> clips the span's text just the same.
    if (!ownText(el) && !((ellipsis || clamp) && (el.textContent || "").trim())) continue;
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) continue;
    clippedEls.add(el);
    clipped.push(Object.assign(rawEl(el, v.rect), {
      scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight,
      hasLabel: labelled(el),
    }));
  }
  // Text cut off by an ancestor rather than its own box:
  // <div class="h-12 overflow-hidden"><p>…</p></div> — the <p> fits itself and
  // the div has no text of its own, so the own-box pass above never sees it.
  // The nearest ancestor with a non-visible overflow-y decides: hidden / clip
  // cuts the text off; auto / scroll means it scrolls, so it is reachable.
  // One entry per clipping container (its first overrunning text block), and
  // nothing for a container the own-box pass already reported. Skipped:
  // containers under 8px tall (collapsed disclosures, height animations) and
  // Leaflet (markers panned out of the map pane are clipped by design; the
  // spec excludes Leaflet panes for the same reason in the spill check).
  const vClipDone = new Set();
  for (const v of vis) {
    if (clipped.length >= LIST_CAP) break;
    const el = v.el;
    if (clippedEls.has(el) || !ownText(el)) continue;
    const container = clipContainerOf(el, v.cs, "y");
    if (!container || vClipDone.has(container) || clippedEls.has(container)) continue;
    const oy = style(container).overflowY;
    if (oy !== "hidden" && oy !== "clip") continue;
    const cr = container.getBoundingClientRect();
    if (cr.height < 8) continue;
    if (el.closest(".leaflet-container")) continue;
    const cRect = docRect(cr);
    const over = Math.max(v.rect.y + v.rect.h - (cRect.y + cRect.h), cRect.y - v.rect.y);
    if (over <= 2) continue;
    vClipDone.add(container);
    clippedEls.add(el);
    clipped.push(Object.assign(rawEl(el, v.rect), {
      scrollW: cRect.w, clientW: cRect.w, scrollH: round(cRect.h + over), clientH: cRect.h,
      hasLabel: labelled(el),
      containerSel: selOf(container),
    }));
  }

  // ---- boxes (overlap candidates) -----------------------------------------------
  // Overlap is only meaningful within one layer, so every box carries a layer
  // key and checkOverlap compares same-layer pairs only: each open overlay is
  // its own layer ("overlay:<n>"); all fixed chrome shares "fixed" (tab bar,
  // floating buttons, toasts — so they are still checked against each other);
  // the rest is "flow". Fixed-vs-flow is deliberately not compared: fixed
  // chrome sits over whatever scrolls beneath it by design — at the top of a
  // phone page the tab bar covers the first screen's bottom edge.
  // Only an *opened* overlay switches layers (Radix data-state="open",
  // aria-modal, or a mounted popper) — a persistent fixed element that merely
  // carries one of these roles must not silently turn off the page's overlap
  // check on every capture.
  const isOpenOverlay = (el) => {
    if (!el.matches(OVERLAY)) return false;
    if (el.hasAttribute("data-radix-popper-content-wrapper")) return true;
    if (!fixedRoot(el)) return false;
    return el.getAttribute("data-state") === "open" || el.getAttribute("aria-modal") === "true";
  };
  const overlayRoots = [];
  for (const v of vis) {
    if (isOpenOverlay(v.el) && !overlayRoots.some((r) => r.contains(v.el))) overlayRoots.push(v.el);
  }
  const layerOf = (el) => {
    for (let i = 0; i < overlayRoots.length; i++) if (overlayRoots[i].contains(el)) return "overlay:" + i;
    return fixedRoot(el) ? "fixed" : "flow";
  };
  const STACK = /(^|\\s)-space-[xy]-/;
  const boxes = [];
  const boxIdx = new Map();
  for (const v of vis) {
    if (boxes.length >= BOX_CAP) break;
    const el = v.el;
    const interactive = el.matches(INTERACTIVE);
    if (!interactive && !(el.matches(TEXT) && (el.textContent || "").trim())) continue;
    // An inline element that wraps has a bounding box spanning both lines,
    // which "overlaps" every other inline on those lines. Skip fragments.
    if (el.getClientRects().length > 1) continue;
    const ancestorIdx = [];
    for (let p = el.parentElement; p; p = p.parentElement) if (boxIdx.has(p)) ancestorIdx.push(boxIdx.get(p));
    const parent = el.parentElement;
    const stackOk = STACK.test(classNameOf(el)) || !!(parent && STACK.test(classNameOf(parent))) ||
      (el.getAttribute("data-slot") === "badge" && v.cs.position === "absolute");
    boxIdx.set(el, boxes.length);
    boxes.push(Object.assign(rawEl(el, v.rect), {
      kind: interactive ? "interactive" : "text",
      ancestorIdx: ancestorIdx,
      stackOk: stackOk,
      inLeaflet: !!el.closest(".leaflet-container"),
      layer: layerOf(el),
    }));
  }

  // ---- targets (phones only) ------------------------------------------------------
  const targets = [];
  if (vw <= 430) {
    for (const v of vis) {
      if (targets.length >= LIST_CAP) break;
      const el = v.el;
      if (!el.matches(INTERACTIVE)) continue;
      if (v.r.width >= 44 && v.r.height >= 44) continue;
      let ok = false;
      let p = el.parentElement;
      for (let i = 0; p && i < 4; i++, p = p.parentElement) {
        if (p.matches(INTERACTIVE) && visSet.has(p)) {
          const pr = p.getBoundingClientRect();
          if (pr.width >= 44 && pr.height >= 44) { ok = true; break; }
        }
      }
      targets.push(Object.assign(rawEl(el, v.rect), { ancestorTargetOk: ok }));
    }
  }

  // ---- lines ----------------------------------------------------------------------
  const ctx = document.createElement("canvas").getContext("2d");
  const glyphMemo = new Map();
  const SAMPLE = "abcdefghijklmnopqrstuvwxyz ".repeat(4);
  const avgGlyphOf = (cs) => {
    const font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(" ");
    if (glyphMemo.has(font)) return glyphMemo.get(font);
    let g = 0;
    if (ctx) { ctx.font = font; g = ctx.measureText(SAMPLE).width / 108; }
    g = Math.round(g * 100) / 100;
    glyphMemo.set(font, g);
    return g;
  };
  const lines = [];
  for (const v of vis) {
    if (lines.length >= LIST_CAP) break;
    const el = v.el;
    if (!el.matches(LINES)) continue;
    // Only text blocks: an <li> that holds a card (a flex/grid/block child) is
    // a layout container, and its width says nothing about line length.
    let leaf = true;
    for (const c of Array.from(el.children)) {
      const d = style(c).display;
      if (d.indexOf("inline") !== 0 && d !== "contents" && d !== "none") { leaf = false; break; }
    }
    if (!leaf) continue;
    const cs = v.cs;
    const fontSize = parseFloat(cs.fontSize) || 16;
    let lh = parseFloat(cs.lineHeight);
    if (!(lh > 0)) lh = fontSize * 1.4;
    if (!(v.r.height > 1.8 * lh)) continue;
    const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
    lines.push(Object.assign(rawEl(el, v.rect), { chars: text.length, avgGlyph: avgGlyphOf(cs) }));
  }

  // ---- chrome (scrolled to the end) ---------------------------------------------------
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom, 0px)";
  body.appendChild(probe);
  const safeAreaBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();

  scrollToY(html.scrollHeight);
  // Only pinned boxes that paint something count as chrome: a transparent
  // positioning layer (the toast viewport is an empty, pointer-events:none
  // fixed <ol> 160px tall at the bottom of every page) covers nothing.
  const paints = ${PAINTS_BACKGROUND_JS};
  const fixedBottom = [];
  for (const v of vis) {
    const pos = v.cs.position;
    if (pos !== "fixed" && pos !== "sticky") continue;
    if (!paints(v.cs)) continue;
    const r = v.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom >= window.innerHeight - 1 && r.height < window.innerHeight / 2) fixedBottom.push(docRect(r));
  }
  // The visually lowest text / interactive element in main that is not itself
  // pinned (fixed or sticky, or inside one) — the thing a Traveller scrolls to
  // the end to reach.
  const root = document.querySelector("main") || body;
  let last = null;
  for (const v of vis) {
    const el = v.el;
    if (!root.contains(el) || el === root) continue;
    const interactive = el.matches(INTERACTIVE);
    if (!interactive && !(el.matches(TEXT) && (el.textContent || "").trim())) continue;
    if (pinned(el)) continue;
    const r = el.getBoundingClientRect();
    if (!last || r.bottom >= last.r.bottom) last = { el: el, r: r };
  }
  const lastContent = last ? rawEl(last.el, docRect(last.r)) : null;
  scrollToY(0);

  return {
    viewport: { w: vw, h: vh },
    doc: { scrollW: scrollW, scrollH: scrollH },
    elementCount: vis.length,
    widest: widest,
    spills: spills,
    clipped: clipped,
    boxes: boxes,
    targets: targets,
    chrome: { fixedBottom: fixedBottom, lastContent: lastContent, safeAreaBottom: safeAreaBottom },
    lines: lines,
  };
})()
`;
