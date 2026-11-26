import { daysBetween, formatDayLabel, formatDayMonth, formatISODate } from "@/lib/dates";
import { isOnTrip } from "@/lib/enum-values";
import { shownCost } from "@/lib/money/cost-row";
import { paidCurrencyOf, toHome } from "@/lib/money/paid-currency";
import { refundState } from "@/lib/money/refund";

const TO_PAY_SOON_DAYS = 14;

export type DueTone = "overdue" | "soon" | "later" | "none" | "paid" | "legacy";

export interface ToPayInput {
  id: string;
  displayLabel: string;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  paidCurrency?: string | null;
  rateToHome: number | null;
  paidAt: Date | null;
  refundMinor: number | null;
  refundedAt: Date | null;
  dueDate: string | null;
  ownerType: string;
  settlement?: string;
}

export interface ToPayRow {
  id: string;
  label: string;
  ownerType: string;
  paid: boolean;
  /** YYYY-MM-DD the Cost was paid; null while unpaid. */
  paidOn: string | null;
  legacy: boolean;
  costMinor: number;
  paidMinor: number | null;
  currency: string;
  /** The currency of `originalMinor`: the paid currency once paid with an amount, else the Cost's. Absent reads as `currency`. */
  shownCurrency?: string;
  /** As stored; null = the Cost's own. A Refund is in `paidCurrency ?? currency`. */
  paidCurrency?: string | null;
  foreign: boolean;
  originalMinor: number;
  homeMinor: number | null;
  /** The Refund as entered; `originalMinor`/`homeMinor` above are already net of a received one. */
  refund: { minor: number; homeMinor: number | null; state: "expected" | "received"; on: string | null } | null;
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
    const { minor: originalMinor, currency: shownCurrency } = shownCost(c);
    const foreign = shownCurrency !== home;
    const ownRate = (from: string) => (from === c.currency.toUpperCase() ? c.rateToHome : null);
    const homeMinor = toHome(originalMinor, shownCurrency, home, ownRate(shownCurrency));
    const refundCurrency = paidCurrencyOf(c);
    const state = refundState(c);
    const refund: ToPayRow["refund"] =
      paid && state !== "none"
        ? {
            minor: c.refundMinor!,
            homeMinor: toHome(c.refundMinor!, refundCurrency, home, ownRate(refundCurrency)),
            state,
            on: c.refundedAt ? formatISODate(c.refundedAt) : null,
          }
        : null;
    const u = unpaidDue(c, today);
    const paidISO = paid ? formatISODate(c.paidAt!) : null;
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
      paidOn: paidISO,
      legacy,
      costMinor: c.costMinor,
      paidMinor: c.paidMinor,
      currency: c.currency,
      shownCurrency,
      paidCurrency: c.paidCurrency ?? null,
      foreign,
      originalMinor,
      homeMinor,
      refund,
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
