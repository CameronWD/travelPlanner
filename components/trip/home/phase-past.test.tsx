import { describe, it, expect, vi, beforeEach } from "vitest";

// phase-past.tsx is a heavy async server component with DB calls.
// We assert the fork-scoping of every plan-entity where-clause by mocking
// db per-model methods directly (mirrors server/actions/search.test.ts and
// the sibling phase-planning.test.tsx / phase-travelling.test.tsx).

const {
  stopFindManyMock,
  transportFindManyMock,
  accommodationFindManyMock,
  itemFindManyMock,
  costFindManyMock,
  exchangeRateFindManyMock,
  chapterFindManyMock,
  journalEntryCountMock,
  buildBudgetMock,
  buildSpendSoFarMock,
} = vi.hoisted(() => ({
  stopFindManyMock: vi.fn(),
  transportFindManyMock: vi.fn(),
  accommodationFindManyMock: vi.fn(),
  itemFindManyMock: vi.fn(),
  costFindManyMock: vi.fn(),
  exchangeRateFindManyMock: vi.fn(),
  chapterFindManyMock: vi.fn(),
  journalEntryCountMock: vi.fn(),
  buildBudgetMock: vi.fn(),
  buildSpendSoFarMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    stop: { findMany: stopFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    item: { findMany: itemFindManyMock },
    cost: { findMany: costFindManyMock },
    exchangeRate: { findMany: exchangeRateFindManyMock },
    chapter: { findMany: chapterFindManyMock },
    journalEntry: { count: journalEntryCountMock },
  },
}));
// Keep the real date helpers (the FX-consistency test below runs the real
// budget/spend builders, which need daysBetween); only nightsBetween is stubbed.
vi.mock("@/lib/dates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dates")>()),
  nightsBetween: vi.fn(),
}));
vi.mock("@/lib/money", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/money")>()),
  formatMoney: vi.fn(),
}));
vi.mock("@/lib/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budget")>()),
  buildBudget: buildBudgetMock,
  applyFxRatesToCosts: vi.fn(),
}));
vi.mock("@/lib/spend-so-far", () => ({ buildSpendSoFar: buildSpendSoFarMock }));
vi.mock("@/lib/chapters", () => ({ chapterForStop: vi.fn() }));
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn() }));
vi.mock("@/lib/cn", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
// React import needed for JSX in mocks above
import React from "react";

const { PAST_DESKTOP_GRID_CLASS, PAST_CTAS_ROW_CLASS, PhasePast } = await import("./phase-past");
const { RouteMapLoader } = await import("@/components/trip/route-map-loader");

// Server components aren't run through a renderer here (see file-header note),
// so a mocked child is never actually invoked. To assert its props without
// standing up a full render, walk the returned React element tree by hand.
function findElementByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) return node as { props: Record<string, unknown> };
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type);
      if (found) return found;
    }
    return null;
  }
  return findElementByType(children, type);
}

describe("PhasePast desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(PAST_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });
});

describe("PhasePast CTA row (mobile overflow fix)", () => {
  it("stacks the two CTA buttons below sm so full label text never clips at 320px", () => {
    expect(PAST_CTAS_ROW_CLASS).toContain("flex-col");
    expect(PAST_CTAS_ROW_CLASS).toContain("sm:flex-row");
  });
});

