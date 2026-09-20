import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/weather", () => ({
  getDayWeather: vi.fn(async () => ({
    source: "forecast",
    highC: 3,
    lowC: -2,
    code: 71,
    label: "Snow",
  })),
}));

import { ShareTodayCard } from "./share-today-card";
import type { DayPlan } from "@/lib/itinerary";

const emptyDay = (dateISO: string): DayPlan =>
  ({
    dateISO,
    stop: null,
    timedItems: [],
    untimedItems: [],
    transportEntries: [],
    accommodationEntries: [],
  }) as unknown as DayPlan;

const baseProps = {
  countdown: "Day 5 of 14",
  timeZone: "Europe/Paris",
  todayISO: "2026-12-10",
  stop: { name: "Strasbourg", country: "France", lat: 48.58, lng: 7.75 },
  scope: {
    includeAccommodation: true,
    includeTransport: true,
    includeDailyPlans: true,
  },
};

describe("ShareTodayCard", () => {
  it("leads with the day number and the current stop", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText("Day 5 of 14")).toBeInTheDocument();
    expect(screen.getByText(/Strasbourg/)).toBeInTheDocument();
  });

  it("shows tonight's stay when given one", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: { name: "Hôtel Gutenberg", address: "31 Rue des Serruriers" },
      }),
    );
    expect(screen.getByText(/Tonight/)).toBeInTheDocument();
    expect(screen.getByText(/Hôtel Gutenberg/)).toBeInTheDocument();
  });

  it("says nothing planned when daily plans are in scope but the day is empty", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText(/nothing planned today/i)).toBeInTheDocument();
  });

  it("omits the plan section entirely when daily plans are out of scope", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        scope: { ...baseProps.scope, includeDailyPlans: false },
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.queryByText(/nothing planned today/i)).toBeNull();
  });

  it("renders the weather label from the forecast", async () => {
    render(
      await ShareTodayCard({
        ...baseProps,
        day: emptyDay("2026-12-10"),
        stay: null,
      }),
    );
    expect(screen.getByText(/Snow/)).toBeInTheDocument();
  });
});
