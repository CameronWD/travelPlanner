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
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByRole("heading", { level: 3, name: "Real plan" })).toBeInTheDocument();
  });

  it("renders the fork column with its name", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[1]);
    expect(table.getByRole("heading", { level: 3, name: "Beach variant" })).toBeInTheDocument();
  });

  it("renders the real plan column before fork columns", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const headers = screen.getAllByRole("heading", { level: 3 });
    const realIdx = headers.findIndex((h) => h.textContent?.includes("Real plan"));
    const forkIdx = headers.findIndex((h) => h.textContent?.includes("Beach variant"));
    expect(realIdx).toBeLessThan(forkIdx);
  });
});

describe("CompareTable — metric rows", () => {
  it("renders the Route row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Route$/i)).toBeInTheDocument();
  });

  it("renders the Projected end row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Projected end$/i)).toBeInTheDocument();
  });

  it("renders the Trip cost row (shared-pot wording, was \"Budget\")", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Trip cost$/i)).toBeInTheDocument();
    expect(table.getByText(/^shared pot$/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/per person|each owes|split/i);
  });

  it("renders the Flags row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Flags$/i)).toBeInTheDocument();
  });

  it("renders the Stops row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Stops$/i)).toBeInTheDocument();
  });

  it("renders the Nights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Nights$/i)).toBeInTheDocument();
  });

  it("renders the Transit time row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Transit time$/i)).toBeInTheDocument();
  });

  it("renders the Driving row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Driving$/i)).toBeInTheDocument();
  });

  it("renders the Flights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByText(/^Flights$/i)).toBeInTheDocument();
  });
});

describe("CompareTable — delta badges", () => {
  it("shows a delta badge in the fork column (e.g. +2 nights)", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // nightTotal delta = 16 - 14 = +2 — one card tree at every width now
    expect(screen.getAllByText("+2 nights")).toHaveLength(1);
  });

  it("shows a delta badge for stop count", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // stopCount delta = 6 - 5 = +1
    expect(screen.getAllByText("+1 stop")).toHaveLength(1);
  });

  it("shows a delta badge for flights", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // flightCount delta = 3 - 2 = +1
    expect(screen.getAllByText("+1 flight")).toHaveLength(1);
  });
});

