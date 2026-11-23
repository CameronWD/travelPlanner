// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { usePageScrollLock } from "./use-page-scroll-lock";

describe("usePageScrollLock", () => {
  let scrollTo: ReturnType<typeof vi.spyOn>;
  let startUrl: string;
  beforeEach(() => {
    startUrl = location.href;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 480 });
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    // Unmount first: a lock still held once its user is gone fails here, in the test that leaked it.
    cleanup();
    const leaked = document.body.style.position;
    history.replaceState(null, "", startUrl);
    scrollTo.mockRestore();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
    expect(leaked).toBe("");
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
    body().removeProperty("position");
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

  describe("a sheet that closes into a new page", () => {
    it("leaves a new pathname's scroll to the router", () => {
      const { unmount } = renderHook(() => usePageScrollLock(true));
      history.pushState(null, "", "/elsewhere");
      unmount();
      expect(body().position).toBe("");
      expect(body().top).toBe("");
      expect(body().width).toBe("");
      expect(root().getPropertyValue("overscroll-behavior")).toBe("");
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("keeps the position when only the search changed on the same page", () => {
      history.replaceState(null, "", "/trips/t1/plan");
      const { unmount } = renderHook(() => usePageScrollLock(true));
      history.pushState(null, "", "/trips/t1/plan?plan=p2");
      unmount();
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith(0, 480);
    });

    it("scrolls a new page's #anchor into view, since the router's scroll ran while the body was fixed", () => {
      history.replaceState(null, "", "/trips/t1");
      const anchor = document.createElement("section");
      anchor.id = "sharing";
      document.body.appendChild(anchor);
      const scrollIntoView = vi.fn();
      anchor.scrollIntoView = scrollIntoView;
      try {
        const { unmount } = renderHook(() => usePageScrollLock(true));
        history.pushState(null, "", "/trips/t1/settings#sharing");
        unmount();
        expect(scrollTo).not.toHaveBeenCalled();
        expect(scrollIntoView).toHaveBeenCalledOnce();
      } finally {
        anchor.remove();
      }
    });

    it("a new page's #anchor that is not there leaves the page at the top", () => {
      const { unmount } = renderHook(() => usePageScrollLock(true));
      history.pushState(null, "", "/elsewhere#missing");
      expect(() => unmount()).not.toThrow();
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("a malformed #hash on the new page is ignored, not thrown", () => {
      const { unmount } = renderHook(() => usePageScrollLock(true));
      history.pushState(null, "", "/settings#a%zz");
      expect(() => unmount()).not.toThrow();
      expect(body().position).toBe("");
      expect(body().top).toBe("");
      expect(body().width).toBe("");
      expect(root().getPropertyValue("overscroll-behavior")).toBe("");
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
