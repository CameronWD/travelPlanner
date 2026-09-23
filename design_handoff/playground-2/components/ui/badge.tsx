import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Server Component. Existing Badge API, restyled as a Playground chip (2px outline, pill, 800 weight).
 * Variant names kept so current call sites keep working; tones added.
 * For clickable chips use <Chip> (components/ui/chip.tsx).
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-border px-2 py-0.5 text-[10px] font-extrabold leading-tight [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        secondary: "bg-card text-foreground",
        outline: "bg-transparent text-foreground",
        accent: "bg-coral text-on-accent",
        success: "bg-teal text-on-accent",
        warning: "bg-sun text-on-accent",
        destructive: "bg-destructive text-destructive-foreground",
        muted: "border-dashed border-border-soft bg-transparent text-muted-foreground",
        coral: "bg-coral text-on-accent",
        sun: "bg-sun text-on-accent",
        teal: "bg-teal text-on-accent",
        lilac: "bg-lilac text-on-accent",
        ink: "bg-primary text-primary-foreground",
      },
      caps: { true: "uppercase tracking-[0.08em]", false: "" },
    },
    defaultVariants: { variant: "default", caps: false },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, caps, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, caps }), className)} {...props} />;
}

export { Badge, badgeVariants };
