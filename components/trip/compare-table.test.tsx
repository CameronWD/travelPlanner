import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompareTable } from "@/components/trip/compare-table";
import type { ComparisonPlan } from "@/server/actions/forks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/actions/forks", () => ({
  getPromotionPreview: vi.fn(),
  promoteFork: vi.fn(),
  moveFork: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

// Mock PromoteForkDialog — we only need to verify it is rendered and openable
vi.mock("@/components/trip/promote-fork-dialog", () => ({
  PromoteForkDialog: vi.fn(({ open, forkName }: { open: boolean; forkName: string }) =>
    open ? <div data-testid="promote-dialog">{forkName}</div> : null,
  ),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const R = (name: string, nights: number | null, country: string | null = "IT") => ({ name, country, nights });
function makeMetrics(over: Partial<import("@/lib/compare").PlanMetrics>): import("@/lib/compare").PlanMetrics {
  return {
    stopCount: 0, nightTotal: 0, countries: [], projectedEnd: null, hardEndState: "none",
    budgetHomeMinor: null, flagCounts: { warning: 0, info: 0 }, transitMinutes: 0,
    drivingMinutes: 0, flightCount: 0, route: [], legs: [], ...over,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const realPlan: ComparisonPlan = {
  forkId: null,
  name: "Real plan",
  metrics: {
    stopCount: 5,
    nightTotal: 14,
    countries: ["France", "Italy"],
    projectedEnd: "2026-08-15",
    hardEndState: "ok",
    budgetHomeMinor: 500000,
    flagCounts: { warning: 1, info: 2 },
    transitMinutes: 180,
    drivingMinutes: 240,
    flightCount: 2,
    route: [
      { name: "Paris", country: "France", nights: 3 },
      { name: "Lyon", country: "France", nights: 4 },
      { name: "Rome", country: "Italy", nights: 7 },
    ],
    legs: [],
  },
};

const forkA: ComparisonPlan = {
  forkId: "fork-1",
  name: "Beach variant",
  metrics: {
    stopCount: 6,
    nightTotal: 16,
    countries: ["France", "Italy", "Spain"],
    projectedEnd: "2026-08-17",
    hardEndState: "approaching",
    budgetHomeMinor: 620000,
    flagCounts: { warning: 2, info: 1 },
    transitMinutes: 240,
    drivingMinutes: 120,
    flightCount: 3,
    route: [
      { name: "Paris", country: "France", nights: 3 },
      { name: "Lyon", country: "France", nights: 4 },
      { name: "Rome", country: "Italy", nights: 5 },
      { name: "Barcelona", country: "Spain", nights: 4 },
    ],
    legs: [],
  },
};

const trip = { id: "t1", name: "Euro Trip", homeCurrency: "AUD" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompareTable — column order and labels", () => {
  it("renders the real plan column with label 'Real plan'", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Real plan")).toBeInTheDocument();
  });

  it("renders the fork column with its name", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Beach variant")).toBeInTheDocument();
  });

  it("renders the real plan column before fork columns", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const headers = screen.getAllByRole("columnheader");
    const realIdx = headers.findIndex((h) => h.textContent?.includes("Real plan"));
    const forkIdx = headers.findIndex((h) => h.textContent?.includes("Beach variant"));
    expect(realIdx).toBeLessThan(forkIdx);
  });
});

describe("CompareTable — metric rows", () => {
  it("renders the Route row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Route$/i)).toBeInTheDocument();
  });

  it("renders the Projected end row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Projected end$/i)).toBeInTheDocument();
  });

  it("renders the Budget row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Budget$/i)).toBeInTheDocument();
  });

  it("renders the Flags row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Flags$/i)).toBeInTheDocument();
  });

  it("renders the Stops row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Stops$/i)).toBeInTheDocument();
  });

  it("renders the Nights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Nights$/i)).toBeInTheDocument();
  });

  it("renders the Transit time row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Transit time$/i)).toBeInTheDocument();
  });

  it("renders the Driving row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Driving$/i)).toBeInTheDocument();
  });

  it("renders the Flights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText(/^Flights$/i)).toBeInTheDocument();
  });
});

describe("CompareTable — delta badges", () => {
  it("shows a delta badge in the fork column (e.g. +2 nights)", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // nightTotal delta = 16 - 14 = +2 — appears in both mobile and desktop
    expect(screen.getAllByText("+2 nights")).toHaveLength(2);
  });

  it("shows a delta badge for stop count", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // stopCount delta = 6 - 5 = +1
    expect(screen.getAllByText("+1 stop")).toHaveLength(2);
  });

  it("shows a delta badge for flights", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // flightCount delta = 3 - 2 = +1
    expect(screen.getAllByText("+1 flight")).toHaveLength(2);
  });
});

