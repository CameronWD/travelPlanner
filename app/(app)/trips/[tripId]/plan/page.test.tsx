import { describe, it, expect, vi, beforeEach } from "vitest";
// React import needed for JSX in the rail mocks below (vi.mock calls
// are hoisted above every import, so this being written before or after
// them doesn't change execution order — top-of-file here for readability).
import React from "react";

// plan/page.tsx is a heavy async server component. Its Plan data (since
// Task 15) comes from one `readPlan` call — mocked here with the `PlanRows` a
// real call would have produced for the scenario (built with the reader's own
// pure `maskPlanStops`/`mergePlanItems`). `readPlan`'s masking, placeholder
// and query-shape behaviour is pinned in lib/plan-reads.test.ts. The `?plan=`
// gate (`resolvePlanParam`) runs for real over a mocked Trip shell and
// `db.fork`. The page's own reads — attachments, notes, Day titles,
// reminders — stay mocked at the `db` level.

const mockDb = vi.hoisted(() => ({
  fork: { findFirst: vi.fn() },
  attachment: { findMany: vi.fn() },
  note: { findMany: vi.fn() },
  reminder: { findMany: vi.fn() },
  dayTitle: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
const { readPlanMock, readTripShellMock } = vi.hoisted(() => ({ readPlanMock: vi.fn(), readTripShellMock: vi.fn() }));
vi.mock("@/lib/plan-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan-reads")>();
  return { ...actual, readPlan: readPlanMock };
});
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: readTripShellMock, readTripHeader: readTripShellMock }));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({
    user: { id: "owner-1", email: "owner@example.com" },
    membership: { userId: "owner-1", role: "owner" },
  })),
  isTripOwnerOrAdmin: vi.fn(() => true),
}));
// Task 7: capture the props ItineraryManager is rendered with, so the
// remindersByStopId grouping can be asserted without a real DOM for it (the
// mock still renders null — every other test in this file relies on that).
const itineraryManagerCapture = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/components/trip/itinerary-manager", () => ({
  ItineraryManager: (props: Record<string, unknown>) => {
    itineraryManagerCapture.props = props;
    return null;
  },
}));
// The rail's pieces are covered by their own tests; here only their slot and
// the props the page builds for them matter.
const railCapture = vi.hoisted(() => ({
  jumpList: undefined as Record<string, unknown> | undefined,
  planBody: undefined as Record<string, unknown> | undefined,
  mapButton: undefined as Record<string, unknown> | undefined,
  fitTile: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: () => false }));
vi.mock("@/components/plan/fit-tile", () => ({
  FitTile: (props: Record<string, unknown>) => {
    railCapture.fitTile = props;
    return <div data-testid="fit-tile" />;
  },
  FitStrip: () => null,
}));
vi.mock("@/components/plan/jump-list", () => ({
  JumpList: (props: Record<string, unknown>) => {
    railCapture.jumpList = props;
    return <div data-testid="jump-list" />;
  },
}));
vi.mock("@/components/plan/plan-mini-map", () => ({
  PlanMapButton: (props: Record<string, unknown>) => {
    railCapture.mapButton = props;
    return <div data-testid="map-button" />;
  },
  PlanMapDialog: () => null,
}));
vi.mock("@/components/plan/plan-body", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/plan/plan-body")>();
  return {
    ...actual,
    PlanBody: (props: React.ComponentProps<typeof actual.PlanBody>) => {
      railCapture.planBody = props;
      return <actual.PlanBody {...props} />;
    },
  };
});
vi.mock("@/components/trip/variant-banner", () => ({ VariantBanner: () => null }));

const { PLAN_ASIDE_CLASS, PLAN_GRID_CLASS, default: TripPlanPage } = await import("./page");
const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
const { maskPlanStops, mergePlanItems } = await import("@/lib/plan-reads");
const { planRows } = await import("@/test/builders/plan-rows");
const { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } = await import("@/test/helpers/surprise-visibility");
const { expectAccessCheckedBeforeWrite } = await import("@/test/helpers/access-order");
const { renderToStaticMarkup } = await import("react-dom/server");

