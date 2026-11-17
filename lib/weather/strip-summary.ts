import type { DayWeather } from "@/lib/weather";
import type { WeatherTheme } from "@/lib/weather/theme";

const deg = (n: number) => `${Math.round(n)}°`;

export function weatherStripSummary(theme: WeatherTheme, day: DayWeather | null): string {
  if (theme.key === "too-far") return "Too far out for a forecast";
  const high = day?.highC;
  const low = day?.lowC;
  const range =
    high != null && low != null ? `${deg(high)} / ${deg(low)}` : high != null ? `High ${deg(high)}` : low != null ? `Low ${deg(low)}` : null;
  return range ? `${range} · ${theme.condition}` : theme.condition;
}
