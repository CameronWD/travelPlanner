export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Sub-pixel slack at the far end: at a fractional zoom or devicePixelRatio a
 * body scrolled all the way down can still report scrollTop a fraction short
 * of scrollHeight - clientHeight, which must not read as "more below".
 */
const END_SLACK = 1;

/** Which edges of a scroll body have content hidden past them. Pure, so it is unit-tested directly. */
export function scrollEdges({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): {
  scrolled: boolean;
  moreBelow: boolean;
} {
  return {
    scrolled: scrollTop > 0,
    moreBelow: scrollHeight - clientHeight - scrollTop > END_SLACK,
  };
}

/** The boxes whose size changes move scrollHeight: element children, looking through `display: contents` wrappers (FormDialog keys its form in one). */
function contentBoxes(el: Element): Element[] {
  const boxes: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (getComputedStyle(child).display === "contents") boxes.push(...contentBoxes(child));
    else boxes.push(child);
  }
  return boxes;
}

/**
 * Keeps `data-scrolled` (content hidden above) and `data-more-below` (content
 * hidden below) on a scroll body, for its sticky header/footer to style off.
 * A React 19 callback ref — pass it straight to `ref` — rather than an effect
 * over a ref object: Radix's Portal mounts its children a commit late, so an
 * effect in DialogContent would run before the body exists and never again.
 * Attributes are written straight to the DOM, not React state, so scrolling
 * never re-renders the dialog. Re-measured on scroll, when the body or any
 * content box resizes (an attachment row arriving, a photo loading, a textarea
 * dragged taller), and when content is added or removed.
 */
export function trackScrollEdges(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;

  const update = () => {
    const { scrolled, moreBelow } = scrollEdges(el);
    el.toggleAttribute("data-scrolled", scrolled);
    el.toggleAttribute("data-more-below", moreBelow);
  };

  el.addEventListener("scroll", update, { passive: true });

  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  const observeBoxes = () => {
    if (!resize) return;
    resize.disconnect();
    resize.observe(el);
    for (const box of contentBoxes(el)) resize.observe(box);
  };
  observeBoxes();

  const mutation =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeBoxes();
          update();
        });
  mutation?.observe(el, { childList: true, subtree: true });

  update();
  return () => {
    el.removeEventListener("scroll", update);
    resize?.disconnect();
    mutation?.disconnect();
  };
}
