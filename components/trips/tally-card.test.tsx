import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TallyCard, TallyStrip } from "./tally-card";
import type { TravelStats } from "@/lib/travel-stats";

const pair = (done: number, planned: number) => ({ done, planned });
const stats: TravelStats = {
  countries: { done: ["fr", "it", "nz"], planned: ["id", "jp"] },
  places: pair(4, 12), trips: pair(1, 3), nightsAway: pair(9, 45), accommodationNights: pair(0, 20),
  transport: { FLIGHT: pair(2, 6), TRAIN: pair(0, 3), BUS: pair(0, 0), FERRY: pair(0, 0), CAR: pair(0, 0) },
  distanceKm: pair(2140, 36309), longestTrip: null, mostVisitedCountry: null, farthestFromHome: null,
};

beforeEach(() => localStorage.clear());

describe("TallyCard", () => {
  it("defaults to Been when a trip is done and persists a switch", () => {
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Been" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/on the list/)).toBeInTheDocument();
    expect(localStorage.getItem("teepee:tally-mode")).toBe("planned");
  });
  it("reads the saved mode", () => {
    localStorage.setItem("teepee:tally-mode", "planned");
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
  });
  it("never shows 0 countries: with none done it starts in Planned", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: [], planned: ["jp"] } }} hasDoneTrip={false} />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("0")).toBeNull();
  });
  it("never shows 0 countries: disables the empty side and ignores clicks on it", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: ["fr"], planned: [] } }} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Planned" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByRole("radio", { name: "Been" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("0")).toBeNull();
  });
  it("never shows 0 countries: renders a dash when both sides are empty", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: [], planned: [] } }} hasDoneTrip={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("TallyStrip", () => {
  it("shows countries, nights and short km with a mode label", () => {
    render(<TallyStrip stats={stats} hasDoneTrip={false} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("36k km")).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
  });
});
