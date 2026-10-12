import { vi } from "vitest";

/** A fake `window.visualViewport`: an EventTarget with mutable height/offsetTop. */
export type FakeVisualViewport = EventTarget & { height: number; offsetTop: number };

/** Installs a fake `window.visualViewport` (jsdom has none) and returns it, so a test can mutate it and dispatch `resize`/`scroll`. */
export function installVV(height: number, offsetTop = 0): FakeVisualViewport {
  const vv = Object.assign(new EventTarget(), { height, offsetTop });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  return vv;
}

/** Removes the fake again — jsdom's default (no visualViewport) is the keyboard-closed path. */
export function removeVV() {
  Reflect.deleteProperty(window, "visualViewport");
}

/** Sets `window.innerHeight` (the layout viewport the keyboard gap is measured against). */
export function setInnerHeight(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

/** Runs requestAnimationFrame callbacks synchronously, so the hook's rAF-throttled reads land inside act(). Undo with vi.restoreAllMocks(). */
export function runFramesSynchronously() {
  return vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 1;
  });
}
