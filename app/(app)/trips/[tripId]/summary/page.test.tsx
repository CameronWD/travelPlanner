import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanRows } from "@/lib/plan-reads";
import type { item, cost } from "@/test/builders";

// summary/page.tsx is a heavy async server component, but since Task 13 its
// one read is `readPlan` (lib/plan-reads.ts) — mocked here with a prebuilt
// `PlanRows`, the shape a real call would have produced for the scenario.
// `readPlan`'s own masking/placeholder/query-shape behaviour (which Costs,
// which Items, in what order, which fragment went where) is pinned in
// lib/plan-reads.test.ts; this file only has to prove the PAGE renders a
// given PlanRows correctly.
//
// Two test styles live in this file:
//  1. A className-only check via an exported constant (no DB/RSC stack needed).
//  2. A full-render harness (mirrors budget/budget-page.test.tsx): `readPlan`
//     is mocked, heavy client leaves (route map, flag list, make-it-fit) are
//     mocked to markers, but `@/lib/chapters` / `@/lib/dates` /
//     `@/lib/plan-order` are left REAL (pure, deterministic) so the actual
//     chapter-gating behaviour in page.tsx is exercised end to end, proving
//     a disabled trip renders flat (Task 13).

const { readPlanMock } = vi.hoisted(() => ({ readPlanMock: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/plan-reads", () => ({ readPlan: readPlanMock }));
// The page itself no longer imports `@/lib/db` (Task 13), but
// `@/lib/flags-loader`'s `loadFlags` (an export the page never calls) still
// does at module scope — stub it so that import doesn't try to open Postgres.
vi.mock("@/lib/db", () => ({ db: {} }));
// requireTripAccess now returns { user, membership } here too (I5): the page
// keeps them to compute isOwner for Make it fit's owner-only Drop half.
// isTripOwnerOrAdmin is the REAL predicate — it lives in lib/access.ts, which
// is framework- and db-free, so importing it here keeps the gate honest
// instead of hand-reimplementing it (same pattern as server/actions/trips.test.ts).
vi.mock("@/lib/guards", async () => {
  const { isTripOwnerOrAdmin } = await import("@/lib/access");
  return {
    requireTripAccess: vi.fn().mockResolvedValue({
      user: { id: "u1", email: "you@example.com" },
      membership: { role: "owner" },
    }),
    isTripOwnerOrAdmin,
  };
});
vi.mock("@/lib/money", () => ({ formatMoney: vi.fn((minor: number, currency: string) => `${minor}${currency}`) }));
vi.mock("@/lib/budget", () => ({
  buildBudget: vi.fn(() => ({
    grandTotal: { costTotalMinor: 0, paidTotalMinor: 0 },
    byCategory: [],
    byStop: [],
    byChapter: [],
    hasMissingRates: false,
    missingRates: [],
  })),
  applyFxRatesToCosts: vi.fn(({ costs }: { costs: unknown[] }) => costs),
}));
vi.mock("@/lib/flags", () => ({ detectFlags: vi.fn(() => []) }));
vi.mock("@/lib/home-base", () => ({ tripHomeBase: vi.fn(() => null) }));
vi.mock("@/lib/route-map", () => ({ homeMapPoint: vi.fn(() => null) }));
vi.mock("@/server/actions/stops", () => ({}));
vi.mock("@/lib/trip-projection-reads", () => ({
  getTripProjection: vi.fn(async () => ({ projectedEnd: null, hardEndDate: null, deadline: null })),
}));
// `@/lib/chapters` and the `@/lib/dates` it depends on internally (isDateWithin)
// are left REAL — pure, deterministic functions — so chapter grouping actually
// reflects the gated `chapters` array built inside page.tsx. Mocking them
// would hide exactly the behaviour this suite needs to prove.
vi.mock("@/lib/chapter-colours", () => ({ chapterColourSwatch: vi.fn(() => "#000000") }));
vi.mock("@/components/trip/chapter-chip", () => ({
  ChapterChip: ({ name }: { name: string }) => <span data-testid="chapter-chip">{name}</span>,
}));
vi.mock("@/components/trip/cost-amounts", () => ({ CostAmounts: () => null }));
vi.mock("@/components/trip/route-map-loader", () => ({ RouteMapLoader: () => <div data-testid="route-map" /> }));
vi.mock("@/components/trip/flag-list", () => ({ FlagList: () => <div data-testid="flag-list" /> }));
vi.mock("@/components/trip/make-it-fit", () => ({ MakeItFit: () => <div data-testid="make-it-fit" /> }));

const { SUMMARY_DESKTOP_GRID_CLASS, SUMMARY_STAT_GRID_CLASS, default: SummaryPage } = await import("./page");
const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
const { buildBudget } = await import("@/lib/budget");
const { hiddenVisibility, placeholderItem } = await import("@/test/helpers/surprise-visibility");
const { trip, stop, chapter, transport, stay } = await import("@/test/builders");
const { planRows } = await import("@/test/builders/plan-rows");

describe("Summary desktop rail width", () => {
  it("desktop grid uses 21.25rem rail (340 px) matching the mockup spec", () => {
    expect(SUMMARY_DESKTOP_GRID_CLASS).toContain("21.25rem");
  });

  it("the stat bar stays 2×2 until lg so 'Paid so far' never truncates at 768 (LA-149)", () => {
    expect(SUMMARY_STAT_GRID_CLASS).toMatch(/\bgrid-cols-2\b/);
    expect(SUMMARY_STAT_GRID_CLASS).toMatch(/\blg:grid-cols-4\b/);
    expect(SUMMARY_STAT_GRID_CLASS).not.toMatch(/\bsm:grid-cols-4\b/);
  });
});

// ---------------------------------------------------------------------------
// Full-render chapter gating (Task 13)
// ---------------------------------------------------------------------------

const BASE_TRIP = {
  id: "trip-1",
  name: "Test Trip",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
  homeCurrency: "GBP",
  drivingWindingFactor: 1.3,
  drivingAvgSpeedKph: 80,
  homeName: null,
  homeLat: null,
  homeLng: null,
  homeCountryCode: null,
  roundTrip: false,
};

// A dated stop that falls inside CHAPTER's date band, so a real
// `groupStopsByChapter` call groups it under that chapter when chapters flow
// through.
const DATED_STOP = stop({
  id: "s1",
  name: "Rome",
  country: "Italy",
  lat: 41.9,
  lng: 12.5,
  timezone: "Europe/Rome",
  arriveDate: "2026-01-02",
  departDate: "2026-01-05",
  sortOrder: 0,
  pinned: false,
  nights: 3,
});

const CHAPTER = chapter({ id: "c1", name: "Italy Leg", colour: "sky", startDate: "2026-01-01", endDate: "2026-01-10" });

// A rough (date-less) stop explicitly assigned to CHAPTER via chapterId —
// exercises the "Not yet scheduled" chip lookup, which reads the page's own
// (gated) `chapters` array directly rather than going through lib/chapters.
const ROUGH_STOP = stop({
  id: "r1",
  name: "Someday Place",
  nights: 2,
  country: "Spain",
  chapterId: "c1",
  pinned: false,
  sortOrder: 1,
  arriveDate: null,
  departDate: null,
  timezone: null,
});

/**
 * Build the `PlanRows` a real `readPlan` call would have handed back for a
 * scenario — `readPlan`'s own masking/placeholder assembly is pinned in
 * lib/plan-reads.test.ts, so this just re-applies the same (pure) merge the
 * reader does: attach each Stop/Item's Surprise view, and append this plan's
 * placeholders.
 */
function rowsFrom({
  trip: tripRow,
  stops = [],
  chapters = [],
  transports = [],
  accommodations = [],
  items = [],
  costs = [],
  exchangeRates = [],
  visibility = NO_SURPRISES,
}: {
  trip: ReturnType<typeof trip>;
  stops?: ReturnType<typeof stop>[];
  chapters?: ReturnType<typeof chapter>[];
  transports?: ReturnType<typeof transport>[];
  accommodations?: ReturnType<typeof stay>[];
  items?: ReturnType<typeof item>[];
  costs?: ReturnType<typeof cost>[];
  exchangeRates?: PlanRows["exchangeRates"];
  visibility?: PlanRows["visibility"];
}): PlanRows {
  return planRows({
    trip: { ...tripRow, members: [], stops: [] } as unknown as PlanRows["trip"],
    plan: null,
    fork: null,
    visibility,
    stops: stops.map((s) => ({ ...s, surprise: visibility.views.stops.get(s.id) ?? null })) as unknown as PlanRows["stops"],
    transports: transports as unknown as PlanRows["transports"],
    accommodations: accommodations as unknown as PlanRows["accommodations"],
    items: [
      ...items.map((i) => ({ ...i, surprise: visibility.views.items.get(i.id) ?? null })),
      ...visibility.placeholderItems.filter((p) => p.forkId === null),
    ] as unknown as PlanRows["items"],
    costs: costs as unknown as PlanRows["costs"],
    exchangeRates,
    chapters: chapters as unknown as PlanRows["chapters"],
    budgetItems: items.map((i) => ({ id: i.id, stopId: i.stopId, category: i.category, date: i.date, title: i.title })),
    budgetAccommodations: accommodations.map((a) => ({ id: a.id, stopId: a.stopId, checkIn: a.checkIn, checkOut: a.checkOut, name: a.name })),
  });
}

function renderSummary() {
  const jsx = SummaryPage({
    params: Promise.resolve({ tripId: "trip-1" }),
  }) as unknown as Promise<React.ReactElement>;
  return jsx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SummaryPage chapter gating — dated trip (Task 13)", () => {
  it("renders flat when readPlan hands back no Chapters (chaptersEnabled off)", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip(BASE_TRIP), stops: [DATED_STOP, ROUGH_STOP], chapters: [] }),
    );

    render(await renderSummary());

    expect(screen.queryByText("Italy Leg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapter-chip")).not.toBeInTheDocument();
  });

  it("shows chapter chips for both dated and rough stops when readPlan hands back a dated Chapter", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip(BASE_TRIP), stops: [DATED_STOP, ROUGH_STOP], chapters: [CHAPTER] }),
    );

    render(await renderSummary());

    expect(screen.getAllByText("Italy Leg").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("chapter-chip").length).toBeGreaterThan(0);
  });
});

