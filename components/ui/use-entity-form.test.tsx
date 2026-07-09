import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEntityForm } from "./use-entity-form";

function fakeEvent() {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

describe("useEntityForm", () => {
  it("on success: closes, notifies, no errors", async () => {
    const submit = vi.fn(async () => ({ success: true as const }));
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() => useEntityForm({ submit, onSaved, onClose }));

    const e = fakeEvent();
    act(() => result.current.onSubmit(e));
    expect(e.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    expect(result.current.errors).toEqual({});
  });

  it("on failure: surfaces errors, does not close", async () => {
    const submit = vi.fn(async () => ({ success: false as const, errors: { name: ["Required"] } }));
    const onClose = vi.fn();
    const { result } = renderHook(() => useEntityForm({ submit, onClose }));

    act(() => result.current.onSubmit(fakeEvent()));
    await waitFor(() => expect(result.current.errors.name).toEqual(["Required"]));
    expect(onClose).not.toHaveBeenCalled();
  });
});