const BASE_TRIP = {
  name: "Christmas in Europe",
  slug: "trip-1",
  homeLat: null,
  homeLng: null,
  homeCurrency: "GBP",
  homeName: null as string | null,
  homeTimezone: null,
  homeCountryCode: null,
  roundTrip: false,
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  hardEndDate: null as string | null,
  drivingWindingFactor: 1.3,
  drivingAvgSpeedKph: 80,
  chaptersEnabled: true,
  forksEnabled: true,
  members: [] as Array<{ user: Record<string, unknown> }>,
  stops: [],
};

type Row = Record<string, unknown> & { id: string };
type StopRow = Row & { accommodations?: Row[] };

/**
 * The scenario a test sets; `readPlan` hands back the PlanRows a real call
 * would have produced for it (Stops flat, Accommodations alongside, Items
 * merged with this plan's placeholders).
 */
const scenario: {
  trip: typeof BASE_TRIP;
  stops: StopRow[];
  transports: Row[];
  items: Row[];
  costs: Row[];
  chapters: Row[];
  visibility: ReturnType<typeof hiddenVisibility>;
} = { trip: BASE_TRIP, stops: [], transports: [], items: [], costs: [], chapters: [], visibility: NO_SURPRISES };

function rowsFor(plan: string | null) {
  const v = scenario.visibility;
  const flat = scenario.stops.map((st) => {
    const rest: StopRow = { ...st };
    delete rest.accommodations;
    return rest as Row & { notes?: string | null };
  });
  return planRows({
    trip: scenario.trip as never,
    plan,
    fork: plan ? { id: plan, name: "Plan B" } : null,
    visibility: v,
    stops: maskPlanStops(flat, v) as never,
    transports: scenario.transports as never,
    accommodations: scenario.stops.flatMap((st) => st.accommodations ?? []) as never,
    items: mergePlanItems(scenario.items, v, plan) as never,
    costs: scenario.costs as never,
    chapters: scenario.chapters as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  scenario.trip = BASE_TRIP;
  scenario.stops = [];
  scenario.transports = [];
  scenario.items = [];
  scenario.costs = [];
  scenario.chapters = [];
  scenario.visibility = NO_SURPRISES;
  readPlanMock.mockImplementation(async (_tripId: string, _viewer: string | null, plan: string | null) => rowsFor(plan));
  readTripShellMock.mockImplementation(async () => scenario.trip);
  mockDb.fork.findFirst.mockResolvedValue(null);
  mockDb.attachment.findMany.mockResolvedValue([]);
  mockDb.note.findMany.mockResolvedValue([]);
  mockDb.reminder.findMany.mockResolvedValue([]);
  mockDb.dayTitle.findMany.mockResolvedValue([]);
});

async function renderPlan() {
  const tree = await TripPlanPage({
    params: Promise.resolve({ tripId: "trip-1" }),
    searchParams: Promise.resolve({}),
  });
  const div = document.createElement("div");
  div.innerHTML = renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
  return div;
}

describe("Plan overview sticky aside (LA-038)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: 4,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  it("a dated return leg from the last Stop is the plan's deadline: the Fit tile and the add-stop line both read it (ADR 0068)", async () => {
    scenario.trip = { ...BASE_TRIP, hardEndDate: "2026-01-20" };
    scenario.stops = [STOP];
    scenario.transports = [{
      id: "t1", mode: "FLIGHT", fromStopId: "s1", toStopId: null, anchorStopId: null,
      depPlace: "FCO", depAt: new Date("2026-01-05T09:00:00Z"), depLat: null, depLng: null,
      arrPlace: "London", arrAt: new Date("2026-01-05T12:00:00Z"), arrLat: null, arrLng: null,
      reference: null, notes: null, sortOrder: 0, depIsHome: false, arrIsHome: true,
    }];
    await renderPlan();
    const summary = railCapture.fitTile!.summary as { deadline: unknown };
    // BASE_TRIP is roundTrip: false (a one-way trip fixture) — homeward follows it (R8).
    expect(summary.deadline).toEqual({ kind: "return-leg", date: "2026-01-05", mode: "FLIGHT", homeward: false });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-05");
  });
  it("with no return leg the stored hard end date is the deadline", async () => {
    scenario.trip = { ...BASE_TRIP, hardEndDate: "2026-01-20" };
    scenario.stops = [STOP];
    await renderPlan();
    expect((railCapture.fitTile!.summary as { deadline: unknown }).deadline).toEqual({ kind: "hard-end", date: "2026-01-20" });
    expect(itineraryManagerCapture.props!.hardEndDate).toBe("2026-01-20");
  });

  // No app top bar from md up (Task 11): the Dock / sidebar is the only
  // chrome there, so no 3.5rem header offset.
  it("the plan overview column sticks near the viewport top on desktop", () => {
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toContain("lg:top-6");
    expect(PLAN_ASIDE_CLASS).not.toContain("3.5rem");
  });

  it("caps the aside's own height to the viewport so its scroll never outgrows the window", () => {
    expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(PLAN_ASIDE_CLASS).toContain("lg:overflow-y-auto");
  });

  it("PageHeader: the h1 is Plan, the eyebrow the trip with year, the meta stops + range", async () => {
    scenario.stops = [STOP];
    const div = await renderPlan();
    expect(div.querySelector("h1")!.textContent).toBe("Plan");
    expect(div.textContent).toContain("Christmas in Europe 2026");
    expect(div.textContent).toContain("1 stop · Thu 1 – Sat 10 Jan");
  });
  it("the rail holds the Route map button, Fit tile and Jump list, in that order, after the list", async () => {
    scenario.stops = [STOP];
    const div = await renderPlan();
    const aside = div.querySelector("aside")!;
    expect(aside.className).toBe(PLAN_ASIDE_CLASS);
    expect([...aside.children].map((c) => c.firstElementChild!.getAttribute("data-testid"))).toEqual(["map-button", "fit-tile", "jump-list"]);
    // Spec 2026-10-04 §C: a button card, not a map tile — it needs no far-home pill.
    expect(Object.keys(railCapture.mapButton!).sort()).toEqual(["home", "stops"]);
    expect(PLAN_ASIDE_CLASS).toContain("lg:sticky");
    expect(PLAN_ASIDE_CLASS).toContain("lg:max-h-[calc(100dvh-3rem)]");
    expect(aside.parentElement!.className).toBe(PLAN_GRID_CLASS);
    expect(aside.previousElementSibling).not.toBeNull();
    expect(aside.nextElementSibling).toBeNull();
  });
  it("MOTION.md P1: the header and rail tiles rise in on first paint, staggered 0 / 60 / 120 / 180ms", async () => {
    scenario.stops = [STOP];
    const div = await renderPlan();
    const header = div.querySelector("h1")!.closest(".tp-rise-in")!;
    expect(header.getAttribute("style")).toContain("--tp-delay:0ms");
    const tiles = [...div.querySelector("aside")!.children];
    expect(tiles.map((t) => t.className)).toEqual([expect.stringContaining("tp-rise-in tp-stagger"), expect.stringContaining("tp-rise-in tp-stagger"), expect.stringContaining("tp-rise-in tp-stagger")]);
    expect(tiles.map((t) => t.getAttribute("style"))).toEqual(["--tp-delay:60ms", "--tp-delay:120ms", "--tp-delay:180ms"]);
  });
  it("no stops → no rail", async () => {
    const div = await renderPlan();
    expect(div.querySelector("aside")).toBeNull();
  });
  it("opens the stop with plans by default", async () => {
    // Today (real clock) is outside Jan 2026's trip, so the default open stop is the first with plans.
    scenario.stops = [STOP, { ...STOP, id: "s2", name: "Florence", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1 }];
    scenario.items = [{ id: "i1", title: "Uffizi", category: "ACTIVITY", date: "2026-01-06", startTime: null, endTime: null, address: null, link: null, booking: null, notes: null, stopId: "s2", lat: null, lng: null, hiddenFromShares: false, photoAttachmentId: null }];
    await renderPlan();
    expect(railCapture.planBody!.initialOpen).toEqual(["s2"]);
  });
});

