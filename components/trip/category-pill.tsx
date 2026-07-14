import * as React from "react";
import { cn } from "@/lib/cn";
import { categoryMeta, type Category } from "@/lib/categories";

export interface CategoryPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  category: Category;
  size?: "sm" | "md";
}

/**
 * A small pill/badge showing a category's label in its theme colour.
 *
 * Colours are Tailwind named-colour classes built from the category metadata.
 * Only the colour names present in CATEGORIES are used, so all variants
 * are statically reachable and won't be purged by Tailwind.
 */
export function CategoryPill({
  category,
  size = "sm",
  className,
  ...props
}: CategoryPillProps) {
  const meta = categoryMeta(category);

  // Map color name → tailwind classes for bg, text, border
  const colorClasses = CATEGORY_COLOR_CLASSES[meta.color] ?? FALLBACK_CLASSES;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        colorClasses,
        className,
      )}
      {...props}
    >
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Static color mapping (all values from lib/categories.ts must appear here
// so Tailwind's content scanner can see the full class strings)
// ---------------------------------------------------------------------------

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  sky: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  amber:
    "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  emerald:
    "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  violet:
    "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  rose: "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  stone:
    "border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300",
};

const FALLBACK_CLASSES =
  "border-border bg-muted text-muted-foreground";

// ---------------------------------------------------------------------------
// Accent classes (hued dot + 4px left-border) for timeline rows and globe-suggestion
// dots. Literal strings so Tailwind's content scanner keeps every variant.
// ---------------------------------------------------------------------------

const CATEGORY_ACCENT_CLASSES: Record<string, { dot: string; borderL: string }> = {
  sky: { dot: "bg-sky-500", borderL: "border-l-sky-500" },
  amber: { dot: "bg-amber-500", borderL: "border-l-amber-500" },
  emerald: { dot: "bg-emerald-500", borderL: "border-l-emerald-500" },
  violet: { dot: "bg-violet-500", borderL: "border-l-violet-500" },
  rose: { dot: "bg-rose-500", borderL: "border-l-rose-500" },
  stone: { dot: "bg-stone-500", borderL: "border-l-stone-500" },
};

const FALLBACK_ACCENT = { dot: "bg-muted-foreground", borderL: "border-l-border" };

/** Category-hued accent classes: a filled dot and a 4px left-border colour. */
export function categoryAccent(category: Category): { dot: string; borderL: string } {
  return CATEGORY_ACCENT_CLASSES[categoryMeta(category).color] ?? FALLBACK_ACCENT;
}
