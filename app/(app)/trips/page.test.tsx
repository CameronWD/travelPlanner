import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ requireUser: vi.fn(), load: vi.fn(), loadDeleted: vi.fn(), map: vi.fn(), tally: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/trips/trips-page-loader", () => ({ loadTripsPage: m.load }));
vi.mock("@/lib/trips/recently-deleted-loader", () => ({ loadRecentlyDeleted: m.loadDeleted }));
vi.mock("@/components/whats-new/whats-new-banner", () => ({ WhatsNewBanner: () => null }));
vi.mock("@/components/welcome/welcome-gate", () => ({ WelcomeGate: () => <div data-testid="welcome-gate" /> }));
vi.mock("@/components/trips/travels-map-responsive", () => ({ TravelsMapResponsive: (p: Record<string, unknown>) => { m.map(p); return <div data-testid="map" />; } }));
vi.mock("@/components/trips/tally-card", () => ({ TallyCard: (p: Record<string, unknown>) => { m.tally(p); return <div data-testid="tally" />; }, TallyStrip: () => <div data-testid="tally-strip" /> }));
vi.mock("@/components/trips/trip-cover", () => ({ TripCover: () => <div data-testid="cover" /> }));
vi.mock("@/components/trips/first-trip-card", () => ({ FirstTripCard: () => <div data-testid="first-trip" /> }));
vi.mock("@/components/trips/recently-deleted", () => ({ RecentlyDeleted: (p: Record<string, unknown>) => <div data-testid="recently-deleted">{(p.trips as unknown[]).length}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));

import TripsPage from "./page";

const stats = { countries: { done: [], planned: [] } } as never;
const card = (id: string, kind: string) => ({ id, name: id, kind, big: { value: "1", unit: ["sleep", "to go"] }, dateLine: "x", href: `/trips/${id}`, index: 0, nextStep: null, cover: { tripId: id, name: id, hue: "coral", photo: null, stops: [], startDate: null, canEdit: true } });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: "u" });
  m.loadDeleted.mockResolvedValue([]);
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
    expect(screen.getByTestId("welcome-gate")).toBeInTheDocument();
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
    expect(screen.getByTestId("welcome-gate")).toBeInTheDocument();
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
  it("renders Recently deleted only when there are deleted trips", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats });
    m.loadDeleted.mockResolvedValue([]);
    render(await TripsPage());
    expect(screen.queryByTestId("recently-deleted")).toBeNull();
  });
  it("renders Recently deleted when loadRecentlyDeleted returns Trips", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats });
    m.loadDeleted.mockResolvedValue([{ id: "d1", name: "Old", slug: "old", deletedAt: new Date() }]);
    render(await TripsPage());
    expect(screen.getByTestId("recently-deleted")).toBeInTheDocument();
  });
  // Spec 2026-10-05 §B: .tally-card is `container-type: size`, so its content
  // can't size the row; below xl nothing else did and the tally overflowed.
  // md→xl the row is a fixed 360px; ≥xl the FRAME's flex-1 takes over again.
  it("gives the populated map/tally row a fixed 360px height from md up to xl", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [card("eu", "up-next")], counts: { upcoming: 1, done: 0 }, hasDoneTrip: false, anyStops: true, mapTrips: [], stats });
    render(await TripsPage());
    const row = screen.getByTestId("map").closest("div.grid")!;
    const cls = row.className.split(/\s+/);
    expect(cls).toContain("md:h-[360px]");
    expect(cls).toContain("xl:h-auto");
    expect(cls).toContain("xl:flex-1");
    expect(row).toContainElement(screen.getByTestId("tally"));
  });
  it("gives the first-run map/tally row the same md→xl height", async () => {
    m.load.mockResolvedValue({ firstName: "Cam", cards: [], counts: { upcoming: 0, done: 0 }, hasDoneTrip: false, anyStops: false, mapTrips: [], stats });
    render(await TripsPage());
    const cls = screen.getByTestId("map").closest("div.grid")!.className.split(/\s+/);
    expect(cls).toContain("md:h-[360px]");
    expect(cls).toContain("xl:h-auto");
  });
});
