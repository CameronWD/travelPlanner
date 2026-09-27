import { cn } from "@/lib/cn";

export interface DaylightView { sunrise: string | null; sunset: string | null; dayLengthMin: number; polarDay: boolean; polarNight: boolean }

const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export function formatDayLength(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** left = sunrise/24h, width = (sunset − sunrise)/24h (WEATHER_CARD §4). */
export function daylightGeometry(d: DaylightView): { leftPct: number; widthPct: number } {
  if (d.polarDay) return { leftPct: 0, widthPct: 100 };
  if (d.polarNight || !d.sunrise || !d.sunset) return { leftPct: 0, widthPct: 0 };
  const rise = toMin(d.sunrise);
  return { leftPct: (rise / 1440) * 100, widthPct: (d.dayLengthMin / 1440) * 100 };
}

export function daylightLabel(d: DaylightView): string {
  if (d.polarDay) return "Daylight all day";
  if (d.polarNight || !d.sunrise || !d.sunset) return "Polar night";
  const h = Math.floor(d.dayLengthMin / 60);
  const m = d.dayLengthMin % 60;
  return `Daylight ${d.sunrise} to ${d.sunset}, ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
}

export function DaylightBar({ daylight, size, segmentClass, trackClass, nowPct = null }: {
  daylight: DaylightView; size: "regular" | "compact"; segmentClass: string; trackClass: string; nowPct?: number | null;
}) {
  const g = daylightGeometry(daylight);
  const compact = size === "compact";
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={daylightLabel(daylight)}
        className={cn("relative w-full overflow-hidden rounded-full border-2 border-current", compact ? "h-2.5" : "h-3", trackClass)}
      >
        {g.widthPct > 0 ? (
          <span
            data-daylight-segment
            className={cn("absolute inset-y-0 border-x-2 border-current", segmentClass)}
            style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}
          />
        ) : null}
        {nowPct != null ? <span data-now-tick className="absolute inset-y-0 w-1 bg-coral" style={{ left: `${nowPct}%` }} /> : null}
      </div>
      <div className={cn("flex items-baseline justify-between font-bold", compact ? "text-[11px]" : "text-xs")}>
        <span>{daylight.sunrise ? `↑ ${daylight.sunrise}` : ""}</span>
        <span>{compact ? formatDayLength(daylight.dayLengthMin) : `${formatDayLength(daylight.dayLengthMin)} daylight`}</span>
        <span>{daylight.sunset ? `${daylight.sunset} ↓` : ""}</span>
      </div>
    </div>
  );
}
