import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NextStep } from "@/lib/next-steps";

interface NextStepsCardProps {
  steps: NextStep[];
  /** Link to the full flag list (Summary). Shown when steps were capped. */
  seeAllHref?: string;
}

/** The ranked to-do list with severity-hued icon chips. Empty state celebrates. */
export function NextStepsCard({ steps, seeAllHref }: NextStepsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft" aria-labelledby="next-steps-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="next-steps-heading" className="font-display text-lg font-semibold text-foreground">
          Next steps
        </h2>
        {steps.length > 0 && (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {steps.length}
          </span>
        )}
      </div>
      {steps.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
          You&apos;re all set — nothing needs attention right now.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {steps.map((step) => {
            const isWarning = step.severity === "warning";
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex items-center gap-3 py-3 text-sm transition-colors hover:bg-muted/40 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
                      isWarning ? "bg-amber-500" : step.kind === "transport" ? "bg-primary" : "bg-sky-500",
                    )}
                  >
                    {isWarning ? (
                      <AlertTriangle className="size-5" aria-hidden="true" />
                    ) : (
                      <Info className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-foreground">{step.title}</span>
                    {step.subtitle && (
                      <span className="block text-xs text-muted-foreground">{step.subtitle}</span>
                    )}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {seeAllHref && steps.length > 0 && (
        <Link href={seeAllHref} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          See all in Summary <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
