import { describe, it, expect, vi, beforeEach } from "vitest";
import { Suspense, type ReactElement } from "react";

const loadNavCountsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/nav-counts", () => ({ loadNavCounts: loadNavCountsMock }));

import { PlanCount, WishlistCount, sidebarNavCounts } from "./sidebar-nav-counts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanCount", () => {
  it("renders the flags count when > 0", async () => {
    loadNavCountsMock.mockResolvedValue({ flags: 3, wishlist: 0 });
    const el = (await PlanCount({ tripId: "t1" })) as ReactElement<{ children: number }> | null;
    expect(el).not.toBeNull();
    expect(el!.props.children).toBe(3);
    expect(loadNavCountsMock).toHaveBeenCalledWith("t1");
  });

  it("renders nothing (null) at 0", async () => {
    loadNavCountsMock.mockResolvedValue({ flags: 0, wishlist: 5 });
    const el = await PlanCount({ tripId: "t1" });
    expect(el).toBeNull();
  });
});

describe("WishlistCount", () => {
  it("renders the wishlist count when > 0", async () => {
    loadNavCountsMock.mockResolvedValue({ flags: 0, wishlist: 7 });
    const el = (await WishlistCount({ tripId: "t1" })) as ReactElement<{ children: number }> | null;
    expect(el).not.toBeNull();
    expect(el!.props.children).toBe(7);
  });

  it("renders nothing (null) at 0", async () => {
    loadNavCountsMock.mockResolvedValue({ flags: 9, wishlist: 0 });
    const el = await WishlistCount({ tripId: "t1" });
    expect(el).toBeNull();
  });
});

describe("sidebarNavCounts", () => {
  it("wraps Plan and Wishlist each in their own Suspense, scoped to the trip", () => {
    const counts = sidebarNavCounts("t1");
    const plan = counts.Plan as ReactElement<{ children: ReactElement<{ tripId: string }>; fallback: unknown }>;
    const wishlist = counts.Wishlist as ReactElement<{ children: ReactElement<{ tripId: string }>; fallback: unknown }>;
    expect(plan.type).toBe(Suspense);
    expect(wishlist.type).toBe(Suspense);
    expect(plan.props.children.props.tripId).toBe("t1");
    expect(wishlist.props.children.props.tripId).toBe("t1");
    expect(plan.props.fallback).toBeNull();
  });
});
