import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { scrollToId, ringId, HIGHLIGHT_MS } from "./scroll-to";

let scrollTo: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollTo = vi.fn();
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  document.body.innerHTML = `<div id="stop-a"></div>`;
  document.getElementById("stop-a")!.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("scrollToId", () => {
  it("scrolls the window so the element sits 24px under the top, smoothly", () => {
    scrollToId("stop-a");
    expect(scrollTo).toHaveBeenCalledWith({ top: 776, behavior: "smooth" });
  });
  it("honours reduced motion and a custom offset", () => {
    scrollToId("stop-a", { reduced: true, offset: 0 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
  });
  it("does nothing for a missing id", () => {
    scrollToId("nope");
    expect(scrollTo).not.toHaveBeenCalled();
  });
  it("no-ops during SSR instead of throwing (no window/document)", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    expect(() => scrollToId("stop-a")).not.toThrow();
    vi.unstubAllGlobals();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("ringId", () => {
  it("rings the element for HIGHLIGHT_MS, then clears it", () => {
    vi.useFakeTimers();
    ringId("stop-a");
    const el = document.getElementById("stop-a")!;
    expect(el.getAttribute("data-highlight")).toBe("true");
    vi.advanceTimersByTime(HIGHLIGHT_MS);
    expect(el.hasAttribute("data-highlight")).toBe(false);
  });
  it("no-ops during SSR instead of throwing (no window/document)", () => {
    const el = document.getElementById("stop-a")!;
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    expect(() => ringId("stop-a")).not.toThrow();
    vi.unstubAllGlobals();
    expect(el.hasAttribute("data-highlight")).toBe(false);
  });
});
