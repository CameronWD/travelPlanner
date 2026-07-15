import { describe, it, expect, vi } from "vitest";

// summary/page.tsx is a heavy async server component with DB calls.
// We test the desktop grid className via an exported constant so we can assert
// the correct rail width without standing up the full DB/RSC stack.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/money", () => ({ formatMoney: vi.fn() }));
vi.mock("@/lib/dates", () => ({ formatDateRange: vi.fn(), nightsBetween: vi.fn() }));
vi.mock("@/lib/budget", () => ({ buildBudget: vi.fn(), applyFxRatesToCosts: vi.fn() }));
vi.mock("@/lib/flags", () => ({ detectFlags: vi.fn() }));
vi.mock("@/lib/home-base", () => ({ tripHomeBase: vi.fn() }));
vi.mock("@/lib/route-map", () => ({ homeMapPoint: vi.fn() }));
vi.mock("@/server/actions/stops", () => ({ getTripProjection: vi.fn() }));
vi.mock("@/lib/chapters", () => ({ groupStopsByChapter: vi.fn(), chapterForStop: vi.fn() }));
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn() }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/cost-amounts", () => ({ CostAmounts: () => null }));

const { SUMMARY_DESKTOP_GRID_CLASS } = await import("./page");

describe("Summary desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(SUMMARY_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});
