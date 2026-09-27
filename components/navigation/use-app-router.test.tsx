import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/trips/t1",
  useSearchParams: () => new URLSearchParams(),
}));

import { useAppRouter } from "./use-app-router";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";

describe("useAppRouter", () => {
  it("push/replace forward to the router with their options and report to the pending context", () => {
    const { result } = renderHook(() => ({ router: useAppRouter(), pending: useNavigationPending() }), {
      wrapper: ({ children }) => <NavigationPendingProvider>{children}</NavigationPendingProvider>,
    });
    act(() => result.current.router.push("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] }));
    expect(push).toHaveBeenCalledWith("/trips/t1/day/2026-12-05", { transitionTypes: ["day-forward"] });
    expect(result.current.pending?.href).toBe("/trips/t1/day/2026-12-05");
    act(() => result.current.router.replace("/trips/t1/plan"));
    expect(replace).toHaveBeenCalledWith("/trips/t1/plan", undefined);
  });

  it("is a plain router without a provider", () => {
    const { result } = renderHook(() => useAppRouter());
    act(() => result.current.push("/x"));
    expect(push).toHaveBeenCalledWith("/x", undefined);
  });
});
