import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";
import { useTripShuffle, PHONE_TIMING, AUTO_ROTATE_MS, TAP_COOLDOWN_MS, type ShuffleTiming } from "./use-trip-shuffle";

type Call = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> };
let calls: Call[];
// Each animate() resolves at once unless a test parks `gate`; `finished`
// then waits for gate.resolve().
let gate: { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } | null;
let lingering: { cancel: ReturnType<typeof vi.fn> };

function installAnimate() {
  calls = [];
  gate = null;
  lingering = { cancel: vi.fn() };
  Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const cancel = vi.fn();
    calls.push({ el: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, cancel });
    const finished = gate ? gate.promise : Promise.resolve();
    return { finished, cancel, pause: vi.fn(), play: vi.fn() } as unknown as Animation;
  }) as unknown as typeof Element.prototype.animate;
  Element.prototype.getAnimations = vi.fn(() => [lingering as unknown as Animation]) as unknown as typeof Element.prototype.getAnimations;
}

function park() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  gate = { promise, resolve, reject };
  return gate;
}

const ORDER = ["countdown", "lilac", "stops"] as const;

function Harness({ timing = PHONE_TIMING }: { timing?: ShuffleTiming }) {
  const { trip, pieceRef, shuffle } = useTripShuffle(ORDER, timing);
  return (
    <div>
      <div data-piece="lilac" ref={pieceRef("lilac")} />
      <div data-piece="countdown" ref={pieceRef("countdown")}>
        <button type="button" onClick={() => void shuffle()}>{trip.name}</button>
      </div>
      <div data-piece="stops" ref={pieceRef("stops")} />
    </div>
  );
}

const name = () => screen.getByRole("button").textContent;
const piece = (el: Element) => (el as HTMLElement).dataset.piece;
const flush = () => act(async () => {});

beforeEach(installAnimate);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setMatchMedia((q) => q === "(min-width: 640px)");
});

describe("useTripShuffle (handoff LANDING.md §5.2)", () => {
  it("a tap runs the outs in DOM order, commits, runs the ins in piece order, and cancels the outs", async () => {
    render(<Harness />);
    expect(name()).toBe("Japan in Autumn");
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(calls).toHaveLength(6);
    const outs = calls.slice(0, 3);
    const ins = calls.slice(3);
    expect(outs.map((c) => piece(c.el))).toEqual(["lilac", "countdown", "stops"]);
    expect(outs.map((c) => c.options.delay)).toEqual([0, 30, 60]);
    for (const c of outs) {
      expect(c.options.duration).toBe(170);
      expect(c.options.fill).toBe("forwards");
      expect(c.options.easing).toBe("cubic-bezier(0.4, 0, 1, 1)");
      expect(c.cancel).toHaveBeenCalled();
    }
    expect(outs[1].keyframes).toEqual([{ transform: "none", opacity: 1 }, { transform: "translateY(24px) scale(.9)", opacity: 0 }]);
    expect(outs[2].keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]); // the ribbon only fades
    expect(ins.map((c) => piece(c.el))).toEqual(["countdown", "lilac", "stops"]);
    expect(ins.map((c) => c.options.delay)).toEqual([0, 70, 140]);
    for (const c of ins) {
      expect(c.options.duration).toBe(380);
      expect(c.options.fill).toBe("backwards");
      expect(c.options.easing).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
    }
    expect(ins[0].keyframes[0]).toEqual({ transform: "translateY(-36px) rotate(-6deg) scale(1.06)", opacity: 0 });
    expect(ins[1].keyframes[0]).toEqual({ transform: "translateY(-36px) rotate(6deg) scale(1.06)", opacity: 0 });
    expect(ins[2].keyframes).toEqual([{ opacity: 0 }, { transform: "none", opacity: 1 }]);
  });

  it("desktop timing staggers 20ms out and 55ms in", async () => {
    render(<Harness timing={{ outStaggerMs: 20, inStaggerMs: 55 }} />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(calls.slice(0, 3).map((c) => c.options.delay)).toEqual([0, 20, 40]);
    expect(calls.slice(3).map((c) => c.options.delay)).toEqual([0, 55, 110]);
  });

  it("a second tap while one is running is ignored (guard)", async () => {
    render(<Harness />);
    const g = park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(calls).toHaveLength(3); // one out batch, nothing more
    expect(name()).toBe("Japan in Autumn");
    gate = null;
    await act(async () => { g.resolve(); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(calls).toHaveLength(6);
  });

  it("the finally still advances, cancels anything left on the wrappers and clears the guard when an animation rejects", async () => {
    render(<Harness />);
    const g = park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    gate = null;
    await act(async () => { g.reject(new Error("AbortError")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    expect(lingering.cancel).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("reduced motion: a tap swaps at once with no animation, and no interval is started", async () => {
    setMatchMedia((q) => q === "(prefers-reduced-motion: reduce)");
    const setInterval = vi.spyOn(window, "setInterval");
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(name()).toBe("Portugal by rail");
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();
  });

  it("wraps from the last trip back to the first", async () => {
    render(<Harness />);
    for (let i = 0; i < 4; i++) {
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
    }
    expect(name()).toBe("Japan in Autumn");
  });

  it("unmounting mid-shuffle neither throws nor logs a React error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const g = park();
    const { unmount } = render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    unmount();
    g.resolve();
    await flush();
    expect(error).not.toHaveBeenCalled();
  });

  it("with no Element.animate (an old Safari) the index still advances and the guard clears", async () => {
    const saved = Element.prototype.animate;
    // Simulate a browser without the Web Animations API.
    delete (Element.prototype as Partial<Element>).animate;
    try {
      render(<Harness />);
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
      expect(name()).toBe("Portugal by rail");
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      await flush();
      expect(name()).toBe("Patagonia loop");
    } finally {
      Element.prototype.animate = saved;
    }
  });
});

describe("useTripShuffle auto-rotate (handoff LANDING.md §5.3)", () => {
  it("advances every 8s", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("skips ticks for 16s after a tap", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS); }); // two ticks, both inside the cooldown
    await flush();
    expect(name()).toBe("Portugal by rail");
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); }); // third tick, cooldown over
    await flush();
    expect(name()).toBe("Patagonia loop");
  });

  it("skips a tick while the document is hidden", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<Harness />);
    act(() => { vi.advanceTimersByTime(AUTO_ROTATE_MS); });
    await flush();
    expect(name()).toBe("Japan in Autumn");
  });

  it("skips a tick while a shuffle is running", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    park();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    act(() => { vi.advanceTimersByTime(TAP_COOLDOWN_MS + AUTO_ROTATE_MS); });
    await flush();
    expect(calls).toHaveLength(3); // the tick did not start a second shuffle
  });

  it("clears the interval on unmount", () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<Harness />);
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
