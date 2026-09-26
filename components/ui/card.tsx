import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Server Component. Outlined card with a hard shadow.
 * `tone` fills it with an accent and turns it into an "island" (text/borders stay legible in both themes).
 * `hue-*` tones fill with the categorical ramp (lib/hues.ts); text is `on-accent`, as on chips — not `onSoft`, which is for the 25% tint.
 * `interactive` adds hover-lift + press for clickable cards. Wrap in <Link> or pass asChild-style via className.
 */
const cardVariants = cva("relative rounded-lg border-2 border-border text-card-foreground", {
  variants: {
    tone: {
      white: "bg-card",
      paper: "bg-background",
      coral: "island bg-coral",
      sun: "island bg-sun",
      teal: "island bg-teal",
      lilac: "island bg-lilac",
      ink: "bg-primary text-primary-foreground",
      "hue-sky": "island bg-hue-sky text-on-accent",
      "hue-sun": "island bg-hue-sun text-on-accent",
      "hue-leaf": "island bg-hue-leaf text-on-accent",
      "hue-lilac": "island bg-hue-lilac text-on-accent",
      "hue-pink": "island bg-hue-pink text-on-accent",
      "hue-teal": "island bg-hue-teal text-on-accent",
      "hue-coral": "island bg-hue-coral text-on-accent",
      "hue-indigo": "island bg-hue-indigo text-on-accent",
      "hue-stone": "island bg-hue-stone text-on-accent",
    },
    shadow: { 0: "", 1: "shadow-hard-1", 2: "shadow-hard-2", 3: "shadow-hard-3", 4: "shadow-hard-4", 5: "shadow-hard-5" },
    radius: { md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" },
    dashed: { true: "border-dashed border-border-soft bg-transparent shadow-none", false: "" },
    interactive: { true: "pressable cursor-pointer hover:shadow-hard-3", false: "" },
  },
  defaultVariants: { tone: "white", shadow: 2, radius: "lg", dashed: false, interactive: false },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  /** Chip or label pinned over the top edge. */
  sticker?: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, shadow, radius, dashed, interactive, sticker, children, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ tone, shadow, radius, dashed, interactive }), className)} {...props}>
      {sticker ? <span className="absolute -top-3 left-3.5">{sticker}</span> : null}
      {children}
    </div>
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("font-display text-lg font-extrabold leading-tight tracking-[-0.03em]", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-[13px] font-medium text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
