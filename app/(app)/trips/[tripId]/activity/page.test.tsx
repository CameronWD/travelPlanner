import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const findMany = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/db", () => ({ db: { activity: { findMany } } }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({ user: { id: "u-viewer" } })) }));
const loadSurpriseVisibility = vi.hoisted(() => vi.fn());
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  loadSurpriseVisibility.mockImplementation(async () => actual.NO_SURPRISES);
  return { ...actual, loadSurpriseVisibility };
});
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/activity-feed", () => ({ ActivityFeed: () => <div data-testid="feed" /> }));
vi.mock("@/components/trip/mark-read-on-view", () => ({ MarkReadOnView: () => null }));

const { default: ActivityPage } = await import("./page");
const { hiddenVisibility, MARKER_WHERE } = await import("@/test/helpers/surprise-visibility");

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

describe("Activity page — Surprise (ADR 0051)", () => {
  it("rows inside a Surprise hidden from the viewer stay in the database", async () => {
    loadSurpriseVisibility.mockResolvedValueOnce(hiddenVisibility({ hiddenStopIds: ["s1"] }));
    findMany.mockClear();
    render(await ActivityPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(loadSurpriseVisibility).toHaveBeenCalledWith("t1", "u-viewer");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "t1", ...MARKER_WHERE.activity }, take: 100 }));
  });
});
