/**
 * How a later Review recognises a Finding it raised before (spec 2026-10-17
 * R10, "matched by category + target"). The target is its id, else its day,
 * else the Trip ("-"). A restated Flag adds its own Flag id (stable across
 * runs), because two Flags can share a category and target: Before opening
 * and After closing on one Item, a Packed and a Spread-out day.
 */
import type { FindingDraft } from "@/lib/review/types";

export function findingKey(d: Pick<FindingDraft, "category" | "targetType" | "targetId" | "date" | "flagId">): string {
  const parts: string[] = [d.category, d.targetType, d.targetId ?? d.date ?? "-"];
  if (d.flagId) parts.push(d.flagId);
  return parts.join("|");
}

/**
 * The restated Flag's id a key carries (spec 2026-10-18 A4), or null for a
 * key without one (a model Finding's). Everything from the 4th segment on;
 * Flag ids never contain "|", so this is the id findingKey appended.
 */
export function flagIdOfKey(key: string): string | null {
  const parts = key.split("|");
  return parts.length < 4 ? null : parts.slice(3).join("|");
}
