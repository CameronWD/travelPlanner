export function refreshOrder<T extends { endDate: string | null }>(trips: T[], today: string): T[] {
  const live = (t: T) => t.endDate === null || t.endDate >= today;
  return [...trips.filter(live), ...trips.filter((t) => !live(t))];
}
