import { Sun } from "lucide-react";
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
  const hasBothBlocks = weather !== null;

  return (
    <div>
      {/* Gradient card */}
      <div className="flex gap-3 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 p-4 text-white shadow-soft-lg">
        {/* Left block: weather (only when weather is present) */}
        {weather && (
          <div className="flex flex-1 flex-col gap-1">
            <Sun className="size-6 shrink-0" aria-hidden />
            <span className="font-display text-2xl font-bold">
              {weather.highC}° / {weather.lowC}°
            </span>
            <span className="text-xs opacity-90">
              {weather.label}
              {weather.source === "typical" && " · typical"}
            </span>
          </div>
        )}

        {/* Divider — only when both blocks present */}
        {hasBothBlocks && (
          <div className="w-px self-stretch bg-white/30" aria-hidden />
        )}

        {/* Right block: daylight */}
        <div className="flex flex-1 flex-col justify-center gap-1 text-xs font-semibold">
          {daylight.polarDay ? (
            <span>Daylight all day</span>
          ) : daylight.polarNight ? (
            <span>Polar night</span>
          ) : (
            <>
              <span>↑ {daylight.sunrise} sunrise</span>
              <span>↓ {daylight.sunset} sunset</span>
              <span className="opacity-85">
                {formatDayLength(daylight.dayLengthMin)} daylight
                {daylight.tzLabel ? ` ${daylight.tzLabel}` : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Attribution — legally required, shown when weather data is present */}
      {weather && (
        <p className="mt-1 text-[10px] text-muted-foreground">
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
    </div>
  );
}
