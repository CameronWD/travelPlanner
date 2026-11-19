import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import type { DayViewData } from "@/lib/day-view-loader";
import { act } from "react";
import { addDays, formatDayLabel } from "@/lib/dates";

// The page is a thin Server Component over `getDays` (lib/day-view-loader.ts,
// tested on its own), which it asks once for the day shown and both
// neighbours (NAV-05). Here the loader and every client island are mocked:
// `getDays` answers each date through the per-day `getDayMock`, so each test
// still says what one day looks like. Both the phone and the desktop trees are
// rendered (one hidden by CSS), so most texts appear twice.

const { getDayMock, getDaysMock, requireTripAccessMock, tripFindUniqueMock, notFoundMock, redirectMock, dayWeatherMock, requestHeaders, registered } = vi.hoisted(() => {
  const getDayMock = vi.fn();
  return {
    getDayMock,
    getDaysMock: vi.fn((tripId: string, dates: string[], viewerId: string) => Promise.all(dates.map((d) => getDayMock(tripId, d, viewerId)))),
    requireTripAccessMock: vi.fn(),
    tripFindUniqueMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirectMock: vi.fn((to: string) => {
      throw new Error(`NEXT_REDIRECT ${to}`);
    }),
    dayWeatherMock: vi.fn(),
    requestHeaders: new Headers(),
    registered: new Map<string, React.ReactNode>(),
  };
});

vi.mock("@/lib/day-view-loader", () => ({ getDays: getDaysMock, getDayWeatherView: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/activity-reads", () => ({
  getUnreadActivityCount: vi.fn().mockResolvedValue(4),
  getRecentActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/actions/activity", () => ({}));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique: tripFindUniqueMock } } }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock, redirect: redirectMock, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));

vi.mock("@/components/trip/day/day-strip", () => ({ DayStrip: () => <nav aria-label="Days" /> }));
vi.mock("@/components/trip/day/day-keyboard-nav", () => ({ DayKeyboardNav: () => null }));
vi.mock("@/components/trip/day/day-carousel", async () => {
  const React = await import("react");
  const DayChromeRegistryContext = React.createContext<{ register: (iso: string, c: React.ReactNode) => void; chromeFor: (iso: string) => React.ReactNode }>({ register: () => {}, chromeFor: () => undefined });
  return {
    DayChromeRegistryContext,
    DayCarousel: ({ panels, shownDate, chrome, chromeFallback }: { panels: Array<{ iso: string; content: React.ReactNode }>; shownDate: string; chrome: React.ReactNode; chromeFallback: (iso: string) => React.ReactNode }) => {
      const { chromeFor } = React.useContext(DayChromeRegistryContext);
      return (
        <>
          {chromeFor(shownDate) ?? chromeFallback(shownDate)}
          {chrome}
          <div data-day-carousel>
            {panels.map((p) => (
              <div key={p.iso} data-day-panel={p.iso} data-shown={p.iso === shownDate ? "true" : undefined} aria-hidden={p.iso === shownDate ? undefined : "true"}>
                {p.content}
              </div>
            ))}
          </div>
        </>
      );
    },
    // DayHeader (real, unmocked) renders DayArrow, which imports `useDayCarousel`
    // from this same module path — mocking the module without this export
    // leaves it undefined and DayArrow crashes calling it.
    useDayCarousel: () => null,
  };
});
vi.mock("@/components/trip/day/day-chrome-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/trip/day/day-chrome-registry")>();
  return {
    ...actual,
    RegisterDayChrome: (p: { iso: string; chrome: React.ReactNode }) => {
      registered.set(p.iso, p.chrome);
      return <actual.RegisterDayChrome {...p} />;
    },
  };
});
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
vi.mock("@/components/day/day-add-menu", () => ({
  DayAddMenu: ({ label, date, stop }: { label: string; date: string; stop: { id: string } | null }) => (
    <button data-default-date={date} data-default-stop={stop?.id ?? ""}>
      {label}
    </button>
  ),
}));
vi.mock("@/components/trip/timeline", () => ({ Timeline: (p: { variant: string }) => <ol data-testid="timeline" data-variant={p.variant} /> }));
vi.mock("@/components/trip/nearby-wishlist", () => ({ NearbyWishlist: () => null }));
vi.mock("@/components/trip/day-map", () => ({ DayMap: () => <div /> }));
vi.mock("@/components/trip/day/day-map-dialog", async (importActual) => {
  const actual = await importActual<typeof import("@/components/trip/day/day-map-dialog")>();
  return {
    DayMapButton: (p: React.ComponentProps<typeof actual.DayMapButton>) => (
      <span data-testid="day-map">
        <actual.DayMapButton {...p} />
      </span>
    ),
  };
});
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: ({ unreadCount }: { unreadCount: number }) => <button aria-label={`Notifications (${unreadCount})`} /> }));
vi.mock("@/components/shell/trip-switcher", () => ({ TripSwitcherFromContext: () => null }));

