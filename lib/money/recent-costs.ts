interface RecentCandidate {
  paidAt: Date | null;
  createdAt?: Date | null;
}

export function recentCosts<T extends RecentCandidate>(costs: readonly T[], limit = 5): T[] {
  return costs
    .map((c, index) => ({ c, index, at: (c.paidAt ?? c.createdAt)?.getTime() ?? 0 }))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .slice(0, limit)
    .map((x) => x.c);
}
