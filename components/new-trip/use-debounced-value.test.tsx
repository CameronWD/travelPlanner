import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  it("settles after the pause", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: "J" } });
    rerender({ v: "Japan" });
    expect(result.current).toBe("J");
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe("Japan");
    vi.useRealTimers();
  });
});