describe("PhasePast fork-scoped plan queries", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({
      grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 },
    });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
  }

  it("scopes the stops query to the real plan", async () => {
    await renderPast();
    expect(stopFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the transports query to the real plan", async () => {
    await renderPast();
    expect(transportFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the accommodations query to the real plan", async () => {
    await renderPast();
    expect(accommodationFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the items query to the real plan", async () => {
    await renderPast();
    expect(itemFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the costs query to the real plan", async () => {
    await renderPast();
    expect(costFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("scopes the chapters query to the real plan", async () => {
    await renderPast();
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
  });

  it("leaves the trip-wide exchange-rate and journal queries unscoped by forkId", async () => {
    await renderPast();
    expect(exchangeRateFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip-1" } }),
    );
    expect(journalEntryCountMock).toHaveBeenCalledWith({ where: { tripId: "trip-1" } });
  });
});

describe("PhasePast route map order (ADR 0038)", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    return PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
  }

  it("orders the route map's stops chronologically, not by raw sortOrder", async () => {
    // sortOrder says Rome (0) then Florence (1), but Florence's dates come first.
    stopFindManyMock.mockResolvedValue([
      {
        id: "rome", name: "Rome", lat: 41.9, lng: 12.5,
        timezone: "Europe/Rome", arriveDate: "2026-01-08", departDate: "2026-01-10", sortOrder: 0,
      },
      {
        id: "florence", name: "Florence", lat: 43.8, lng: 11.3,
        timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-03", sortOrder: 1,
      },
    ]);

    const tree = await renderPast();

    const routeMapEl = findElementByType(tree, RouteMapLoader);
    expect(routeMapEl).not.toBeNull();
    const stops = routeMapEl!.props.stops as Array<{ id: string }>;
    expect(stops.map((s) => s.id)).toEqual(["florence", "rome"]);
  });
});

describe("PhasePast chapter gating (Task 13)", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue([]);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    // Chapters exist in the DB regardless of the toggle — gating hides the
    // presentation, the data stays.
    chapterFindManyMock.mockResolvedValue([
      { id: "c1", name: "Chapter One", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" },
    ]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 } });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 0,
      paidSoFarMinor: 0,
      paidCostMinor: 0,
      varianceMinor: 0,
      costRemainingMinor: 0,
      tripElapsedPct: 100,
    });
  });

  async function renderPast(tripOverrides: Partial<typeof baseTrip> = {}) {
    await PhasePast({ tripId: "trip-1", trip: { ...baseTrip, ...tripOverrides } });
  }

  it("skips the chapters query when chaptersEnabled is false, and passes no chapters into the budget build", async () => {
    await renderPast({ chaptersEnabled: false });
    expect(chapterFindManyMock).not.toHaveBeenCalled();
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ chapters: [] }),
    );
  });

  it("runs the chapters query when chaptersEnabled is true and feeds it into the budget build", async () => {
    await renderPast({ chaptersEnabled: true });
    expect(chapterFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ forkId: null }) }),
    );
    expect(buildBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapters: [expect.objectContaining({ id: "c1", name: "Chapter One" })],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Playground kit restyle (Task 10b) — kit shared/onthego.jsx "Summary"
// ---------------------------------------------------------------------------

describe("PhasePast Playground kit restyle (Task 10b)", () => {
  const baseTrip = {
    id: "trip-1",
    name: "Test Trip",
    startDate: "2026-01-01",
    endDate: "2026-01-10",
    homeCurrency: "GBP",
    chaptersEnabled: false,
  };
  const STOPS = [
    { id: "rome", name: "Rome", lat: 41.9, lng: 12.5, timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-10", sortOrder: 0 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    stopFindManyMock.mockResolvedValue(STOPS);
    transportFindManyMock.mockResolvedValue([]);
    accommodationFindManyMock.mockResolvedValue([]);
    itemFindManyMock.mockResolvedValue([]);
    costFindManyMock.mockResolvedValue([]);
    exchangeRateFindManyMock.mockResolvedValue([]);
    chapterFindManyMock.mockResolvedValue([]);
    journalEntryCountMock.mockResolvedValue(0);
    buildBudgetMock.mockReturnValue({ grandTotal: { costTotalMinor: 100000, paidTotalMinor: 60000 } });
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 100000,
      paidSoFarMinor: 60000,
      paidCostMinor: 65000,
      varianceMinor: -5000,
      costRemainingMinor: 40000,
      tripElapsedPct: 100,
    });
    const dates = await import("@/lib/dates");
    vi.mocked(dates.nightsBetween).mockReturnValue(9);
    const money = await import("@/lib/money");
    vi.mocked(money.formatMoney).mockImplementation((m: number) => `£${(m / 100).toFixed(2)}`);
  });

  const render = () => PhasePast({ tripId: "trip-1", trip: baseTrip });
  async function dom() {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup((await render()) as Parameters<typeof renderToStaticMarkup>[0]);
    return div;
  }

  it("leads with the 'That's a wrap' heading and the kit Summary stat row (teal nights · sun cost · lilac paid)", async () => {
    const div = await dom();
    expect(div.querySelector("h2")?.textContent).toBe("That's a wrap");
    const statCard = (label: string) =>
      [...div.querySelectorAll(".text-label")].find((el) => el.textContent === label)!.parentElement!;
    expect(statCard("Nights").className).toMatch(/\bbg-teal\b/);
    expect(statCard("Nights").textContent).toContain("9");
    expect(statCard("Trip cost").className).toMatch(/\bbg-sun\b/);
    expect(statCard("Trip cost").textContent).toContain("£1000.00");
    expect(statCard("Paid so far").className).toMatch(/\bbg-lilac\b/);
    expect(statCard("Paid so far").textContent).toContain("£600.00");
    for (const l of ["Nights", "Trip cost", "Paid so far"]) {
      expect(statCard(l).className).toMatch(/\bborder-2\b/);
      expect(statCard(l).className).toMatch(/\bshadow-hard-\d\b/);
    }
    expect(div.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("60");
  });

  it("shows under/over as a status chip, not an accent", async () => {
    let div = await dom();
    const under = [...div.querySelectorAll("span")].filter((s) => /under$/.test(s.textContent ?? "")).pop()!;
    expect(under.className).toMatch(/\bbg-success\b|\bbg-teal\b/);
    buildSpendSoFarMock.mockReturnValue({
      costTotalMinor: 100000, paidSoFarMinor: 60000, paidCostMinor: 50000, varianceMinor: 10000, costRemainingMinor: 40000, tripElapsedPct: 100,
    });
    div = await dom();
    const over = [...div.querySelectorAll("span")].filter((s) => /over$/.test(s.textContent ?? "")).pop()!;
    expect(over.className).toMatch(/\bbg-destructive\b/);
  });

  it("renders the route map bare (it draws its own kit frame) and keeps money a shared pot", async () => {
    const { Card } = await import("@/components/ui/card");
    const tree = await render();
    expect(findElementByType(tree, RouteMapLoader)).not.toBeNull();
    // No Card around the map: the map's own 2px outline + hard shadow is the frame.
    expect(findParent(tree, RouteMapLoader)?.type).not.toBe(Card);
    const div = await dom();
    expect(div.textContent).toContain("shared pot");
    expect(div.textContent).not.toMatch(/per person|each owes|split/i);
    expect(div.innerHTML).not.toMatch(/rounded-2xl border border-border|shadow-soft|hsl\(/);
  });

  it("reads 'Trip cost' and 'of X cost' from one FX source — a foreign cost priced only by the rate table counts in both", async () => {
    const actualBudget = await vi.importActual<typeof import("@/lib/budget")>("@/lib/budget");
    const actualSpend = await vi.importActual<typeof import("@/lib/spend-so-far")>("@/lib/spend-so-far");
    const budgetMod = await import("@/lib/budget");
    buildBudgetMock.mockImplementation(actualBudget.buildBudget);
    vi.mocked(budgetMod.applyFxRatesToCosts).mockImplementation(actualBudget.applyFxRatesToCosts);
    buildSpendSoFarMock.mockImplementation(actualSpend.buildSpendSoFar);
    costFindManyMock.mockResolvedValue([
      // £100 home-currency cost, paid.
      { id: "c1", costMinor: 10000, paidMinor: 10000, currency: "GBP", rateToHome: null, paidAt: new Date("2026-01-02"), ownerType: "OTHER", ownerId: null, label: "Hotel", category: "OTHER" },
      // €200 with no stored rateToHome — only the trip's rate table prices it (EUR→GBP 0.5 = £100).
      { id: "c2", costMinor: 20000, paidMinor: null, currency: "EUR", rateToHome: null, paidAt: null, ownerType: "OTHER", ownerId: null, label: "Tour", category: "OTHER" },
    ]);
    exchangeRateFindManyMock.mockResolvedValue([{ base: "EUR", quote: "GBP", rate: 0.5 }]);

    const div = await dom();
    const statCard = (label: string) =>
      [...div.querySelectorAll(".text-label")].find((el) => el.textContent === label)!.parentElement!;
    expect(statCard("Trip cost").textContent).toContain("£200.00");
    expect(statCard("Paid so far").textContent).toContain("of £200.00 cost");
  });

  it("renders the kit empty treatment in place of the route map when no stop has dates", async () => {
    stopFindManyMock.mockResolvedValue([]);
    const { EmptyState } = await import("@/components/ui/empty-state");
    const empty = findElementByType(await render(), EmptyState);
    expect(empty).not.toBeNull();
    expect(empty!.props.title).toBe("No stops yet");
  });
});

function findParent(node: unknown, type: unknown): { type?: unknown } | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findParent(n, type);
      if (f) return f;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  const kids = ([] as unknown[]).concat(el.props?.children ?? []);
  if (kids.some((k) => k && typeof k === "object" && (k as { type?: unknown }).type === type)) return el;
  return findParent(el.props?.children, type);
}
