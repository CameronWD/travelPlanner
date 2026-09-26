"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  /** Strike through the label when checked (to-do lists) */
  strike?: boolean;
}

/** Client Component. Native checkbox (keyboard + forms for free), drawn as a 24px outlined square. */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ label, strike = true, className, ...props }, ref) => (
  <label className={cn("group inline-flex min-h-11 cursor-pointer items-center gap-2.5", className)}>
    <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[6px] border-2 border-input bg-card text-primary-foreground transition-colors duration-[var(--dur-fast)] peer-checked:bg-primary peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
      <Check className="size-4" strokeWidth={3.5} />
    </span>
    <span className={cn(strike && "peer-checked:text-muted-foreground peer-checked:line-through")}>{label}</span>
  </label>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
