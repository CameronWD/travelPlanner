import { describe, it, expect, vi } from "vitest";

// budget/page.tsx is a heavy async server component with DB calls.
// We test the desktop two-column grid className via an exported constant so
// we can assert the correct rail width without standing up the full DB/RSC stack.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/budget", () => ({ buildBudget: vi.fn() }));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: vi.fn() }));
vi.mock("@/lib/fx", () => ({ isRateStale: vi.fn() }));
vi.mock("@/lib/dates", () => ({ todayISO: vi.fn(), nightsBetween: vi.fn() }));
vi.mock("@/components/trip/other-cost-editor", () => ({ OtherCostEditor: () => null }));
vi.mock("@/components/trip/cost-amounts", () => ({ CostAmounts: () => null }));
vi.mock("@/components/trip/rates-panel", () => ({ RatesPanel: () => null }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/spend-so-far-card", () => ({ SpendSoFarCard: () => null }));
vi.mock("@/components/trip/budget-hero-row", () => ({ BudgetHeroRow: () => null }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/ui/card", () => ({
  Card: () => null,
  CardContent: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));

const { BUDGET_DESKTOP_GRID_CLASS, BUDGET_CATEGORY_ROW_CLASS, BUDGET_AMOUNT_ROW_CLASS } =
  await import("./page");

/** Track count of the grid template that applies at `sm` and up. */
function smTrackCount(cls: string): number {
  const sm = cls.match(/(?:^| )sm:grid-cols-\[([^\]]+)\]/);
  const base = cls.match(/(?:^| )grid-cols-\[([^\]]+)\]/);
  const template = (sm ?? base)![1];
  return template.split("_").length;
}

describe("Budget desktop right rail", () => {
  it("budget grid uses 20rem rail matching the D5 mockup spec", () => {
    expect(BUDGET_DESKTOP_GRID_CLASS).toContain("20rem");
  });

  it("budget grid has data-testid budget-grid marker", () => {
    expect(BUDGET_DESKTOP_GRID_CLASS).toBeDefined();
  });

  it("budget grid className contains the two-column responsive grid classes", () => {
    expect(BUDGET_DESKTOP_GRID_CLASS).toContain("grid");
    expect(BUDGET_DESKTOP_GRID_CLASS).toContain("grid-cols-1");
    expect(BUDGET_DESKTOP_GRID_CLASS).toContain("lg:grid-cols-");
    expect(BUDGET_DESKTOP_GRID_CLASS).toContain("lg:items-start");
  });
});

// M-7: a row whose template has more tracks than it has children still pays
// the column gap for each empty track, so its amounts ended 12–24px short of
// the right edge — out of line with the flush-right By-chapter rows. Each row
// shape gets a template with exactly one track per child.
describe("Budget breakdown rows line their amounts up flush right", () => {
  it("category rows (label · % · amounts) use three tracks from sm", () => {
    expect(smTrackCount(BUDGET_CATEGORY_ROW_CLASS)).toBe(3);
  });

  it("label + amounts rows (By destination, reconciliation) use two tracks", () => {
    expect(smTrackCount(BUDGET_AMOUNT_ROW_CLASS)).toBe(2);
  });
});
