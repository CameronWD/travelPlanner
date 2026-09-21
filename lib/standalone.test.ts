import { describe, it, expect, afterEach, vi } from "vitest";
import { isStandalone } from "./standalone";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
});

describe("isStandalone", () => {
  it("is true when the display-mode media query matches", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(isStandalone()).toBe(true);
  });

  it("is true for iOS Safari's legacy navigator.standalone flag", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    (window.navigator as Navigator & { standalone?: boolean }).standalone = true;
    expect(isStandalone()).toBe(true);
  });

  it("is false in an ordinary browser tab", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(isStandalone()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    // Older engines, and any environment where the query cannot be asked:
    // assume a browser tab rather than claiming installed.
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;
    expect(isStandalone()).toBe(false);
  });
});
