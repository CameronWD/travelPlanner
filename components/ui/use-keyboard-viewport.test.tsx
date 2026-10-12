import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readKeyboardViewport, useKeyboardViewport, KEYBOARD_THRESHOLD_PX } from "./use-keyboard-viewport";

describe("readKeyboardViewport", () => {
  it("no visualViewport reads as closed", () => {
    expect(readKeyboardViewport(844, null)).toEqual({ keyboardOpen: false, visibleHeight: 844, bottomInset: 0 });
  });
  it("a keyboard-sized gap reads as open with the inset below the visible area", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344 });
  });
  it("Safari scrolling the visual viewport down shrinks the inset", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 100 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 244 });
  });
  it("a toolbar-sized change stays closed", () => {
    expect(readKeyboardViewport(844, { height: 844 - KEYBOARD_THRESHOLD_PX, offsetTop: 0 }).keyboardOpen).toBe(false);
  });
  it("landscape with keyboard recomputes from the new numbers", () => {
    expect(readKeyboardViewport(390, { height: 180, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 180, bottomInset: 210 });
  });
});

describe("useKeyboardViewport", () => {
  // Fake visualViewport: an EventTarget with mutable height/offsetTop, installed on window.
  function installVV(height: number, offsetTop = 0) {
    const vv = Object.assign(new EventTarget(), { height, offsetTop });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
    return vv;
  }
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, "visualViewport");
    vi.restoreAllMocks();
  });

  it("starts from the current viewport and follows resize events", () => {
    const vv = installVV(844);
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current.keyboardOpen).toBe(false);
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344 });
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current.keyboardOpen).toBe(false);
  });

  it("follows scroll events (offsetTop)", () => {
    const vv = installVV(500, 0);
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344 });
    act(() => {
      vv.offsetTop = 100;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 244 });
  });

  it("disabled: never subscribes and reads closed", () => {
    const vv = installVV(500);
    const addEventListenerSpy = vi.spyOn(vv, "addEventListener");
    const { result } = renderHook(() => useKeyboardViewport(false));
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0 });
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it("removes its listeners on unmount", () => {
    const vv = installVV(844);
    const removeEventListenerSpy = vi.spyOn(vv, "removeEventListener");
    const { unmount } = renderHook(() => useKeyboardViewport());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("no visualViewport: closed, no throw", () => {
    expect(() => renderHook(() => useKeyboardViewport())).not.toThrow();
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0 });
  });
});
