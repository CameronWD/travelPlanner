import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TravelStatsTiles } from "./travel-stats-tiles";
import type { TravelStats } from "@/lib/travel-stats";

function emptyPair() {
  return { done: 0, planned: 0 };
}

function baseStats(overrides: Partial<TravelStats> = {}): TravelStats {
  return {
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
    ...overrides,
  };
}

describe("TravelStatsTiles", () => {
  it("renders the countries tile with done count, flags, and '+N planned'", () => {
    render(
      <TravelStatsTiles
        stats={baseStats({ countries: { done: ["fr", "it", "jp"], planned: ["pt"] } })}
      />,
    );

    expect(screen.getByText("3 countries")).toBeInTheDocument();
    expect(screen.getByText("+1 planned")).toBeInTheDocument();
  });

  it("shows a tile per transport mode with a nonzero count, hiding a 0/0 mode", () => {
    render(
      <TravelStatsTiles
        stats={baseStats({
          transport: {
            FLIGHT: { done: 2, planned: 1 },
            TRAIN: { done: 0, planned: 0 },
            BUS: { done: 0, planned: 0 },
            FERRY: { done: 0, planned: 0 },
            CAR: { done: 0, planned: 0 },
          },
        })}
      />,
    );

    expect(screen.getByText("2 flights")).toBeInTheDocument();
    expect(screen.queryByText("Ferries")).not.toBeInTheDocument();
    expect(screen.queryByText(/ferr(y|ies)/i)).not.toBeInTheDocument();
  });

  it("still shows a transport tile when only planned legs exist (done: 0, planned > 0)", () => {
    render(
      <TravelStatsTiles
        stats={baseStats({
          transport: {
            FLIGHT: emptyPair(),
            TRAIN: emptyPair(),
            BUS: emptyPair(),
            FERRY: { done: 0, planned: 2 },
            CAR: emptyPair(),
          },
        })}
      />,
    );

    expect(screen.getByText("Ferries")).toBeInTheDocument();
    expect(screen.getByText("+2 planned")).toBeInTheDocument();
  });

  it("formats distance with thousands separators and a km suffix", () => {
    render(<TravelStatsTiles stats={baseStats({ distanceKm: { done: 12340, planned: 0 } })} />);
    expect(screen.getByText("12,340 km")).toBeInTheDocument();
  });

  it("renders fun facts only when present", () => {
    render(
      <TravelStatsTiles
        stats={baseStats({
          longestTrip: { tripId: "t1", name: "Japan 2026", nights: 10 },
          mostVisitedCountry: { code: "fr", stops: 3 },
          farthestFromHome: { stopName: "Tokyo", km: 7823 },
        })}
      />,
    );

    expect(screen.getByText(/Longest trip: Japan 2026 \(10 nights\)/)).toBeInTheDocument();
    expect(screen.getByText(/Most-visited country: 🇫🇷 France \(3 stops\)/)).toBeInTheDocument();
    expect(screen.getByText(/Farthest from home: Tokyo \(7,823 km\)/)).toBeInTheDocument();
  });

  it("renders no fun-facts list when all three are null", () => {
    render(<TravelStatsTiles stats={baseStats()} />);
    expect(screen.queryByText(/Longest trip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Most-visited/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Farthest/)).not.toBeInTheDocument();
  });
});
