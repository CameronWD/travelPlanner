import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));
vi.mock("@/lib/day-view-loader", () => ({ getDayWeatherView: viewMock }));
vi.mock("@/components/weather/WeatherCard", () => ({
  WeatherCard: (p: { size: string; dateLabel: string; placeName: string }) => <section aria-label="Weather" data-size={p.size}>{`${p.placeName} ${p.dateLabel}`}</section>,
}));

import { DayWeather } from "@/components/trip/day/day-weather";

const input = { lat: 48.58, lng: 7.75, timezone: "Europe/Paris" };

describe("DayWeather", () => {
  it("loads the Stop's weather view and renders the card at the given size", async () => {
    viewMock.mockResolvedValue({ theme: { key: "sunny" }, day: null, daylight: {}, nowLocal: null, forecastOpensOn: null, dateLabel: "Sat 12 Dec", placeName: "Strasbourg" });
    render((await DayWeather({ input, dateISO: "2026-12-12", today: "2026-12-01", placeName: "Strasbourg", size: "compact" }))!);
    expect(viewMock).toHaveBeenCalledWith({ ...input, dateISO: "2026-12-12", today: "2026-12-01", placeName: "Strasbourg" });
    expect(screen.getByRole("region", { name: "Weather" })).toHaveAttribute("data-size", "compact");
    expect(screen.getByText("Strasbourg Sat 12 Dec")).toBeInTheDocument();
  });
  it("renders nothing when the loader has no reading", async () => {
    viewMock.mockResolvedValue(null);
    expect(await DayWeather({ input, dateISO: "2026-12-12", today: "2026-12-01", placeName: "Strasbourg", size: "regular" })).toBeNull();
  });
});
