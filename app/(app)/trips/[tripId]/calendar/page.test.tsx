import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PlanRows } from "@/lib/plan-reads";

// calendar/page.tsx is an async server component whose Plan data (since
// Task 14) comes from one `readPlan` call — mocked here with a prebuilt
// `PlanRows`, the shape a real call would have produced for the scenario.
// `readPlan`'s own masking/placeholder/query-shape behaviour is pinned in
// lib/plan-reads.test.ts; this file only has to prove the PAGE renders a
// given PlanRows correctly. The page still makes two reads of its own: the
// Wishlist ideas list (trip-wide, not part of any Plan) and Day titles —
// both stay mocked at the `db` level.

const { readPlanMock } = vi.hoisted(() => ({ readPlanMock: vi.fn() }));
const { dayTitleFindManyMock, itemFindManyMock } = vi.hoisted(() => ({
  dayTitleFindManyMock: vi.fn().mockResolvedValue([]),
  itemFindManyMock: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db", () => ({
  db: {
    dayTitle: { findMany: dayTitleFindManyMock },
    item: { findMany: itemFindManyMock },
  },
}));
vi.mock("@/lib/plan-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan-reads")>();
  return { ...actual, readPlan: readPlanMock };
});
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/lib/guards", () => ({
  requireTripAccess: vi.fn(async () => ({ user: { id: "u-viewer", email: "v@example.com" }, membership: { role: "member" } })),
}));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
const calendarViewsCapture = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("@/components/trip/calendar-views", () => ({
  CalendarViews: (props: Record<string, unknown>) => {
    calendarViewsCapture.props = props;
    return <div data-testid="calendar-views" />;
  },
  CalendarViewSwitch: () => <div data-testid="view-switch" />,
}));

import CalendarPage from "./page";
const { planRows } = await import("@/test/builders/plan-rows");
const { maskPlanStops, mergePlanItems } = await import("@/lib/plan-reads");
const { NO_SURPRISES } = await import("@/lib/surprise-visibility");
const { hiddenVisibility, placeholderItem, SURPRISED_VIEW } = await import("@/test/helpers/surprise-visibility");
const { trip, stop } = await import("@/test/builders");

/**
 * Build the `PlanRows` a real `readPlan` call would have handed back for a
 * scenario — reusing the reader's own (pure) `maskPlanStops`/`mergePlanItems`
 * rather than re-implementing the merge.
 */
function rowsFrom({
  trip: tripRow,
  stops = [],
  visibility = NO_SURPRISES,
}: {
  trip: ReturnType<typeof trip>;
  stops?: ReturnType<typeof stop>[];
  visibility?: PlanRows["visibility"];
}): PlanRows {
  return planRows({
    trip: { ...tripRow, members: [], stops: [] } as unknown as PlanRows["trip"],
    plan: null,
    fork: null,
    visibility,
    stops: maskPlanStops(stops, visibility) as unknown as PlanRows["stops"],
    transports: [],
    accommodations: [],
    items: mergePlanItems([], visibility, null) as unknown as PlanRows["items"],
    costs: [],
    exchangeRates: [],
    chapters: [],
    budgetItems: [],
    budgetAccommodations: [],
  });
}

async function renderPage() {
  render(await CalendarPage({ params: Promise.resolve({ tripId: "t1" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dayTitleFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
});

describe("CalendarPage — PageHeader + empty states (Task 22, AUDIT.md)", () => {
  it("a date-less trip: No dates yet, with Set dates → settings", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip({ id: "t1", slug: "t1", name: "Europe", startDate: null, endDate: null }) }),
    );
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No dates yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/t1/settings");
    expect(screen.queryByTestId("view-switch")).toBeNull();
  });

  it("dated with no stops: No stops yet (sentence case), Add a stop → the Plan add-stop sheet", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({ trip: trip({ id: "t1", slug: "t1", name: "Europe", startDate: "2026-12-01", endDate: "2026-12-20" }) }),
    );
    await renderPage();
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a stop" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
    expect(screen.queryByTestId("view-switch")).toBeNull();
  });

  it("with stops, the Month/Agenda switch is the header action, and a phone-only copy stays reachable below md", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ id: "t1", slug: "t1", name: "Europe", startDate: "2026-09-21", endDate: "2026-09-27" }),
        stops: [stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-09-21", departDate: "2026-09-27", sortOrder: 0 })],
      }),
    );
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    // PageHeader hides `actions` below md, so the switch also gets a
    // phone-only copy (controller ruling, Task 22) — one inside PageHeader's
    // actions slot, one in the page's own md:hidden wrapper.
    const switches = screen.getAllByTestId("view-switch");
    expect(switches).toHaveLength(2);
    expect(switches[0].closest('[data-slot="page-header-actions"]')).not.toBeNull();
    expect(switches[1].closest('[data-slot="calendar-mobile-view-switch"]')).not.toBeNull();
    expect(screen.getByTestId("calendar-views")).toBeInTheDocument();
  });
});

describe("CalendarPage — Day titles (Task 5, CONTEXT.md \"Day title\")", () => {
  it("loads Day titles for the trip's dated stops and passes a plain dayTitles object to CalendarViews", async () => {
    readPlanMock.mockResolvedValue(
      rowsFrom({
        trip: trip({ id: "t1", slug: "t1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-10" }),
        stops: [stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0 })],
      }),
    );
    dayTitleFindManyMock.mockResolvedValue([{ stopId: "s1", dayIndex: 1, title: "Sintra day trip" }]);

    await renderPage();

    expect(dayTitleFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stopId: { in: ["s1"] } } }),
    );
    expect(calendarViewsCapture.props?.dayTitles).toEqual({
      "2026-01-02": { title: "Sintra day trip", stopId: "s1" },
    });
  });
});

describe("CalendarPage — Surprise (CONTEXT.md \"Surprise\", ADR 0051)", () => {
  function surprisedRows() {
    const visibility = hiddenVisibility({
      hiddenStopIds: ["s-secret"],
      placeholders: [
        placeholderItem({ id: "i-dinner", stopId: "s1", date: "2026-01-03", startTime: "19:30" }),
        placeholderItem({ id: "i-fork", stopId: "s1", date: "2026-01-03", forkId: "fork-1" }),
      ],
    });
    return rowsFrom({
      trip: trip({ id: "t1", slug: "t1", name: "Europe", startDate: "2026-01-01", endDate: "2026-01-10" }),
      stops: [
        stop({ id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0 }),
        stop({ id: "s-secret", name: "Somewhere", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1 }),
      ],
      visibility,
    });
  }

  it("reads no Day titles of a hidden Stop", async () => {
    readPlanMock.mockResolvedValue(surprisedRows());
    await renderPage();
    expect(dayTitleFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { stopId: { in: ["s1"] } } }));
  });

  it("a real-plan placeholder lands on its day titled Surprise", async () => {
    readPlanMock.mockResolvedValue(surprisedRows());
    await renderPage();
    const days = calendarViewsCapture.props!.days as Array<{ dateISO: string; timedItems: Array<{ item: Record<string, unknown> }> }>;
    const day = days.find((d) => d.dateISO === "2026-01-03")!;
    expect(day.timedItems.map((e) => e.item.id)).toEqual(["i-dinner"]);
    expect(day.timedItems[0].item).toMatchObject({ title: "Surprise", category: "OTHER", startTime: "19:30", surprise: SURPRISED_VIEW });
  });
});
