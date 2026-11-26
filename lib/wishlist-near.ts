import { haversineKm } from "@/lib/geo";
import { EPSILON_KM, NEAR_STOP_KM } from "@/lib/schedule-day-options";

export const ALL = "all";
export const ELSEWHERE = "elsewhere";

export type WishlistChip = { key: string; label: string; count: number };

export type WishlistNear = {
  chips: WishlistChip[];
  nearLabel: Map<string, string>;
  inChip(ideaId: string, chipKey: string): boolean;
};

type Coords = { lat?: number | null; lng?: number | null };

export function wishlistNear(
  ideas: readonly ({ id: string } & Coords)[],
  stops: readonly ({ id: string; name: string } & Coords)[],
): WishlistNear {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  const chipOrder: string[] = [];
  for (const s of located) {
    const key = `near:${s.name}`;
    if (!chipOrder.includes(key)) chipOrder.push(key);
  }

  const members = new Map<string, Set<string>>();
  const nearLabel = new Map<string, string>();
  const elsewhere = new Set<string>();

  for (const idea of ideas) {
    let nearest: { name: string; km: number } | null = null;
    if (idea.lat != null && idea.lng != null) {
      const point = { lat: idea.lat, lng: idea.lng };
      for (const s of located) {
        const km = haversineKm(point, { lat: s.lat!, lng: s.lng! });
        if (km > NEAR_STOP_KM + EPSILON_KM) continue;
        const key = `near:${s.name}`;
        if (!members.has(key)) members.set(key, new Set());
        members.get(key)!.add(idea.id);
        if (!nearest || km < nearest.km) nearest = { name: s.name, km };
      }
    }
    if (nearest) nearLabel.set(idea.id, `Near ${nearest.name}`);
    else elsewhere.add(idea.id);
  }

  const nearChips = chipOrder
    .filter((key) => members.has(key))
    .map((key) => ({ key, label: `Near ${key.slice("near:".length)}`, count: members.get(key)!.size }));

  const chips: WishlistChip[] =
    nearChips.length === 0
      ? []
      : [
          { key: ALL, label: "All", count: ideas.length },
          ...nearChips,
          ...(elsewhere.size > 0 ? [{ key: ELSEWHERE, label: "Elsewhere", count: elsewhere.size }] : []),
        ];

  return {
    chips,
    nearLabel,
    inChip(ideaId, chipKey) {
      if (chipKey === ALL) return true;
      if (chipKey === ELSEWHERE) return elsewhere.has(ideaId);
      return members.get(chipKey)?.has(ideaId) ?? false;
    },
  };
}
