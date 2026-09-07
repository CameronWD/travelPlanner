import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock Next.js Link so it renders as a plain anchor in jsdom
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// AgendaView renders Timeline, which now statically imports
// UnscheduleItemButton (Task 7) — that client island pulls in the
// server-actions module and next/navigation's useRouter at import time even
// though the agenda variant never renders the button. Mock both so this
// stays a pure component test, same pattern as timeline.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/items", () => ({
  unscheduleItem: vi.fn(),
  scheduleItem: vi.fn(),
  rescheduleItem: vi.fn(),
}));

import { AgendaView } from "./agenda-view";
import type { DayPlan } from "@/lib/itinerary";

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
  it("marks today's date section with aria-current='date'", () => {
    const days = [makeDayPlan("2026-07-13"), makeDayPlan(FIXED_TODAY), makeDayPlan("2026-07-15")];
    render(<AgendaView tripId="t1" days={days} todayISO={FIXED_TODAY} />);

    // The section for today should have aria-current="date"
    const sections = document.querySelectorAll("section[aria-current='date']");
    expect(sections.length).toBe(1);
  });

  it("renders a 'Today' badge on today's entry", () => {
    const days = [makeDayPlan(FIXED_TODAY)];
    render(<AgendaView tripId="t1" days={days} todayISO={FIXED_TODAY} />);

    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("does NOT render a 'Today' badge on non-today entries", () => {
    const days = [makeDayPlan("2026-07-13"), makeDayPlan("2026-07-15")];
    render(<AgendaView tripId="t1" days={days} todayISO={FIXED_TODAY} />);

    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("highlights the day matching the given todayISO", () => {
    const twoDays = [makeDayPlan("2026-07-13"), makeDayPlan("2026-07-14")];
    render(<AgendaView tripId="t1" days={twoDays} todayISO={twoDays[1].dateISO} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});
