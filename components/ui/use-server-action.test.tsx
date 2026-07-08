import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useServerAction } from "./use-server-action";

describe("useServerAction", () => {
  it("routes a failure result into errors and calls onError", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const action = vi.fn(async (id: string) => ({ success: false as const, errors: { name: ["Required"] } }));
    const onError = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onError }));

    act(() => result.current.run("someId"));
    await waitFor(() => expect(result.current.errors.name).toEqual(["Required"]));
    expect(onError).toHaveBeenCalledWith({ name: ["Required"] }, "someId");
    expect(result.current.isPending).toBe(false);
  });

  it("calls onSuccess and clears errors on a success result", async () => {
    const action = vi.fn(async () => ({ success: true as const }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onSuccess }));

    act(() => result.current.run());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(result.current.errors).toEqual({});
  });

  it("passes run() args through to the action and callbacks", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const action = vi.fn(async (id: string) => ({ success: true as const }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useServerAction(action, { onSuccess }));

    act(() => result.current.run("abc"));
    await waitFor(() => expect(action).toHaveBeenCalledWith("abc"));
    expect(onSuccess).toHaveBeenCalledWith({ success: true }, "abc");
  });
});
