import type { DayWeather } from "@/lib/weather";
import type { WeatherTheme } from "@/lib/weather/theme";

const deg = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}°`);

export function weatherStripSummary(theme: WeatherTheme, day: DayWeather | null): string {
  if (theme.key === "too-far") return "Too far out for a forecast";
  return `${deg(day?.highC)} / ${deg(day?.lowC)} · ${theme.condition}`;
}
