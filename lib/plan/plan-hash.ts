export interface PlanHash {
  open: string[];
  day: string | null;
  stopTarget: string | null;
}

const EMPTY: PlanHash = { open: [], day: null, stopTarget: null };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A `#stop-<id>` deep link wins over `#open=/&day=` (PLAN.md §D6): it opens and targets that stop. */
export function parsePlanHash(hash: string): PlanHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.startsWith("stop-")) {
    const id = raw.slice(5).split("&")[0];
    return id ? { open: [id], day: null, stopTarget: id } : EMPTY;
  }
  if (!raw.startsWith("open=") && !raw.includes("&day=") && !raw.startsWith("day=")) return EMPTY;
  const params = new URLSearchParams(raw);
  const open = [...new Set((params.get("open") ?? "").split(",").filter(Boolean))];
  const day = params.get("day");
  return { open, day: day && ISO.test(day) ? day : null, stopTarget: null };
}

export function serializePlanHash({ open, day }: { open: readonly string[]; day: string | null }): string {
  const parts: string[] = [];
  if (open.length > 0) parts.push(`open=${open.join(",")}`);
  if (day) parts.push(`day=${day}`);
  return parts.join("&");
}

/**
 * PLAN.md §3 fold state: the stop currently being travelled through (an
 * arrival "wins" a same-day changeover), else the first stop with any
 * plans, else nothing opens by default.
 */
export function defaultOpenStops(
  stops: readonly { id: string; arriveDate: string | null; departDate: string | null }[],
  planCounts: Readonly<Record<string, number>>,
  today: string,
): string[] {
  const dated = stops.filter((s) => s.arriveDate && s.departDate);
  const current =
    dated.find((s) => s.arriveDate! <= today && today < s.departDate!) ??
    dated.find((s) => s.arriveDate! <= today && today <= s.departDate!);
  if (current) return [current.id];
  const planned = stops.find((s) => (planCounts[s.id] ?? 0) > 0);
  return planned ? [planned.id] : [];
}
