import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DayViewData } from "@/lib/day-view-loader";

vi.mock("@/components/trip/day/day-chrome-registry", () => ({ RegisterDayChrome: () => null }));
vi.mock("@/components/trip/day/day-plan-card", () => ({ DayPlanCard: () => null }));
vi.mock("@/components/trip/day/journal-card", () => ({ JournalCard: () => null }));
vi.mock("@/components/trip/day/day-weather", () => ({ DayWeather: () => null }));
vi.mock("@/components/day/day-add-menu", () => ({ DayAddMenu: () => null }));
vi.mock("@/components/trip/day/day-header", () => ({ DayHeader: () => null }));
vi.mock("@/components/trip/day/day-title-inline", () => ({ DayTitleInline: () => null }));
vi.mock("@/components/trip/day/tonight-card", () => ({
  TonightCard: (p: { needsBookingConfirmation?: boolean }) => <div data-testid="tonight" data-needs={String(p.needsBookingConfirmation)} />,
}));

const { DaySlot } = await import("./day-slot");

const shared = { tripId: "t1", slug: "t1", tripName: "Trip", shownDate: "2026-12-08", unreadCount: 0, recent: [], members: [] };

function day(needsConfirmationIds: string[], readFirst = false) {
  return {
    date: "2026-12-08",
    isLast: false,
    stop: { id: "s1", name: "Lisbon" },
    tonight: { id: "acc1" },
    needsConfirmationIds,
    editor: { readFirst },
    surprise: null,
    trip: { homeCurrency: "AUD", homeName: null, homeTimezone: null },
    stopOptions: [],
    hasEntries: true,
    weatherInput: null,
    journal: { open: false, slots: [] },
  } as unknown as DayViewData;
}

describe("DaySlot Tonight", () => {
  it("tells Tonight when its Accommodation needs a booking confirmation", () => {
    render(<DaySlot iso="2026-12-08" read={[day(["acc1"])]} shared={shared} chrome={null} />);
    for (const el of screen.getAllByTestId("tonight")) expect(el).toHaveAttribute("data-needs", "true");
  });

  it("does not when it is not on the list", () => {
    render(<DaySlot iso="2026-12-08" read={[day(["other"])]} shared={shared} chrome={null} />);
    for (const el of screen.getAllByTestId("tonight")) expect(el).toHaveAttribute("data-needs", "false");
  });

  it("does not while the trip is being travelled or is past (readFirst), as the old row did", () => {
    render(<DaySlot iso="2026-12-08" read={[day(["acc1"], true)]} shared={shared} chrome={null} />);
    for (const el of screen.getAllByTestId("tonight")) expect(el).toHaveAttribute("data-needs", "false");
  });
});
