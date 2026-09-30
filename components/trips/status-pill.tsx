import type { TripCardKind } from "@/lib/trips/trip-status";
import { cardLabel } from "@/lib/trips/trip-status";
import { cn } from "@/lib/cn";

const FILL: Record<TripCardKind, string> = {
  "up-next": "bg-card",
  "on-the-road": "bg-card",
  planning: "bg-teal",
  idea: "bg-lilac",
  done: "bg-card",
};

/** 11px / 800 / 0.08em pill, 2px ink border (TRIPS_PAGE.md §4a–b). */
export function StatusPill({ kind, label, className }: { kind: TripCardKind; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border-2 border-border px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.08em] text-foreground",
        FILL[kind],
        className,
      )}
    >
      {label ?? cardLabel(kind)}
    </span>
  );
}
