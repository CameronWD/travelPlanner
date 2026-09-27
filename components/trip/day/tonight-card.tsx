import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDayLabel } from "@/lib/dates";
import type { DayViewData } from "@/lib/day-view-loader";

/**
 * Tonight (DAY_VIEW §2 right column 2, §3.7): lilac card naming tonight's bed,
 * its night-of count and check-out day. Hidden on the trip's last day.
 *
 * Links go to the day's Stop on the Plan (`#stop-<id>`, the anchor
 * stop-card.tsx sets): the Plan has no per-Accommodation anchor, and a stay
 * is edited from its Stop there.
 */
export function TonightCard({
  tripId,
  tonight,
  isLastDay,
  stopId,
  size,
}: {
  tripId: string;
  tonight: DayViewData["tonight"];
  isLastDay: boolean;
  stopId: string | null;
  size: "desktop" | "phone";
}) {
  if (isLastDay) return null;
  const phone = size === "phone";
  const planHref = `/trips/${tripId}/plan${stopId ? `#stop-${stopId}` : ""}`;
  const shell = cn(
    "island flex flex-col gap-1 rounded-3xl border-2 border-border bg-lilac text-on-accent",
    phone ? "px-4 py-3.5 shadow-hard-2" : "px-[22px] py-[18px] shadow-hard-3",
  );
  const name = cn("font-display font-extrabold leading-tight", phone ? "text-[18px]" : "text-[20px]");
  const eyebrow = <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em]">Tonight</span>;

  if (!tonight) {
    return (
      <div className={shell}>
        {eyebrow}
        <p className={name}>No bed yet</p>
        <Link href={planHref} className="inline-flex min-h-11 items-center self-start text-[13px] font-bold underline underline-offset-2 md:min-h-0">
          + Add a stay
        </Link>
      </div>
    );
  }
  return (
    <Link href={planHref} className={cn(shell, "pressable focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring")}>
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          {eyebrow}
          <span className={cn("block truncate", name)}>{tonight.name}</span>
          <span className="block text-[13px] font-semibold">{`Night ${tonight.nightOf.night} of ${tonight.nightOf.of} · check-out ${formatDayLabel(tonight.checkOut)}`}</span>
        </span>
        <ChevronRight className="size-5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      </span>
    </Link>
  );
}
