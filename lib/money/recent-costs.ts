import { formatISODate } from "@/lib/dates";

interface RecentCandidate {
  paidAt: Date | null;
  createdAt?: Date | null;
}

// Sort day is the paid day, or the day it was added when unpaid or paid in the
// future; same-day Costs go later-added first.
export function recentCosts<T extends RecentCandidate>(costs: readonly T[], limit = 5, today?: string): T[] {
  return costs
    .map((c, index) => {
      const paid = c.paidAt ? formatISODate(c.paidAt) : null;
      const created = c.createdAt ? formatISODate(c.createdAt) : "";
      const day = paid && (!today || paid <= today) ? paid : created;
      return { c, index, day, at: c.createdAt?.getTime() ?? 0 };
    })
    .sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1) || b.at - a.at || b.index - a.index)
    .slice(0, limit)
    .map((x) => x.c);
}
