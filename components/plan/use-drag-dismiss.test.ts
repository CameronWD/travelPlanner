// @vitest-environment jsdom
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
function handleEl(): { sheet: HTMLElement; handle: HTMLElement } {
  const sheet = document.createElement("div");
  sheet.setAttribute("role", "dialog");
  sheet.getBoundingClientRect = () => ({ height: 1000 }) as DOMRect;
  const handle = document.createElement("div");
  handle.setPointerCapture = vi.fn();
  sheet.appendChild(handle);
  document.body.appendChild(sheet);
  return { sheet, handle };
}

function pointer(el: HTMLElement, clientY: number) {
  return { currentTarget: el, clientY, pointerId: 1 } as unknown as React.PointerEvent<HTMLElement>;
}

describe("useDragDismiss (MOTION.md P12)", () => {
  it("moves the sheet with the finger without re-rendering, then dismisses past the threshold", () => {
    const onDismiss = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useDragDismiss({ onDismiss });
    });
    const { sheet, handle } = handleEl();
    const before = renders;
    act(() => result.current.handleProps.onPointerDown!(pointer(handle, 100)));
    act(() => result.current.handleProps.onPointerMove!(pointer(handle, 300)));
    expect(sheet.style.transform).toBe("translateY(200px)");
    act(() => result.current.handleProps.onPointerMove!(pointer(handle, 500)));
    expect(sheet.style.transform).toBe("translateY(400px)");
    expect(sheet.style.transition).toBe("none");
    expect(renders).toBe(before);
    now.mockReturnValue(10_000); // slow: only the distance counts
    act(() => result.current.handleProps.onPointerUp!(pointer(handle, 500)));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Left where it was let go, so the slide-down carries on from there…
    expect(sheet.style.transform).toBe("translateY(400px)");
    // …not cleared by a descendant's animation ending (it bubbles)…
    handle.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(sheet.style.transform).toBe("translateY(400px)");
    // …and cleared once the sheet's own animation ends.
    sheet.dispatchEvent(new Event("animationend"));
    expect(sheet.style.transform).toBe("");
    now.mockRestore();
    sheet.remove();
  });

  it("a dismissed sheet the caller keeps open goes straight back", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useDragDismiss({ onDismiss: vi.fn() }));
      const { sheet, handle } = handleEl();
      sheet.setAttribute("data-state", "open");
      act(() => result.current.handleProps.onPointerDown!(pointer(handle, 0)));
      act(() => result.current.handleProps.onPointerMove!(pointer(handle, 600)));
      act(() => result.current.handleProps.onPointerUp!(pointer(handle, 600)));
      act(() => vi.advanceTimersByTime(1));
      expect(sheet.style.transform).toBe("");
      sheet.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a short slow drag springs back to 0 over --dur-base", () => {
    const onDismiss = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { result } = renderHook(() => useDragDismiss({ onDismiss }));
    const { sheet, handle } = handleEl();
    act(() => result.current.handleProps.onPointerDown!(pointer(handle, 100)));
    act(() => result.current.handleProps.onPointerMove!(pointer(handle, 50)));
    expect(sheet.style.transform).toBe("translateY(0px)");
    act(() => result.current.handleProps.onPointerMove!(pointer(handle, 200)));
    now.mockReturnValue(10_000);
    act(() => result.current.handleProps.onPointerUp!(pointer(handle, 200)));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.transition).toMatch(/var\(--dur-base\)/);
    now.mockRestore();
    sheet.remove();
  });
});