describe("SummaryPage chapter gating — date-less trip (Task 13)", () => {
  const DATELESS_ROUGH_STOP = stop({
    id: "r1",
    name: "Someday Place",
    nights: 2,
    country: "Spain",
    chapterId: "c1",
    arriveDate: null,
    departDate: null,
    timezone: null,
  });

  it("renders flat when readPlan hands back no Chapters (chaptersEnabled off)", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip({ ...BASE_TRIP, startDate: null, endDate: null }), stops: [DATELESS_ROUGH_STOP], chapters: [] }),
    );

    render(await renderSummary());

    expect(screen.queryByText("Italy Leg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chapter-chip")).not.toBeInTheDocument();
  });

  it("shows the chapter chip when readPlan hands back a Chapter", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip({ ...BASE_TRIP, startDate: null, endDate: null }), stops: [DATELESS_ROUGH_STOP], chapters: [CHAPTER] }),
    );

    render(await renderSummary());

    expect(screen.getByText("Italy Leg")).toBeInTheDocument();
    expect(screen.getByTestId("chapter-chip")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Width safety — long Stop, accommodation and transport-place names must
// wrap/truncate inside their own cells instead of widening the page.
// ---------------------------------------------------------------------------

const longStop = "S".repeat(60);
const longAccom = "A".repeat(60);
const longPlace = "P".repeat(60);

// Second dated stop with a 60-char unbroken name, inside CHAPTER's band.
const LONG_STOP = stop({
  id: "s2",
  name: longStop,
  country: "France",
  lat: 48.8,
  lng: 2.3,
  timezone: "Europe/Paris",
  arriveDate: "2026-01-06",
  departDate: "2026-01-08",
  sortOrder: 1,
  pinned: false,
  nights: 2,
});

// Trailing stop so LONG_STOP is not the last stop (outbound transport is only
// rendered for non-last stops).
const TAIL_STOP = stop({
  id: "s3",
  name: "Tail",
  country: null,
  lat: 0,
  lng: 0,
  timezone: "UTC",
  arriveDate: "2026-01-09",
  departDate: "2026-01-10",
  sortOrder: 2,
  pinned: false,
  nights: 1,
});

describe("SummaryPage — long names don't widen the page", () => {
  it("wraps/truncates a long Stop name, accommodation name and transport place", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ ...BASE_TRIP, chaptersEnabled: true }),
        stops: [DATED_STOP, LONG_STOP, TAIL_STOP, ROUGH_STOP],
        chapters: [CHAPTER],
        accommodations: [stay({ id: "a1", stopId: "s2", name: longAccom, checkIn: "2026-01-06", checkOut: "2026-01-08" })],
        transports: [
          transport({
            id: "t1",
            mode: "flight",
            fromStopId: "s2",
            toStopId: "s3",
            depPlace: longPlace,
            arrPlace: "Tail",
            depAt: new Date("2026-01-08T10:00:00.000Z"),
            arrAt: null,
            sortOrder: 0,
            depIsHome: false,
            arrIsHome: false,
          }),
        ],
      }),
    );

    render(await renderSummary());

    const stopName = screen.getByRole("heading", { level: 3, name: longStop });
    expect(stopName.className).toMatch(/\bbreak-words\b/);
    expect(stopName.className).toMatch(/\bmin-w-0\b/);
    expect(stopName.parentElement!.className).toMatch(/\bmin-w-0\b/); // flex row
    expect(stopName.parentElement!.parentElement!.className).toMatch(/\bmin-w-0\b/); // left column
    expect(screen.getByText(longAccom).className).toMatch(/\btruncate\b|\bbreak-words\b/);
    expect(screen.getByText(new RegExp(longPlace)).className).toMatch(/\bmin-w-0\b/);
  });
});

