"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/cn";

type Tone = "coral" | "sun" | "teal" | "lilac" | "ink";
const ON: Record<Tone, string> = {
  coral: "data-[state=on]:bg-coral data-[state=on]:text-on-accent",
  sun: "data-[state=on]:bg-sun data-[state=on]:text-on-accent",
  teal: "data-[state=on]:bg-teal data-[state=on]:text-on-accent",
  lilac: "data-[state=on]:bg-lilac data-[state=on]:text-on-accent",
  ink: "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
};
const ToneCtx = React.createContext<Tone>("coral");

/** Pill segmented control on Radix Toggle Group (arrow-key roving focus). API unchanged (+ tone). */
const Segmented = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> & { tone?: Tone }
>(({ className, tone = "coral", ...props }, ref) => (
  <ToneCtx.Provider value={tone}>
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn("inline-flex items-center gap-1 rounded-full border-2 border-input bg-card p-1", className)}
      {...props}
    />
  </ToneCtx.Provider>
));
Segmented.displayName = "Segmented";

const SegmentedItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  const tone = React.useContext(ToneCtx);
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        "inline-flex h-8 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-2 border-transparent px-3.5 text-[13px] font-extrabold text-muted-foreground transition-colors duration-[var(--dur-fast)]",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-45",
        "data-[state=on]:border-border",
        ON[tone],
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
});
SegmentedItem.displayName = "SegmentedItem";

export { Segmented, SegmentedItem };
