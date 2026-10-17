import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { openingLine } from "@/lib/opening-hours-display";
import type { OpeningHours } from "@/lib/opening-hours";

/**
 * CONTEXT.md "Opening hours": "Open 10:00–18:00 today" / "Closed on
 * Tuesdays" for a thing scheduled on `dateISO` (its Stop's local date).
 * Nothing at all when the hours or the date are not known. Telling the
 * Traveller that is Branch 2's Flags' job, not this line's.
 */
export function OpeningHoursLine({
  hours,
  dateISO,
  today = false,
  className,
}: {
  hours: OpeningHours | null | undefined;
  dateISO: string | null | undefined;
  today?: boolean;
  className?: string;
}) {
  const line = dateISO ? openingLine(hours, dateISO, { today }) : null;
  if (!line) return null;
  return (
    <span
      data-testid="opening-hours-line"
      data-closed={line.closed ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        line.closed ? "font-extrabold text-foreground" : "font-semibold text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      {line.text}
    </span>
  );
}
