import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
const shell = vi.hoisted(() => ({ current: { name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }, { user: { id: "u2", name: "Sam", image: null } }] } }));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => shell.current) }));
vi.mock("@/lib/fx", () => ({ isRateStale: vi.fn(() => false) }));
vi.mock("@/lib/tz", () => ({ todayISOInZone: vi.fn(() => "2026-01-05"), currentTripTimezone: vi.fn(() => "UTC") }));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), nightsBetween: vi.fn(() => 9) }));
vi.mock("@/lib/budget", () => ({ buildBudget: vi.fn() }));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: vi.fn(() => ({ paidSoFarMinor: 0 })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/variant-banner", () => ({
  VariantBanner: ({ variantName }: { variantName: string }) => <div data-testid="variant-banner">{variantName}</div>,
}));
vi.mock("@/components/money/add-cost-button", () => ({ AddCostButton: ({ variant }: { variant: string }) => <button type="button" data-testid={`add-cost-${variant}`}>Add a cost</button> }));
vi.mock("@/components/money/paid-bar", () => ({ PaidBar: () => <div data-testid="paid-bar" /> }));
vi.mock("@/components/money/to-pay-panel", () => ({
  ToPayPanel: ({ rows }: { rows: { id: string }[] }) => <div data-testid="to-pay-panel" data-ids={rows.map((r) => r.id).join(",")} />,
}));
vi.mock("@/components/money/breakdown-switch", () => ({
  BreakdownSwitch: ({ value, options }: { value: string; options: { value: string }[] }) => (
    <div data-testid="breakdown-switch" data-value={value} data-options={options.map((o) => o.value).join(",")} />
  ),
}));
vi.mock("@/components/money/stacked-bar", () => ({ StackedBar: () => <div data-testid="stacked-bar" /> }));
vi.mock("@/components/money/rate-cell", () => ({ RateCell: ({ entry }: { entry: { currency: string } }) => <div data-testid={`rate-${entry.currency}`} /> }));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: ({ name }: { name: string }) => <span>{name}</span> }));

const { default: BudgetPage } = await import("./page");
const { buildBudget } = await import("@/lib/budget");

const zero = { costTotalMinor: 0, paidTotalMinor: 0 };
const BUDGET = {
  homeCurrency: "GBP",
  grandTotal: { costTotalMinor: 1000, paidTotalMinor: 0, beforeTotalMinor: 1000, onTripTotalMinor: 0, beforePaidMinor: 0, onTripPaidMinor: 0 },
  byCategory: [{ category: "Transport", costTotalMinor: 1000, paidTotalMinor: 0 }],
  byStop: [],
  byDay: [],
  missingRates: [] as string[],
  hasMissingRates: false,
  byChapter: [] as unknown[],
  chapterReconciliation: { ungrouped: zero, betweenLegs: zero, otherCosts: zero },
};
const ONE_COST = [
  { id: "cost-1", costMinor: 1000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, dueDate: null, ownerType: "OTHER", ownerId: null, label: "Flight", category: "Transport", settlement: "BEFORE" },
];
const TRIP = { homeCurrency: "GBP", startDate: "2026-01-01", endDate: "2026-01-10", chaptersEnabled: true, forksEnabled: true };

async function renderPage(search: Record<string, string | string[]> = {}) {
  render(await BudgetPage({ params: Promise.resolve({ tripId: "trip-1" }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = { name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }, { user: { id: "u2", name: "Sam", image: null } }] };
  vi.mocked(buildBudget).mockReturnValue(BUDGET as never);
  mockDb.trip.findUnique.mockResolvedValue(TRIP);
  mockDb.cost.findMany.mockResolvedValue(ONE_COST);
  for (const k of ["stop", "item", "accommodation", "transport", "exchangeRate", "chapter"] as const) mockDb[k].findMany.mockResolvedValue([]);
  mockDb.fork.findFirst.mockResolvedValue(null);
});

describe("Money page — header", () => {
  it("h1 Money under the trip name, with the meta line and no sr-only heading", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByText("In GBP · 9 nights · 1 cost")).toBeInTheDocument();
    expect(document.querySelector("h2.sr-only")).toBeNull();
    expect(screen.getByRole("link", { name: "Split with 2" })).toHaveAttribute("href", "/trips/trip-1/settings#travellers");
  });
  it("one traveller: no Split pill and no 'each'", async () => {
    shell.current = { ...shell.current, members: [shell.current.members[0]] };
    await renderPage();
    expect(screen.queryByRole("link", { name: /Split with/ })).toBeNull();
    expect(screen.queryByText(/each/)).toBeNull();
  });
});

