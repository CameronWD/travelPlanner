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

/**
 * Whether "Before {first Stop}" can hold for a leg with these endpoints. The
 * head is stored as no anchor (null), and a null-anchor leg is placed by the
 * endpoint fallback above — so the head only holds where that fallback lands
 * on it: no from-Stop, arriving at the first Stop or at no Stop at all.
 */
export function canSitBeforeFirstStop(
  t: { fromStopId?: string | null; toStopId?: string | null },
  orderedStops: readonly AnchorStopLike[],
): boolean {
  return (
    resolveTransportSlot({ id: "", sortOrder: 0, fromStopId: t.fromStopId, toStopId: t.toStopId }, orderedStops) ===
    HEAD_SLOT
  );
}

/**
 * The anchor a leg is created with (spec 2026-10-04 §D): the slot it would
 * resolve to — its own anchor while that still names one of `orderedStops`,
 * else the endpoint fallback — with the head stored as null.
 */
export function creationAnchor(
  t: { anchorStopId?: string | null; fromStopId?: string | null; toStopId?: string | null },
  orderedStops: readonly AnchorStopLike[],
): string | null {
  const slot = resolveTransportSlot(
    { id: "", sortOrder: 0, anchorStopId: t.anchorStopId, fromStopId: t.fromStopId, toStopId: t.toStopId },
    orderedStops,
  );
  return slot === HEAD_SLOT ? null : slot;
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
