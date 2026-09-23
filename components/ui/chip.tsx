"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Client Component. Clickable pill: filters, votes, "+ add" affordances.
 * Renders a <button> (aria-pressed when `selected` is set). For static labels use <Badge>.
 */
const chipVariants = cva(
  "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border font-extrabold leading-tight transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-pop [&_svg]:size-3.5 [&_svg]:shrink-0 disabled:opacity-45",
  {
    variants: {
      tone: {
        white: "bg-card text-foreground",
        coral: "bg-coral text-on-accent",
        sun: "bg-sun text-on-accent",
        teal: "bg-teal text-on-accent",
        lilac: "bg-lilac text-on-accent",
        ink: "bg-primary text-primary-foreground",
      },
      size: { s: "px-2 py-0.5 text-[10px]", m: "px-2.5 py-1 text-[11px]", l: "px-3.5 py-2 text-xs" },
      dashed: { true: "border-dashed border-border-soft bg-transparent text-muted-foreground", false: "" },
    },
    defaultVariants: { tone: "white", size: "m", dashed: false },
  },
);

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof chipVariants> {
  selected?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(({ className, tone, size, dashed, selected, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={selected}
    className={cn(chipVariants({ tone, size, dashed }), selected && "-translate-x-px -translate-y-px shadow-hard-1", className)}
    {...props}
  />
));
Chip.displayName = "Chip";

export { Chip, chipVariants };
