import { describe, it, expect, afterEach } from "vitest";
import { scrollEdges, trackScrollEdges } from "./scroll-edges";

describe("scrollEdges", () => {
  it("reports nothing hidden when the content fits", () => {
    expect(scrollEdges({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toEqual({ scrolled: false, moreBelow: false });
  });

  it("reports content below at the top of a tall body", () => {
    expect(scrollEdges({ scrollTop: 0, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: false, moreBelow: true });
  });

  it("reports both edges mid-scroll", () => {
    expect(scrollEdges({ scrollTop: 250, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: true, moreBelow: true });
  });

  it("reports only the top edge at the end", () => {
    expect(scrollEdges({ scrollTop: 512, scrollHeight: 1282, clientHeight: 770 })).toEqual({ scrolled: true, moreBelow: false });
  });

  it("treats a sub-pixel shortfall at the end as the end (fractional zoom)", () => {
    expect(scrollEdges({ scrollTop: 511.4, scrollHeight: 1282, clientHeight: 770 }).moreBelow).toBe(false);
  });
});

describe("trackScrollEdges", () => {
  const realResizeObserver = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = realResizeObserver;
    document.body.innerHTML = "";
  });

  function sized(el: HTMLElement, scrollHeight: number, clientHeight: number) {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  }

  function body() {
    const el = document.createElement("div");
    el.innerHTML = "<header></header><div style=\"display: contents\"><form></form></div>";
    document.body.appendChild(el);
    return el;
  }

  it("sets nothing on a body whose content fits — a short dialog looks unchanged", () => {
    const el = body();
    sized(el, 400, 400);
    trackScrollEdges(el);
    expect(el.hasAttribute("data-scrolled")).toBe(false);
    expect(el.hasAttribute("data-more-below")).toBe(false);
  });

  it("marks more-below at rest, both mid-scroll, and only scrolled at the end", () => {
    const el = body();
    sized(el, 1282, 770);
    trackScrollEdges(el);
    expect(el.hasAttribute("data-more-below")).toBe(true);
    expect(el.hasAttribute("data-scrolled")).toBe(false);

    el.scrollTop = 250;
    el.dispatchEvent(new Event("scroll"));
    expect(el.hasAttribute("data-more-below")).toBe(true);
    expect(el.hasAttribute("data-scrolled")).toBe(true);

    el.scrollTop = 512;
    el.dispatchEvent(new Event("scroll"));
    expect(el.hasAttribute("data-more-below")).toBe(false);
    expect(el.hasAttribute("data-scrolled")).toBe(true);
  });

  it("re-measures when content grows without a scroll — an attachment arriving while scrolled to the end", () => {
    const callbacks: ResizeObserverCallback[] = [];
    const observed: Element[] = [];
    globalThis.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {
        observed.length = 0;
      }
    } as unknown as typeof ResizeObserver;

    const el = body();
    sized(el, 1282, 770);
    el.scrollTop = 512;
    trackScrollEdges(el);
    expect(el.hasAttribute("data-more-below")).toBe(false);
    // Watches the body and the form inside FormDialog's display:contents wrapper.
    expect(observed).toContain(el);
    expect(observed).toContain(el.querySelector("form"));

    sized(el, 1354, 770); // the form grew by an attachment row
    callbacks[0]([], {} as ResizeObserver);
    expect(el.hasAttribute("data-more-below")).toBe(true);
  });

  it("re-measures when content is added or removed", async () => {
    const el = body();
    sized(el, 770, 770);
    trackScrollEdges(el);
    expect(el.hasAttribute("data-more-below")).toBe(false);

    sized(el, 900, 770);
    el.querySelector("form")!.appendChild(document.createElement("p"));
    await Promise.resolve(); // MutationObserver delivers on a microtask
    expect(el.hasAttribute("data-more-below")).toBe(true);
  });

  it("stops listening once detached", () => {
    const el = body();
    sized(el, 1282, 770);
    const cleanup = trackScrollEdges(el)!;
    cleanup();
    el.scrollTop = 512;
    el.dispatchEvent(new Event("scroll"));
    expect(el.hasAttribute("data-scrolled")).toBe(false);
  });

  it("does nothing for a null element (React detaching the ref)", () => {
    expect(trackScrollEdges(null)).toBeUndefined();
  });

  it("works without ResizeObserver (jsdom, very old browsers): scroll still updates", () => {
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const el = body();
    sized(el, 1282, 770);
    expect(() => trackScrollEdges(el)).not.toThrow();
    el.scrollTop = 600;
    el.dispatchEvent(new Event("scroll"));
    expect(el.hasAttribute("data-scrolled")).toBe(true);
  });
});
