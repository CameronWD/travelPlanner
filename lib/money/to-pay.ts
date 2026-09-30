import { convertMinor } from "@/lib/money";
import { daysBetween, formatDayLabel, formatDayMonth } from "@/lib/dates";
import { isOnTrip } from "@/lib/enums";

export const TO_PAY_SOON_DAYS = 14;

export type DueTone = "overdue" | "soon" | "later" | "none" | "paid" | "legacy";

export interface ToPayInput {
  id: string;
  displayLabel: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  rateToHome: number | null;
  paidAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  settlement?: string;
}

export interface ToPayRow {
  id: string;
  label: string;
  ownerType: string;
  paid: boolean;
  legacy: boolean;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  foreign: boolean;
  originalMinor: number;
  homeMinor: number | null;
  dueLine: string;
  dueTone: DueTone;
  unpaidDueLine: string;
  unpaidDueTone: DueTone;
}

function unpaidDue(c: ToPayInput, today: string): { line: string; tone: DueTone } {
  if (c.dueDate) {
    const days = daysBetween(today, c.dueDate);
    if (days < 0) return { line: `Overdue · ${formatDayLabel(c.dueDate)}`, tone: "overdue" };
    return { line: `Due ${formatDayLabel(c.dueDate)}`, tone: days <= TO_PAY_SOON_DAYS ? "soon" : "later" };
  }
  if (isOnTrip(c.settlement)) {
    return { line: c.ownerType === "ACCOMMODATION" ? "Pay at check-in" : "Pay on the day", tone: "none" };
  }
  return { line: "", tone: "none" };
}

/**
 * One list for To pay (MONEY.md §4): unpaid (legacy included) first, soonest
 * due first and undated after in created order, then paid, newest first.
 * Paid is `paidAt` alone (ADR 0037).
 */
export function mergeToPay(
  costs: ToPayInput[],
  { today, homeCurrency }: { today: string; homeCurrency: string },
): ToPayRow[] {
  const home = homeCurrency.toUpperCase();
  const rows = costs.map((c, index) => {
    const paid = c.paidAt != null;
    const legacy = !paid && c.paidMinor != null;
    const originalMinor = paid ? (c.paidMinor ?? c.costMinor) : c.costMinor;
    const foreign = c.currency.toUpperCase() !== home;
    const homeMinor = !foreign
      ? originalMinor
      : c.rateToHome != null
        ? convertMinor(originalMinor, c.currency, home, c.rateToHome)
        : null;
    const u = unpaidDue(c, today);
    const paidISO = paid ? c.paidAt!.toISOString().slice(0, 10) : null;
    const due = paid
      ? { line: `Paid ${formatDayMonth(paidISO!)}`, tone: "paid" as const }
      : legacy
        ? { line: "Paid · date missing", tone: "legacy" as const }
        : u;
    const row: ToPayRow = {
      id: c.id,
      label: c.displayLabel,
      ownerType: c.ownerType,
      paid,
      legacy,
      costMinor: c.costMinor,
      paidMinor: c.paidMinor,
      currency: c.currency,
      foreign,
      originalMinor,
      homeMinor,
      dueLine: due.line,
      dueTone: due.tone,
      unpaidDueLine: u.line,
      unpaidDueTone: u.tone,
    };
    return { row, index, due: c.dueDate, paidAt: c.paidAt?.getTime() ?? 0 };
  });

  rows.sort((a, b) => {
    if (a.row.paid !== b.row.paid) return a.row.paid ? 1 : -1;
    if (a.row.paid) return b.paidAt - a.paidAt;
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : a.index - b.index;
    if (a.due) return -1;
    if (b.due) return 1;
    return a.index - b.index;
  });
  return rows.map((r) => r.row);
}
