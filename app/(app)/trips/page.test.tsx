import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ requireUser: vi.fn(), load: vi.fn(), map: vi.fn(), tally: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/trips/trips-page-loader", () => ({ loadTripsPage: m.load }));
vi.mock("@/components/whats-new/whats-new-banner", () => ({ WhatsNewBanner: () => null }));
vi.mock("@/components/trips/travels-map-responsive", () => ({ TravelsMapResponsive: (p: Record<string, unknown>) => { m.map(p); return <div data-testid="map" />; } }));
vi.mock("@/components/trips/tally-card", () => ({ TallyCard: (p: Record<string, unknown>) => { m.tally(p); return <div data-testid="tally" />; }, TallyStrip: () => <div data-testid="tally-strip" /> }));
vi.mock("@/components/trips/trip-cover", () => ({ TripCover: () => <div data-testid="cover" /> }));
vi.mock("@/components/trips/first-trip-card", () => ({ FirstTripCard: () => <div data-testid="first-trip" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

import TripsPage from "./page";

const stats = { countries: { done: [], planned: [] } } as never;
const card = (id: string, kind: string) => ({ id, name: id, kind, big: { value: "1", unit: ["sleep", "to go"] }, dateLine: "x", href: `/trips/${id}`, index: 0, nextStep: null, cover: { tripId: id, name: id, hue: "coral", photo: null, stops: [], startDate: null, canEdit: true } });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: "u" });
});

describe("TripsPage", () => {
  it("first run: welcome greeting, first-trip card, past-trip card, dashed tally, no New trip", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [], counts: { upcoming: 0, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.getByText("Welcome to teepee, Cam")).toBeInTheDocument();
    expect(screen.getAllByTestId("first-trip").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "+ Past trip" })[0]).toHaveAttribute("href", "/trips/new?past=1");
    expect(screen.getByText("Starts counting with your first trip")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ New trip" })).toBeNull();
    expect(m.map).toHaveBeenCalledWith(expect.objectContaining({ empty: true }));
  });
  it("populated: hero first, then standard cards, meta line, New trip, map and tally", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next"), card("nz", "planning"), card("old", "done")], counts: { upcoming: 2, done: 1 }, hasDoneTrip: true, anyStops: true, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.queryByText(/Hey Cam/)).toBeNull();
    expect(screen.getByText("2 coming up · 1 done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New trip" })).toHaveAttribute("href", "/trips/new");
    const links = screen.getAllByRole("link", { name: /, (up next|planning|done), / });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/trips/eu", "/trips/nz", "/trips/old"]);
    expect(screen.getByTestId("tally")).toBeInTheDocument();
    expect(m.tally).toHaveBeenCalledWith(expect.objectContaining({ hasDoneTrip: true }));
  });
  it("hides the tally when stats failed", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats: null });
    render(await TripsPage());
    expect(screen.queryByTestId("tally")).toBeNull();
  });
  it("ideas only, no stops: populated layout with the dashed tally", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("j", "idea")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    expect(screen.getByText("Starts counting with your first trip")).toBeInTheDocument();
    expect(screen.queryByTestId("tally")).toBeNull();
  });
});
