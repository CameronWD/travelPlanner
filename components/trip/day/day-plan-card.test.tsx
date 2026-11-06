import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import type { DayViewData } from "@/lib/day-view-loader";

const { sheetMock, lifecycle } = vi.hoisted(() => ({ sheetMock: vi.fn(), lifecycle: { mount: vi.fn(), unmount: vi.fn() } }));
vi.mock("@/components/trip/whats-around-sheet", () => ({
  WhatsAroundSheet: (p: Record<string, unknown>) => {
    sheetMock(p);
    React.useEffect(() => {
      lifecycle.mount();
      return () => lifecycle.unmount();
    }, []);
    return <button>What&apos;s around</button>;
  },
}));
vi.mock("@/components/trip/timeline", () => ({ Timeline: () => null }));
vi.mock("@/components/trip/day/day-ideas-rows", () => ({ DayIdeasRows: () => null }));
vi.mock("@/components/trip/day-feasibility", () => ({ DayFeasibility: () => null }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/day-map-panel", () => ({ DayMapPanel: () => null }));

const { DayPlanCard } = await import("./day-plan-card");

const starts = [
  { key: "accommodation:a1", label: "Tonight's stay", from: { kind: "accommodation" as const, id: "a1" } },
  { key: "stop:s1", label: "Lisbon", from: { kind: "stop" as const, id: "s1" } },
  { key: "item:i1", label: "Castle", from: { kind: "item" as const, id: "i1" } },
];

function data(over: Partial<DayViewData> & { enabled?: boolean } = {}) {
  const { enabled = true, ...rest } = over;
  return {
    tripId: "t1",
    date: "2026-12-08",
    isToday: true,
    phase: "travelling",
    stop: { id: "s1", name: "Lisbon" },
    hasEntries: true,
    planCount: 1,
    ideas: { rows: [], all: [], eyebrow: "" },
    feasibility: [],
    nearby: [],
    whatsAround: { enabled, starts },
    ...rest,
  } as unknown as DayViewData;
}

describe("DayPlanCard What's around", () => {
  it("renders the entry point on a planned day with the start points in order and Near me allowed today", () => {
    sheetMock.mockClear();
    render(<DayPlanCard data={data()} size="desktop" addButton={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "What's around" })).toBeInTheDocument();
    expect(sheetMock).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "t1", date: "2026-12-08", stopId: "s1", startPoints: starts, allowNearMe: true }),
    );
  });

  it("renders it on an empty day too", () => {
    render(<DayPlanCard data={data({ hasEntries: false, planCount: 0 })} size="phone" addButton={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "What's around" })).toBeInTheDocument();
  });

  it("disallows Near me when the day is not today", () => {
    sheetMock.mockClear();
    render(<DayPlanCard data={data({ isToday: false })} size="desktop" addButton={<button>Add</button>} />);
    expect(sheetMock).toHaveBeenCalledWith(expect.objectContaining({ allowNearMe: false }));
  });

  it("renders nothing when the Trip has it off", () => {
    render(<DayPlanCard data={data({ enabled: false })} size="desktop" addButton={<button>Add</button>} />);
    expect(screen.queryByRole("button", { name: "What's around" })).toBeNull();
  });

  it("keeps the same sheet instance when an empty day becomes planned", () => {
    lifecycle.mount.mockClear();
    lifecycle.unmount.mockClear();
    const empty = data({ hasEntries: false, planCount: 0 });
    const { rerender } = render(<DayPlanCard data={empty} size="desktop" addButton={<button>Add</button>} />);
    rerender(<DayPlanCard data={data()} size="desktop" addButton={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "What's around" })).toBeInTheDocument();
    expect(lifecycle.mount).toHaveBeenCalledTimes(1);
    expect(lifecycle.unmount).not.toHaveBeenCalled();
  });

  it("renders nothing with no start points and no Near me", () => {
    render(<DayPlanCard data={data({ isToday: false, whatsAround: { enabled: true, starts: [] } } as never)} size="desktop" addButton={<button>Add</button>} />);
    expect(screen.queryByRole("button", { name: "What's around" })).toBeNull();
  });

  it("renders with no start points when Near me is allowed", () => {
    render(<DayPlanCard data={data({ whatsAround: { enabled: true, starts: [] } } as never)} size="desktop" addButton={<button>Add</button>} />);
    expect(screen.getByRole("button", { name: "What's around" })).toBeInTheDocument();
  });
});
