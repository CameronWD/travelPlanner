import { describe, it, expect, vi } from "vitest";

// phase-planning.tsx is a heavy async server component with DB calls.
// We test the desktop grid className via an exported constant so we can assert
// the correct rail width without standing up the full DB/RSC stack.

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/dates", () => ({ daysBetween: vi.fn() }));
vi.mock("@/lib/trip-phase", () => ({ describePhase: vi.fn() }));
vi.mock("@/lib/flags", () => ({ detectFlags: vi.fn() }));
vi.mock("@/lib/budget", () => ({ buildBudget: vi.fn(), applyFxRatesToCosts: vi.fn() }));
vi.mock("@/lib/next-steps", () => ({ buildNextSteps: vi.fn() }));
vi.mock("@/lib/home-base", () => ({ tripHomeBase: vi.fn(), hasOutboundLeg: vi.fn(), hasReturnLeg: vi.fn() }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection: vi.fn() }));
vi.mock("@/lib/chapters", () => ({ chapterForStop: vi.fn() }));
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn() }));
vi.mock("@/components/trip/home/countdown-hero", () => ({ CountdownHero: () => null }));
vi.mock("@/components/trip/home/next-steps-card", () => ({ NextStepsCard: () => null }));
vi.mock("@/components/trip/home/budget-glance", () => ({ BudgetGlance: () => null }));
vi.mock("@/components/trip/home/quick-actions", () => ({ QuickActions: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => null }));

const { PLANNING_DESKTOP_GRID_CLASS } = await import("./phase-planning");

describe("PhasePlanning desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(PLANNING_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});