describe("Plan page zero-stops layout (Review Focus #5)", () => {
  it("renders a single column with no rail, grid or Fit strip when the trip has no stops", async () => {
    scenario.stops = [];
    const div = await renderPlan();

    expect(div.querySelector('[data-testid="fit-tile"]')).toBeNull();
    expect(div.innerHTML).not.toContain("lg:grid-cols-");
    expect(div.innerHTML).not.toContain("lg:sticky");
  });
});

describe("Plan Stops list in the side panel (spec §G, feedback cmuhvbi4h)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: null,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  it("passes the ordered Stops, their compact (year-less) date labels, rough flags and the Home base down to the Jump list", async () => {
    scenario.trip = { ...BASE_TRIP, homeName: "Sydney", roundTrip: true };
    scenario.stops = [
      STOP,
      { ...STOP, id: "s2", name: "Naples", arriveDate: null, departDate: null, nights: 3, sortOrder: 1 },
    ];

    await renderPlan();

    const jl = railCapture.jumpList!;
    expect((jl.stops as Array<Record<string, unknown>>).map((s) => [s.name, s.dateLabel, s.rough])).toEqual([
      ["Rome", "1–5 Jan", false],
      ["Naples", "~3 nights", true],
    ]);
    expect(jl.homeBase).toEqual({ name: "Sydney", roundTrip: true });
  });
});

