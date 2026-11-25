import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  it("collapsed: a one-line strip that opens the full card on tap", async () => {
    viewMock.mockResolvedValue({ theme: { key: "rain", condition: "Rain" }, day: { highC: 15, lowC: 9 }, daylight: {}, nowLocal: null, forecastOpensOn: null, dateLabel: "Sat 12 Dec", placeName: "Strasbourg" });
    render((await DayWeather({ input, dateISO: "2026-12-12", today: "2026-12-12", placeName: "Strasbourg", size: "compact", collapsed: true }))!);
    const strip = screen.getByRole("button", { name: "15° / 9° · Rain" });
    expect(strip).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Weather" })).toBeNull();
    await userEvent.click(strip);
    expect(strip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Weather" })).toBeInTheDocument();
  });
  it("a no-forecast view still renders a card in the day's place", async () => {
    viewMock.mockResolvedValue({ theme: { key: "no-forecast", condition: "No forecast right now" }, day: null, daylight: {}, nowLocal: null, forecastOpensOn: null, dateLabel: "Sat 12 Dec", placeName: "Strasbourg" });
    const el = await DayWeather({ input, dateISO: "2026-12-12", today: "2026-12-01", placeName: "Strasbourg", size: "regular" });
    expect(el).not.toBeNull();
    render(el);
    expect(screen.getByRole("region", { name: "Weather" })).toBeInTheDocument();
  });
});
