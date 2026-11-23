import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import { stopHue } from "@/lib/stop-colours";

export function StopBadge({
  number,
  sortOrder,
  rough,
  className,
}: {
  number: number;
  sortOrder: number;
  rough: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold text-on-accent",
        rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(sortOrder)].fill,
        className,
      )}
    >
      {number}
    </span>
  );
}
