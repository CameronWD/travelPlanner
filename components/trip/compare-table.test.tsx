import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompareTable } from "@/components/trip/compare-table";
import type { ComparisonPlan } from "@/server/actions/forks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/server/actions/forks", () => ({
  getPromotionPreview: vi.fn(),
  promoteFork: vi.fn(),
}));

// Mock PromoteForkDialog — we only need to verify it is rendered and openable
vi.mock("@/components/trip/promote-fork-dialog", () => ({
  PromoteForkDialog: vi.fn(({ open, forkName }: { open: boolean; forkName: string }) =>
    open ? <div data-testid="promote-dialog">{forkName}</div> : null,
  ),
}));

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
    expect(screen.getByText("Real plan")).toBeInTheDocument();
  });

  it("renders the fork column with its name", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText("Beach variant")).toBeInTheDocument();
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
    expect(screen.getByText(/Route/i)).toBeInTheDocument();
  });

  it("renders the Projected end row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Projected end/i)).toBeInTheDocument();
  });

  it("renders the Budget row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Budget/i)).toBeInTheDocument();
  });

  it("renders the Flags row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Flags/i)).toBeInTheDocument();
  });

  it("renders the Stops row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/^Stops$/i)).toBeInTheDocument();
  });

  it("renders the Nights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/^Nights$/i)).toBeInTheDocument();
  });

  it("renders the Transit time row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Transit time/i)).toBeInTheDocument();
  });

  it("renders the Driving row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Driving/i)).toBeInTheDocument();
  });

  it("renders the Flights row", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    expect(screen.getByText(/Flights/i)).toBeInTheDocument();
  });
});

describe("CompareTable — delta badges", () => {
  it("shows a delta badge in the fork column (e.g. +2 nights)", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // nightTotal delta = 16 - 14 = +2
    expect(screen.getByText("+2 nights")).toBeInTheDocument();
  });

  it("shows a delta badge for stop count", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // stopCount delta = 6 - 5 = +1
    expect(screen.getByText("+1 stop")).toBeInTheDocument();
  });

  it("shows a delta badge for flights", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    // flightCount delta = 3 - 2 = +1
    expect(screen.getByText("+1 flight")).toBeInTheDocument();
  });
});

describe("CompareTable — Promote affordance", () => {
  it("renders a Promote button per fork column", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const promoteButtons = screen.getAllByRole("button", { name: /promote/i });
    expect(promoteButtons).toHaveLength(1); // one fork
  });

  it("does NOT render a Promote button for the real plan column", () => {
    render(<CompareTable trip={trip} plans={[realPlan]} />);
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });

  it("opens the PromoteForkDialog when Promote is clicked", async () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} />);
    const promoteBtn = screen.getByRole("button", { name: /promote/i });
    fireEvent.click(promoteBtn);
    await waitFor(() => {
      expect(screen.getByTestId("promote-dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("promote-dialog")).toHaveTextContent("Beach variant");
  });
});

describe("CompareTable — discreet mode", () => {
  it("hides the compare table in discreet mode", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} discreet />);
    // Should not render the Real plan column header
    expect(screen.queryByText("Real plan")).not.toBeInTheDocument();
    // Should not render fork name
    expect(screen.queryByText("Beach variant")).not.toBeInTheDocument();
  });

  it("shows a neutral placeholder in discreet mode", () => {
    render(<CompareTable trip={trip} plans={[realPlan, forkA]} discreet />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });
});

describe("CompareTable — real plan only (no forks)", () => {
  it("renders just the real plan column with no Promote button", () => {
    render(<CompareTable trip={trip} plans={[realPlan]} />);
    expect(screen.getByText("Real plan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
  });
});
