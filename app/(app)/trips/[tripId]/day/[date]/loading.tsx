import { WeatherCardSkeleton } from "@/components/weather/WeatherCardSkeleton";

/** Loading state for a Day view: the header, strip and two-column body in outline. */
export default function DayLoading() {
  const bar = "tp-pulse rounded-full bg-canvas motion-reduce:animate-none";
  return (
    <div role="status" aria-label="Loading day" className="flex flex-col gap-3.5 lg:gap-[18px]">
      <div className="flex flex-col items-center gap-2 md:items-start">
        <span className={`${bar} h-3 w-32`} />
        <span className={`${bar} h-10 w-56`} />
        <span className={`${bar} h-4 w-72 max-w-full`} />
      </div>
      <div className="grid grid-cols-7 gap-2 md:grid-cols-9">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`${bar} h-[58px] rounded-[14px] md:h-[62px] ${i >= 7 ? "hidden md:block" : ""}`} />
        ))}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[7fr_5fr] lg:gap-[18px]">
        <div className="h-[480px] rounded-3xl border-2 border-border bg-card p-6">
          <span className={`${bar} block h-6 w-28`} />
        </div>
        <div className="flex flex-col gap-3.5 lg:gap-[18px]">
          <WeatherCardSkeleton size="regular" />
          <span className={`${bar} block h-24 rounded-3xl`} />
        </div>
      </div>
    </div>
  );
}
