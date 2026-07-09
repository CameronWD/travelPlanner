import * as React from "react";
import { cn } from "@/lib/cn";

export interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  count?: number | string;
  action?: React.ReactNode;
  className?: string;
}

/** Icon + heading (+ optional count) row with an optional right-aligned action. */
export function SectionHeader({ icon, title, count, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {icon}
      <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
      {count != null && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
      {action != null && <div className="ml-auto">{action}</div>}
    </div>
  );
}
