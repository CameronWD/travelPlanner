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
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
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

async function renderPage() {
  render(await CalendarPage({ params: Promise.resolve({ tripId: "t1" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stopFindManyMock.mockResolvedValue([]);
  itemFindManyMock.mockResolvedValue([]);
  transportFindManyMock.mockResolvedValue([]);
  accommodationFindManyMock.mockResolvedValue([]);
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

  it("with stops, the Month/Agenda switch is the header action", async () => {
    tripFindUniqueMock.mockResolvedValue({ name: "Europe", startDate: "2026-09-21", endDate: "2026-09-27" });
    stopFindManyMock.mockResolvedValue([
      {
        id: "s1", name: "Rome", country: "Italy", timezone: "Europe/Rome",
        arriveDate: "2026-09-21", departDate: "2026-09-27", sortOrder: 0,
      },
    ]);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByTestId("view-switch")).toBeInTheDocument();
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
