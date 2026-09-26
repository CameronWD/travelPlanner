import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// calendar/page.tsx is an async server component with DB calls; invoke it
// with mocked db per-model methods (same pattern as day/[date]/page.test.tsx)
// and pin the two empty branches (Task 12b: kit empty treatment).

const { tripFindUniqueMock, stopFindManyMock, itemFindManyMock, transportFindManyMock, accommodationFindManyMock } =
  vi.hoisted(() => ({
    tripFindUniqueMock: vi.fn(),
    stopFindManyMock: vi.fn(),
    itemFindManyMock: vi.fn(),
    transportFindManyMock: vi.fn(),
    accommodationFindManyMock: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    trip: { findUnique: tripFindUniqueMock },
    stop: { findMany: stopFindManyMock },
    item: { findMany: itemFindManyMock },
    transport: { findMany: transportFindManyMock },
    accommodation: { findMany: accommodationFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/components/trip/calendar-views", () => ({ CalendarViews: () => <div data-testid="calendar-views" /> }));

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

describe("CalendarPage — empty states (kit states.jsx `Days`)", () => {
  it("a date-less trip renders the kit 'No dates yet' empty state with a Plan action", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: null, endDate: null });
    await renderPage();
    expect(screen.getByRole("heading", { name: "No dates yet" })).toBeInTheDocument();
    // Kit copy (states.jsx Days).
    expect(screen.getByText("Pick when you leave and we’ll lay your stops across the calendar.")).toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Go to Plan" });
    expect(action).toHaveAttribute("href", "/trips/t1/plan");
    // Kit Button, not the pre-reskin hand-rolled link.
    expect(action.className).toMatch(/\bborder-2\b/);
    expect(action.className).not.toMatch(/rounded-lg bg-primary/);
    expect(screen.queryByTestId("calendar-views")).not.toBeInTheDocument();
  });

  it("a dated trip with no dated stops renders the 'No Stops yet' empty state", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-09-21", endDate: "2026-09-27" });
    await renderPage();
    expect(screen.getByRole("heading", { name: "No Stops yet" })).toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Go to Plan" });
    expect(action.className).toMatch(/\bborder-2\b/);
    expect(screen.queryByTestId("calendar-views")).not.toBeInTheDocument();
  });
});
