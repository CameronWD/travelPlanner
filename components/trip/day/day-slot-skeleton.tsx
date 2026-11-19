/** A day not read yet: a few nodes, so a slot for every day of a long Trip stays cheap. Two shapes in the real order: the weather card first on a phone, beside the plan card from lg. */
export function DaySlotSkeleton() {
  return (
    <div
      data-day-slot-skeleton
      role="status"
      aria-label="Loading day"
      className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-[18px]"
    >
      <div className="tp-pulse h-72 rounded-[20px] border-2 border-border bg-card shadow-hard-2 md:rounded-3xl md:shadow-hard-3" />
      <div className="tp-pulse order-first h-[140px] rounded-[20px] border-2 border-border bg-card shadow-hard-2 md:order-none md:h-[236px] md:rounded-3xl md:shadow-hard-3" />
    </div>
  );
}
