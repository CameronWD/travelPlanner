import { enumerateTripDays } from "@/lib/itinerary";
import { parseISODate } from "@/lib/dates";
import type { Category } from "@/lib/categories";

export const DOT_CAP = 5;
/** PLAN.md §7.3: a day counts as full at this many plans. */
const FULL_DAY_PLANS = 5;

export interface DaySlotItem {
  id: string;
  date?: string | null;
  category: string;
}

export interface DaySlot {
  dateISO: string;
  dow: string;
  num: number;
  title?: string;
  dots: Category[];
  count: number;
  changeover: "arrive" | "depart" | null;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function daySlots(
  stop: { arriveDate: string; departDate: string },
  items: readonly DaySlotItem[],
  dayTitles?: Record<string, { title: string }>,
  neighbours?: { prevDepartDate?: string | null; nextArriveDate?: string | null },
): DaySlot[] {
  const byDate = new Map<string, Category[]>();
  for (const it of items) {
    if (!it.date) continue;
    const list = byDate.get(it.date) ?? [];
    list.push(it.category as Category);
    byDate.set(it.date, list);
  }
  return enumerateTripDays(stop.arriveDate, stop.departDate).map((dateISO) => {
    const d = parseISODate(dateISO);
    const cats = byDate.get(dateISO) ?? [];
    let changeover: DaySlot["changeover"] = null;
    if (dateISO === stop.arriveDate && neighbours?.prevDepartDate === dateISO) changeover = "arrive";
    else if (dateISO === stop.departDate && neighbours?.nextArriveDate === dateISO) changeover = "depart";
    return {
      dateISO,
      dow: DOW[d.getUTCDay()],
      num: d.getUTCDate(),
      title: dayTitles?.[dateISO]?.title,
      dots: cats.slice(0, DOT_CAP),
      count: cats.length,
      changeover,
    };
  });
}

export function dayLoadLabel(slot: Pick<DaySlot, "count" | "title">, tag?: "Arrive" | "Leave" | null): string {
  const parts: string[] = [];
  if (tag) parts.push(tag);
  if (slot.title) parts.push(slot.title);
  if (slot.count >= FULL_DAY_PLANS) parts.push("full");
  else if (slot.count > 0) parts.push(`${slot.count} plan${slot.count === 1 ? "" : "s"}`);
  else if (!slot.title) parts.push("Free day");
  return parts.join(" · ");
}

export function dayTag(stop: { arriveDate: string; departDate: string }, dateISO: string): "Arrive" | "Leave" | null {
  if (dateISO === stop.arriveDate) return "Arrive";
  if (dateISO === stop.departDate) return "Leave";
  return null;
}
