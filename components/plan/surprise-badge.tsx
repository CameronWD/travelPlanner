import { Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { surpriseLine, type SurpriseView } from "@/lib/surprise";

export interface SurpriseBadgeProps {
  view: SurpriseView;
  /** `sm` for a dense row (an Item, a chip); `md` (default) beside a Stop's name. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * The Surprise pill (CONTEXT.md **Surprise**): "Surprise, planned by Cam" to
 * the surprised, "Surprise for Sam and Alex" to everyone else, via
 * `surpriseLine`. Text badge in the "Booked" pill pattern.
 */
export function SurpriseBadge({ view, size = "md", className }: SurpriseBadgeProps) {
  const line = surpriseLine(view);
  return (
    <span
      role="img"
      aria-label={line}
      title={line}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 border-border bg-coral/15 px-2 text-xs font-bold",
        size === "sm" && "text-[11px]",
        className,
      )}
    >
      <Gift className="size-3" aria-hidden />
      {line}
    </span>
  );
}

/**
 * What a surprised Traveller sees inside a Surprise Stop: who is planning it,
 * and nothing else (no stay, ideas, days or extras). Desktop open body and the
 * mobile Stop sheet both render it.
 */
export function SurpriseShell({ view }: { view: SurpriseView }) {
  return (
    <div data-testid="surprise-shell" className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-muted-foreground">
      <Gift className="mx-auto size-6" aria-hidden />
      <p className="mt-2 font-semibold">{surpriseLine(view)}</p>
    </div>
  );
}