describe("SummaryPage — phone stop cards (LA-144, LA-148)", () => {
  it("stacks the cost block under the name row below sm and keeps the name column full width", async () => {
    readPlanMock.mockResolvedValue(rowsFrom({ trip: trip(BASE_TRIP), stops: [DATED_STOP] }));
    vi.mocked(buildBudget).mockReturnValueOnce({
      grandTotal: { costTotalMinor: 1000, paidTotalMinor: 0 },
      byCategory: [],
      byStop: [{ stopId: "s1", costTotalMinor: 1000, paidTotalMinor: 0 }],
      byChapter: [],
      hasMissingRates: false,
      missingRates: [],
    } as unknown as ReturnType<typeof buildBudget>);

    render(await renderSummary());

    // "cost" is the caption; with nights > 0 and a non-zero total, the real
    // per-night suffix (" · 333GBP/night") lands in the same <p>, so match
    // the caption by prefix rather than an exact "cost" string.
    const costCaption = screen.getByText(/^cost/);
    const costBlock = costCaption.parentElement!;
    const headerRow = costBlock.parentElement!;
    // Phones: a column (cost under the name row); from sm: one row, cost on the right.
    expect(headerRow.className).toMatch(/\bflex-col\b/);
    expect(headerRow.className).toMatch(/\bsm:flex-row\b/);
    expect(headerRow.className).not.toMatch(/\bflex-wrap\b/);
    expect(costBlock.className).not.toMatch(/(^|\s)shrink-0(\s|$)/); // no shrink-0 on phones
    expect(costBlock.className).toMatch(/\bsm:shrink-0\b/);
    // The name row wraps the country under the name rather than squeezing the h3.
    const nameRow = screen.getByRole("heading", { level: 3, name: "Rome" }).parentElement!;
    expect(nameRow.className).toMatch(/\bflex-wrap\b/);
  });

  it("wraps the accommodation name and puts the date range on its own line below sm", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip(BASE_TRIP),
        stops: [DATED_STOP],
        accommodations: [stay({ id: "a1", stopId: "s1", name: "Arctic Glass Igloos & Lodge", checkIn: "2026-01-02", checkOut: "2026-01-05" })],
      }),
    );

    render(await renderSummary());

    const name = screen.getByText("Arctic Glass Igloos & Lodge");
    expect(name.className).toMatch(/\bbreak-words\b/);
    expect(name.className).not.toMatch(/\btruncate\b/);
    const range = screen.getByText("2026-01-02 – 2026-01-05");
    const line = range.parentElement!;
    expect(line).toBe(name.parentElement);
    expect(line.className).toMatch(/\bflex-col\b/);
    expect(line.className).toMatch(/\bsm:flex-row\b/);
  });
});

