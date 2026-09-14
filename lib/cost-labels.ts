/**
 * Shared owner-label logic for `Cost` rows: turns a cost's `ownerType`/`ownerId`
 * into a human-readable label by resolving it against the accommodation,
 * transport, and item it's attached to.
 *
 * Extracted from the budget page's inline `transportLabel` + `ownerName` map
 * (see git blame) so the budget page, both Homes phases, and the due-date
 * cron (Task 13) all label costs the same way.
 */

export interface CostLabelSources {
  items: { id: string; title: string }[];
  accommodations: { id: string; name: string }[];
  transports: { id: string; mode: string; depPlace: string | null; arrPlace: string | null }[];
}

/** Transport has no name of its own — label it by mode, with endpoints when both resolve. */
function transportLabel(t: { mode: string; depPlace: string | null; arrPlace: string | null }): string {
  const mode = t.mode.charAt(0).toUpperCase() + t.mode.slice(1).toLowerCase();
  if (t.depPlace && t.arrPlace) return `${mode} · ${t.depPlace} → ${t.arrPlace}`;
  return mode;
}

/** Build an ownerId → display-name map from every ownable plan entity. */
export function buildCostLabelMap(sources: CostLabelSources): Map<string, string> {
  return new Map<string, string>([
    ...sources.accommodations.map((a) => [a.id, a.name] as const),
    ...sources.transports.map((t) => [t.id, transportLabel(t)] as const),
    ...sources.items.map((i) => [i.id, i.title] as const),
  ]);
}

/** Generic fallback when a cost's owner entity can't be found in the map. */
const FALLBACK_BY_TYPE: Record<string, string> = {
  TRANSPORT: "Transport",
  ACCOMMODATION: "Accommodation",
  ITEM: "Activity",
};

/**
 * Resolve a single cost's display label.
 * - OTHER costs use their own free-text `label` (or "Other cost").
 * - Owned costs resolve through `ownerNames`, falling back to a generic
 *   label for the owner's type when the entity itself can't be found
 *   (e.g. it's been deleted).
 */
export function costLabel(
  cost: { ownerType: string; ownerId: string | null; label: string | null },
  ownerNames: Map<string, string>,
): string {
  if (cost.ownerType === "OTHER") return cost.label ?? "Other cost";
  const owned = cost.ownerId ? ownerNames.get(cost.ownerId) : undefined;
  return owned ?? FALLBACK_BY_TYPE[cost.ownerType] ?? "Cost";
}
