/**
 * `list_costs`'s loader (spec 2026-10-11 Task 2): every Cost on the real
 * plan, in its own currency and the trip's home currency (via
 * `convertCostToHome`, from the cost's own stored `rateToHome` — the same
 * source of truth the Budget page and `get_budget` use, with no
 * ExchangeRate-table fallback), paid-or-due, and what it belongs to
 * (`loadOwners`). Real plan only: scoped with `REAL_PLAN`, never accepts a
 * `forkId`.
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { convertCostToHome, effectiveCategory, type BudgetCost } from "@/lib/budget";
import { formatMinor } from "@/lib/money";
import { isOnTrip } from "@/lib/enum-values";
import { daysBetween, formatISODate } from "@/lib/dates";
import { currentTripTimezone, todayISOInZone } from "@/lib/tz";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { loadOwners, ownerKey, REMOVED_LABEL, type OwnerKind } from "./owners";

interface McpCost {
  id: string;
  amount: { minor: number; currency: string; formatted: string };
  /** null = no exchange rate is known for this cost's currency. */
  home: { minor: number; currency: string; formatted: string } | null;
  /** null while unpaid. `on` is the paid date, YYYY-MM-DD. */
  paid: { minor: number; formatted: string; on: string } | null;
  dueDate: string | null;
  /** negative = overdue; null when paid or undated. */
  daysUntilDue: number | null;
  settlement: "before-you-go" | "on-the-trip";
  label: string | null;
  category: string;
  owner: { kind: OwnerKind; label: string };
}

export interface McpCostsResult {
  homeCurrency: string;
  today: string;
  costs: McpCost[];
}

/** True for an unpaid cost with a due date — the group sorted soonest-first ahead of everything else. */
function isDueBearing(c: Pick<McpCost, "paid" | "dueDate">): boolean {
  return c.paid === null && c.dueDate !== null;
}

function compareCosts(a: McpCost, b: McpCost): number {
  const aDue = isDueBearing(a);
  const bDue = isDueBearing(b);
  if (aDue && bDue) return a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0;
  if (aDue) return -1;
  if (bDue) return 1;
  return 0;
}

export async function loadCostsForMcp(
  tripId: string,
  opts: { unpaidOnly?: boolean; dueWithinDays?: number },
): Promise<McpCostsResult> {
  const { user } = await requireTripAccess(tripId);
  // Surprise (ADR 0051): lines inside a Surprise hidden from the acting
  // Traveller stay in the database. Their money still counts in get_budget.
  const v = await loadSurpriseVisibility(tripId, user.id);

  const [trip, rawCosts, stops, items] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { homeCurrency: true } }),
    db.cost.findMany({
      where: { tripId, ...REAL_PLAN, ...v.where.cost },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        costMinor: true,
        paidMinor: true,
        currency: true,
        rateToHome: true,
        paidAt: true,
        dueDate: true,
        ownerType: true,
        ownerId: true,
        label: true,
        category: true,
        settlement: true,
      },
    }),
    db.stop.findMany({ where: { tripId, ...REAL_PLAN }, select: { timezone: true, arriveDate: true, departDate: true } }),
    db.item.findMany({ where: { tripId, ...REAL_PLAN }, select: { id: true, category: true } }),
  ]);

  const homeCurrency = trip?.homeCurrency ?? "AUD";
  const today = todayISOInZone(currentTripTimezone(stops));
  // Raw rateToHome only, no ExchangeRate-table fallback — matches the Budget
  // page and get_budget (lib/budget-loader.ts loadBudget → buildBudgetFromRows).
  const budgetCosts = rawCosts as unknown as BudgetCost[];

  const { owners } = await loadOwners(
    tripId,
    rawCosts
      .filter((c) => c.ownerType !== "OTHER" && c.ownerId)
      .map((c) => ({ kind: c.ownerType as OwnerKind, id: c.ownerId })),
  );

  const itemCategoryById: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, i.category]));

  const mapped: McpCost[] = rawCosts.map((raw, idx) => {
    const budgetCost = budgetCosts[idx]!;
    const { costHome } = convertCostToHome(budgetCost, homeCurrency);

    const paidAt = raw.paidAt;
    const isPaid = paidAt != null;
    const paidOn = isPaid ? (paidAt instanceof Date ? formatISODate(paidAt) : String(paidAt).slice(0, 10)) : null;

    const dueDate = raw.dueDate ?? null;
    const daysUntilDue = !isPaid && dueDate ? daysBetween(today, dueDate) : null;

    let owner: { kind: OwnerKind; label: string };
    if (raw.ownerType === "OTHER") {
      owner = { kind: "OTHER", label: raw.label ?? "Other cost" };
    } else {
      const kind = raw.ownerType as OwnerKind;
      const found = raw.ownerId ? owners.get(ownerKey(kind, raw.ownerId)) : undefined;
      owner = found ? { kind: found.kind, label: found.label } : { kind, label: REMOVED_LABEL };
    }

    return {
      id: raw.id,
      amount: { minor: raw.costMinor, currency: raw.currency, formatted: formatMinor(raw.costMinor, raw.currency) },
      home: costHome !== null ? { minor: costHome, currency: homeCurrency, formatted: formatMinor(costHome, homeCurrency) } : null,
      paid: isPaid ? { minor: raw.paidMinor ?? 0, formatted: formatMinor(raw.paidMinor ?? 0, raw.currency), on: paidOn! } : null,
      dueDate: isPaid ? null : dueDate,
      daysUntilDue,
      settlement: isOnTrip(raw.settlement) ? "on-the-trip" : "before-you-go",
      label: raw.label,
      category: effectiveCategory(budgetCost, itemCategoryById),
      owner,
    };
  });

  const filtered = mapped
    .filter((c) => !opts.unpaidOnly || c.paid === null)
    .filter(
      (c) =>
        opts.dueWithinDays === undefined ||
        (c.paid === null && c.dueDate !== null && c.daysUntilDue !== null && c.daysUntilDue <= opts.dueWithinDays),
    );

  return { homeCurrency, today, costs: filtered.sort(compareCosts) };
}