import { setMatchMedia } from "@/test/setup";
import DayPage, { generateMetadata } from "./page";

function fixture(over: Partial<DayViewData> = {}): DayViewData {
  return {
    tripId: "t1",
    viewerId: "u1",
    trip: { name: "Christmas in Europe", startDate: "2026-12-04", endDate: "2027-01-08", homeCurrency: "AUD", homeName: null, homeTimezone: null },
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
    stop: {
      id: "s1",
      name: "Strasbourg",
      country: "France",
      countryCode: "FR",
      timezone: "Europe/Paris",
      lat: 48.58,
      lng: 7.75,
      arriveDate: "2026-12-10",
      departDate: "2026-12-13",
    },
    travelDay: false,
    dayTitle: null,
    dayTitleStopId: "s1",
    plan: { dateISO: "2026-12-12", stop: null, timedItems: [], untimedItems: [], transportEntries: [], accommodationEntries: [] },
    ordered: { entries: [], anytime: [] } as unknown as DayViewData["ordered"],
    hasEntries: false,
    freeForm: true,
    planCount: 0,
    editor: {} as DayViewData["editor"],
    itemDirections: {},
    dayMap: { points: [], routePoints: [], perItemPrev: {} },
    attachmentsByTarget: {},
    needsConfirmationIds: [],
    stopOptions: [{ id: "s1", name: "Strasbourg", arriveDate: "2026-12-10", departDate: "2026-12-13", timezone: "Europe/Paris", sortOrder: 0 }],
    ideas: {
      rows: [
        { id: "a", title: "Petite France walk", category: "SIGHTSEEING", hint: null, pool: "todo" },
        { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
        { id: "c", title: "Cathédrale", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
      ],
      all: [
        { id: "a", title: "Petite France walk", category: "SIGHTSEEING", hint: null, pool: "todo" },
        { id: "b", title: "Christkindelsmärik", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
        { id: "c", title: "Cathédrale", category: "SIGHTSEEING", hint: null, pool: "wishlist" },
      ],
      more: 0,
      eyebrow: "IDEAS FOR STRASBOURG",
    },
    nearby: [],
    whatsAround: { enabled: false, starts: [] },
    tonight: { id: "acc1", name: "Hôtel Cour du Corbeau", nightOf: { night: 3, of: 4 }, checkOut: "2026-12-14", address: null, confirmation: null, checkInTime: null, checkOutTime: null, notes: null, lat: null, lng: null },
    holidays: [],
    strip: { dates: [], line: { homeStart: null, homeEnd: null, segments: [] } },
    journal: { open: false, mine: null, others: [] },
    feasibility: [],
    markedFine: [],
    hops: [],
    surprise: null,
    weatherInput: { lat: 48.58, lng: 7.75, timezone: "Europe/Paris" },
    ...over,
  };
}

// getDaysMock answers each date asked for with the same content, dated; a
// date outside the fixture Trip is out of range. The strip carries every day
// of the Trip, which is where the page takes its slots from.
function dayFor(over: Partial<DayViewData> = {}, start = "2026-12-04", end = "2027-01-08") {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return (_tripId: string, date: string) => {
    if (date < start || date > end) return Promise.resolve("out-of-range" as const);
    return Promise.resolve(
      fixture({
        date,
        prevDate: date === start ? null : addDays(date, -1),
        nextDate: date === end ? null : addDays(date, 1),
        isFirst: date === start,
        isLast: date === end,
        strip: { dates: dates.map((iso) => ({ iso, count: 0, isCurrent: iso === date, isToday: false, holiday: false })), line: { homeStart: null, homeEnd: null, segments: [] } },
        ...over,
      }),
    );
  };
}
const shownPanel = (container: HTMLElement) => container.querySelector('[data-day-panel][data-shown="true"]') as HTMLElement;

async function renderPage(date = "2026-12-12") {
  const page = await DayPage({ params: Promise.resolve({ tripId: "t1", date }) });
  let result!: ReturnType<typeof render>;
  // Lets the streamed slots' read land inside act.
  await act(async () => {
    result = render(page);
  });
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  requestHeaders.delete("x-teepee-warm");
  registered.clear();
  requireTripAccessMock.mockResolvedValue({ user: { id: "u1" }, membership: {} });
  tripFindUniqueMock.mockResolvedValue({ name: "Christmas in Europe", members: [{ user: { id: "u1", name: "Cam", image: null } }] });
  getDayMock.mockImplementation(dayFor());
});

describe("Day page", () => {
  it("opens one Day map when ?map=1 is set, and it is the shown day's, not a neighbour's", async () => {
    getDayMock.mockImplementation((_t: string, date: string) =>
      dayFor({
        hasEntries: true,
        dayMap: { points: [{ kind: "item", id: `i-${date}`, lat: 1, lng: 2, label: `Place on ${date}`, order: 1 }], routePoints: [], perItemPrev: {} },
      })(_t, date),
    );
    window.history.replaceState(null, "", "/?map=1");
    try {
      setMatchMedia((q) => q === "(min-width: 640px)");
      await renderPage();
      await waitFor(() => expect(document.querySelectorAll('[role="dialog"]').length).toBeGreaterThan(0));
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
      expect(dialogs).toHaveLength(1);
      expect(within(dialogs[0]).getByText("Place on 2026-12-12")).toBeInTheDocument();
      expect(within(dialogs[0]).queryByText("Place on 2026-12-11")).toBeNull();
      expect(within(dialogs[0]).queryByText("Place on 2026-12-13")).toBeNull();
    } finally {
      window.history.replaceState(null, "", "/");
      setMatchMedia((q) => q === "(min-width: 640px)");
    }
  });

  it("a Changeover day whose Stop is the Surprise does not preselect that Stop on its add buttons", async () => {
    getDayMock.mockImplementation(dayFor({ surprise: { plannedByName: "Xanthia", whole: false, dayStopHidden: true }, tonight: null }));
    const { container } = await renderPage();
    const buttons = within(shownPanel(container)).getAllByRole("button", { name: /Add/ });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toHaveAttribute("data-default-stop", "");
  });

  it("renders the h1 date, the strip, the plan card empty state with three idea rows, tonight and the future journal", async () => {
    const { container } = await renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
    expect(screen.getByText("DAY 9 OF 36 · EUROPE")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Days" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nothing planned yet").length).toBeGreaterThan(0);
    for (const ul of within(shownPanel(container)).getAllByTestId("ideas")) expect(within(ul).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByText("Hôtel Cour du Corbeau").length).toBeGreaterThan(0);
    expect(within(shownPanel(container)).getByText("Opens on the day")).toBeInTheDocument();
    expect(within(shownPanel(container)).queryByTestId("journal-editor")).toBeNull();
    expect(screen.getByRole("link", { name: "Weather by Open-Meteo" })).toHaveAttribute("href", "https://open-meteo.com/");
    // Weather: compact on phone (above the plan), regular in the right column.
    expect(screen.getAllByRole("region", { name: "Weather" }).map((s) => s.dataset.size)).toEqual(["compact", "regular"]);
    expect(dayWeatherMock).toHaveBeenCalledWith(expect.objectContaining({ dateISO: "2026-12-12", today: "2026-11-01", placeName: "Strasbourg" }));
    // Arrows link to the neighbouring days.
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(screen.getByRole("link", { name: "Next day: Sun 13 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-13");
    // Bell: phone/tablet top bar, the lg-to-xl pill row cluster, and the xl date-row cluster.
    expect(screen.getAllByRole("button", { name: "Notifications (4)" })).toHaveLength(3);
    // Every add-an-item button preselects the date. "Add a title" is a
    // different affordance (DayTitleInline, spec 2026-09-28 D4) and has no
    // default date to preselect.
    for (const b of screen.getAllByRole("button", { name: /^Add / }).filter((b) => b.textContent !== "Add a title"))
      expect(b).toHaveAttribute("data-default-date", "2026-12-12");
    // Empty dashed rows: phone "Add something else", desktop with the kinds.
    expect(screen.getByRole("button", { name: "Add something else" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add something else · a place, an activity, a note" })).toBeInTheDocument();
    expect(screen.queryByTestId("timeline")).toBeNull();
    expect(screen.queryByTestId("day-map")).toBeNull();
  });

  it("emits both Tonight wrappers on a mid-trip day", async () => {
    const { container } = await renderPage();
    expect(shownPanel(container).querySelectorAll('[data-slot="tonight"]')).toHaveLength(2);
  });

  it("phone order: strip → weather → plan → tonight → journal", async () => {
    const { container } = await renderPage();
    const order = (el: Element) => Array.prototype.indexOf.call(container.querySelectorAll("*"), el);
    const strip = screen.getAllByRole("navigation", { name: "Days" })[0];
    const weather = screen.getAllByRole("region", { name: "Weather" })[0];
    const plan = screen.getAllByRole("heading", { level: 2, name: "Day plan" })[0];
    const tonight = within(shownPanel(container)).getAllByText("Hôtel Cour du Corbeau")[0];
    const journal = screen.getByRole("heading", { level: 2, name: "Journal" });
    const seq = [strip, weather, plan, tonight, journal].map(order);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);
  });

  it("with items renders the Timeline and the count, and the dashed row reads '+ Add to this day' on phone / '+ Add something else · a place, an activity, a note' on desktop", async () => {
    getDayMock.mockImplementation(dayFor({ hasEntries: true, freeForm: false, planCount: 3 }));
    await renderPage();
    const timelines = screen.getAllByTestId("timeline");
    expect(timelines.length).toBeGreaterThan(0);
    for (const t of timelines) expect(t).toHaveAttribute("data-variant", "day");
    // The Day map sits in the plan card on a planned day (a header button that opens the dialog).
    expect(screen.getAllByTestId("day-map").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 things").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("ideas")).toBeNull();
    // Header button (pill-row and date-row clusters) + phone dashed row.
    expect(screen.getAllByRole("button", { name: "Add to this day" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add something else · a place, an activity, a note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add something else" })).toBeNull();
  });

  it("keeps the feasibility advisory on a planned day", async () => {
    getDayMock.mockImplementation(dayFor({ hasEntries: true, planCount: 2, feasibility: [{ fine: { flagId: "tight-a-b", fingerprint: "fp-1", between: { from: "Lunch", to: "Train" } }, severity: "warning", message: "Tight connection to the train", hop: undefined }] }));
    await renderPage();
    expect(screen.getAllByText("Tight connection to the train").length).toBeGreaterThan(0);
  });

  it("empty day (no plans, no ideas): a compact centred 'Nothing planned' block holding the add action (spec 2026-09-29 D5)", async () => {
    getDayMock.mockImplementation(dayFor({ ideas: { rows: [], all: [], more: 0, eyebrow: null } }));
    const { container } = await renderPage();
    const empties = Array.from(shownPanel(container).querySelectorAll<HTMLElement>('[data-slot="day-plan-empty"]'));
    expect(empties).toHaveLength(2); // phone + desktop trees
    for (const e of empties) {
      expect(e).toHaveTextContent("Nothing planned");
      expect(e.className).toContain("min-h-[12rem]");
      expect(e.className).toContain("justify-center");
      expect(e.querySelector("button")).not.toBeNull();
    }
    expect(screen.queryByText("Nothing planned yet. Add a place, an activity or a note.")).toBeNull();
    for (const s of Array.from(shownPanel(container).querySelectorAll<HTMLElement>('section[aria-labelledby^="day-plan-heading"]'))) {
      expect(s.className).not.toContain("h-full");
    }
  });

  it("a busy day grows with the page: no max height, no internal scroll (spec 2026-11-18 D1)", async () => {
    getDayMock.mockImplementation(dayFor({ hasEntries: true, planCount: 9 }));
    const { container } = await renderPage();
    const body = shownPanel(container).querySelector('[data-slot="day-plan-body"][data-size="desktop"]') as HTMLElement;
    expect(body.className).not.toMatch(/max-h/);
    expect(body.className).not.toMatch(/overflow-y/);
    expect(body.className).not.toContain("flex-1");
  });

  it("the right column sticks below the top of the viewport on a wide screen, unless it is too tall to fit (spec 2026-11-18 D1)", async () => {
    const { container } = await renderPage();
    const side = shownPanel(container).querySelector("[data-day-body] > .grid > [data-day-side]") as HTMLElement;
    for (const c of ["lg:sticky", "lg:top-6", "lg:self-start", "lg:data-tall:static"]) expect(side.className.split(" ")).toContain(c);
    expect(within(side).getByRole("link", { name: "Weather by Open-Meteo" })).toBeInTheDocument();
  });

  it("both desktop columns are top-aligned and neither card stretches (spec 2026-09-29 D5/D6)", async () => {
    const { container } = await renderPage();
    const grid = shownPanel(container).querySelector("[data-day-body] > .grid") as HTMLElement;
    expect(grid.className).toContain("lg:items-start");
    expect(grid.className).not.toContain("flex-1");
    expect((shownPanel(container).querySelector("[data-journal]") as HTMLElement).className).not.toContain("flex-1");
  });

  it("gap day (stop null): no weather section, no tonight card (review focus 2)", async () => {
    getDayMock.mockImplementation(dayFor({ stop: null, weatherInput: null, tonight: null, subLine: "", subLineCompact: "" }));
    await renderPage();
    expect(screen.queryByRole("region", { name: "Weather" })).toBeNull();
    expect(screen.queryByText("No bed yet")).toBeNull();
    expect(screen.queryByText("Hôtel Cour du Corbeau")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
  });

  it("a day that is wholly a Surprise: the shell, no add anywhere, no Tonight, the weather and Journal stay", async () => {
    getDayMock.mockImplementation(dayFor({ surprise: { plannedByName: "Xanthia", whole: true, dayStopHidden: true }, tonight: null, hasEntries: false }));
    const { container } = await renderPage();
    expect(within(shownPanel(container)).getAllByTestId("surprise-shell")).toHaveLength(2);
    expect(screen.getAllByText("Surprise, planned by Xanthia").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Add (to this day|something else)/ })).toBeNull();
    expect(screen.queryByText("No bed yet")).toBeNull();
    expect(shownPanel(container).querySelectorAll('[data-slot="tonight"]')).toHaveLength(0);
    expect(screen.getAllByRole("region", { name: "Weather" }).length).toBeGreaterThan(0);
  });

  it("a Changeover day shared with a Surprise keeps the add buttons and says the rest is a surprise", async () => {
    getDayMock.mockImplementation(dayFor({ surprise: { plannedByName: "Xanthia", whole: false, dayStopHidden: false }, tonight: null }));
    await renderPage();
    expect(screen.getAllByRole("button", { name: "Add to this day" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("The rest of today is a surprise, planned by Xanthia.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No bed yet").length).toBeGreaterThan(0);
  });

  it("a Stop with no bed shows 'No bed yet' and '+ Add a stay'", async () => {
    getDayMock.mockImplementation(dayFor({ tonight: null }));
    await renderPage();
    expect(screen.getAllByText("No bed yet").length).toBeGreaterThan(0);
    for (const l of screen.getAllByRole("link", { name: "+ Add a stay" })) expect(l).toHaveAttribute("href", "/trips/t1/plan#stop-s1");
  });

  it("travel day: eyebrow 'DAY 11 OF 36 · TRAVEL DAY' and the arrow sub line (review focus 3)", async () => {
    getDayMock.mockImplementation(
      dayFor({ travelDay: true, eyebrow: "DAY 11 OF 36 · TRAVEL DAY", heading: "Mon 14 Dec", subLine: "Strasbourg → Colmar · CET", subLineCompact: "Strasbourg → Colmar · CET" }),
    );
    await renderPage("2026-12-14");
    expect(screen.getByText("DAY 11 OF 36 · TRAVEL DAY")).toBeInTheDocument();
    expect(screen.getAllByText("Strasbourg → Colmar · CET")).toHaveLength(2);
  });

  it("on the day with nothing written: a compact prompt; the editor opens on 'Write an entry' (spec 2026-09-29 D6)", async () => {
    getDayMock.mockImplementation(dayFor({ journal: { open: true, mine: { body: "", updatedAt: null, photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] } }));
    const { container } = await renderPage();
    expect(screen.queryByText("Opens on the day")).toBeNull();
    expect(screen.queryByTestId("journal-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Write an entry" }));
    expect(within(shownPanel(container)).getByTestId("journal-editor")).toBeInTheDocument();
  });

  it("on the day with an entry: the editor shows straight away", async () => {
    getDayMock.mockImplementation(dayFor({ journal: { open: true, mine: { body: "Snow!", updatedAt: new Date(), photo: null, extraPhotos: [], hiddenFromShares: false }, others: [] } }));
    const { container } = await renderPage();
    expect(within(shownPanel(container)).getByTestId("journal-editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write an entry" })).toBeNull();
  });

  it("last day hides Tonight", async () => {
    getDayMock.mockImplementation(dayFor());
    const { container } = await renderPage("2027-01-08");
    expect(within(shownPanel(container)).queryByText("Hôtel Cour du Corbeau")).toBeNull();
    // No empty Tonight wrapper either (it would add a spurious gap).
    expect(shownPanel(container).querySelector('[data-slot="tonight"]')).toBeNull();
    expect(screen.getByLabelText("Next day")).toHaveAttribute("aria-disabled", "true");
  });

  it("asks for the day shown and both neighbours in one getDays call, then the days two and three away in one more (NAV-05)", async () => {
    await renderPage();
    expect(getDaysMock).toHaveBeenCalledTimes(2);
    expect(getDaysMock).toHaveBeenNthCalledWith(1, "t1", ["2026-12-12", "2026-12-11", "2026-12-13"], "u1");
    expect(getDaysMock).toHaveBeenNthCalledWith(2, "t1", ["2026-12-09", "2026-12-10", "2026-12-14", "2026-12-15"], "u1");
  });

  it("first day: every day has a slot, the first is shown, and nothing is read before it", async () => {
    const { container } = await renderPage("2026-12-04");
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items).toHaveLength(36);
    expect(items[0]).toHaveAttribute("data-day-panel", "2026-12-04");
    expect(items[0]).toHaveAttribute("data-shown", "true");
    expect(getDaysMock).toHaveBeenNthCalledWith(2, "t1", ["2026-12-06", "2026-12-07"], "u1");
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
  });

  it("a date the loader clamped onto the Trip's last day: that day is shown, and the day before it comes from the further read", async () => {
    getDayMock.mockImplementation((t: string, date: string) => dayFor({}, "2026-12-04", "2026-12-12")(t, date > "2026-12-12" ? "2026-12-12" : date));
    const { container } = await renderPage("2026-12-13");
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
    expect(items.at(-1)).toHaveAttribute("data-shown", "true");
    expect(items.at(-1)).toHaveAttribute("data-day-panel", "2026-12-12");
    expect(getDaysMock).toHaveBeenNthCalledWith(2, "t1", ["2026-12-09", "2026-12-10", "2026-12-11"], "u1");
  });

  it("a malformed date asks for that date alone", async () => {
    getDayMock.mockResolvedValue("invalid");
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getDaysMock).toHaveBeenCalledWith("t1", ["nope"], "u1");
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

  it("builds its links from the Trip's slug (ADR 0064)", async () => {
    tripFindUniqueMock.mockResolvedValue({ slug: "christmas-in-europe-2026", name: "Christmas in Europe", members: [] });
    await renderPage();
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/christmas-in-europe-2026/day/2026-12-11");
  });
});

describe("Day page: a slot for every day", () => {
  const tenDays = (over: Partial<DayViewData> = {}) => dayFor(over, "2026-12-01", "2026-12-10");
  const slots = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>("[data-day-panel]"));
  const isFilled = (slot: HTMLElement) => slot.querySelector("[data-day-body]") != null;
  const isSkeleton = (slot: HTMLElement) => slot.querySelector("[data-day-slot-skeleton]") != null;

  it("a ten-day Trip on day 5: ten slots; 4 to 6 paint first, 2, 3, 7 and 8 stream in from one more read, the rest stay skeletons", async () => {
    getDayMock.mockImplementation(tenDays());
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    getDaysMock.mockImplementationOnce((t: string, dates: string[], v: string) => Promise.all(dates.map((d) => getDayMock(t, d, v))));
    getDaysMock.mockImplementationOnce((t: string, dates: string[], v: string) => held.then(() => Promise.all(dates.map((d) => getDayMock(t, d, v)))));
    const { container } = await renderPage("2026-12-05");
    const all = slots(container);
    expect(all.map((s) => s.dataset.dayPanel)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10"]);
    expect(all.map(isFilled)).toEqual([false, false, false, true, true, true, false, false, false, false]);
    expect(all.map(isSkeleton)).toEqual([true, true, true, false, false, false, true, true, true, true]);
    expect(getDaysMock).toHaveBeenCalledTimes(2);
    expect(getDaysMock).toHaveBeenNthCalledWith(2, "t1", ["2026-12-02", "2026-12-03", "2026-12-07", "2026-12-08"], "u1");
    await act(async () => release());
    expect(slots(container).map(isFilled)).toEqual([false, true, true, true, true, true, true, true, false, false]);
    expect(slots(container).map(isSkeleton)).toEqual([true, false, false, false, false, false, false, false, true, true]);
    expect(getDaysMock).toHaveBeenCalledTimes(2);
  });

  it("a one-day Trip has one slot and makes no further read", async () => {
    getDayMock.mockImplementation(dayFor({}, "2026-12-01", "2026-12-01"));
    const { container } = await renderPage("2026-12-01");
    expect(slots(container).map((s) => s.dataset.dayPanel)).toEqual(["2026-12-01"]);
    expect(getDaysMock).toHaveBeenCalledTimes(1);
  });

  it("each filled slot registers its own header", async () => {
    getDayMock.mockImplementation((t: string, date: string) =>
      tenDays({ eyebrow: `EYEBROW ${date}`, heading: formatDayLabel(date), subLine: `Sub ${date}`, subLineCompact: `Sub ${date}`, dayTitle: `Title ${date}`, holidays: [`Holiday ${date}`] })(t, date),
    );
    await renderPage("2026-12-05");
    expect([...registered.keys()].sort()).toEqual(["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08"]);
    const header = render(<>{registered.get("2026-12-07")}</>);
    const h = within(header.container);
    expect(h.getByRole("heading", { level: 1, name: "Mon 7 Dec" })).toBeInTheDocument();
    expect(h.getByText("EYEBROW 2026-12-07")).toBeInTheDocument();
    expect(h.getAllByText("Sub 2026-12-07").length).toBeGreaterThan(0);
    expect(h.getByText("Title 2026-12-07")).toBeInTheDocument();
    expect(h.getByText("Holiday 2026-12-07")).toBeInTheDocument();
  });

  it("the offline warmer's request gets the three near days only and no further read", async () => {
    getDayMock.mockImplementation(tenDays());
    requestHeaders.set("x-teepee-warm", "1");
    const { container } = await renderPage("2026-12-05");
    expect(slots(container)).toHaveLength(10);
    expect(slots(container).map(isFilled)).toEqual([false, false, false, true, true, true, false, false, false, false]);
    expect(getDaysMock).toHaveBeenCalledTimes(1);
  });
});
