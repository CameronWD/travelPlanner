import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { loadYourTravelsMock, travelMapMock, travelStatsTilesMock } = vi.hoisted(() => ({
  loadYourTravelsMock: vi.fn(),
  travelMapMock: vi.fn(),
  travelStatsTilesMock: vi.fn(),
}));

vi.mock("@/lib/travel-stats-loader", () => ({ loadYourTravels: loadYourTravelsMock }));
vi.mock("@/components/trips/travel-map-loader", () => ({
  TravelMapLoader: (props: Record<string, unknown>) => {
    travelMapMock(props);
    return <div data-testid="travel-map" />;
  },
}));
vi.mock("@/components/trips/travel-stats-tiles", () => ({
  TravelStatsTiles: (props: Record<string, unknown>) => {
    travelStatsTilesMock(props);
    return <div data-testid="travel-stats-tiles" />;
  },
}));

import { YourTravels } from "./your-travels";

const emptyPair = () => ({ done: 0, planned: 0 });
const baseStats = () => ({
  countries: { done: [], planned: [] },
  places: emptyPair(),
  trips: emptyPair(),
  nightsAway: emptyPair(),
  accommodationNights: emptyPair(),
  transport: { FLIGHT: emptyPair(), TRAIN: emptyPair(), BUS: emptyPair(), FERRY: emptyPair(), CAR: emptyPair() },
  distanceKm: emptyPair(),
  longestTrip: null,
  mostVisitedCountry: null,
  farthestFromHome: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("YourTravels", () => {
  it("renders the section with id='your-travels' and an h2 heading", async () => {
    loadYourTravelsMock.mockResolvedValue({ stats: baseStats(), mapTrips: [] });

    render(await YourTravels({ userId: "u1", today: "2026-06-15" }));

    const heading = screen.getByRole("heading", { level: 2, name: "Your travels" });
    expect(heading).toBeInTheDocument();
    expect(document.getElementById("your-travels")).not.toBeNull();
  });

  it("renders stats plus a map-area empty state when ≥1 Trip exists but none has a located point", async () => {
    loadYourTravelsMock.mockResolvedValue({
      stats: baseStats(),
      mapTrips: [{ id: "t1", name: "Sketching only", dateLabel: "Not dated yet", when: "upcoming", points: [] }],
    });

    render(await YourTravels({ userId: "u1", today: "2026-06-15" }));

    // Map area: its own small empty state, distinct from the section heading.
    expect(screen.getByText("No places on the map yet")).toBeInTheDocument();
    expect(screen.getByText("Your trips will appear on the map once they have places")).toBeInTheDocument();
    expect(screen.queryByTestId("travel-map")).not.toBeInTheDocument();
    // Stats still render — a Trip's dates/nights/transport don't need a located Stop.
    expect(screen.getByTestId("travel-stats-tiles")).toBeInTheDocument();
  });

  it("shows only the whole-section empty state when the user has zero Trips", async () => {
    loadYourTravelsMock.mockResolvedValue({ stats: baseStats(), mapTrips: [] });

    render(await YourTravels({ userId: "u1", today: "2026-06-15" }));

    expect(screen.getByText("Your trips will appear here once they have places")).toBeInTheDocument();
    // Distinct from the "Your travels" h2 — not a repeat of the section heading.
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByTestId("travel-map")).not.toBeInTheDocument();
    expect(screen.queryByTestId("travel-stats-tiles")).not.toBeInTheDocument();
  });

  it("passes only Trips with located points to the Travel map", async () => {
    const located = { id: "t1", name: "Japan", dateLabel: "10–20 Jun 2026", when: "now" as const, points: [{ lat: 1, lng: 2, name: "Tokyo" }] };
    const unlocated = { id: "t2", name: "Undated sketch", dateLabel: "Not dated yet", when: "upcoming" as const, points: [] };
    loadYourTravelsMock.mockResolvedValue({ stats: baseStats(), mapTrips: [located, unlocated] });

    render(await YourTravels({ userId: "u1", today: "2026-06-15" }));

    expect(travelMapMock).toHaveBeenCalledTimes(1);
    expect(travelMapMock.mock.calls[0][0].trips).toEqual([located]);
    expect(screen.getByTestId("travel-stats-tiles")).toBeInTheDocument();
  });

  it("loads stats and map trips for the given user and today", async () => {
    loadYourTravelsMock.mockResolvedValue({ stats: baseStats(), mapTrips: [] });

    await YourTravels({ userId: "u42", today: "2026-06-15" });

    expect(loadYourTravelsMock).toHaveBeenCalledWith("u42", "2026-06-15");
  });
});
