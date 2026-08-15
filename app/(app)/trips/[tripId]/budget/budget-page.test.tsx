import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// budget/page.tsx is an async server component. We invoke it directly (it's
// just an async function) to get its resolved element tree, then render that
// tree with RTL to assert on what actually shows up in the DOM. All DB access
// is mocked; UI leaf components are mocked to either pass their children
// through (Card family, so literal copy like "Mark off what you've paid" is
// visible to text queries) or to a detectable marker (VariantBanner,
// SpendSoFarCard) so we can assert presence/absence without depending on
// their internal implementation.

const mockDb = vi.hoisted(() => ({
  trip: { findUnique: vi.fn() },
  fork: { findFirst: vi.fn() },
  cost: { findMany: vi.fn() },
  stop: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
  accommodation: { findMany: vi.fn() },
  transport: { findMany: vi.fn() },
  exchangeRate: { findMany: vi.fn() },
  chapter: { findMany: vi.fn() },
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/budget", () => ({
  buildBudget: vi.fn(() => ({
    grandTotal: { costTotalMinor: 1000, paidTotalMinor: 0 },
    byCategory: [],
    byStop: [],
    byDay: [],
    missingRates: [],
    hasMissingRates: false,
    byChapter: [],
    chapterReconciliation: {
      ungrouped: { costTotalMinor: 0, paidTotalMinor: 0 },
      betweenLegs: { costTotalMinor: 0, paidTotalMinor: 0 },
      otherCosts: { costTotalMinor: 0, paidTotalMinor: 0 },
    },
  })),
}));
vi.mock("@/lib/spend-so-far", () => ({
  buildSpendSoFar: vi.fn(() => ({ paidSoFarMinor: 0 })),
  legacyPaidCount: vi.fn(() => 0),
}));
vi.mock("@/lib/fx", () => ({ isRateStale: vi.fn(() => false) }));
vi.mock("@/lib/dates", () => ({ nightsBetween: vi.fn(() => 5) }));
vi.mock("@/components/trip/other-cost-editor", () => ({
  OtherCostEditor: () => <div data-testid="other-cost-editor" />,
}));
vi.mock("@/components/trip/cost-amounts", () => ({ CostAmounts: () => null }));
vi.mock("@/components/trip/rates-panel", () => ({ RatesPanel: () => null }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: () => null }));
vi.mock("@/components/trip/spend-so-far-card", () => ({
  SpendSoFarCard: () => <div data-testid="spend-so-far-card" />,
}));
vi.mock("@/components/trip/budget-hero-row", () => ({ BudgetHeroRow: () => null }));
vi.mock("@/components/trip/cost-checklist", () => ({ CostChecklist: () => null }));
// Pass `action` through so the "No costs yet" branch's conditional editor slot
// is actually observable in the rendered tree (children/title are not needed
// by these tests, so they're dropped).
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ action }: { action?: React.ReactNode }) => <div data-testid="empty-state">{action}</div>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/trip/variant-banner", () => ({
  VariantBanner: ({ variantName }: { tripId: string; variantName: string }) => (
    <div data-testid="variant-banner">{variantName}</div>
  ),
}));

const { default: BudgetPage } = await import("./page");
const { legacyPaidCount } = await import("@/lib/spend-so-far");

const ONE_COST = [
  {
    id: "cost-1",
    costMinor: 1000,
    paidMinor: 0,
    currency: "GBP",
    rateToHome: 1,
    paidAt: null,
    ownerType: "OTHER",
    ownerId: null,
    label: "Flight",
    category: "Transport",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.trip.findUnique.mockResolvedValue({
    homeCurrency: "GBP",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
  });
  mockDb.cost.findMany.mockResolvedValue(ONE_COST);
  mockDb.stop.findMany.mockResolvedValue([]);
  mockDb.item.findMany.mockResolvedValue([]);
  mockDb.accommodation.findMany.mockResolvedValue([]);
  mockDb.transport.findMany.mockResolvedValue([]);
  mockDb.exchangeRate.findMany.mockResolvedValue([]);
  mockDb.chapter.findMany.mockResolvedValue([]);
  mockDb.fork.findFirst.mockResolvedValue(null);
});

