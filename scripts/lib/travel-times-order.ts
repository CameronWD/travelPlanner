export function refreshOrder<T extends { endDate: string | null }>(trips: T[], today: string): T[] {
  const live = (t: T) => t.endDate === null || t.endDate >= today;
  return [...trips.filter(live), ...trips.filter((t) => !live(t))];
}

export function parseRefreshArgs(args: string[]): { execute: boolean; cap?: number } | { error: string } {
  const execute = args.includes("--execute");
  const at = args.indexOf("--cap");
  if (at === -1) return { execute };
  if (!execute) return { error: "--cap only applies with --execute." };
  const raw = args[at + 1];
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return { error: "--cap needs a positive whole number, e.g. --cap 500." };
  return { execute, cap: Number(raw) };
}

export function googleRefusing(run: { fetched: number; failed: number }): boolean {
  return run.failed > 0 && run.fetched === 0;
}