describe("Plan page with stops (LA-038)", () => {
  const STOP = {
    id: "s1",
    name: "Rome",
    country: "Italy",
    timezone: "Europe/Rome",
    arriveDate: "2026-01-01",
    departDate: "2026-01-05",
    sortOrder: 0,
    notes: null,
    lat: null,
    lng: null,
    nights: 4,
    pinned: false,
    chapterId: null,
    chapterSortOrder: 0,
    accommodations: [],
  };

  // Task 7: a Reminder about a Stop is queried directly (not via
  // listRemindersForTrip's date-filtered/capped "upcoming" feed) and grouped
  // by stopId for the Stop card's own "Reminders" line.
  it("groups a Stop's reminders by stopId and passes them to ItineraryManager", async () => {
    scenario.stops = [STOP];
    mockDb.reminder.findMany.mockResolvedValue([
      { id: "r1", title: "Reconfirm the tour", date: "2026-01-02", stopId: "s1" },
    ]);

    await renderPlan();

    expect(mockDb.reminder.findMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1", stopId: { not: null } },
      orderBy: { date: "asc" },
      select: { id: true, title: true, date: true, stopId: true },
    });
    const remindersByStopId = itineraryManagerCapture.props?.remindersByStopId as Map<
      string,
      unknown[]
    >;
    expect(remindersByStopId.get("s1")).toEqual([
      {
        id: "r1",
        title: "Reconfirm the tour",
        date: "2026-01-02",
        stopId: "s1",
        stopName: "Rome",
      },
    ]);
  });

  // Task 5 (CONTEXT.md "Day title", spec §H): the loader resolves DayTitle
  // rows against the plan's Stops and passes a plain object (not a Map) down
  // to ItineraryManager, so it serialises to the client.
  it("loads Day titles for the plan's stops and passes a plain dayTitles object to ItineraryManager", async () => {
    scenario.stops = [STOP];
    mockDb.dayTitle.findMany.mockResolvedValue([
      { stopId: "s1", dayIndex: 1, title: "Sintra day trip" },
    ]);

    await renderPlan();

    expect(mockDb.dayTitle.findMany).toHaveBeenCalledWith({
      where: { stop: { tripId: "trip-1", forkId: null } },
      select: { stopId: true, dayIndex: true, title: true },
    });
    expect(itineraryManagerCapture.props?.dayTitles).toEqual({
      "2026-01-02": { title: "Sintra day trip", stopId: "s1" },
    });
  });

  it("lays the list and rail on the 1fr + 280/320px grid", async () => {
    scenario.stops = [STOP];
    const div = await renderPlan();
    expect(div.querySelector("aside")!.parentElement!.className).toBe(PLAN_GRID_CLASS);
    expect(PLAN_GRID_CLASS).toContain("lg:grid-cols-[minmax(0,1fr)_280px]");
    expect(PLAN_GRID_CLASS).toContain("xl:grid-cols-[minmax(0,1fr)_320px]");
  });
});

