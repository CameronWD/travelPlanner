"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Pill button: 2px outline + hard offset shadow that collapses on press.
 * One `primary` per screen (ink with a coral shadow). API unchanged from the previous version,
 * plus `accent` and `dashed` variants.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border-2 border-border font-extrabold outline-none transition-[transform,box-shadow,background-color,color] duration-[var(--dur-fast)] ease-pop disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "pressable bg-primary text-primary-foreground shadow-cta hover:shadow-[5px_5px_0_hsl(var(--coral))]",
        secondary: "pressable bg-card text-foreground shadow-hard-1 hover:shadow-hard-2",
        accent: "pressable bg-coral text-on-accent shadow-hard-1 hover:shadow-hard-2",
        outline: "bg-transparent text-foreground hover:bg-muted",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-muted active:translate-x-0.5 active:translate-y-0.5",
        dashed: "border-dashed border-border-soft bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
        destructive: "pressable bg-destructive text-destructive-foreground shadow-hard-1",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        md: "h-11 px-[18px] text-[13px] [&_svg]:size-4",
        lg: "h-[52px] px-[22px] text-[15px] [&_svg]:size-5",
        icon: "size-11 rounded-md [&_svg]:size-5",
      },
      shape: {
        default: "rounded-full",
        pill: "rounded-full",
        square: "rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render via Radix Slot so the variant styles apply to the child element. */
  asChild?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const showSpinner = loading && !asChild;
    const inertWhenAsChild = loading && asChild;
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, shape }), size === "icon" && "rounded-md", inertWhenAsChild && "pointer-events-none opacity-45", className)}
        disabled={asChild ? undefined : (disabled ?? loading)}
        aria-disabled={inertWhenAsChild || undefined}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {showSpinner ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" data-testid="button-spinner" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