describe("CompareTable — Promote affordance", () => {
  it("renders a Promote button per fork — one per fork card (single tree at every width)", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const promoteButtons = screen.getAllByRole("button", { name: /promote beach variant/i });
    expect(promoteButtons).toHaveLength(1);
    // Kit: primary md button (44px) in the fork card's footer
    expect(promoteButtons[0].className).toContain("h-11");
    expect(within(screen.getAllByTestId("plan-card")[1]).getByRole("button", { name: /promote beach variant/i })).toBe(promoteButtons[0]);
  });

  it("does NOT render a Promote button for the real plan column", () => {
    render(<CompareTable trip={trip} plans={[realPlan]} />);
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("ARCH-DAT-1: hides the Promote button for a non-owner", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} isOwner={false} />);
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("opens the PromoteForkDialog when Promote is clicked", async () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // Click the fork card's promote button
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
    const table = within(screen.getAllByTestId("plan-card")[0]);
    expect(table.getByRole("heading", { level: 3, name: "Real plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });
});

describe("CompareTable — kit layout (together.jsx Compare)", () => {
  it("announces flag counts as warnings / info flags", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const card = screen.getAllByTestId("plan-card")[0];
    const sr = [...card.querySelectorAll(".sr-only")].map((e) => e.textContent?.trim());
    expect(sr).toContain("warning");
    expect(sr).toContain("info flags");
    expect(sr).not.toContain("infos");
  });

  it("renders one kit card grid at every width: stacked on phones, two columns from md", () => {
    const { container } = render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const grid = container.querySelector('[data-slot="compare-grid"]');
    expect(grid).toBeInTheDocument();
    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("md:grid-cols-2");
    // The old duplicated mobile/desktop trees and the table are gone
    expect(container.querySelector(".sm\\:hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("gives each plan a kit Card: real plan white with a REAL PLAN chip, forks a lilac island with FORK", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const cards = screen.getAllByTestId("plan-card");
    expect(cards).toHaveLength(2);
    for (const c of cards) expect(c.className).toContain("border-2");
    expect(cards[0].className).toContain("bg-card");
    expect(cards[0].className).toContain("shadow-hard-2");
    expect(within(cards[0]).getByText(/^real plan$/i, { selector: "span" }).className).toContain("uppercase");
    expect(cards[1].className).toContain("island");
    expect(cards[1].className).toContain("bg-lilac");
    expect(cards[1].className).toContain("shadow-hard-4");
    expect(within(cards[1]).getByText(/^fork$/i)).toBeInTheDocument();
    expect(within(cards[1]).getByRole("heading", { level: 3, name: "Beach variant" })).toBeInTheDocument();
  });

  it("metric labels use the kit Label type", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const card = within(screen.getAllByTestId("plan-card")[0]);
    expect(card.getByText(/^Nights$/).className).toContain("text-label");
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

    // Summary line for the fork — one card tree at every width
    expect(screen.getAllByText("+Lucerne · -Venice · Rome 4→2n")).toHaveLength(1);
    // Added / dropped / re-nighted markers appear
    expect(screen.getAllByText(/Lucerne/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Venice/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4→2n|4→2/).length).toBeGreaterThan(0);

    // Kit rows: a changed stop is a bordered row; a dropped one is struck through with "− "
    const rows = within(screen.getAllByTestId("plan-card")[1]).getAllByTestId("route-row");
    const venice = rows.find((r) => r.textContent?.includes("Venice"))!;
    expect(venice.className).toContain("line-through");
    expect(venice.className).toContain("border-border");
    expect(venice.textContent).toMatch(/^− Venice/);
    const lucerne = rows.find((r) => r.textContent?.includes("Lucerne"))!;
    expect(lucerne.textContent).toMatch(/^\+ Lucerne/);
    expect(lucerne.dataset.change).toBe("added");
    const rome = rows.find((r) => r.textContent?.includes("Rome"))!;
    expect(rome.dataset.change).toBe("renighted");
    // The visible prefix is decorative; only the sr-only word is announced.
    for (const [row, glyph, word] of [[venice, "−", "dropped"], [lucerne, "+", "added"]] as const) {
      const hidden = [...row.querySelectorAll('[aria-hidden="true"]')].map((e) => e.textContent?.trim());
      expect(hidden).toContain(glyph);
      expect(row.querySelector(".sr-only")?.textContent).toContain(word);
    }
  });
});

describe("CompareTable — reorder arrows", () => {
  it("renders reorder arrows on fork columns, disabled at the ends", () => {
    const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const c = { forkId: "fork-c", name: "Variant C", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b, c]} />);

    // Two "move left" controls (one per fork, single card tree);
    // the first fork's buttons are disabled.
    const moveLeft = screen.getAllByRole("button", { name: /move .* left/i });
    expect(moveLeft).toHaveLength(2);
    // 44px touch targets with the 3px focus ring
    for (const b of moveLeft) {
      expect(b.className).toContain("size-11");
      expect(b.className).toContain("focus-visible:ring-[3px]");
    }
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
    expect(cLeft).toHaveLength(1); // one per fork card
    expect(cRight).toHaveLength(1);
    for (const btn of [...cLeft, ...cRight]) expect(btn).toBeEnabled();
  });

  it("renders no reorder arrows for the real plan column", () => {
    const real = { forkId: null, name: "Real plan", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    const b = { forkId: "fork-b", name: "Variant B", metrics: makeMetrics({ route: [R("Rome", 3)] }) };
    render(<CompareTable trip={{ id: "trip-1", name: "Trip", homeCurrency: "AUD" }} plans={[real, b]} />);

    expect(screen.queryByRole("button", { name: /move Real plan/i })).not.toBeInTheDocument();
  });
});
