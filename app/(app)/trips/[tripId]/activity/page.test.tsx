import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const findMany = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/db", () => ({ db: { activity: { findMany } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/activity-feed", () => ({ ActivityFeed: () => <div data-testid="feed" /> }));
vi.mock("@/components/trip/mark-read-on-view", () => ({ MarkReadOnView: () => null }));

const { default: ActivityPage } = await import("./page");

describe("Activity page header", () => {
  it("is the page h1 with the trip eyebrow and a capped count", async () => {
    findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: String(i) })));
    render(await ActivityPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByText("Last 100 changes")).toBeInTheDocument();
    expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
  });
});
