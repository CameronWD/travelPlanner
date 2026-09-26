import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// compare/page.tsx is an async Server Component; mock its data + guards.
const getComparison = vi.fn();
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/actions/forks", () => ({ getComparison: (...a: unknown[]) => getComparison(...a) }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn().mockResolvedValue({ user: { email: "a@b.c" }, membership: { role: "OWNER" } }),
  isTripOwnerOrAdmin: vi.fn().mockReturnValue(true),
}));
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ title, tone }: { title: string; tone?: string }) => (
    <div data-testid="empty-state" data-tone={tone}>{title}</div>
  ),
}));
vi.mock("@/components/trip/compare-table", () => ({
  CompareTable: ({ isOwner }: { isOwner: boolean }) => <div data-testid="compare-table" data-owner={String(isOwner)} />,
}));

const { default: ComparePage, COMPARE_TITLE_CLASS } = await import("./page");
const trip = { id: "t1", name: "Trip", homeCurrency: "AUD", forksEnabled: true };

describe("Compare page kit shape (Task 15)", () => {
  it("title uses the kit display type (extrabold, 28px → 4xl)", () => {
    expect(COMPARE_TITLE_CLASS).toContain("font-extrabold");
    expect(COMPARE_TITLE_CLASS).toContain("sm:text-4xl");
  });

  it("no forks renders the EmptyState in the kit's Compare tone (coral)", async () => {
    getComparison.mockResolvedValueOnce({ trip, plans: [{ forkId: null, name: "Real plan", metrics: {} }] });
    render(await ComparePage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("heading", { level: 2, name: "Compare plans" }).className).toBe(COMPARE_TITLE_CLASS);
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent("No variants to compare");
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
