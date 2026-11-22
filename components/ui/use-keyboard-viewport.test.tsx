import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readKeyboardViewport, useKeyboardViewport, KEYBOARD_THRESHOLD_PX, KEYBOARD_SETTLE_MS } from "./use-keyboard-viewport";
import { installVV, removeVV, runFramesSynchronously, setInnerHeight } from "@/test/helpers/visual-viewport";

describe("readKeyboardViewport", () => {
  it("no visualViewport reads as closed", () => {
    expect(readKeyboardViewport(844, null)).toEqual({ keyboardOpen: false, visibleHeight: 844, bottomInset: 0, offsetTop: 0, bottom: "0px" });
  });
  it("a keyboard-sized gap reads as open with the inset below the visible area", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344, offsetTop: 0, bottom: "calc(100% - 500px)" });
  });
  it("Safari scrolling the visual viewport down shrinks the inset", () => {
    expect(readKeyboardViewport(844, { height: 500, offsetTop: 100 })).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 244, offsetTop: 100, bottom: "calc(100% - 600px)" });
  });
  it("a toolbar-sized change stays closed", () => {
    expect(readKeyboardViewport(844, { height: 844 - KEYBOARD_THRESHOLD_PX, offsetTop: 0 }).keyboardOpen).toBe(false);
  });
  it("landscape with keyboard recomputes from the new numbers", () => {
    expect(readKeyboardViewport(390, { height: 180, offsetTop: 0 })).toEqual({ keyboardOpen: true, visibleHeight: 180, bottomInset: 210, offsetTop: 0, bottom: "calc(100% - 180px)" });
  });
  it("pinch-zoomed (scale 2) reads closed even with a keyboard-sized gap", () => {
    expect(readKeyboardViewport(844, { height: 422, offsetTop: 0, scale: 2 }).keyboardOpen).toBe(false);
  });
});

describe("readKeyboardViewport bottom", () => {
  it("anchors bottom to the visual viewport, not innerHeight", () => {
    expect(readKeyboardViewport(874, { height: 500, offsetTop: 0 }).bottom).toBe("calc(100% - 500px)");
    expect(readKeyboardViewport(874, { height: 500, offsetTop: 120 }).bottom).toBe("calc(100% - 620px)");
  });
  it("is 0px with no keyboard", () => {
    expect(readKeyboardViewport(874, { height: 874, offsetTop: 0 }).bottom).toBe("0px");
    expect(readKeyboardViewport(874, null).bottom).toBe("0px");
  });
});

describe("useKeyboardViewport", () => {
  beforeEach(() => {
    setInnerHeight(844);
    runFramesSynchronously();
  });
  afterEach(() => {
    removeVV();
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
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344, offsetTop: 0, bottom: "calc(100% - 500px)" });
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current.keyboardOpen).toBe(false);
  });

  it("follows scroll events (offsetTop)", () => {
    const vv = installVV(500, 0);
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344, offsetTop: 0, bottom: "calc(100% - 500px)" });
    act(() => {
      vv.offsetTop = 100;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 244, offsetTop: 100, bottom: "calc(100% - 600px)" });
  });

  it("opening with the keyboard already up reports open on the first render, without waiting for a frame", () => {
    // A dialog/sheet opened while the keyboard is already showing must not
    // paint one frame at the closed geometry (behind the keyboard): the hook
    // reads the viewport synchronously when it subscribes.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1); // frames never run
    installVV(500, 0);
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344, offsetTop: 0, bottom: "calc(100% - 500px)" });
  });

  it("disabled: never subscribes and reads closed", () => {
    const vv = installVV(500);
    const addEventListenerSpy = vi.spyOn(vv, "addEventListener");
    const { result } = renderHook(() => useKeyboardViewport(false));
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0, offsetTop: 0, bottom: "0px" });
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
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0, offsetTop: 0, bottom: "0px" });
  });

  it("toggling enabled on a mounted hook: disabling reads closed immediately, a stale scheduled frame can't resurrect it even after re-enabling", () => {
    const vv = installVV(844);
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useKeyboardViewport(enabled), {
      initialProps: { enabled: true },
    });

    // Keyboard opens while enabled.
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual({ keyboardOpen: true, visibleHeight: 500, bottomInset: 344, offsetTop: 0, bottom: "calc(100% - 500px)" });

    // (a) Disable — output goes closed immediately, regardless of the stored value.
    rerender({ enabled: false });
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0, offsetTop: 0, bottom: "0px" });

    // (b) Re-enable, then schedule an update whose rAF we hold instead of
    // auto-running (override beforeEach's auto-invoking mock), so we can fire
    // it ourselves after disabling again.
    rerender({ enabled: true });
    let staleFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      staleFrame = cb;
      return 1;
    });
    act(() => {
      vv.height = 300;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(staleFrame).not.toBeNull();
    rerender({ enabled: false });
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0, offsetTop: 0, bottom: "0px" });
    act(() => staleFrame!(0));
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 0, bottomInset: 0, offsetTop: 0, bottom: "0px" });

    // (c) Re-enable — the effect's own synchronous read refreshes from the
    // current viewport (no frame needed); the still-pending stale frame from
    // the dead effect instance, even fired after re-enabling, must not
    // clobber it.
    vv.height = 844;
    rerender({ enabled: true });
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 844, bottomInset: 0, offsetTop: 0, bottom: "0px" });

    act(() => staleFrame!(0));
    expect(result.current).toEqual({ keyboardOpen: false, visibleHeight: 844, bottomInset: 0, offsetTop: 0, bottom: "0px" });
  });
});

describe("useKeyboardViewport settling", () => {
  beforeEach(() => {
    setInnerHeight(874);
    vi.useFakeTimers();
  });
  afterEach(() => {
    removeVV();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps reading every frame after an event, so a pan with no scroll events is still caught", () => {
    const vv = installVV(874, 0);
    const { result } = renderHook(() => useKeyboardViewport());
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(16);
    });
    expect(result.current.offsetTop).toBe(0);
    act(() => {
      vv.offsetTop = 120;
      vi.advanceTimersByTime(300);
    });
    expect(result.current.offsetTop).toBe(120);
    expect(result.current.bottom).toBe("calc(100% - 620px)");
  });

  it("a focusin on the document starts a settle too", () => {
    const vv = installVV(500, 0);
    const { result } = renderHook(() => useKeyboardViewport());
    act(() => {
      document.dispatchEvent(new Event("focusin"));
      vv.offsetTop = 80;
      vi.advanceTimersByTime(100);
    });
    expect(result.current.offsetTop).toBe(80);
  });

  it("stops scheduling frames once KEYBOARD_SETTLE_MS has passed", () => {
    const vv = installVV(500, 0);
    renderHook(() => useKeyboardViewport());
    act(() => {
      vv.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(KEYBOARD_SETTLE_MS + 100);
    });
    const raf = vi.spyOn(window, "requestAnimationFrame");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(raf).not.toHaveBeenCalled();
  });
});
