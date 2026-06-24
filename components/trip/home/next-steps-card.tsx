import Link from "next/link";
import { AlertTriangle, Info, CheckCircle2, ChevronRight } from "lucide-react";
import type { NextStep } from "@/lib/next-steps";

interface NextStepsCardProps {
  steps: NextStep[];
  /** Link to the full flag list (Summary). Shown when steps were capped. */
  seeAllHref?: string;
}

/** The ranked to-do list. Empty state celebrates being on top of things. */
export function NextStepsCard({ steps, seeAllHref }: NextStepsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft" aria-labelledby="next-steps-heading">
      <h2 id="next-steps-heading" className="mb-3 font-display text-lg font-semibold text-foreground">
        Next steps
      </h2>
      {steps.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
          You&apos;re all set — nothing needs attention right now.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {step.severity === "warning" ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                ) : (
                  <Info className="size-4 shrink-0 text-sky-500" aria-hidden="true" />
                )}
                <span className="flex-1 text-foreground">{step.title}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {seeAllHref && steps.length > 0 && (
        <Link href={seeAllHref} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          See all in Summary →
        </Link>
      )}
    </section>
  );
}
