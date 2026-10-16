import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// The Money page's Plan data comes from one `readPlan` call (lib/plan-reads.ts)
// — mocked here with the `PlanRows` a real call would hand back for the
// scenario (`planRows()`); `readPlan`'s query shapes, plan scoping and
// Surprise masking are pinned in lib/plan-reads.test.ts. The `?plan=` gate
// (`resolvePlanParam`) runs for real over a mocked Trip shell and `db.fork`.
const mockDb = vi.hoisted(() => ({
  fork: { findFirst: vi.fn() },
}));
const MEMBERS = [{ user: { id: "u1", name: "Cam", image: null } }, { user: { id: "u2", name: "Sam", image: null } }];
const TRIP_BASE = { name: "Christmas in Europe", slug: null, homeCurrency: "GBP", startDate: "2026-01-01", endDate: "2026-01-10", chaptersEnabled: true, forksEnabled: true, homeTimezone: null, members: MEMBERS, deletedAt: null };
/** The scenario a test sets; `readPlan` hands back the PlanRows a real call would have produced for it. */
const scenario = vi.hoisted(() => ({
  trip: {} as Record<string, unknown>,
  costs: [] as Record<string, unknown>[],
  stops: [] as Record<string, unknown>[],
  chapters: [] as Record<string, unknown>[],
  budgetItems: [] as Record<string, unknown>[],
  budgetAccommodations: [] as Record<string, unknown>[],
  visibility: undefined as unknown,
}));
const { readPlanMock } = vi.hoisted(() => ({ readPlanMock: vi.fn() }));
vi.mock("@/lib/plan-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan-reads")>();
  return { ...actual, readPlan: readPlanMock };
});

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children?: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn().mockResolvedValue({ user: { id: "u1" }, membership: {} }) }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => scenario.trip), readTripHeader: vi.fn(async () => scenario.trip) }));
vi.mock("@/lib/money/fx", () => ({ isRateStale: vi.fn(() => false) }));
vi.mock("@/lib/tz", () => ({ todayISOInZone: vi.fn(() => "2026-01-05"), currentTripTimezone: vi.fn(() => "UTC") }));
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), nightsBetween: vi.fn(() => 9) }));
vi.mock("@/lib/money/budget", () => ({ buildBudget: vi.fn() }));
vi.mock("@/lib/money/spend-so-far", () => ({ buildSpendSoFar: vi.fn(() => ({ paidSoFarMinor: 0 })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/components/trip/variant-banner", () => ({
  VariantBanner: ({ variantName }: { variantName: string }) => <div data-testid="variant-banner">{variantName}</div>,
}));
vi.mock("@/components/money/add-cost-from-url", () => ({
  AddCostFromUrl: ({ defaults }: { defaults?: { currency: string; settlement: string } }) => (
    <div data-testid="add-cost-from-url" data-currency={defaults?.currency ?? "none"} data-settlement={defaults?.settlement ?? "none"} />
  ),
}));
vi.mock("@/components/money/add-cost-button", () => ({ AddCostButton: ({ variant }: { variant: string }) => <button type="button" data-testid={`add-cost-${variant}`}>Add a cost</button> }));
vi.mock("@/components/money/paid-bar", () => ({ PaidBar: () => <div data-testid="paid-bar" /> }));
vi.mock("@/components/money/to-pay-panel", () => ({
  ToPayPanel: ({ rows }: { rows: { id: string; label: string }[] }) => (
    <div data-testid="to-pay-panel" data-ids={rows.map((r) => r.id).join(",")} data-labels={rows.map((r) => r.label).join("|")} />
  ),
}));
vi.mock("@/components/money/breakdown-switch", () => ({
  BreakdownSwitch: ({ value, options }: { value: string; options: { value: string }[] }) => (
    <div data-testid="breakdown-switch" data-value={value} data-options={options.map((o) => o.value).join(",")} />
  ),
}));
vi.mock("@/components/money/stacked-bar", () => ({
  StackedBar: () => <div data-testid="stacked-bar" />,
  FadeSwap: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/money/rate-cell", () => ({
  RateCell: ({ entry }: { entry: { currency: string } }) => <div data-testid={`rate-${entry.currency}`} />,
  CollapsibleLine: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/trip/chapter-chip", () => ({ ChapterChip: ({ name }: { name: string }) => <span>{name}</span> }));

const { default: BudgetPage } = await import("./page");
const { buildBudget } = await import("@/lib/money/budget");
const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
const { maskPlanStops } = await import("@/lib/plan-reads");
const { planRows } = await import("@/test/builders/plan-rows");
const { hiddenVisibility, placeholderItem } = await import("@/test/helpers/surprise-visibility");

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
  surpriseCostIds: [] as string[],
};
const ONE_COST = [
  { id: "cost-1", costMinor: 1000, paidMinor: null, currency: "GBP", rateToHome: 1, paidAt: null, dueDate: null, ownerType: "OTHER", ownerId: null, label: "Flight", category: "Transport", settlement: "BEFORE" },
];
const TRIP = TRIP_BASE;

function rowsFor(plan: string | null) {
  const v = (scenario.visibility ?? NO_SURPRISES) as typeof NO_SURPRISES;
  return planRows({
    trip: scenario.trip as never,
    plan,
    fork: plan ? { id: plan, name: "Plus Switzerland" } : null,
    visibility: v,
    stops: maskPlanStops(scenario.stops as { id: string }[], v) as never,
    transports: [],
    accommodations: [],
    items: [],
    costs: scenario.costs as never,
    exchangeRates: [],
    chapters: scenario.chapters as never,
    budgetItems: scenario.budgetItems as never,
    budgetAccommodations: scenario.budgetAccommodations as never,
  });
}

async function renderPage(search: Record<string, string | string[]> = {}) {
  render(await BudgetPage({ params: Promise.resolve({ tripId: "trip-1" }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildBudget).mockReturnValue(BUDGET as never);
  scenario.trip = TRIP;
  scenario.costs = ONE_COST;
  scenario.stops = [];
  scenario.chapters = [];
  scenario.budgetItems = [];
  scenario.budgetAccommodations = [];
  scenario.visibility = NO_SURPRISES;
  readPlanMock.mockImplementation(async (_tripId: string, _viewer: string | null, plan: string | null) => rowsFor(plan));
  mockDb.fork.findFirst.mockResolvedValue(null);
});

describe("Money page — reads the Plan once (buildBudgetFromRows takes the rows readPlan handed back)", () => {
  it("calls readPlan exactly once per render, for this viewer", async () => {
    await renderPage();
    expect(readPlanMock).toHaveBeenCalledTimes(1);
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "u1", null);
  });
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
    scenario.trip = { ...TRIP, members: [MEMBERS[0]] };
    await renderPage();
    expect(screen.queryByRole("link", { name: /Split with/ })).toBeNull();
    expect(screen.queryByText(/each/)).toBeNull();
  });
});

describe("Money page — plan scoping", () => {
  it("reads the active fork's Plan", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-9", name: "Plus Switzerland" });
    await renderPage({ plan: "fork-9" });
    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fork-9", tripId: "trip-1" } }));
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "u1", "fork-9");
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
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "u1", null);
  });

  it("ignores ?plan= when plan variants are off", async () => {
    scenario.trip = { ...TRIP, forksEnabled: false };
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
    scenario.trip = { ...TRIP, chaptersEnabled: false };
    await renderPage({ by: "chapter" });
    expect(screen.getByTestId("breakdown-switch")).toHaveAttribute("data-value", "category");
    await renderPage({ by: ["day", "place"] });
    expect(screen.getAllByTestId("breakdown-switch")[1]).toHaveAttribute("data-value", "category");
  });
  it("passes no chapters into the budget when chapters are off", async () => {
    scenario.trip = { ...TRIP, chaptersEnabled: false };
    // Handed through even with the toggle off, so the page's own guard is what's under test.
    scenario.chapters = [{ id: "c1", name: "One", colour: "sky", startDate: "2026-01-02", endDate: "2026-01-05" }];
    await renderPage();
    expect(vi.mocked(buildBudget)).toHaveBeenCalledWith(expect.objectContaining({ chapters: [] }));
  });
});

