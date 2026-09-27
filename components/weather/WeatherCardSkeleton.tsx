import { cn } from "@/lib/cn";

/** Same footprint as the card; canvas bars where the text will be (WEATHER_CARD §6). */
export function WeatherCardSkeleton({ size }: { size: "regular" | "compact" }) {
  const compact = size === "compact";
  const bar = "tp-pulse rounded-full bg-canvas";
  return (
    <div role="status" aria-label="Loading weather" className={cn("relative flex w-full flex-col overflow-hidden border-2 border-border bg-card", compact ? "h-[140px] rounded-[20px] p-[14px_16px] shadow-hard-2" : "h-[236px] rounded-3xl p-[20px_22px] shadow-hard-3")}>
      <span className={cn(bar, "absolute right-4 top-4 rounded-full", compact ? "size-14" : "size-24")} />
      {!compact ? <span className={cn(bar, "h-3 w-[130px]")} /> : null}
      <span className={cn(bar, "mt-3 h-[52px] w-[150px]", compact && "h-9 w-28")} />
      <span className={cn(bar, "mt-3 h-[18px] w-[180px]", compact && "h-3.5 w-32")} />
      <span className={cn(bar, "mt-auto h-3 w-full")} />
    </div>
  );
}