describe("Plan page — plan variants opt-in", () => {
  async function renderWithPlan(plan: string) {
    const tree = await TripPlanPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ plan }),
    });
    renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
  }

  it("an old ?plan=<forkId> link shows the real plan when plan variants are off", async () => {
    scenario.trip = { ...BASE_TRIP, forksEnabled: false };
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });

    await renderWithPlan("fork-1");

    expect(mockDb.fork.findFirst).not.toHaveBeenCalled();
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "owner-1", null);
  });

  it("?plan=<forkId> selects the Fork when plan variants are on", async () => {
    mockDb.fork.findFirst.mockResolvedValue({ id: "fork-1", name: "Plan B" });

    await renderWithPlan("fork-1");

    expect(mockDb.fork.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fork-1", tripId: "trip-1" } }),
    );
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "owner-1", "fork-1");
  });
});

// Task 15 / final review #3: /plan?add=stop is handled client-side by
// ItineraryManager itself (useSearchParams — opens the dialog, then strips
// the param); the page no longer threads it as a prop.
describe("?add=stop", () => {
  it("is not threaded through as a prop any more", async () => {
    const tree = await TripPlanPage({
      params: Promise.resolve({ tripId: "trip-1" }),
      searchParams: Promise.resolve({ add: "stop" } as { plan?: string }),
    });
    renderToStaticMarkup(tree as Parameters<typeof renderToStaticMarkup>[0]);
    expect(itineraryManagerCapture.props).not.toHaveProperty("openAddStop");
  });
});

describe("Plan page reads (spec 2026-10-06 §C)", () => {
  it("issues every read in one wave once the Plan is known", async () => {
    let release!: (rows: unknown[]) => void;
    mockDb.attachment.findMany.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = renderPlan();
    // The Attachments read is still pending: anything awaited after it would not have started.
    await vi.waitFor(() => expect(mockDb.attachment.findMany).toHaveBeenCalled());
    expect(readPlanMock).toHaveBeenCalledTimes(1);
    expect(mockDb.note.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.dayTitle.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.reminder.findMany).toHaveBeenCalledTimes(1);
    release([]);
    await pending;
  });
});

