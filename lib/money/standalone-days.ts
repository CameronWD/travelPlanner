import { convertCostToHome, type BudgetCost, type BudgetResult } from "@/lib/money/budget";
import { formatDayLabel, formatISODate } from "@/lib/dates";
import type { BreakdownRow } from "@/lib/money/breakdown";

export const NOT_ON_A_DAY_KEY = "day:none";

export type StandaloneDayCost = BudgetCost & { dueDate: string | null };

export function dayRowsWithStandalone({
  budget,
  homeCurrency,
  costs,
}: {
  budget: Pick<BudgetResult, "grandTotal" | "byDay">;
  homeCurrency: string;
  costs: readonly StandaloneDayCost[];
}): BreakdownRow[] {
  const days = new Map(budget.byDay.map((d) => [d.dateISO, { cost: d.costTotalMinor, paid: d.paidTotalMinor }]));
  for (const c of costs) {
    const { costHome, paidHome } = convertCostToHome(c, homeCurrency);
    if (costHome === null) continue;
    const day = days.get(c.paidAt != null ? formatISODate(new Date(c.paidAt)) : (c.dueDate ?? ""));
    if (!day) continue;
    day.cost += costHome;
    day.paid += paidHome ?? 0;
  }

  const base = { muted: false, missingRate: false, icon: null, hue: "stone" as const, pct: null };
  const rows: BreakdownRow[] = [];
  let placedCost = 0;
  let placedPaid = 0;
  for (const [dateISO, d] of days) {
    placedCost += d.cost;
    placedPaid += d.paid;
    if (d.cost > 0 || d.paid > 0) {
      rows.push({ ...base, key: `day:${dateISO}`, label: formatDayLabel(dateISO), costMinor: d.cost, paidMinor: d.paid });
    }
  }
  const restCost = budget.grandTotal.costTotalMinor - placedCost;
  const restPaid = budget.grandTotal.paidTotalMinor - placedPaid;
  if (restCost !== 0 || restPaid !== 0) {
    rows.push({ ...base, key: NOT_ON_A_DAY_KEY, label: "Not on a day", hue: null, muted: true, costMinor: restCost, paidMinor: restPaid });
  }
  return rows;
}
