import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDraftReporter } from "./use-draft-reporter";

describe("useDraftReporter", () => {
  it("reports the first draft on mount and again only when the built input changes", () => {
    const onDraftChange = vi.fn();
    const { rerender } = renderHook(({ name }) => useDraftReporter(onDraftChange, () => ({ name, skipped: undefined })), {
      initialProps: { name: "Lisbon" },
    });
    expect(onDraftChange).toHaveBeenCalledTimes(1);
    expect(onDraftChange).toHaveBeenLastCalledWith({ name: "Lisbon" });

    rerender({ name: "Lisbon" });
    expect(onDraftChange).toHaveBeenCalledTimes(1);

    rerender({ name: "Porto" });
    expect(onDraftChange).toHaveBeenCalledTimes(2);
    expect(onDraftChange).toHaveBeenLastCalledWith({ name: "Porto" });
  });

  it("calls the latest callback without re-reporting when only the callback changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb, name }) => useDraftReporter(cb, () => ({ name })), {
      initialProps: { cb: first, name: "A" },
    });
    rerender({ cb: second, name: "A" });
    expect(second).not.toHaveBeenCalled();
    rerender({ cb: second, name: "B" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ name: "B" });
  });

  it("does not build the input at all without a callback", () => {
    const build = vi.fn(() => ({}));
    renderHook(() => useDraftReporter(undefined, build));
    expect(build).not.toHaveBeenCalled();
  });
});
