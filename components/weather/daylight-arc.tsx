import { cn } from "@/lib/cn";
import type { DaylightView } from "@/lib/daylight";
import { clockTime, sunArcPosition } from "@/lib/weather/scene-math";

export function formatDayLength(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function daylightLabel(d: DaylightView): string {
  if (d.polarDay) return "Daylight all day";
  if (d.polarNight || !d.sunrise || !d.sunset) return "Polar night";
  const h = Math.floor(d.dayLengthMin / 60);
  const m = d.dayLengthMin % 60;
  return `Daylight ${d.sunrise} to ${d.sunset}, ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
}

// The sun's path is the quadratic curve M0,10 Q50,-10 100,10: x runs linearly
// with t and the height is 10·(1−2t)², so the marker can sit on it in CSS
// while the SVG stretches to any card width.
const ARC = "M0 10 Q50 -10 100 10";
const travelled = (t: number) => `M0 10 Q${50 * t} ${10 - 20 * t} ${100 * t} ${10 * (1 - 2 * t) ** 2}`;

export function DaylightArc({ now, size, ...daylight }: DaylightView & { now?: string | null; size: "regular" | "compact" }) {
  const { sunrise, sunset, dayLengthMin, polarDay, polarNight } = daylight;
  const compact = size === "compact";
  const risesAndSets = !polarDay && !polarNight && sunrise != null && sunset != null;
  const t = risesAndSets && now ? sunArcPosition(clockTime(sunrise), clockTime(sunset), clockTime(now)) : null;
  const line = { fill: "none", stroke: "currentColor", vectorEffect: "non-scaling-stroke", strokeLinecap: "round" } as const;
  return (
    <div data-daylight-arc className={cn("flex flex-col font-bold leading-none", compact ? "gap-0.5 text-[11px]" : "gap-1 text-xs")}>
      <div className="flex items-end gap-2">
        {risesAndSets ? <span className="shrink-0">{`↑ ${sunrise}`}</span> : null}
        <div role="img" aria-label={daylightLabel(daylight)} className={cn("relative min-w-0 flex-1", compact ? "h-[18px]" : "h-7")}>
          <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 10" preserveAspectRatio="none">
            {polarNight ? null : <path d={ARC} {...line} strokeWidth={2} strokeDasharray={polarDay ? undefined : "0.5 5"} />}
            {t != null ? <path d={travelled(t)} {...line} strokeWidth={3} /> : null}
            <line x1={0} y1={10} x2={100} y2={10} {...line} strokeWidth={2} />
          </svg>
          {t != null ? (
            <span
              data-sun-marker
              className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current bg-wx-sun-disc shadow-[2px_2px_0_currentColor]", compact ? "size-2.5" : "size-3.5")}
              style={{ left: `${t * 100}%`, top: `${(1 - 2 * t) ** 2 * 100}%` }}
            />
          ) : null}
        </div>
        {risesAndSets ? <span className="shrink-0">{`${sunset} ↓`}</span> : null}
      </div>
      <span aria-hidden="true" className="text-center leading-none">{compact ? formatDayLength(dayLengthMin) : `${formatDayLength(dayLengthMin)} daylight`}</span>
    </div>
  );
}
