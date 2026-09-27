import { WeatherCard } from "@/components/weather/WeatherCard";
import { getDayWeatherView } from "@/lib/day-view-loader";

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
}: {
  input: { lat: number; lng: number; timezone: string };
  dateISO: string;
  today: string;
  placeName: string;
  size: "regular" | "compact";
}) {
  const v = await getDayWeatherView({ ...input, dateISO, today, placeName });
  if (!v) return null;
  return (
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
}
