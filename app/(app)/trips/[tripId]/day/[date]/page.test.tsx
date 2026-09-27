import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DayViewData } from "@/lib/day-view-loader";

// The page is a thin Server Component over `getDay` (lib/day-view-loader.ts,
// tested on its own). Here the loader and every client island are mocked, and
// the page's composition is asserted. Both the phone and the desktop trees are
// rendered (one hidden by CSS), so most texts appear twice.

const { getDayMock, requireTripAccessMock, tripFindUniqueMock, notFoundMock, redirectMock, dayWeatherMock } = vi.hoisted(() => ({
  getDayMock: vi.fn(),
  requireTripAccessMock: vi.fn(),
  tripFindUniqueMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  dayWeatherMock: vi.fn(),
}));

vi.mock("@/lib/day-view-loader", () => ({ getDay: getDayMock, getDayWeatherView: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/server/actions/activity", () => ({
  getUnreadActivityCount: vi.fn().mockResolvedValue(4),
  getRecentActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique: tripFindUniqueMock } } }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock, redirect: redirectMock }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));

vi.mock("@/components/trip/day/day-strip", () => ({ DayStrip: () => <nav aria-label="Days" /> }));
vi.mock("@/components/trip/day/day-keyboard-nav", () => ({ DayKeyboardNav: () => null }));
vi.mock("@/components/trip/day/day-swipe", () => ({ DaySwipe: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/trip/day/day-ideas-rows", () => ({
  DayIdeasRows: ({ rows }: { rows: unknown[] }) => <ul data-testid="ideas">{rows.map((_, i) => <li key={i} />)}</ul>,
}));
// DayWeather is an async Server Component (its own test below); here a
// synchronous stand-in shows where it mounts.
vi.mock("@/components/trip/day/day-weather", () => ({
  DayWeather: (p: { size: string }) => {
    dayWeatherMock(p);
    return <section aria-label="Weather" data-size={p.size} />;
  },
}));
vi.mock("@/components/trip/journal-editor", () => ({ JournalEditor: () => <div data-testid="journal-editor" /> }));
vi.mock("@/components/trip/journal-entry-view", () => ({ JournalEntryView: () => null }));
vi.mock("@/components/trip/item-form-dialog", () => ({
  AddItemButton: ({ label, defaultDate }: { label: string; defaultDate?: string }) => <button data-default-date={defaultDate}>{label}</button>,
}));
vi.mock("@/components/trip/timeline", () => ({ Timeline: (p: { variant: string }) => <ol data-testid="timeline" data-variant={p.variant} /> }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: ({ unreadCount }: { unreadCount: number }) => <button aria-label={`Notifications (${unreadCount})`} /> }));
vi.mock("@/components/shell/trip-switcher", () => ({ TripSwitcherFromContext: () => null }));

import DayPage, { generateMetadata } from "./page";

