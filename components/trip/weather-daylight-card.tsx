import type { DayWeather } from "@/lib/weather";

interface DaylightProps {
  /** Local sunrise time as "HH:MM" in the stop's timezone, or null on polar day/night. */
  sunrise: string | null;
  /** Local sunset time as "HH:MM" in the stop's timezone, or null on polar day/night. */
  sunset: string | null;
  /** Day length in minutes (0 on polar night, 1440 on polar day). */
  dayLengthMin: number;
  /** True when the sun never sets (midnight sun). */
  polarDay: boolean;
  /** True when the sun never rises. */
  polarNight: boolean;
  /** Short timezone label for display, e.g. "AEST" or "BST". */
  tzLabel: string | null;
}

interface Props {
  weather: DayWeather | null;
  daylight: DaylightProps;
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

      {/* Attribution — shown only when weather data is present */}
      {weather && (
        <p className="text-xs text-muted-foreground">
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Weather by Open-Meteo
          </a>
        </p>
      )}

      {/* Daylight section */}
      <div className="text-sm text-muted-foreground">
        {daylight.polarDay ? (
          <span>Daylight all day</span>
        ) : daylight.polarNight ? (
          <span>Polar night</span>
        ) : (
          <span>
            ☀ {daylight.sunrise} – {daylight.sunset}
            {daylight.tzLabel ? ` ${daylight.tzLabel}` : ""} ·{" "}
            {formatDayLength(daylight.dayLengthMin)} of light
          </span>
        )}
      </div>
    </div>
  );
}