describe("Money page — plan scoping", () => {
  it("scopes every plan query to the active fork; rates stay trip-wide", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    await renderPage({ plan: "fork-9" });
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fork-9", tripId: "trip-1" } }));
    for (const k of ["cost", "stop", "item", "accommodation", "transport", "chapter"] as const) {
      expect(mockDb[k].findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tripId: "trip-1", forkId: "fork-9" }) }));
    }
    expect(mockDb.exchangeRate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tripId: "trip-1" } }));
  });

  it("a fork hides To pay, Add a cost and the paid bar, and says why", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    await renderPage({ plan: "fork-9" });
    expect(screen.getByTestId("variant-banner")).toHaveTextContent("Plus Switzerland");
    expect(screen.getByText(/Paid tracking lives on the real plan/)).toBeInTheDocument();
    expect(screen.queryByTestId("to-pay-panel")).toBeNull();
    expect(screen.queryByTestId("paid-bar")).toBeNull();
    expect(screen.queryByText("Add a cost")).toBeNull();
  });

  it("the real plan shows To pay, the paid bar and Add a cost", async () => {
    await renderPage();
    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(screen.getByTestId("to-pay-panel")).toHaveAttribute("data-ids", "cost-1");
    expect(screen.getByTestId("paid-bar")).toBeInTheDocument();
    expect(screen.getByTestId("add-cost-pill")).toBeInTheDocument();
    expect(screen.getByTestId("add-cost-round")).toBeInTheDocument();
  });

  it("falls back to the real plan for a fork of another trip, and takes the first of a repeated ?plan= (AB-02)", async () => {
    await renderPage({ plan: ["a", "b"] });
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a", tripId: "trip-1" } }));
    expect(mockDb.cost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }));
  });

  it("ignores ?plan= when plan variants are off", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, forksEnabled: false });
    await renderPage({ plan: "fork-9" });
    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(screen.queryByTestId("variant-banner")).toBeNull();
  });
});

describe("Money page — Where it goes", () => {
  it("passes ?by= through when it is available", async () => {
    await renderPage({ by: "place" });
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-value", "place");
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-options", "category,place");
  });
  it("falls back to Category when the grouping isn't available", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, chaptersEnabled: false });
    await renderPage({ by: "chapter" });
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-value", "category");
    await renderPage({ by: ["day", "place"] });
    expect(screen.getAllByTestId("breakdown-switch")[1]).toHaveAttribute("data-value", "category");
  });
  it("passes no chapters into the budget when chapters are off", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, chaptersEnabled: false });
    mockDb.chapter.findMany.mockResolvedValue([{ id: "c1", name: "One", colour: "sky", startDate: "2026-01-02", endDate: "2026-01-05" }]);
    await renderPage();
    expect(vi.mocked(buildBudget)).toHaveBeenCalledWith(expect.objectContaining({ chapters: [] }));
  });
});

describe("Money page — rates", () => {
  it("a strip per foreign currency and the missing line instead of a banner", async () => {
    mockDb.cost.findMany.mockResolvedValue([
      ...ONE_COST,
      { ...ONE_COST[0], id: "c2", currency: "IDR", rateToHome: null },
      { ...ONE_COST[0], id: "c3", currency: "IDR", rateToHome: null },
    ]);
    vi.mocked(buildBudget).mockReturnValue({ ...BUDGET, missingRates: ["IDR"], hasMissingRates: true } as never);
    await renderPage();
    expect(screen.getAllByTestId("rate-IDR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 IDR costs left out of totals until you set a rate.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Some costs are missing exchange rates/)).toBeNull();
  });
});

describe("Money page — states (MONEY.md §9)", () => {
  it("no dates: the header and a Set dates call to action", async () => {
    mockDb.trip.findUnique.mockResolvedValue({ ...TRIP, startDate: null, endDate: null });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("No dates yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/trip-1/settings");
  });

  it("no costs: a coral Nothing costed yet tile with Add a cost, and the dashed To pay placeholder", async () => {
    mockDb.cost.findMany.mockResolvedValue([]);
    await renderPage();
    const tile = screen.getByRole("heading", { name: "Nothing costed yet" }).closest("section")!;
    expect(tile.className).toContain("bg-coral");
    expect(within(tile).getByText("Costs show up here as you add flights, stays and things to do.")).toBeInTheDocument();
    expect(within(tile).getByTestId("add-cost-pill")).toBeInTheDocument();
    expect(screen.getByText("Due dates will line up here")).toBeInTheDocument();
    expect(screen.queryByTestId("paid-bar")).toBeNull();
  });

  it("no costs on a fork: no Add a cost", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    mockDb.cost.findMany.mockResolvedValue([]);
    await renderPage({ plan: "fork-9" });
    expect(screen.getByTestId("variant-banner")).toBeInTheDocument();
    expect(screen.queryByText("Add a cost")).toBeNull();
  });
});
