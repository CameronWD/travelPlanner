/**
 * The ancestor an absolutely positioned element resolves its containing block
 * against, read off Tailwind's position utilities — jsdom has no layout, so
 * this is what a test can pin. Only bare (unprefixed) utilities count: a
 * `sm:relative` is not positioned at every width.
 */
const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);

export function nearestPositionedAncestor(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node.className.split(/\s+/).some((c) => POSITIONED.has(c))) return node;
  }
  return null;
}
