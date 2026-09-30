import type { BudgetResult } from "@/lib/budget";
import { type Hue, LEGACY_TO_HUE } from "@/lib/hues";
import { CATEGORIES } from "@/lib/categories";
import { formatDayLabel } from "@/lib/dates";

export type BreakdownBy = "category" | "place" | "chapter" | "day";
export type MoneyCategoryIcon = "transport" | "accommodation" | "activity" | "food" | "other";

const FIXED: Record<string, { hue: Hue; icon: MoneyCategoryIcon }> = {
  Transport: { hue: "sun", icon: "transport" },
  Accommodation: { hue: "teal", icon: "accommodation" },
  "Food & Drink": { hue: "leaf", icon: "food" },
};
// Every Item category that is something to do (lib/categories.ts labels), plus
// effectiveCategory's own "Activity" fallback and the Other-cost "Activities".
const ACTIVITY_LABELS = new Set<string>([
  ...CATEGORIES.filter((c) => c.value !== "FOOD" && c.value !== "OTHER").map((c) => c.label),
  "Activity",
  "Activities",
]);

/** MONEY.md §1: Transport = sun, Accommodation = teal, things to do = coral, Food = leaf, the rest = lilac. */
export function budgetCategoryStyle(label: string): { hue: Hue; icon: MoneyCategoryIcon } {
  return FIXED[label] ?? (ACTIVITY_LABELS.has(label) ? { hue: "coral", icon: "activity" } : { hue: "lilac", icon: "other" });
}

export function breakdownOptions({ chapters, days }: { chapters: boolean; days: boolean }): { value: BreakdownBy; label: string }[] {
  return [
    { value: "category", label: "Category" },
    { value: "place", label: "Place" },
    ...(chapters ? [{ value: "chapter" as const, label: "Chapter" }] : []),
    ...(days ? [{ value: "day" as const, label: "Day" }] : []),
  ];
}

export function parseBy(raw: string | string[] | undefined, available: readonly BreakdownBy[]): BreakdownBy {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return available.find((v) => v === first) ?? "category";
}

export interface BreakdownRow {
  key: string;
  label: string;
  hue: Hue | null;
  icon: MoneyCategoryIcon | null;
  chapterColour?: string;
  pct: number | null;
  costMinor: number;
  paidMinor: number;
  muted: boolean;
  missingRate: boolean;
}

export type BreakdownBudget = Pick<BudgetResult, "grandTotal" | "byCategory" | "byStop" | "byDay" | "byChapter" | "chapterReconciliation">;

const PLACE_RAMP: readonly Hue[] = ["sun", "teal", "coral", "leaf", "lilac", "sky", "pink", "indigo"];

export function rowsFor(
  budget: BreakdownBudget,
  by: BreakdownBy,
  opts: { stopChapterColour?: ReadonlyMap<string, string>; missingRateCategories?: ReadonlySet<string> } = {},
): BreakdownRow[] {
  const total = budget.grandTotal.costTotalMinor;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const base = { muted: false, missingRate: false, icon: null };

  switch (by) {
    case "category":
      return budget.byCategory.map((c) => {
        const style = budgetCategoryStyle(c.category);
        return {
          ...base,
          key: `cat:${c.category}`,
          label: c.category,
          hue: style.hue,
          icon: style.icon,
          pct: pct(c.costTotalMinor),
          costMinor: c.costTotalMinor,
          paidMinor: c.paidTotalMinor,
          missingRate: opts.missingRateCategories?.has(c.category) ?? false,
        };
      });
    case "place":
      return budget.byStop.map((s, i) => {
        const chapterColour = s.stopId ? opts.stopChapterColour?.get(s.stopId) : undefined;
        const hue: Hue = s.stopId == null ? "stone" : chapterColour ? (LEGACY_TO_HUE[chapterColour] ?? "stone") : PLACE_RAMP[i % PLACE_RAMP.length];
        return { ...base, key: `stop:${s.stopId ?? "tripwide"}`, label: s.stopName, hue, pct: pct(s.costTotalMinor), costMinor: s.costTotalMinor, paidMinor: s.paidTotalMinor };
      });
    case "chapter": {
      const rows: BreakdownRow[] = budget.byChapter.map((c) => ({
        ...base,
        key: `ch:${c.chapterId}`,
        label: c.chapterName,
        hue: LEGACY_TO_HUE[c.colour] ?? "stone",
        chapterColour: c.colour,
        pct: pct(c.costTotalMinor),
        costMinor: c.costTotalMinor,
        paidMinor: c.paidTotalMinor,
      }));
      const rec = budget.chapterReconciliation;
      for (const [key, label, v] of [
        ["ungrouped", "Ungrouped", rec.ungrouped],
        ["between", "Between legs", rec.betweenLegs],
        ["other", "Other costs", rec.otherCosts],
      ] as const) {
        if (v.costTotalMinor > 0 || v.paidTotalMinor > 0) {
          rows.push({ ...base, key: `rec:${key}`, label, hue: null, muted: true, pct: pct(v.costTotalMinor), costMinor: v.costTotalMinor, paidMinor: v.paidTotalMinor });
        }
      }
      return rows;
    }
    case "day":
      return budget.byDay
        .filter((d) => d.costTotalMinor > 0 || d.paidTotalMinor > 0)
        .map((d) => ({ ...base, key: `day:${d.dateISO}`, label: formatDayLabel(d.dateISO), hue: "stone" as const, pct: null, costMinor: d.costTotalMinor, paidMinor: d.paidTotalMinor }));
  }
}

export interface BarSegment {
  key: string;
  hue: Hue;
  fraction: number;
}

/** The stacked bar (MONEY.md §5): segments under 1% and swatch-less rows merge into one trailing stone segment. */
export function segmentsFor(rows: BreakdownRow[], totalMinor: number): BarSegment[] {
  if (totalMinor <= 0) return [];
  const segs: BarSegment[] = [];
  let tail = 0;
  for (const r of rows) {
    if (r.costMinor <= 0) continue;
    const fraction = r.costMinor / totalMinor;
    if (r.hue === null || fraction < 0.01) tail += fraction;
    else segs.push({ key: r.key, hue: r.hue, fraction: Math.round(fraction * 1e6) / 1e6 });
  }
  if (tail > 0) segs.push({ key: "__small", hue: "stone", fraction: Math.round(tail * 1e6) / 1e6 });
  return segs;
}