describe("BudgetPage plan scoping", () => {
  it("scopes plan entities to the active fork and hides paid surfaces", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan: "fork-9" }),
    });
    render(jsx);

    // Fork validated against the trip before use.
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-9", tripId: "trip-1" } }),
    );

    // All six plan-entity queries scoped to the active fork.
    expect(mockDb.cost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(mockDb.stop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(mockDb.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(mockDb.accommodation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(mockDb.transport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );
    expect(mockDb.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }),
    );

    // Exchange rates stay trip-wide — no forkId in the where clause at all.
    expect(mockDb.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );

    // Variant banner + note shown.
    expect(screen.getByTestId("variant-banner")).toHaveTextContent("Plus Switzerland");
    expect(
      screen.getByText(/Paid tracking lives on the real plan/i),
    ).toBeInTheDocument();

    // Real-plan-only paid surfaces stay hidden on a fork.
    expect(screen.queryByText("Mark off what you've paid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("spend-so-far-card")).not.toBeInTheDocument();

    // Other-cost creation writes to the real plan (no fork context) — hide
    // the editor on a variant rather than silently misfiling data.
    expect(screen.queryByTestId("other-cost-editor")).not.toBeInTheDocument();
  });

  it("scopes to the real plan and shows paid surfaces when no ?plan= is given", async () => {
    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    // No fork lookup performed when nothing is selected.
    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();

    expect(mockDb.cost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: null }) }),
    );

    expect(screen.queryByTestId("variant-banner")).not.toBeInTheDocument();
    expect(screen.queryByText(/Paid tracking lives on the real plan/i)).not.toBeInTheDocument();

    expect(screen.getByText("Mark off what you've paid")).toBeInTheDocument();
    expect(screen.getByTestId("spend-so-far-card")).toBeInTheDocument();

    // Real plan: Other-cost editor renders normally.
    expect(screen.getByTestId("other-cost-editor")).toBeInTheDocument();
  });

  it("falls back to the real plan when the requested fork doesn't belong to this trip", async () => {
    mockDb.fork.findFirst.mockResolvedValue(null); // not found / wrong trip

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan: "someone-elses-fork" }),
    });
    render(jsx);

    expect(mockDb.cost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null } )}),
    );
    expect(screen.queryByTestId("variant-banner")).not.toBeInTheDocument();
    expect(screen.getByText("Mark off what you've paid")).toBeInTheDocument();
  });
});

describe("BudgetPage 'No costs yet' empty state and Other-costs editor", () => {
  it("hides the Other-costs editor action on a fork, but still shows the variant banner", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    mockDb.cost.findMany.mockResolvedValue([]); // no costs at all -> empty-state branch

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan: "fork-9" }),
    });
    render(jsx);

    expect(screen.getByTestId("variant-banner")).toHaveTextContent("Plus Switzerland");
    expect(screen.queryByTestId("other-cost-editor")).not.toBeInTheDocument();
  });

  it("shows the Other-costs editor action on the real plan", async () => {
    mockDb.cost.findMany.mockResolvedValue([]); // no costs at all -> empty-state branch

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    expect(screen.queryByTestId("variant-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("other-cost-editor")).toBeInTheDocument();
  });
});

describe("BudgetPage legacy paid-without-date notice", () => {
  it("does not show the notice when legacyCount is 0", async () => {
    vi.mocked(legacyPaidCount).mockReturnValue(0);

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    expect(
      screen.queryByText(/cost.*has.*recorded payment but no date/i),
    ).not.toBeInTheDocument();
  });

  it("shows the notice with singular 'cost has' when legacyCount is 1", async () => {
    vi.mocked(legacyPaidCount).mockReturnValue(1);

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    expect(
      screen.getByText(/1 cost has a recorded payment but no date/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tick it off below to confirm/i),
    ).toBeInTheDocument();
  });

  it("shows the notice with plural 'costs have' when legacyCount is 2", async () => {
    vi.mocked(legacyPaidCount).mockReturnValue(2);

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({}),
    });
    render(jsx);

    expect(
      screen.getByText(/2 costs have a recorded payment but no date/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tick them off below to confirm/i),
    ).toBeInTheDocument();
  });

  it("does not show the notice on a fork even when legacyCount > 0", async () => {
    vi.mocked(legacyPaidCount).mockReturnValue(3);
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });

    const jsx = await BudgetPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan: "fork-9" }),
    });
    render(jsx);

    expect(
      screen.queryByText(/cost.*has.*recorded payment but no date/i),
    ).not.toBeInTheDocument();
  });
});
