// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { appearMs, probeSavedCopy, trackHidden, wasHiddenSince, resetHiddenForTests, afterNextPaint } from "./timing";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setVisibility("visible");
});

describe("appearMs", () => {
  it("is the rounded time since navigation start for the first screen of a document", () => {
    vi.spyOn(performance, "now").mockReturnValue(812.6);
    expect(appearMs(null, true)).toBe(813);
  });

  it("is the time since the navigation began for a later screen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_400);
    expect(appearMs(10_000, false)).toBe(400);
  });

  it("is null for a later screen with no navigation start", () => {
    expect(appearMs(null, false)).toBeNull();
  });

  it("is null when the document is hidden", () => {
    setVisibility("hidden");
    vi.spyOn(performance, "now").mockReturnValue(500);
    expect(appearMs(null, true)).toBeNull();
  });

  it("is null over 120000 ms or negative", () => {
    vi.spyOn(performance, "now").mockReturnValue(120_001);
    expect(appearMs(null, true)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    expect(appearMs(2000, false)).toBeNull();
  });
});

describe("wasHiddenSince", () => {
  afterEach(() => resetHiddenForTests());

  it("is false when the tab was never hidden", () => {
    trackHidden();
    expect(wasHiddenSince(Date.now() - 1000)).toBe(false);
    expect(wasHiddenSince(null)).toBe(false);
  });

  it("remembers a hide that came and went after the navigation began", () => {
    vi.useFakeTimers();
    trackHidden();
    const startedAt = Date.now();
    vi.advanceTimersByTime(500);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(500);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(wasHiddenSince(startedAt)).toBe(true);
    expect(wasHiddenSince(Date.now())).toBe(false);
    expect(wasHiddenSince(null)).toBe(true);
  });

  it("counts a document that was hidden when tracking began", () => {
    setVisibility("hidden");
    trackHidden();
    expect(wasHiddenSince(null)).toBe(true);
  });
});

describe("afterNextPaint", () => {
  it("falls back to a timer without requestAnimationFrame", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    const cb = vi.fn();
    afterNextPaint(cb);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("afterNextPaint never throws", () => {
  it("swallows a callback that throws", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);
    afterNextPaint(() => {
      throw new Error("boom");
    });
    expect(() => vi.advanceTimersByTime(16)).not.toThrow();
  });

  it("swallows a scheduler that throws", () => {
    vi.stubGlobal("requestAnimationFrame", () => {
      throw new Error("no frames");
    });
    expect(() => afterNextPaint(() => {})).not.toThrow();
  });
});

describe("probeSavedCopy", () => {
  function stubController(answer: unknown | null) {
    const postMessage = vi.fn((_message: unknown, ports?: MessagePort[]) => {
      if (answer !== null) ports?.[0].postMessage(answer);
    });
    Object.defineProperty(navigator, "serviceWorker", { value: { controller: { postMessage } }, configurable: true });
    return postMessage;
  }

  it("is true when the worker answers savedCopy", async () => {
    const postMessage = stubController({ savedCopy: true });
    await expect(probeSavedCopy("/trips/x/plan")).resolves.toBe(true);
    expect(postMessage.mock.calls[0][0]).toEqual({ type: "WAS_SAVED_COPY", url: "/trips/x/plan" });
  });

  it("is false when the worker says it was not", async () => {
    stubController({ savedCopy: false });
    await expect(probeSavedCopy("/trips/x/plan")).resolves.toBe(false);
  });

  it("is false with no controller", async () => {
    Object.defineProperty(navigator, "serviceWorker", { value: { controller: null }, configurable: true });
    await expect(probeSavedCopy("/trips/x/plan")).resolves.toBe(false);
  });

  it("is false after the timeout", async () => {
    vi.useFakeTimers();
    stubController(null);
    const answer = probeSavedCopy("/trips/x/plan", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(answer).resolves.toBe(false);
  });

  it("is false when posting throws", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: { controller: { postMessage: () => { throw new Error("no"); } } },
      configurable: true,
    });
    await expect(probeSavedCopy("/trips/x/plan")).resolves.toBe(false);
  });
});
