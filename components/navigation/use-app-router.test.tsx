import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
// One router object, as Next's useRouter() returns across renders.
const router = { push, replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));

import { useAppRouter } from "./use-app-router";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";

describe("useAppRouter", () => {
  it("push/replace forward to the router with their options and report to the pending context", async () => {
    const { result } = renderHook(() => ({ router: useAppRouter(), pending: useNavigationPending() }), {
      wrapper: ({ children }) => <NavigationPendingProvider>{children}</NavigationPendingProvider>,
    });
    // Held in flight (as the real router's transition is while the server responds).
    let finish!: () => void;
    const gate = new Promise<void>((r) => { finish = r; });
    push.mockImplementationOnce(() => gate);
    act(() => result.current.router.push("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] }));
    expect(push).toHaveBeenCalledWith("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] });
    expect(result.current.pending?.href).toBe("/trips/t1/day/2026-12-05");
    await act(async () => {
      finish();
      await gate;
    });
    act(() => result.current.router.replace("/trips/t1/plan"));
    expect(replace).toHaveBeenCalledWith("/trips/t1/plan", undefined);
  });

  it("settles when its transition ends even though the URL never changed (a redirect back to the page shown)", async () => {
    // A push whose navigation suspends until we resolve it — as the real
    // router's transition does while the server responds.
    let finish!: () => void;
    const gate = new Promise<void>((r) => { finish = r; });
    push.mockImplementationOnce(() => gate);
    const { result } = renderHook(() => ({ router: useAppRouter(), pending: useNavigationPending() }), {
      wrapper: ({ children }) => <NavigationPendingProvider>{children}</NavigationPendingProvider>,
    });
    act(() => result.current.router.push("/trips/t1/day"));
    expect(result.current.pending?.href).toBe("/trips/t1/day");
    await act(async () => {
      finish();
      await gate;
    });
    expect(result.current.pending).toBeNull();
  });

  it("keeps its identity across renders", () => {
    const { result, rerender } = renderHook(() => useAppRouter(), {
      wrapper: ({ children }) => <NavigationPendingProvider>{children}</NavigationPendingProvider>,
    });
    const first = result.current;
    act(() => result.current.push("/trips/t1/plan"));
    rerender();
    expect(result.current).toBe(first);
  });

  it("is a plain router without a provider", () => {
    const { result } = renderHook(() => useAppRouter());
    act(() => result.current.push("/x"));
    expect(push).toHaveBeenCalledWith("/x", undefined);
  });
});
