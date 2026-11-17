import { WeatherCard } from "@/components/weather/WeatherCard";
import { getDayWeatherView } from "@/lib/day-view-loader";
import { WeatherStrip } from "@/components/weather/weather-strip";
import { weatherStripSummary } from "@/lib/weather/strip-summary";

/**
 * The Day view's weather island (DAY_VIEW §4): an async Server Component the
 * page awaits inside its own <Suspense fallback={<WeatherCardSkeleton/>}>, so
 * the day's plan never waits on Open-Meteo. Renders nothing when the loader
 * has no reading (error and no cache).
 */
export async function DayWeather({
  input,
  dateISO,
  today,
  placeName,
  size,
  collapsed = false,
}: {
  input: { lat: number; lng: number; timezone: string };
  dateISO: string;
  today: string;
  placeName: string;
  size: "regular" | "compact";
  collapsed?: boolean;
}) {
  const v = await getDayWeatherView({ ...input, dateISO, today, placeName });
  if (!v) return null;
  const card = (
    <WeatherCard
      size={size}
      dateLabel={v.dateLabel}
      placeName={v.placeName}
      theme={v.theme}
      day={v.day}
      daylight={v.daylight}
      nowLocal={v.nowLocal}
      forecastOpensOn={v.forecastOpensOn}
    />
  );
  return collapsed ? <WeatherStrip summary={weatherStripSummary(v.theme, v.day)}>{card}</WeatherStrip> : card;
}
