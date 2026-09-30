import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { shouldDismiss, useDragDismiss } from "./use-drag-dismiss";

describe("shouldDismiss (MOTION.md P12)", () => {
  it("over 30% of the height or a fast flick closes; an upward drag never does", () => {
    expect(shouldDismiss(310, 1000, 0.1)).toBe(true);
    expect(shouldDismiss(200, 1000, 0.1)).toBe(false);
    expect(shouldDismiss(80, 1000, 0.8)).toBe(true);
    expect(shouldDismiss(-300, 1000, 2)).toBe(false);
  });
});

/** A handle inside a 1000px-tall sheet, so the 30% threshold is 300px. */
function handleEl(): HTMLElement {
  const sheet = document.createElement("div");
  sheet.setAttribute("role", "dialog");
  sheet.getBoundingClientRect = () => ({ height: 1000 }) as DOMRect;
  const handle = document.createElement("div");
  handle.setPointerCapture = vi.fn();
  sheet.appendChild(handle);
  return handle;
}

function pointer(el: HTMLElement, clientY: number) {
  return { currentTarget: el, clientY, pointerId: 1 } as unknown as React.PointerEvent<HTMLElement>;
}

describe("useDragDismiss (MOTION.md P12)", () => {
  it("follows the finger downward, then dismisses past the threshold", () => {
    const onDismiss = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { result } = renderHook(() => useDragDismiss({ onDismiss }));
    const el = handleEl();
    act(() => result.current.handleProps.onPointerDown!(pointer(el, 100)));
    act(() => result.current.handleProps.onPointerMove!(pointer(el, 500)));
    expect(result.current.style.transform).toBe("translateY(400px)");
    now.mockReturnValue(10_000); // slow: only the distance counts
    act(() => result.current.handleProps.onPointerUp!(pointer(el, 500)));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("a short slow drag springs back to 0 with a transition", () => {
    const onDismiss = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { result } = renderHook(() => useDragDismiss({ onDismiss }));
    const el = handleEl();
    act(() => result.current.handleProps.onPointerDown!(pointer(el, 100)));
    act(() => result.current.handleProps.onPointerMove!(pointer(el, 50)));
    expect(result.current.style.transform).toBe("translateY(0px)");
    act(() => result.current.handleProps.onPointerMove!(pointer(el, 200)));
    now.mockReturnValue(10_000);
    act(() => result.current.handleProps.onPointerUp!(pointer(el, 200)));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.style.transform).toBeUndefined();
    expect(result.current.style.transition).toMatch(/var\(--dur-base\)/);
    now.mockRestore();
  });
});
