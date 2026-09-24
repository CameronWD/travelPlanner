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

describe("AgendaView — kit day cards (Task 12b)", () => {
  function withItem(dateISO: string): DayPlan {
    return {
      ...makeDayPlan(dateISO),
      timedItems: [
        {
          kind: "item",
          item: { id: "i1", title: "Louvre", category: "SIGHTSEEING", date: dateISO, startTime: "09:00", endTime: null, stopId: "s1" },
        },
      ],
    } as DayPlan;
  }

  it("each day is a kit Card (2px outline + hard shadow), not a divided list", () => {
    const { container } = render(<AgendaView tripId="t1" days={[makeDayPlan("2026-07-13"), makeDayPlan("2026-07-15")]} todayISO={FIXED_TODAY} />);
    const sections = container.querySelectorAll("section");
    expect(sections).toHaveLength(2);
    for (const s of Array.from(sections)) {
      expect(s.className).toMatch(/\bborder-2\b/);
      expect(s.className).toMatch(/\bshadow-hard-\d\b/);
    }
    expect(container.innerHTML).not.toMatch(/divide-y|bg-primary\/5/);
  });

  it("the day heading links to the Day page and is named with the date", () => {
    render(<AgendaView tripId="t1" days={[makeDayPlan("2026-07-13")]} todayISO={FIXED_TODAY} />);
    const link = screen.getByRole("link", { name: /Mon 13 Jul 2026/ });
    expect(link).toHaveAttribute("href", "/trips/t1/day/2026-07-13");
    expect(screen.getByRole("heading", { name: /Mon 13 Jul 2026/ })).toBeInTheDocument();
  });

  it("today's card is lifted and carries the Today sticker", () => {
    const { container } = render(<AgendaView tripId="t1" days={[makeDayPlan(FIXED_TODAY)]} todayISO={FIXED_TODAY} />);
    const today = container.querySelector("section[aria-current='date']")!;
    expect(today.className).toMatch(/\bshadow-hard-3\b/);
    expect(screen.getByText("Today").className).toMatch(/\bborder-2\b/);
  });

  it("a travel day carries the Travel day chip as a sticker", () => {
    const day = {
      ...makeDayPlan("2026-07-13"),
      transportEntries: [
        {
          kind: "transport-departure",
          transport: { id: "t1", mode: "TRAIN", fromStopId: null, toStopId: null, depPlace: "Paris", arrPlace: "Lyon", depAt: null, arrAt: null, reference: null, notes: null },
          depTimeLabel: "08:00",
          arrTimeLabel: null,
          arrivesSameDay: true,
          arrivalDateISO: null,
        },
      ],
    } as unknown as DayPlan;
    render(<AgendaView tripId="t1" days={[day]} todayISO={FIXED_TODAY} />);
    expect(screen.getByText("Travel day")).toBeInTheDocument();
  });

  it("a day's plan uses the kit Days rows (as on the Day page)", () => {
    const { container } = render(<AgendaView tripId="t1" days={[withItem("2026-07-13")]} todayISO={FIXED_TODAY} />);
    expect(container.querySelectorAll("[data-timeline-row]").length).toBe(1);
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    // Read-only overview: no Unschedule control here.
    expect(screen.queryByRole("button", { name: /unschedule/i })).not.toBeInTheDocument();
  });

  it("an empty day keeps a quiet one-liner", () => {
    render(<AgendaView tripId="t1" days={[makeDayPlan("2026-07-13")]} todayISO={FIXED_TODAY} />);
    expect(screen.getByText("Nothing planned.")).toBeInTheDocument();
  });
});
