/** A day not read yet: a few nodes, so a slot for every day of a long Trip stays cheap. */
export function DaySlotSkeleton() {
  return (
    <div data-day-slot-skeleton role="status" aria-label="Loading day" className="flex flex-col gap-3.5 lg:gap-[18px]">
      <div className="tp-pulse h-[140px] rounded-[20px] border-2 border-border bg-card" />
      <div className="tp-pulse h-72 rounded-3xl border-2 border-border bg-card" />
    </div>
  );
}
