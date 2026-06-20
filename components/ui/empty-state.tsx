import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Icon component (e.g. from lucide-react). */
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action, typically a <Button>. */
  action?: React.ReactNode;
}

/**
 * Centered placeholder for empty lists/areas: icon + title + description +
 * optional action.
 */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, description, action, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
