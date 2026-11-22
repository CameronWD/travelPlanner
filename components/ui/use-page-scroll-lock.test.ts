// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageScrollLock } from "./use-page-scroll-lock";

describe("usePageScrollLock", () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 480 });
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    scrollTo.mockRestore();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  const body = () => document.body.style;
  const root = () => document.documentElement.style;

  it("pins the body where the page was scrolled to and stops the root overscrolling", () => {
    renderHook(() => usePageScrollLock(true));
    expect(body().position).toBe("fixed");
    expect(body().top).toBe("-480px");
    expect(body().width).toBe("100%");
    expect(root().getPropertyValue("overscroll-behavior")).toBe("none");
  });

  it("wins over Radix's body[data-scroll-locked] { position: relative !important }", () => {
    const sheet = document.createElement("style");
    sheet.textContent = "body[data-scroll-locked] { position: relative !important; }";
    document.head.appendChild(sheet);
    document.body.setAttribute("data-scroll-locked", "1");
    try {
      renderHook(() => usePageScrollLock(true));
      expect(getComputedStyle(document.body).position).toBe("fixed");
    } finally {
      sheet.remove();
      document.body.removeAttribute("data-scroll-locked");
    }
  });

  it("does nothing while inactive", () => {
    renderHook(() => usePageScrollLock(false));
    expect(body().position).toBe("");
    expect(root().getPropertyValue("overscroll-behavior")).toBe("");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("deactivating restores the previous inline styles and the scroll position", () => {
    body().position = "relative";
    body().top = "4px";
    root().setProperty("overscroll-behavior", "contain");
    const { rerender } = renderHook(({ active }) => usePageScrollLock(active), { initialProps: { active: true } });
    rerender({ active: false });
    expect(body().position).toBe("relative");
    expect(body().getPropertyPriority("position")).toBe("");
    expect(body().top).toBe("4px");
    expect(body().width).toBe("");
    expect(root().getPropertyValue("overscroll-behavior")).toBe("contain");
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 480);
  });

  it("holds while any user is active: releasing one keeps the lock, releasing the last restores", () => {
    const first = renderHook(() => usePageScrollLock(true));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 }); // the fixed body has no scroll range
    const second = renderHook(() => usePageScrollLock(true));
    first.unmount();
    expect(body().position).toBe("fixed");
    expect(body().top).toBe("-480px");
    expect(scrollTo).not.toHaveBeenCalled();
    second.unmount();
    expect(body().position).toBe("");
    expect(body().top).toBe("");
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 480);
  });

  it("unmounting while active releases", () => {
    const { unmount } = renderHook(() => usePageScrollLock(true));
    unmount();
    expect(body().position).toBe("");
    expect(body().width).toBe("");
    expect(root().getPropertyValue("overscroll-behavior")).toBe("");
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 480);
  });
});
