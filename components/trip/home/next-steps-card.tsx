import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import type { NextStep } from "@/lib/next-steps";

interface NextStepsCardProps {
  steps: NextStep[];
  /** Link to the full flag list (Summary). Shown when steps were capped. */
  seeAllHref?: string;
}

/**
 * The ranked to-do list (kit DHome.jsx "Sort these out" card): count badge,
 * ListRow-shaped rows with a tile. Warning tiles take the status token
 * (state); info is a neutral tile and transport the ink tile — no hue, since
 * hue means identity. Empty state celebrates.
 */
export function NextStepsCard({ steps, seeAllHref }: NextStepsCardProps) {
  return (
    <Card className="p-4" aria-labelledby="next-steps-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="next-steps-heading" className="font-display text-lg font-extrabold leading-tight tracking-[-0.03em] text-foreground">
          Next steps
          {steps.length > 0 && <span className="sr-only">, {steps.length}</span>}
        </h2>
        {steps.length > 0 && <CountBadge count={steps.length} />}
      </div>
      {steps.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <CheckCircle2 className="size-4 text-teal-text" aria-hidden="true" />
          You&apos;re all set — nothing needs attention right now.
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-col">
          {steps.map((step) => {
            const isWarning = step.severity === "warning";
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex min-h-11 items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-muted/40"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-[34px] shrink-0 place-items-center rounded-sm border-2 border-border",
                      isWarning
                        ? "bg-warning text-warning-foreground"
                        : step.kind === "transport"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground",
                    )}
                  >
                    {isWarning ? (
                      <AlertTriangle className="size-4" strokeWidth={2.5} />
                    ) : (
                      <Info className="size-4" strokeWidth={2.5} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[15px] font-semibold text-foreground">{step.title}</span>
                    {step.subtitle && (
                      <span className="block text-xs font-medium text-muted-foreground">{step.subtitle}</span>
                    )}
                  </span>
                  <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {seeAllHref && steps.length > 0 && (
        <Link href={seeAllHref} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-extrabold text-foreground hover:underline">
          See all in Summary <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}