function fixture(over: Partial<DayViewData> = {}): DayViewData {
  return {
    tripId: "t1",
    viewerId: "u1",
    trip: { name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08", homeCurrency: "AUD", homeName: null },
    date: "2026-12-12",
    today: "2026-11-01",
    isToday: false,
    phase: "planning",
    dayNumber: 9,
    totalDays: 36,
    heading: "Sat 12 Dec",
    eyebrow: "DAY 9 OF 36 · EUROPE",
    subLine: "Strasbourg, France · CET · night 3 of 4",
    subLineCompact: "Strasbourg · CET · night 3 of 4",
    isFirst: false,
    isLast: false,
    prevDate: "2026-12-11",
    nextDate: "2026-12-13",
    stop: { id: "s1", name: "Strasbourg", country: "France", countryCode: "FR", timezone: "Europe/Paris", lat: 48.58, lng: 7.75 },
    travelDay: false,
    dayTitle: null,
    plan: { dateISO: "2026-12-12", stop: null, timedItems: [], untimedItems: [], transportEntries: [], accommodationEntries: [] },
    ordered: { entries: [], anytime: [] } as unknown as DayViewData["ordered"],
    hasEntries: false,
    freeForm: true,
    planCount: 0,
    editor: {} as DayViewData["editor"],
    itemDirections: {},
    attachmentsByTarget: {},
    stopOptions: [{ id: "s1", name: "Strasbourg", arriveDate: "2026-12-10" }],
    ideas: {
      rows: [
        { id: "a", title: "Petite France walk", category: "SIGHTSEEING", hint: null, pool: "todo" },
        { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
        { id: "c", title: "Cathédrale", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
      ],
      more: 0,
      eyebrow: "IDEAS FOR STRASBOURG",
    },
    nearby: [],
    tonight: { id: "acc1", name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14" },
    strip: { dates: [], segments: [] },
    journal: { open: false, mine: null, others: [] },
    feasibility: [],
    weatherInput: { lat: 48.58, lng: 7.75, timezone: "Europe/Paris" },
    ...over,
  };
}

async function renderPage(date = "2026-12-12") {
  return render(await DayPage({ params: Promise.resolve({ tripId: "t1", date }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  tripFindUniqueMock.mockResolvedValue({ name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }] });
  getDayMock.mockResolvedValue(fixture());
});

describe("Day page", () => {
  it("renders the h1 date, the strip, the plan card empty state with three idea rows, tonight and the future journal", async () => {
    await renderPage();
    expect(getDayMock).toHaveBeenCalledWith("t1", "2026-12-12", "u1");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
    expect(screen.getByText("DAY 9 OF 36 · EUROPE")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Days" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nothing planned yet").length).toBeGreaterThan(0);
    for (const ul of screen.getAllByTestId("ideas")) expect(within(ul).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByText("Hôtel Cour du Corbeau").length).toBeGreaterThan(0);
    expect(screen.getByText("Opens on the day")).toBeInTheDocument();
    expect(screen.queryByTestId("journal-editor")).toBeNull();
    expect(screen.getByRole("link", { name: "Weather by Open-Meteo" })).toHaveAttribute("href", "https://open-meteo.com/");
    // Weather: compact on phone (above the plan), regular in the right column.
    expect(screen.getAllByRole("region", { name: "Weather" }).map((s) => s.dataset.size)).toEqual(["compact", "regular"]);
    expect(dayWeatherMock).toHaveBeenCalledWith(expect.objectContaining({ dateISO: "2026-12-12", today: "2026-11-01", placeName: "Strasbourg" }));
    // Arrows link to the neighbouring days.
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(screen.getByRole("link", { name: "Next day: Sun 13 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-13");
    expect(screen.getByRole("button", { name: "Notifications (4)" })).toBeInTheDocument();
    // Every add button preselects the date.
    for (const b of screen.getAllByRole("button", { name: /^Add / })) expect(b).toHaveAttribute("data-default-date", "2026-12-12");
    // Empty dashed rows: phone "Add something else", desktop with the kinds.
    expect(screen.getByRole("button", { name: "Add something else" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add something else · a place, an activity, a note" })).toBeInTheDocument();
    expect(screen.queryByTestId("timeline")).toBeNull();
  });

  it("phone order: strip → weather → plan → tonight → journal", async () => {
    const { container } = await renderPage();
    const order = (el: Element) => Array.prototype.indexOf.call(container.querySelectorAll("*"), el);
    const strip = screen.getAllByRole("navigation", { name: "Days" })[0];
    const weather = screen.getAllByRole("region", { name: "Weather" })[0];
    const plan = screen.getAllByRole("heading", { level: 2, name: "Day plan" })[0];
    const tonight = screen.getAllByText("Hôtel Cour du Corbeau")[0];
    const journal = screen.getByRole("heading", { level: 2, name: "Journal" });
    const seq = [strip, weather, plan, tonight, journal].map(order);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });

  it("with items renders the Timeline and the count, and the dashed row reads '+ Add to this day' on phone / '+ Add something else · a place, an activity, a note' on desktop", async () => {
    getDayMock.mockResolvedValue(fixture({ hasEntries: true, freeForm: false, planCount: 3 }));
    await renderPage();
    const timelines = screen.getAllByTestId("timeline");
    expect(timelines.length).toBeGreaterThan(0);
    for (const t of timelines) expect(t).toHaveAttribute("data-variant", "day");
    expect(screen.getAllByText("3 things").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("ideas")).toBeNull();
    // Header button + phone dashed row.
    expect(screen.getAllByRole("button", { name: "Add to this day" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add something else · a place, an activity, a note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add something else" })).toBeNull();
  });

  it("keeps the feasibility advisory on a planned day", async () => {
    getDayMock.mockResolvedValue(fixture({ hasEntries: true, planCount: 2, feasibility: [{ severity: "warning", message: "Tight connection to the train" }] }));
    await renderPage();
    expect(screen.getAllByText("Tight connection to the train").length).toBeGreaterThan(0);
  });

  it("no ideas → 'Nothing planned yet. Add a place, an activity or a note.'", async () => {
    getDayMock.mockResolvedValue(fixture({ ideas: { rows: [], more: 0, eyebrow: null } }));
    await renderPage();
    expect(screen.getAllByText("Nothing planned yet. Add a place, an activity or a note.").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("ideas")).toBeNull();
  });

  it("gap day (stop null): no weather section, no tonight card (review focus 2)", async () => {
    getDayMock.mockResolvedValue(fixture({ stop: null, weatherInput: null, tonight: null, subLine: "", subLineCompact: "" }));
    await renderPage();
    expect(screen.queryByRole("region", { name: "Weather" })).toBeNull();
    expect(screen.queryByText("No bed yet")).toBeNull();
    expect(screen.queryByText("Hôtel Cour du Corbeau")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
  });

  it("a Stop with no bed shows 'No bed yet' and '+ Add a stay'", async () => {
    getDayMock.mockResolvedValue(fixture({ tonight: null }));
    await renderPage();
    expect(screen.getAllByText("No bed yet").length).toBeGreaterThan(0);
    for (const l of screen.getAllByRole("link", { name: "+ Add a stay" })) expect(l).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
  });

  it("travel day: eyebrow 'DAY 11 OF 36 · TRAVEL DAY' and the arrow sub line (review focus 3)", async () => {
    getDayMock.mockResolvedValue(
      fixture({ travelDay: true, eyebrow: "DAY 11 OF 36 · TRAVEL DAY", heading: "Mon 14 Dec", subLine: "Strasbourg → Colmar · CET", subLineCompact: "Strasbourg → Colmar · CET" }),
    );
    await renderPage("2026-12-14");
    expect(screen.getByText("DAY 11 OF 36 · TRAVEL DAY")).toBeInTheDocument();
    expect(screen.getAllByText("Strasbourg → Colmar · CET")).toHaveLength(2);
  });

  it("on the day: the Journal editor, no 'Opens on the day'", async () => {
    getDayMock.mockResolvedValue(fixture({ journal: { open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] } }));
    await renderPage();
    expect(screen.getByTestId("journal-editor")).toBeInTheDocument();
    expect(screen.queryByText("Opens on the day")).toBeNull();
  });

  it("last day hides Tonight", async () => {
    getDayMock.mockResolvedValue(fixture({ isLast: true, nextDate: null }));
    await renderPage();
    expect(screen.queryByText("Hôtel Cour du Corbeau")).toBeNull();
    expect(screen.getByLabelText("Next day")).toHaveAttribute("aria-disabled", "true");
  });

  it("calls notFound for 'invalid'/'out-of-range' and redirects a 'dateless' trip to the Plan", async () => {
    getDayMock.mockResolvedValue("invalid");
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    getDayMock.mockResolvedValue("out-of-range");
    await expect(renderPage("2030-01-01")).rejects.toThrow("NEXT_NOT_FOUND");
    getDayMock.mockResolvedValue("dateless");
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT /trips/t1/plan");
    expect(redirectMock).toHaveBeenCalledWith("/trips/t1/plan");
  });

  it("titles the page with the date, and nothing for a malformed date", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ tripId: "t1", date: "2026-12-12" }) });
    expect(meta.title).toBeTruthy();
    expect(await generateMetadata({ params: Promise.resolve({ tripId: "t1", date: "x" }) })).toEqual({});
  });
});
