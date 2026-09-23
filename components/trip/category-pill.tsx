import * as React from "react";
import { cn } from "@/lib/cn";
import { categoryMeta, categoryClasses, type Category } from "@/lib/categories";
import type { Hue } from "@/lib/hues";

export interface CategoryPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  category: Category;
  size?: "sm" | "md";
}

/**
 * A small pill/badge showing a category's label in its theme colour.
 *
 * Colours come from the Playground hue ramp (lib/categories.ts → lib/hues.ts)
 * via `categoryClasses()`, which writes every class string out in full — no
 * `bg-hue-${x}` template, so Tailwind's scanner sees every variant.
 */
export function CategoryPill({
  category,
  size = "sm",
  className,
  ...props
}: CategoryPillProps) {
  const meta = categoryMeta(category);
  const classes = categoryClasses(category);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        classes.chip,
        className,
      )}
      {...props}
    >
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Left-border rail class (4px accent on the "day" timeline card). The ramp's
// `dot`/`chip`/`text`/`soft`/`fill` variants (lib/hues.ts) have no plain-border
// form, so this borrows the same --color-hue-* custom property directly via
// Tailwind v4's border-side utilities — the same technique lib/stop-colours.ts
// uses for its own band rail. One literal per hue, written out in full so
// Tailwind's text-based scanner sees each (no `border-l-hue-${hue}` template).
// ---------------------------------------------------------------------------

const BORDER_L: Record<Hue, string> = {
  sky: "border-l-hue-sky",
  sun: "border-l-hue-sun",
  leaf: "border-l-hue-leaf",
  lilac: "border-l-hue-lilac",
  pink: "border-l-hue-pink",
  teal: "border-l-hue-teal",
  coral: "border-l-hue-coral",
  indigo: "border-l-hue-indigo",
  stone: "border-l-hue-stone",
};

/** Category-hued accent classes: a filled dot and a 4px left-border colour. */
export function categoryAccent(category: Category): { dot: string; borderL: string } {
  const meta = categoryMeta(category);
  const classes = categoryClasses(category);
  return { dot: classes.dot, borderL: BORDER_L[meta.hue] };
}
