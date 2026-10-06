/**
 * Optimistic calendar drag (spec 2026-10-06 §W): move one scheduled Item's
 * entry to another day of the projected DayPlans, re-dated, keeping it timed
 * (in start-time order) or untimed. PURE. Returns the input unchanged when the
 * Item or the target day isn't in view.
 */
import type { DayPlan, ItemEntry } from "@/lib/itinerary";

export function moveItemInDays(days: DayPlan[], itemId: string, dateISO: string): DayPlan[] {
  if (!days.some((d) => d.dateISO === dateISO)) return days;
  let moving: ItemEntry | null = null;
  for (const d of days) {
    moving = [...d.timedItems, ...d.untimedItems].find((e) => e.item.id === itemId) ?? null;
    if (moving) break;
  }
  if (!moving) return days;
  const moved: ItemEntry = { ...moving, item: { ...moving.item, date: dateISO } };
  const timed = Boolean(moved.item.startTime);
  return days.map((d) => {
    const timedItems = d.timedItems.filter((e) => e.item.id !== itemId);
    const untimedItems = d.untimedItems.filter((e) => e.item.id !== itemId);
    if (d.dateISO !== dateISO) {
      return timedItems.length === d.timedItems.length && untimedItems.length === d.untimedItems.length
        ? d
        : { ...d, timedItems, untimedItems };
    }
    return timed
      ? { ...d, untimedItems, timedItems: [...timedItems, moved].sort((a, b) => (a.item.startTime ?? "").localeCompare(b.item.startTime ?? "")) }
      : { ...d, timedItems, untimedItems: [...untimedItems, moved] };
  });
}
