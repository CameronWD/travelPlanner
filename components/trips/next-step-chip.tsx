import { ChevronRight } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import type { SortRow } from "@/lib/sort-these-out";
import { ICONS, TONES } from "@/components/trip/home/desktop/sort-row-style";
import { cn } from "@/lib/cn";
import { ROW_NAME_CLASS } from "@/components/ui/row-text";

/**
 * The hero card's next-step chip (TRIPS_PAGE.md §4a): the first "Sort these
 * out" row, a separate link that sits beside the card's stretched link.
 */
export function NextStepChip({ row }: { row: SortRow }) {
  // row.href is null only for the "You're all sorted" sentinel, which goes
  // nowhere and must never render as a link — the chip just disappears.
  if (row.href == null) return null;
  const Icon = ICONS[row.icon];
  return (
    <AppLink
      href={row.href}
      className="relative z-10 mt-3.5 inline-flex max-w-full shrink-0 items-center gap-2.5 self-start rounded-[12px] border-2 border-border bg-card px-3 py-[7px] text-sm font-bold text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className={cn("grid size-[22px] shrink-0 place-items-center rounded-[7px] border-2 border-border", TONES[row.tone])}>
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      <span className={cn(ROW_NAME_CLASS, "text-left")}>{row.title}</span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </AppLink>
  );
}
