import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// calendar/page.tsx is an async server component with DB calls; invoke it
// with mocked db per-model methods (same pattern as day/[date]/page.test.tsx)
// and pin the two empty branches plus the PageHeader wiring (Task 22).

const { tripFindUniqueMock, stopFindManyMock, itemFindManyMock, transportFindManyMock, accommodationFindManyMock, dayTitleFindManyMock } =
  vi.hoisted(() => ({
    tripFindUniqueMock: vi.fn(),
    stopFindManyMock: vi.fn(),
    itemFindManyMock: vi.fn(),
    transportFindManyMock: vi.fn(),
    accommodationFindManyMock: vi.fn(),
    dayTitleFindManyMock: vi.fn().mockResolvedValue([]),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
    dayTitle: { findMany: dayTitleFindManyMock },
  },
}));
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
// Surprise (ADR 0051): the page asks the visibility loader first and spreads
// its fragments into its own queries; the loader itself is tested on its own.
const { loadSurpriseVisibilityMock } = vi.hoisted(() => ({ loadSurpriseVisibilityMock: vi.fn() }));
vi.mock("@/lib/surprise-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/surprise-visibility")>();
  return { ...actual, loadSurpriseVisibility: loadSurpriseVisibilityMock };
});
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async () => "t1" }));
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
import { NO_SURPRISES } from "@/lib/surprise-visibility";
import { hiddenVisibility, placeholderItem, MARKER_WHERE, SURPRISED_VIEW } from "@/test/helpers/surprise-visibility";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

async function renderPage() {
  render(await CalendarPage({ params: Promise.resolve({ tripId: "t1" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stopFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  transportFindManyMock.mockResolvedValue([]);
  accommodationFindManyMock.mockResolvedValue([]);
  loadSurpriseVisibilityMock.mockResolvedValue(NO_SURPRISES);
});

describe("CalendarPage — PageHeader + empty states (Task 22, AUDIT.md)", () => {
  it("a date-less trip: No dates yet, with Set dates → settings", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: null, endDate: null });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No dates yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set dates" })).toHaveAttribute("href", "/trips/t1/settings");
    expect(screen.queryByTestId("view-switch")).toBeNull();
  });

  it("dated with no stops: No stops yet (sentence case), Add a stop → the Plan add-stop sheet", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-12-01", endDate: "2026-12-20" });
    await renderPage();
    expect(screen.getByRole("heading", { name: "No stops yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a stop" })).toHaveAttribute("href", "/trips/t1/plan?add=stop");
    expect(screen.queryByTestId("view-switch")).toBeNull();
  });

  it("with stops, the Month/Agenda switch is the header action, and a phone-only copy stays reachable below md", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-09-21", endDate: "2026-09-27" });
    stopFindManyMock.mockResolvedValue([
      {
        id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome",
        arriveDate: "2026-09-21", departDate: "2026-09-27", sortOrder: 0,
      },
    ]);
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
  const STOP = {
    id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome",
    arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0,
  };

  it("loads Day titles for the trip's dated stops and passes a plain dayTitles object to CalendarViews", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-01-01", endDate: "2026-01-10" });
    stopFindManyMock.mockResolvedValue([STOP]);
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
  const ROME = {
    id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome",
    arriveDate: "2026-01-01", departDate: "2026-01-05", sortOrder: 0,
  };
  const SECRET = { ...ROME, id: "s-secret", name: "Somewhere", arriveDate: "2026-01-05", departDate: "2026-01-08", sortOrder: 1 };

  function surprised() {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-01-01", endDate: "2026-01-10" });
    stopFindManyMock.mockResolvedValue([ROME, SECRET]);
    dayTitleFindManyMock.mockResolvedValue([]);
    loadSurpriseVisibilityMock.mockResolvedValue(
      hiddenVisibility({
        hiddenStopIds: ["s-secret"],
        placeholders: [
          placeholderItem({ id: "i-dinner", stopId: "s1", date: "2026-01-03", startTime: "19:30" }),
          placeholderItem({ id: "i-fork", stopId: "s1", date: "2026-01-03", forkId: "fork-1" }),
        ],
      }),
    );
  }

  it("asks the visibility loader for this viewer before any query it filters", async () => {
    surprised();
    await renderPage();
    expect(loadSurpriseVisibilityMock).toHaveBeenCalledWith("t1", "u-viewer");
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, itemFindManyMock);
    expectAccessCheckedBeforeWrite(loadSurpriseVisibilityMock, stopFindManyMock);
  });

  it("spreads the fragments into both Item reads and the Accommodation read, and reads no Day titles of a hidden Stop", async () => {
    surprised();
    await renderPage();
    const whereOf = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.map(([a]) => (a as { where: Record<string, unknown> }).where);
    expect(whereOf(itemFindManyMock)).toHaveLength(2);
    for (const w of whereOf(itemFindManyMock)) expect(w).toMatchObject(MARKER_WHERE.item);
    expect(whereOf(accommodationFindManyMock)[0]).toMatchObject(MARKER_WHERE.accommodation);
    expect(dayTitleFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { stopId: { in: ["s1"] } } }));
  });

  it("a real-plan placeholder lands on its day titled Surprise", async () => {
    surprised();
    await renderPage();
    const days = calendarViewsCapture.props!.days as Array<{ dateISO: string; timedItems: Array<{ item: Record<string, unknown> }> }>;
    const day = days.find((d) => d.dateISO === "2026-01-03")!;
    expect(day.timedItems.map((e) => e.item.id)).toEqual(["i-dinner"]);
    expect(day.timedItems[0].item).toMatchObject({ title: "Surprise", category: "OTHER", startTime: "19:30", surprise: SURPRISED_VIEW });
  });
});
