import { cn } from "@/lib/cn";

/** Booking import (spec 2026-10-14 "Preview"): a field Claude was unsure of. Lilac is the AI accent. */
export const HIGHLIGHT_CLASS = "rounded-sm bg-hue-lilac/30 px-0.5 ring-2 ring-hue-lilac";

export function highlightAttrs(
  highlight: readonly string[] | undefined,
  field: string | readonly string[],
  className?: string,
): { className?: string; "data-highlight"?: string } {
  const fields = typeof field === "string" ? [field] : field;
  const hit = fields.find((f) => highlight?.includes(f));
  const merged = cn(className, hit && HIGHLIGHT_CLASS) || undefined;
  return hit ? { className: merged, "data-highlight": hit } : { className: merged };
}
