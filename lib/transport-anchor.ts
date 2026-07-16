export const HEAD_SLOT = "__head__";

export interface AnchorStopLike {
  id: string;
}
export interface AnchorTransportLike {
  id: string;
  anchorStopId?: string | null;
  fromStopId?: string | null;
  toStopId?: string | null;
  sortOrder: number;
}

export function resolveTransportSlot(
  t: AnchorTransportLike,
  orderedStops: readonly AnchorStopLike[],
): string {
  const has = (id: string | null | undefined): id is string =>
    Boolean(id) && orderedStops.some((s) => s.id === id);

  if (has(t.anchorStopId)) return t.anchorStopId;
  if (has(t.fromStopId)) return t.fromStopId;
  if (has(t.toStopId)) {
    const idx = orderedStops.findIndex((s) => s.id === t.toStopId);
    return idx > 0 ? orderedStops[idx - 1].id : HEAD_SLOT;
  }
  return HEAD_SLOT;
}

export function groupTransportsBySlot<T extends AnchorTransportLike>(
  transports: readonly T[],
  orderedStops: readonly AnchorStopLike[],
  excludeIds?: ReadonlySet<string>,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of transports) {
    if (excludeIds?.has(t.id)) continue;
    const slot = resolveTransportSlot(t, orderedStops);
    const arr = map.get(slot) ?? [];
    arr.push(t);
    map.set(slot, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }
  return map;
}
