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
});