describe("CompareTable — Promote affordance", () => {
  it("renders a Promote button per fork — one in mobile card and one in desktop table", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const promoteButtons = screen.getAllByRole("button", { name: /promote beach variant/i });
    // Two buttons rendered: one in mobile cards (sm:hidden) and one in desktop table (hidden sm:block)
    expect(promoteButtons).toHaveLength(2);
  });

  it("does NOT render a Promote button for the real plan column", () => {
    render(<CompareTable trip={trip} plans={[realPlan]} />);
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("opens the PromoteForkDialog when Promote is clicked", async () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // Click the first available promote button (mobile card)
    const promoteBtn = screen.getAllByRole("button", { name: /promote beach variant/i })[0];
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(screen.getByTestId("promote-dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("promote-dialog")).toHaveTextContent("Beach variant");
  });
});

describe("CompareTable — real plan only (no forks)", () => {
  it("renders just the real plan column with no Promote button", () => {
    render(<CompareTable trip={trip} plans={[realPlan]} />);
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Real plan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });
});

describe("CompareTable — responsive layout visibility gates", () => {
  it("renders a mobile card container (sm:hidden) when given plans", () => {
    const { container } = render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const mobileBlock = container.querySelector(".sm\\:hidden");
    expect(mobileBlock).toBeInTheDocument();
  });

  it("renders a desktop table container (hidden sm:block) when given plans", () => {
    const { container } = render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const desktopBlock = container.querySelector(".hidden.sm\\:block");
    expect(desktopBlock).toBeInTheDocument();
  });

  it("mobile cards contain one card per plan", () => {
    const { container } = render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const mobileBlock = container.querySelector(".sm\\:hidden");
    // Each plan gets a rounded-3xl card
    const cards = mobileBlock?.querySelectorAll(".rounded-3xl");
    expect(cards?.length).toBe(2);
  });
});

describe("CompareTable — route diff in fork columns", () => {
  it("shows the route diff in a fork column: added, dropped, re-nighted and a summary", () => {
    const real = {
      forkId: null,
      name: "Real plan",
      metrics: makeMetrics({ route: [R("Rome", 4), R("Venice", 3)], legs: [] }),
    };
    const fork = {
      forkId: "fork-1",
      name: "Variant B",
      metrics: makeMetrics({ route: [R("Rome", 2), R("Lucerne", 3, "CH")], legs: [] }),
    };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, fork]} />);

    // Summary line for the fork — one per viewport (mobile card + desktop table)
    expect(screen.getAllByText("+Lucerne · -Venice · Rome 4→2n")).toHaveLength(2);
    // Added / dropped / re-nighted markers appear
    expect(screen.getAllByText(/Lucerne/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Venice/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4→2n|4→2/).length).toBeGreaterThan(0);
  });
});

describe("CompareTable — reorder arrows", () => {
  it("renders reorder arrows on fork columns, disabled at the ends", () => {
    const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const c = { forkId: "fork-c", name: "Variant C", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b, c]} />);

    // Four "move left" controls (one per fork per viewport: mobile + desktop);
    // the first fork's buttons are disabled.
    const moveLeft = screen.getAllByRole("button", { name: /move .* left/i });
    expect(moveLeft).toHaveLength(4);
    expect(moveLeft[0]).toBeDisabled();
    const moveRight = screen.getAllByRole("button", { name: /move .* right/i });
    expect(moveRight[moveRight.length - 1]).toBeDisabled();
  });

  it("enables both arrows on a middle fork (neither first nor last)", () => {
    const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const c = { forkId: "fork-c", name: "Variant C", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const d = { forkId: "fork-d", name: "Variant D", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b, c, d]} />);

    // Middle fork "Variant C" is neither first nor last, so both its arrows stay enabled
    // (guards against a disable-all regression that the ends-only test would miss).
    const cLeft = screen.getAllByRole("button", { name: /move Variant C left/i });
    const cRight = screen.getAllByRole("button", { name: /move Variant C right/i });
    expect(cLeft).toHaveLength(2); // one per viewport: mobile + desktop
    expect(cRight).toHaveLength(2);
    for (const btn of [...cLeft, ...cRight]) expect(btn).toBeEnabled();
  });

  it("renders no reorder arrows for the real plan column", () => {
    const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b]} />);

    expect(screen.queryByRole("button", { name: /move Real plan/i })).not.toBeInTheDocument();
  });
});
