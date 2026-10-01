import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";
import { useTripHref, useTripSlug, useTripIdFromRef } from "./use-trip-href";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const shell: ShellUser = {
  user: { id: "u1", name: "Cam", email: "c@x", image: null } as ShellUser["user"],
  isAdmin: false,
  adminQueue: EMPTY_ADMIN_QUEUE,
  trips: [{ id: "t1", slug: "christmas-in-europe-2026", name: "Christmas in Europe", statusLine: "" }],
  lastTrip: null,
};
const wrapper = ({ children }: { children: React.ReactNode }) => <ShellUserProvider value={shell}>{children}</ShellUserProvider>;

describe("useTripHref / useTripSlug (ADR 0064)", () => {
  it("builds links from the Trip's slug in the shell's trip list", () => {
    const { result } = renderHook(() => useTripHref("t1"), { wrapper });
    expect(result.current("/day/2026-12-26")).toBe("/trips/christmas-in-europe-2026/day/2026-12-26");
    expect(result.current()).toBe("/trips/christmas-in-europe-2026");
  });
  it("falls back to the id outside the provider or for an unknown Trip (the proxy redirects an id)", () => {
    expect(renderHook(() => useTripSlug("t1")).result.current).toBe("t1");
    expect(renderHook(() => useTripSlug("t9"), { wrapper }).result.current).toBe("t9");
  });
});

describe("useTripIdFromRef (Task 10 extra requirement b/c)", () => {
  it("resolves a slug from the URL back to the Trip's id via the shell's trip list", () => {
    const { result } = renderHook(() => useTripIdFromRef("christmas-in-europe-2026"), { wrapper });
    expect(result.current).toBe("t1");
  });
  it("passes a bare id straight through — it isn't anyone's slug", () => {
    const { result } = renderHook(() => useTripIdFromRef("t1"), { wrapper });
    expect(result.current).toBe("t1");
  });
  it("falls back to the ref itself outside the provider, or for a ref the list doesn't know", () => {
    expect(renderHook(() => useTripIdFromRef("t1")).result.current).toBe("t1");
    expect(renderHook(() => useTripIdFromRef("some-other-slug"), { wrapper }).result.current).toBe("some-other-slug");
  });
  it("passes null through unchanged — no route segment to resolve", () => {
    expect(renderHook(() => useTripIdFromRef(null), { wrapper }).result.current).toBeNull();
  });
});
