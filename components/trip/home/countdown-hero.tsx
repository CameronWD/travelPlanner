import { formatDateRange } from "@/lib/dates";
import type { PhaseDescription } from "@/lib/trip-phase";

interface CountdownHeroProps {
  description: PhaseDescription;
  startDate: string | null;
  endDate: string | null;
  /** Visually escalate (final-prep). */
  urgent?: boolean;
}

/** Big "In 26 days" / "Day 5 of 11" hero block at the top of Home. */
export function CountdownHero({ description, startDate, endDate, urgent }: CountdownHeroProps) {
  const range = startDate && endDate ? formatDateRange(startDate, endDate) : null;
  return (
    <section
      className={
        "flex flex-col gap-1 rounded-2xl border p-6 shadow-soft " +
        (urgent ? "border-primary/40 bg-primary/5" : "border-border bg-card")
      }
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {description.label}
      </span>
      <p className="font-display text-3xl font-semibold tracking-tight text-foreground">
        {description.countdown}
      </p>
      {range && <p className="text-sm text-muted-foreground">{range}</p>}
    </section>
  );
}
