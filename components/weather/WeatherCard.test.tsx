import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WeatherCard } from "@/components/weather/WeatherCard";
import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";
import { getWeatherTheme } from "@/lib/weather/theme";
import type { DayWeather } from "@/lib/weather";

function wx(over: Partial<DayWeather> = {}): DayWeather {
  return { source: "forecast", highC: 9, lowC: 5, code: 3, label: "Overcast", precipProbMax: null, gustsKph: null, uvMax: null, snowfallCm: null, current: null, fetchedAt: 0, stale: false, ...over };
}
const daylight = { sunrise: "08:12", sunset: "16:33", dayLengthMin: 501, polarDay: false, polarNight: false };
const base = { daysOut: 3, isToday: false, monthShort: "Dec", now: () => 2 * 3600 * 1000 };
function card(day: DayWeather | null, size: "regular" | "compact" = "regular", extra: Partial<Parameters<typeof WeatherCard>[0]> = {}, themeIn: Partial<typeof base> = {}) {
  const theme = getWeatherTheme({ ...base, ...themeIn, day })!;
  return render(<WeatherCard size={size} dateLabel="Sat 12 Dec" placeName="Strasbourg" theme={theme} day={day} daylight={daylight} {...extra} />);
}
const article = () => screen.getByRole("region", { name: "Weather" });

describe("WeatherCard — every theme at both sizes (WEATHER_CARD §7, behaviour not snapshots)", () => {
  const themes: Array<[string, DayWeather, string, string]> = [
    ["sunny", wx({ code: 0 }), "bg-wx-sunny", "Sunny"],
    ["partly", wx({ code: 2 }), "bg-wx-partly", "Partly cloudy"],
    ["overcast", wx({ code: 3 }), "bg-wx-overcast", "Overcast"],
    ["fog", wx({ code: 45 }), "bg-wx-fog", "Fog"],
    ["rain", wx({ code: 80, precipProbMax: 70 }), "bg-wx-rain", "Showers"],
    ["snow", wx({ code: 71, snowfallCm: 2 }), "bg-wx-snow", "Light snow"],
    ["storm", wx({ code: 95, precipProbMax: 60 }), "bg-wx-storm", "Storms"],
    ["wind", wx({ code: 1, gustsKph: 55 }), "bg-wx-wind", "Windy"],
    ["heat", wx({ code: 0, highC: 36 }), "bg-wx-heat", "Scorcher"],
  ];
  for (const size of ["regular", "compact"] as const) {
    it.each(themes)(`${size}: %s → fill, scene, condition`, (key, day, fill, condition) => {
      card(day, size);
      const el = article();
      expect(el.className.split(/\s+/)).toContain(fill);
      expect(el.querySelector(`[data-scene="${key}"]`)).toBeTruthy();
      expect(screen.getByText(condition)).toBeInTheDocument();
      expect(el.className).toContain(size === "regular" ? "h-[236px]" : "h-[140px]");
      if (size === "compact") expect(screen.queryByText(/SAT 12 DEC/i)).toBeNull();
      else expect(screen.getByText("Sat 12 Dec · Strasbourg")).toBeInTheDocument();
    });
  }
  it("night: ink fill, paper text, coral shadow, moon scene, '−2° now', now tick", () => {
    card(wx({ code: 0, current: { tempC: -2, isDay: false } }), "regular", { nowLocal: "21:00" }, { isToday: true });
    const el = article();
    expect(el.className).toContain("bg-wx-night");
    expect(el.className).toContain("text-primary-foreground");
    expect(el.className).toContain("shadow-[5px_5px_0_var(--color-coral)]");
    expect(el.querySelector('[data-scene="night"]')).toBeTruthy();
    expect(screen.getByText("-2°")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
    expect(el.querySelector("[data-now-tick]")).toBeTruthy();
  });
  it("shows exactly one chip, or none", () => {
    card(wx({ code: 80, precipProbMax: 70 }));
    expect(screen.getAllByTestId("wx-chip")).toHaveLength(1);
    expect(screen.getByTestId("wx-chip")).toHaveTextContent("Rain 70%");
    cleanup();
    card(wx({ code: 0, uvMax: 3 }));
    expect(screen.queryAllByTestId("wx-chip").filter((c) => c.textContent === "")).toHaveLength(0);
  });
  it("offline: keeps the fill, drops the scene, ink chip top right", () => {
    card(wx({ code: 3, stale: true }));
    const el = article();
    expect(el.className).toContain("bg-wx-overcast");
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByTestId("wx-offline")).toHaveTextContent("Offline · updated 2h ago");
  });
  it("too far out: dashed paper card, no shadow, 'Too far out' copy with the date, daylight chip", () => {
    card(null, "regular", { forecastOpensOn: "Fri 18 Dec" }, { daysOut: 40 });
    const el = article();
    expect(el.className).toContain("border-dashed");
    expect(el.className).not.toMatch(/shadow-hard/);
    expect(el.querySelector("[data-scene]")).toBeNull();
    expect(screen.getByText(/Too far out for a forecast\. We'll switch to the real one on Fri 18 Dec, 15 days before\./)).toBeInTheDocument();
    expect(screen.getByText("↑ 08:12 · 16:33 ↓")).toBeInTheDocument();
  });
  it("high/low read as one accessible phrase", () => {
    card(wx({ code: 3 }));
    expect(screen.getByText("9°")).toBeInTheDocument();
    expect(screen.getByText("/ 5°")).toBeInTheDocument();
    expect(screen.getByText("High 9 degrees, low 5 degrees")).toHaveClass("sr-only");
  });
  it("skeleton has the same sizes and the pulse", () => {
    const { container } = render(<WeatherCardSkeleton size="regular" />);
    expect(container.firstElementChild!.className).toContain("h-[236px]");
    expect(container.querySelector(".tp-pulse")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading weather" })).toBeInTheDocument();
  });
});