describe("Money page — rates", () => {
  it("a strip per foreign currency and the missing line instead of a banner", async () => {
    scenario.costs = [
      ...ONE_COST,
      { ...ONE_COST[0], id: "c2", currency: "IDR", rateToHome: null },
      { ...ONE_COST[0], id: "c3", currency: "IDR", rateToHome: null },
    ];
    vi.mocked(buildBudget).mockReturnValue({ ...BUDGET, missingRates: ["IDR"], hasMissingRates: true } as never);
    await renderPage();
    expect(screen.getAllByTestId("rate-IDR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 IDR costs left out of totals until you set a rate.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Some costs are missing exchange rates/)).toBeNull();
  });
});

describe("Money page — states (MONEY.md §9)", () => {
  it("no dates: the header and a Set dates call to action", async () => {
    scenario.trip = { ...TRIP, startDate: null, endDate: null };
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("No dates yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/trip-1/settings");
  });

  it("no costs: a coral Nothing costed yet tile with Add a cost, and the dashed To pay placeholder", async () => {
    scenario.costs = [];
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
    scenario.costs = [];
    await renderPage({ plan: "fork-9" });
    expect(screen.getByTestId("variant-banner")).toBeInTheDocument();
    expect(screen.queryByText("Add a cost")).toBeNull();
  });
});

describe("Money page — ?add=cost defaults (spec 2026-10-06 §K)", () => {
  it("while Travelling, a new cost defaults to today's Stop currency and On the trip", async () => {
    // todayISOInZone is mocked to 2026-01-05; TRIP runs 2026-01-01 → 2026-01-10.
    scenario.stops = [
      { id: "s1", name: "Paris", timezone: "Europe/Paris", arriveDate: "2026-01-04", departDate: "2026-01-07", sortOrder: 0, countryCode: "fr", notes: null },
    ];
    await renderPage();
    const mount = screen.getByTestId("add-cost-from-url");
    expect(mount).toHaveAttribute("data-currency", "EUR");
    expect(mount).toHaveAttribute("data-settlement", "ON_TRIP");
  });

  it("before the trip, the plain defaults", async () => {
    scenario.trip = { ...TRIP, startDate: "2026-03-01", endDate: "2026-03-10" };
    await renderPage();
    expect(screen.getByTestId("add-cost-from-url")).toHaveAttribute("data-currency", "GBP");
  });
});

describe("Money page — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  function surprised() {
    scenario.visibility = hiddenVisibility({ viewerId: "u1", placeholders: [placeholderItem({ id: "cost-hidden-owner" })] });
  }

  it("reads the Plan for this viewer and passes its hiddenOwnerIds through as surpriseOwnerIds", async () => {
    surprised();
    await renderPage();
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "u1", null);
    expect(vi.mocked(buildBudget)).toHaveBeenCalledWith(expect.objectContaining({ surpriseOwnerIds: ["cost-hidden-owner"] }));
  });

  it("drops a line folded into the Surprise category from the To pay panel and the All costs sheet, while the totals keep the money", async () => {
    surprised();
    scenario.costs = [
      ...ONE_COST,
      { ...ONE_COST[0], id: "cost-hidden", ownerId: "cost-hidden-owner" },
    ];
    vi.mocked(buildBudget).mockReturnValue({ ...BUDGET, surpriseCostIds: ["cost-hidden"] } as never);
    await renderPage();
    // The lines list drops the hidden cost's line...
    expect(screen.getByTestId("to-pay-panel")).toHaveAttribute("data-ids", "cost-1");
    // ...but the grand total (CostTile reads budget.grandTotal, unfiltered by this page) is untouched.
    expect(vi.mocked(buildBudget)).toHaveBeenCalledWith(expect.objectContaining({ costs: expect.arrayContaining([expect.objectContaining({ id: "cost-hidden" })]) }));
  });
});

describe("Money page — Cost owner labels", () => {
  it("labels an unlabelled Cost by its owner, including a Wishlist idea and a stay outside the visible Plan rows", async () => {
    scenario.costs = [
      { ...ONE_COST[0], id: "c-idea", label: null, ownerType: "ITEM", ownerId: "idea-1" },
      { ...ONE_COST[0], id: "c-stay", label: null, ownerType: "ACCOMMODATION", ownerId: "acc-1" },
    ];
    // An idea (no Stop, no date) is never a Plan placement, so only the
    // unfiltered budget rows carry it.
    scenario.budgetItems = [{ id: "idea-1", stopId: null, category: "FOOD", date: null, title: "Pastéis de Belém" }];
    scenario.budgetAccommodations = [{ id: "acc-1", stopId: "s1", checkIn: "2026-01-02", checkOut: "2026-01-04", name: "Hotel Avenida" }];
    await renderPage();
    const labels = screen.getByTestId("to-pay-panel").getAttribute("data-labels")!.split("|");
    expect(labels).toEqual(expect.arrayContaining(["Pastéis de Belém", "Hotel Avenida"]));
  });
});
