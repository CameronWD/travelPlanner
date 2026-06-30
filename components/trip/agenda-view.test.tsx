import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock todayISO so we can control "today" in tests
vi.mock("@/lib/dates", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/dates")>();
  return { ...mod, todayISO: vi.fn(() => "2026-07-14") };
});

// Mock Next.js Link so it renders as a plain anchor in jsdom
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AgendaView } from "./agenda-view";
import type { DayPlan } from "@/lib/itinerary";
import { todayISO } from "@/lib/dates";

const FIXED_TODAY = "2026-07-14";

function makeDayPlan(dateISO: string): DayPlan {
  return {
    dateISO,
    stop: {
      id: "s1",
      name: "Paris",
      country: "France",
      timezone: "Europe/Paris",
      arriveDate: dateISO,
      departDate: dateISO,
      sortOrder: 0,
    },
    timedItems: [],
    untimedItems: [],
    transportEntries: [],
    accommodationEntries: [],
  };
}

describe("AgendaView — today marker", () => {
  beforeEach(() => {
    vi.mocked(todayISO).mockReturnValue(FIXED_TODAY);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks today's date section with aria-current='date'", () => {
    const days = [makeDayPlan("2026-07-13"), makeDayPlan(FIXED_TODAY), makeDayPlan("2026-07-15")];
    render(<AgendaView tripId="t1" days={days} />);

    // The section for today should have aria-current="date"
    const sections = document.querySelectorAll("section[aria-current='date']");
    expect(sections.length).toBe(1);
  });

  it("renders a 'Today' badge on today's entry", () => {
    const days = [makeDayPlan(FIXED_TODAY)];
    render(<AgendaView tripId="t1" days={days} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("does NOT render a 'Today' badge on non-today entries", () => {
    const days = [makeDayPlan("2026-07-13"), makeDayPlan("2026-07-15")];
    render(<AgendaView tripId="t1" days={days} />);

    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });
});
