import { Sun } from "lucide-react";
import type { DayWeather } from "@/lib/weather";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

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
  /** Intrinsic width, tighter type scale — for placing beside the day header instead of full-width. */
  compact?: boolean;
}

function formatDayLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function WeatherDaylightCard({ weather, daylight, compact = false }: Props) {
  const hasBothBlocks = weather !== null;

  return (
    <div className={compact ? "w-fit" : undefined}>
      {/* Full Playground restyle, not just a contrast patch — this was the
          last surface in the app still wearing the pre-reskin look (Phase
          2's colour sweep grepped bg|text|border|fill|stroke, never
          from|via|to, so this card's gradient stops slipped the migration
          entirely). Four changes, each closing one specific gap:

          1. `bg-hue-sky` (solid), not `from-sky-500 to-teal-500` (gradient).
             `--hue-sky` is weather's *identity* colour (a category, same as
             a chapter colour), not app *state* — it does not belong on
             `bg-teal`, which shares its exact HSL values with `--success`
             in globals.css and would read as a status colour here. It's
             also solid rather than a gradient because a `background-image`
             is structurally unmeasurable by the contrast audit script
             (scripts/contrast-audit.ts's effectiveBackground() stops dead
             at any background-image, on purpose — see its docblock): no
             choice of "safe" stops makes a gradient provably pass, only a
             plausible one, and a solid fill is the only shape that turns
             this into a real, checked ratio on every run instead of a
             one-time eyeball.
          2. `<Card>` (border-2 border-border + shadow-hard-4), not a bare
             div — the 2px ink border and hard offset shadow are the
             system's signature (see StatCard, and "Tonight's stay" on the
             trip home right rail); this card had neither.
          3. `island` re-scopes --foreground/--muted-foreground/--border to
             the on-accent ink pair (globals.css) so text on the fill stays
             >= 4.5:1 in both themes — the same mechanism Card's
             tone="coral|sun|teal|lilac" already uses for text on an accent
             fill (`text-white` is not a Playground token at all).
          4. `shadow-hard-4`, not `shadow-soft-lg` — same underlying value
             (globals.css maps shadow-soft-lg to --shadow-4 for legacy call
             sites), but shadow-hard-* is the current, canonical name. */}
      <Card
        radius="2xl"
        shadow={4}
        className={cn("island flex gap-3 bg-hue-sky p-4", compact && "p-3 text-sm")}
      >
        {/* Left block: weather (only when weather is present) */}
        {weather && (
          <div className={cn("flex flex-col gap-1", compact ? undefined : "flex-1")}>
            <Sun className="size-6 shrink-0" aria-hidden />
            <span className="font-display text-2xl font-bold">
              {weather.highC}° / {weather.lowC}°
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {weather.label}
              {weather.source === "typical" && " · typical"}
            </span>
          </div>
        )}

        {/* Divider — only when both blocks present */}
        {hasBothBlocks && (
          <div className="w-px self-stretch bg-foreground/25" aria-hidden />
        )}

        {/* Right block: daylight */}
        <div
          className={cn(
            "flex flex-col justify-center gap-1 text-xs font-semibold",
            compact ? undefined : "flex-1",
          )}
        >
          {daylight.polarDay ? (
            <span>Daylight all day</span>
          ) : daylight.polarNight ? (
            <span>Polar night</span>
          ) : (
            <>
              <span>↑ {daylight.sunrise} sunrise</span>
              <span>↓ {daylight.sunset} sunset</span>
              <span className="font-medium text-muted-foreground">
                {formatDayLength(daylight.dayLengthMin)} daylight
                {daylight.tzLabel ? ` ${daylight.tzLabel}` : ""}
              </span>
            </>
          )}
        </div>
      </Card>

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