describe("SummaryPage — departure dates in the leg's timezone (spec 2026-10-06 §G)", () => {
  it("a 06:30 Sydney departure shows its own calendar day, not the UTC one", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip(BASE_TRIP),
        stops: [
          stop({ ...DATED_STOP, id: "syd", name: "Sydney", country: "Australia", timezone: "Australia/Sydney", arriveDate: "2026-01-02", departDate: "2026-01-08" }),
          TAIL_STOP,
        ],
        transports: [
          transport({
            id: "t1", mode: "flight", fromStopId: "syd", toStopId: "s3", depPlace: "SYD", arrPlace: "Tail",
            // 2026-01-07T19:30Z = 06:30 on 8 Jan in Sydney (AEDT, UTC+11).
            depAt: new Date("2026-01-07T19:30:00.000Z"), arrAt: null, sortOrder: 0, depIsHome: false, arrIsHome: false,
          }),
        ],
      }),
    );

    render(await renderSummary());

    expect(screen.getByText("8 Jan")).toBeInTheDocument();
    expect(screen.queryByText("7 Jan")).toBeNull();
  });
});

describe("SummaryPage — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  it("hands the hidden Stops to the Flags, so nothing about their inside is raised", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip(BASE_TRIP),
        stops: [DATED_STOP],
        visibility: hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s1"] }),
      }),
    );

    render(await renderSummary());

    const { detectFlags } = await import("@/lib/flags");
    expect(vi.mocked(detectFlags)).toHaveBeenCalledWith(expect.objectContaining({ hiddenStopIds: ["s1"] }));
  });

  it("passes hiddenOwnerIds through to buildBudget as surpriseOwnerIds, so the totals keep the money but fold it into one Surprise category row", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip(BASE_TRIP),
        stops: [DATED_STOP],
        visibility: hiddenVisibility({
          viewerId: "u1",
          hiddenStopIds: ["s1"],
          placeholders: [
            placeholderItem({ id: "i-dinner", stopId: "s1", date: "2026-01-03", startTime: "19:30" }),
            placeholderItem({ id: "i-fork", stopId: "s1", date: "2026-01-03", forkId: "fork-1" }),
          ],
        }),
      }),
    );

    render(await renderSummary());

    const input = vi.mocked(buildBudget).mock.calls[0][0] as unknown as { surpriseOwnerIds: string[] };
    expect(input.surpriseOwnerIds).toEqual(["i-dinner", "i-fork"]);
  });

  it("a hidden Accommodation's row still reaches buildBudget (via rows.budgetAccommodations) so byStop/byDay can place its cost correctly, and its name never renders", async () => {
    // The filtered (rendered) `accommodations` excludes the Accommodation
    // inside hidden Stop s1; `budgetAccommodations` — unfiltered, used ONLY
    // to feed buildBudget (lib/plan-reads.ts) — still carries it.
    const rows = rowsFrom({
      trip: trip(BASE_TRIP),
      stops: [DATED_STOP],
      visibility: hiddenVisibility({ viewerId: "u1", hiddenStopIds: ["s1"] }),
    });
    rows.accommodations = []; // what the viewer may render — hidden one excluded
    rows.budgetAccommodations = [{ id: "acc-1", stopId: "s1", checkIn: "2026-01-02", checkOut: "2026-01-04", name: "The Hideaway Inn" }];
    readPlanMock.mockResolvedValue(rows);

    const html = render(await renderSummary()).container.innerHTML;
    const input = vi.mocked(buildBudget).mock.calls[0][0] as unknown as { accommodations: Array<Record<string, unknown>> };
    expect(input.accommodations).toEqual([{ id: "acc-1", stopId: "s1", checkIn: "2026-01-02", checkOut: "2026-01-04", name: "The Hideaway Inn" }]);
    expect(html).not.toContain("The Hideaway Inn");
  });
});
