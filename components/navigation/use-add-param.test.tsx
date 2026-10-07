import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/trips/t1/wishlist",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { useAddParam } from "./use-add-param";

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
});

describe("useAddParam (spec 2026-10-06 §F)", () => {
  it("opens for its value, then strips add (keeping other params) without scrolling", async () => {
    nav.search = "plan=f1&add=item";
    const { result } = renderHook(() => useAddParam("item"));
    expect(result.current[0]).toBe(true);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/trips/t1/wishlist?plan=f1", { scroll: false }));
  });

  it("stays closed for another value and leaves the URL alone", () => {
    nav.search = "add=cost";
    const { result } = renderHook(() => useAddParam("item"));
    expect(result.current[0]).toBe(false);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("closes through its setter", () => {
    nav.search = "add=item";
    const { result } = renderHook(() => useAddParam("item"));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
