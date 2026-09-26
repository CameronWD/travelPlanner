import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "sun" | "teal" | "lilac" | "coral";
const TILE: Record<Tone, string> = { sun: "bg-sun", teal: "bg-teal", lilac: "bg-lilac", coral: "bg-coral" };

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Icon component (lucide-react). */
  icon?: LucideIcon;
  /** Or a typographic glyph ("Zz", "¥"). Wins over icon. */
  glyph?: React.ReactNode;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action, typically a <Button>. */
  action?: React.ReactNode;
}

/** Server Component. Dashed frame, a tilted accent tile, one action. API unchanged (+ glyph, tone). */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, glyph, tone = "sun", title, description, action, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border-soft px-5 py-7 text-center", className)}
      {...props}
    >
      {glyph || Icon ? (
        <span aria-hidden="true" className={cn("island grid size-16 -rotate-6 place-items-center rounded-lg border-2 border-border font-display text-3xl font-extrabold shadow-hard-2", TILE[tone])}>
          {glyph ?? (Icon ? <Icon className="size-8" strokeWidth={2.5} /> : null)}
        </span>
      ) : null}
      <div className="mt-1.5 flex flex-col gap-1">
        <h3 className="font-display text-2xl font-extrabold tracking-[-0.03em]">{title}</h3>
        {description ? <p className="max-w-[260px] text-[13px] font-medium text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
