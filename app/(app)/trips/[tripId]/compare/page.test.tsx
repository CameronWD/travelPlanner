import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const whatIf = vi.hoisted(() => ({ hidden: false }));
vi.mock("@/lib/what-if", () => ({
  get WHAT_IF_PLANS_HIDDEN() {
    return whatIf.hidden;
  },
}));

// compare/page.tsx is an async Server Component; mock its data + guards.
const getComparison = vi.fn();
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/actions/forks", () => ({ getComparison: (...a: unknown[]) => getComparison(...a) }));
const requireTripAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  isTripOwnerOrAdmin: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ title, tone }: { title: string; tone?: string }) => (
    <div data-testid="empty-state" data-tone={tone}>{title}</div>
  ),
}));
vi.mock("@/components/trip/compare-table", () => ({
  CompareTable: ({ isOwner }: { isOwner: boolean }) => <div data-testid="compare-table" data-owner={String(isOwner)} />,
}));

requireTripAccessMock.mockResolvedValue({ user: { email: "a@b.c" }, membership: { role: "OWNER" } });
const { default: ComparePage } = await import("./page");
const trip = { id: "t1", name: "Trip", homeCurrency: "AUD", forksEnabled: true };

describe("Compare page kit shape (Task 15)", () => {
  it("no forks renders the EmptyState in the kit's Compare tone (coral)", async () => {
    getComparison.mockResolvedValueOnce({ trip, plans: [{ forkId: null, name: "Real plan", metrics: {} }] });
    render(await ComparePage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Compare plans" })).toBeInTheDocument();
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent("No what-if plans to compare");
    expect(empty).toHaveAttribute("data-tone", "coral");
    expect(screen.queryByTestId("compare-table")).not.toBeInTheDocument();
  });

  it("with forks renders the comparison and passes the owner gate through", async () => {
    getComparison.mockResolvedValueOnce({
      trip,
      plans: [{ forkId: null, name: "Real plan", metrics: {} }, { forkId: "f1", name: "B", metrics: {} }],
    });
    render(await ComparePage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByTestId("compare-table")).toHaveAttribute("data-owner", "true");
    expect(screen.getByText("2 plans")).toBeInTheDocument();
  });

  it("redirects to the plan when plan variants are off — dormant Forks aren't compared", async () => {
    getComparison.mockResolvedValueOnce({
      trip: { ...trip, forksEnabled: false },
      plans: [{ forkId: null, name: "Real plan", metrics: {} }, { forkId: "f1", name: "B", metrics: {} }],
    });
    await expect(ComparePage({ params: Promise.resolve({ tripId: "t1" }) })).rejects.toThrow(
      "NEXT_REDIRECT /trips/t1/plan",
    );
    expect(redirectMock).toHaveBeenCalledWith("/trips/t1/plan");
  });
});

describe("Compare page while What-if plans are hidden", () => {
  beforeEach(() => {
    whatIf.hidden = true;
    getComparison.mockClear();
    redirectMock.mockClear();
  });
  afterEach(() => {
    whatIf.hidden = false;
  });

  it("answers a non-member with not-found, not a redirect naming the trip", async () => {
    requireTripAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(ComparePage({ params: Promise.resolve({ tripId: "t1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getComparison).not.toHaveBeenCalled();
  });

  it("redirects to the Plan before reading anything, even when the trip has Forks enabled", async () => {
    getComparison.mockResolvedValue({ trip, plans: [{ forkId: null, name: "Real plan", metrics: {} }, { forkId: "f1", name: "B", metrics: {} }] });
    await expect(ComparePage({ params: Promise.resolve({ tripId: "t1" }) })).rejects.toThrow("NEXT_REDIRECT /trips/t1/plan");
    expect(getComparison).not.toHaveBeenCalled();
  });
});
