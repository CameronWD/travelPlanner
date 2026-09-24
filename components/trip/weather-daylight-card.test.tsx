import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherDaylightCard } from "./weather-daylight-card";

const baseDaylight = {
  sunrise: "05:30",
  sunset: "20:10",
  dayLengthMin: 880,
  polarDay: false,
  polarNight: false,
  tzLabel: "BST",
};

const forecastWeather = {
  source: "forecast" as const,
  highC: 21,
  lowC: 12,
  code: 0,
  label: "Clear",
};

describe("WeatherDaylightCard", () => {
  it("renders forecast temps, label, sunrise and sunset with timezone label", () => {
    render(
      <WeatherDaylightCard weather={forecastWeather} daylight={baseDaylight} />,
    );
    expect(screen.getByText(/21/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/Clear/)).toBeInTheDocument();
    expect(screen.getByText(/05:30/)).toBeInTheDocument();
    expect(screen.getByText(/20:10/)).toBeInTheDocument();
    expect(screen.getByText(/BST/)).toBeInTheDocument();
  });

  it('shows a "typical" qualifier when source is typical', () => {
    const typicalWeather = { ...forecastWeather, source: "typical" as const };
    render(
      <WeatherDaylightCard weather={typicalWeather} daylight={baseDaylight} />,
    );
    expect(screen.getByText(/typical/i)).toBeInTheDocument();
  });

  it("still renders the daylight section when weather is null", () => {
    render(<WeatherDaylightCard weather={null} daylight={baseDaylight} />);
    expect(screen.getByText(/05:30/)).toBeInTheDocument();
    expect(screen.getByText(/20:10/)).toBeInTheDocument();
  });

  it('shows "Daylight all day" for polarDay', () => {
    const polarDaylight = {
      sunrise: null,
      sunset: null,
      dayLengthMin: 1440,
      polarDay: true,
      polarNight: false,
      tzLabel: null,
    };
    render(<WeatherDaylightCard weather={null} daylight={polarDaylight} />);
    expect(screen.getByText(/Daylight all day/i)).toBeInTheDocument();
  });

  it('shows "Polar night" for polarNight', () => {
    const polarNightDaylight = {
      sunrise: null,
      sunset: null,
      dayLengthMin: 0,
      polarDay: false,
      polarNight: true,
      tzLabel: null,
    };
    render(<WeatherDaylightCard weather={null} daylight={polarNightDaylight} />);
    expect(screen.getByText(/Polar night/i)).toBeInTheDocument();
  });

  it("renders without tzLabel when tzLabel is null", () => {
    const noTzDaylight = { ...baseDaylight, tzLabel: null };
    render(<WeatherDaylightCard weather={null} daylight={noTzDaylight} />);
    expect(screen.getByText(/05:30/)).toBeInTheDocument();
  });

  it("renders the weather as a Playground Card: island-scoped, ink border, hard shadow, solid hue fill", () => {
    const { container } = render(
      <WeatherDaylightCard weather={forecastWeather} daylight={baseDaylight} />,
    );
    const card = container.querySelector(".bg-hue-sky");
    expect(card).toBeTruthy();
    expect(card?.className).toMatch(/island/);
    // Card's own base classes — the 2px ink border and hard offset shadow
    // are the Playground signature (see components/ui/card.tsx).
    expect(card?.className).toMatch(/border-2/);
    expect(card?.className).toMatch(/border-border/);
    expect(card?.className).toMatch(/shadow-hard-4/);
    expect(card?.className).toMatch(/text-card-foreground/);
    // Not the pre-Playground look: no gradient, no raw white text, no
    // legacy soft-shadow name. background-image is also structurally
    // unmeasurable by the contrast audit script (see
    // scripts/contrast-audit.ts) — a solid fill is a real, checked ratio
    // on every run instead of a one-time eyeball.
    expect(card?.className).not.toMatch(/bg-gradient-to-br/);
    expect(card?.className).not.toMatch(/text-white/);
    expect(card?.className).not.toMatch(/shadow-soft-lg/);
  });

  it("compact variant does not stretch its blocks", () => {
    const { container } = render(
      <WeatherDaylightCard
        compact
        weather={forecastWeather}
        daylight={baseDaylight}
      />,
    );
    const card = container.querySelector(".bg-hue-sky");
    expect(card?.className).not.toMatch(/flex-1/);
    expect(container.innerHTML).not.toContain("flex-1");
  });

  it("non-compact variant stretches its blocks (control for the compact guard above)", () => {
    const { container } = render(
      <WeatherDaylightCard weather={forecastWeather} daylight={baseDaylight} />,
    );
    expect(container.innerHTML).toContain("flex-1");
  });
});
