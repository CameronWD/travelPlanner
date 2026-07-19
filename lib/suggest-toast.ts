import type { ActionResult } from "@/lib/action-result";

/**
 * Maps the result of `suggestChaptersFromCountries` to a toast descriptor.
 * Pure helper — no side effects. Both ChaptersManager and ItineraryManager
 * call `toast(suggestResultToast(result))` so the copy stays in one place.
 */
export function suggestResultToast(
  result: ActionResult<{ created: number }>,
): { variant?: "destructive"; title: string; description?: string } {
  if (!result.success) {
    return {
      variant: "destructive",
      title: "Couldn't suggest chapters",
      description: result.errors._?.[0] ?? "Something went wrong.",
    };
  }
  if (result.created === 0) {
    return {
      title: "Nothing to group",
      description:
        "Add stops with a resolvable country (or dates) first — anything already grouped is left alone.",
    };
  }
  return {
    title: `Created ${result.created} ${result.created === 1 ? "chapter" : "chapters"}`,
    description: "Rename or redraw them any time.",
  };
}
