import { feedbackSite } from "@/lib/feedback/site";
import type { UsageSite } from "./lists";
import type { UsageInput } from "./validate";

export type UsageRow = UsageInput & { userId: string; site: UsageSite };

const MAX_BATCH_TRIPS = 5;

export function usageSite(env: Record<string, string | undefined> = process.env): UsageSite {
  const site = feedbackSite(env);
  return site === "main" || site === "beta" || site === "local" ? site : "preview";
}

export function batchTripIds(records: readonly UsageInput[]): string[] {
  const ids: string[] = [];
  for (const { tripId } of records) {
    if (tripId !== null && !ids.includes(tripId)) ids.push(tripId);
  }
  return ids.slice(0, MAX_BATCH_TRIPS);
}

export function prepareUsageRows(
  records: readonly UsageInput[],
  ctx: { userId: string; site: UsageSite; memberTripIds: ReadonlySet<string>; surprisedTripIds: ReadonlySet<string> },
): UsageRow[] {
  const allowed = new Set(batchTripIds(records).filter((id) => ctx.memberTripIds.has(id)));
  const rows: UsageRow[] = [];
  for (const r of records) {
    if (r.tripId !== null && !allowed.has(r.tripId)) continue;
    rows.push({
      screen: r.screen,
      action: r.action,
      detail: r.detail,
      userId: ctx.userId,
      tripId: r.tripId,
      phase: r.phase,
      mode: r.mode,
      site: ctx.site,
      appearMs: r.appearMs,
      savedCopy: r.savedCopy,
      // Spec §2: which days a Traveller opens could give away a Surprise hidden
      // from them, so their offsets on that Trip go; the day-change method stays.
      dayOffset: r.tripId !== null && ctx.surprisedTripIds.has(r.tripId) ? null : r.dayOffset,
      occurredAt: r.occurredAt,
    });
  }
  return rows;
}
