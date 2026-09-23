"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Client Component. role="switch". Use for settings that apply immediately. Pair with a <label htmlFor>. */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ checked, onCheckedChange, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onCheckedChange(!checked)}
    className={cn("relative h-[30px] w-[52px] shrink-0 rounded-full border-2 border-input transition-colors duration-[var(--dur-base)]", checked ? "bg-teal" : "bg-card", className)}
    {...props}
  >
    <span aria-hidden="true" className={cn("absolute top-0.5 size-[22px] rounded-full bg-primary transition-[left] duration-[var(--dur-base)] ease-bounce", checked ? "left-6" : "left-0.5")} />
  </button>
));
Switch.displayName = "Switch";

export { Switch };
