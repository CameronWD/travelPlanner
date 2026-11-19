import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DayWeather } from "@/lib/weather";
import { themeFill, type WeatherTheme } from "@/lib/weather/theme";
import { Scene } from "@/components/weather/scenes";
import { DaylightArc } from "@/components/weather/daylight-arc";
import type { DaylightView } from "@/lib/daylight";

export interface WeatherCardProps {
  size: "regular" | "compact";
  dateLabel: string;
  placeName: string;
  theme: WeatherTheme;
  day: DayWeather | null;
  daylight: DaylightView;
  nowLocal?: string | null;
  forecastOpensOn?: string | null;
  className?: string;
}

const deg = (n: number | null) => (n == null ? "—" : `${Math.round(n)}°`);

function Chip({ children, ink = false, testId = "wx-chip", className }: { children: ReactNode; ink?: boolean; testId?: string; className?: string }) {
  return (
    <span data-testid={testId} className={cn("inline-flex items-center whitespace-nowrap rounded-full border-2 border-border px-2 py-0.5 text-[11px] font-bold", ink ? "bg-primary text-primary-foreground" : "bg-card text-foreground", className)}>
      {children}
    </span>
  );
}

/**
 * The Weather card (WEATHER_CARD.md): one fixed layout; the theme sets the
 * fill and the scene. Server Component. Text on every fill is ink via the
 * island utility; the night card is ink with paper text.
 */
export function WeatherCard({ size, dateLabel, placeName, theme, day, daylight, nowLocal, forecastOpensOn, className }: WeatherCardProps) {
  const compact = size === "compact";
  const night = theme.key === "night";
  const tooFar = theme.key === "too-far";
  const box = cn(
    "relative flex w-full flex-col overflow-hidden border-2",
    compact ? "h-[140px] rounded-[20px] p-[14px_16px]" : "h-[236px] rounded-3xl p-[20px_22px]",
    tooFar
      ? "border-dashed border-border bg-background text-foreground"
      : cn(themeFill(theme.key), night ? "border-border text-wx-night-text shadow-[5px_5px_0_var(--color-coral)]" : cn("island border-border", compact ? "shadow-hard-2" : "shadow-hard-3")),
    className,
  );
  const eyebrow = !compact ? (
    <p className={cn("truncate text-[11px] font-extrabold uppercase tracking-[0.08em]", tooFar && "text-muted-foreground")}>{dateLabel} · {placeName}</p>
  ) : null;

  if (tooFar) {
    return (
      <section aria-label="Weather" className={box}>
        <h2 className="sr-only">Weather</h2>
        {eyebrow}
        <p className={cn("font-display font-extrabold tracking-[-0.03em]", compact ? "mt-1 text-[26px]" : "mt-2 text-[40px]", "leading-none")}>Too far out</p>
        <p className={cn("mt-2 font-semibold text-muted-foreground", compact ? "text-[12px]" : "text-sm")}>
          Too far out for a forecast.{forecastOpensOn ? ` The real forecast starts on ${forecastOpensOn}, 15 days before.` : ""}
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          {daylight.sunrise && daylight.sunset ? <Chip>{`↑ ${daylight.sunrise} · ${daylight.sunset} ↓`}</Chip> : null}
        </div>
      </section>
    );
  }

  const high = night && day?.current ? day.current.tempC : day?.highC ?? null;
  return (
    <section aria-label="Weather" className={box}>
      <h2 className="sr-only">Weather</h2>
      {theme.scene ? <Scene scene={theme.scene} isDay={day?.current?.isDay ?? true} gustsKph={day?.gustsKph ?? null} size={size} /> : null}
      {theme.offline ? <Chip ink testId="wx-offline" className="absolute right-3 top-3">{theme.offline}</Chip> : null}

      <div className="relative flex flex-col">
        {eyebrow}
        <p className={cn("flex items-baseline gap-2 whitespace-nowrap font-display font-extrabold tracking-[-0.04em]", compact ? "mt-1 text-[44px] leading-[.9]" : "mt-2 text-[60px] leading-[.9]")}>
          <span className="sr-only">{night && day?.current ? `${Math.round(day.current.tempC)} degrees now` : `High ${day?.highC == null ? "unknown" : Math.round(day.highC)} degrees, low ${day?.lowC == null ? "unknown" : Math.round(day.lowC)} degrees`}</span>
          <span aria-hidden="true">{deg(high)}</span>
          <span aria-hidden="true" className={cn("font-display font-extrabold tracking-[-0.02em]", compact ? "text-[20px]" : "text-[26px]")}>{night ? "now" : `/ ${deg(day?.lowC ?? null)}`}</span>
        </p>
        <p className={cn("mt-1 flex min-w-0 items-center gap-2", compact ? "text-[17px]" : "text-[20px]")}>
          <span className="min-w-0 truncate font-display font-extrabold tracking-[-0.02em]">{theme.condition}</span>
          {theme.chip ? <Chip className={cn("shrink-0", compact && "text-[10px]")}>{theme.chip}</Chip> : null}
        </p>
      </div>

      <div className="relative mt-auto">
        <DaylightArc {...daylight} now={nowLocal} size={size} />
      </div>
    </section>
  );
}
