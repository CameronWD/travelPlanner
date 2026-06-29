import type { DayWeather } from "@/lib/weather";
import type { DaylightResult } from "@/lib/daylight";

interface Props {
  weather: DayWeather | null;
  daylight: DaylightResult;
}

function formatDayLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function WeatherDaylightCard({ weather, daylight }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-col gap-3">
      {/* Weather section */}
      {weather && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {weather.highC}° / {weather.lowC}°C
          </span>
          <span className="text-sm text-muted-foreground">{weather.label}</span>
          {weather.source === "typical" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              typical
            </span>
          )}
        </div>
      )}

      {/* Daylight section */}
      <div className="text-sm text-muted-foreground">
        {daylight.polarDay ? (
          <span>Daylight all day</span>
        ) : daylight.polarNight ? (
          <span>Polar night</span>
        ) : (
          <span>
            ☀ {daylight.sunriseUTC} – {daylight.sunsetUTC} ·{" "}
            {formatDayLength(daylight.dayLengthMin)} of light
          </span>
        )}
      </div>
    </div>
  );
}