describe("Plan page — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  const STOP = {
    id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome",
    arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0,
    notes: "Booked the hot-air balloon", lat: null, lng: null, nights: 4,
    pinned: false, chapterId: null, chapterSortOrder: 0, accommodations: [],
  };
  const DATED = {
    id: "i-real", title: "Colosseum", category: "SIGHTSEEING", date: "2026-01-02", startTime: null, endTime: null,
    address: null, link: null, booking: null, notes: null, stopId: "s1", lat: null, lng: null,
    hiddenFromShares: false, photoAttachmentId: null,
  };

  function surprised() {
    scenario.visibility = hiddenVisibility({
      hiddenStopIds: ["s1"],
      placeholders: [
        placeholderItem({ id: "i-real-plan", stopId: "s2", date: "2026-01-06", startTime: "19:00" }),
        placeholderItem({ id: "i-fork", stopId: "s2", date: "2026-01-06", forkId: "fork-1" }),
      ],
    });
  }

  it("asks the visibility loader for this viewer before the first query it filters", async () => {
    surprised();
    await renderPlan();
    // The visibility now comes inside the PlanRows, so every filtered read waits for readPlan.
    expect(readPlanMock).toHaveBeenCalledWith("trip-1", "owner-1", null);
    expectAccessCheckedBeforeWrite(readPlanMock, mockDb.attachment.findMany);
    expectAccessCheckedBeforeWrite(readPlanMock, mockDb.note.findMany);
  });

  it("spreads each fragment into its own queries", async () => {
    surprised();
    await renderPlan();
    const whereOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.map(([a]) => (a as { where: Record<string, unknown> }).where);
    expect(whereOf(mockDb.attachment.findMany)[0]).toMatchObject(MARKER_WHERE.attachment);
    expect(whereOf(mockDb.note.findMany)[0]).toMatchObject(MARKER_WHERE.note);
    expect(whereOf(mockDb.dayTitle.findMany)[0]).toMatchObject(MARKER_WHERE.dayTitle);
    expect(whereOf(mockDb.reminder.findMany)[0]).toMatchObject(MARKER_WHERE.reminder);
  });

  it("blanks a hidden Stop's notes, badges it, and adds this Plan's placeholders as Items titled Surprise", async () => {
    surprised();
    scenario.stops = [
      STOP,
      { ...STOP, id: "s2", name: "Florence", notes: "Duomo", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1 },
    ];
    scenario.items = [DATED];
    await renderPlan();

    const initialStops = itineraryManagerCapture.props!.initialStops as Array<{ id: string; notes: string | null; surprise: unknown }>;
    expect(initialStops.find((s) => s.id === "s1")).toMatchObject({ notes: null, surprise: SURPRISED_VIEW });
    expect(initialStops.find((s) => s.id === "s2")).toMatchObject({ notes: "Duomo", surprise: null });

    const dayItems = itineraryManagerCapture.props!.dayItemsByStopId as Map<string, Array<{ id: string; title: string; surprise: unknown }>>;
    const florence = dayItems.get("s2")!;
    expect(florence.map((i) => i.id)).toEqual(["i-real-plan"]); // the Fork's placeholder stays in its Fork
    expect(florence[0]).toMatchObject({ title: "Surprise", category: "OTHER", surprise: SURPRISED_VIEW });
    expect(dayItems.get("s1")!.find((i) => i.id === "i-real")).toMatchObject({ surprise: null });
  });

  it("loads the Trip's members and hands them to the manager", async () => {
    const member = { id: "u2", name: "Sam", image: null, displayName: null, photoKey: null, photoUpdatedAt: null };
    scenario.trip = { ...BASE_TRIP, members: [{ user: member }] };
    await renderPlan();
    expect(itineraryManagerCapture.props!.members).toEqual([member]);
  });

  it("nests each Stop's Accommodations, and hands only visible owners' Cost lines to the cards", async () => {
    const cost = (id: string, ownerType: string, ownerId: string) => ({
      id, costMinor: 1000, paidMinor: 0, currency: "GBP", rateToHome: 1, paidAt: null, dueDate: null,
      ownerType, ownerId, label: null, category: null, settlement: null,
    });
    const acc = (id: string, checkIn: string) => ({
      id, stopId: "s2", name: id, address: null, checkIn, checkOut: "2026-01-08", checkInTime: null, checkOutTime: null,
      confirmation: null, notes: null, lat: null, lng: null,
    });
    surprised();
    scenario.stops = [
      STOP,
      { ...STOP, id: "s2", name: "Florence", notes: "Duomo", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1,
        accommodations: [acc("a-first", "2026-01-05"), acc("a-second", "2026-01-06")] },
    ];
    scenario.items = [{ ...DATED, id: "i-todo", date: null, stopId: "s2" }];
    scenario.costs = [
      cost("c-acc", "ACCOMMODATION", "a-first"),
      cost("c-todo", "ITEM", "i-todo"),
      cost("c-hidden", "ITEM", "i-real-plan"), // owner is a hidden Item: totals keep it, the cards don't
      cost("c-other", "OTHER", "x"),
    ];
    await renderPlan();

    const initialStops = itineraryManagerCapture.props!.initialStops as Array<{ id: string; accommodations: Array<{ id: string; costs: Array<{ id: string }> }> }>;
    expect(initialStops.find((s) => s.id === "s1")!.accommodations).toEqual([]);
    const florence = initialStops.find((s) => s.id === "s2")!;
    expect(florence.accommodations.map((a) => a.id)).toEqual(["a-first", "a-second"]);
    expect(florence.accommodations[0].costs.map((c) => c.id)).toEqual(["c-acc"]);

    const itemCosts = itineraryManagerCapture.props!.thingsToDoItemCostsById as Map<string, Array<{ id: string }>>;
    expect([...itemCosts.keys()]).toEqual(["i-todo"]);
    const todos = itineraryManagerCapture.props!.thingsToDoByStopId as Map<string, Array<{ id: string }>>;
    expect(todos.get("s2")!.map((i) => i.id)).toEqual(["i-todo"]);
  });

  it("an undated Surprise placeholder stays out of the Stop's things to do", async () => {
    scenario.visibility = hiddenVisibility({ placeholders: [placeholderItem({ id: "i-undated", stopId: "s1", date: null })] });
    scenario.stops = [STOP];
    await renderPlan();
    const todos = itineraryManagerCapture.props!.thingsToDoByStopId as Map<string, unknown[]>;
    expect(todos.get("s1")).toBeUndefined();
  });
});
