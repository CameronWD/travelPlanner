import { canSeePackingItem, type PackingViewer } from "@/lib/packing-access";
import type { TravellerLike } from "@/lib/traveller";

export type PackingRow = {
  id: string;
  text: string;
  done: boolean;
  sortOrder: number;
  buy: string | null;
  ownerId: string | null;
  packedBy: TravellerLike | null;
};

export type PackingSections = {
  mine: PackingRow[];
  shared: PackingRow[];
  others: Array<{ traveller: TravellerLike & { id: string }; items: PackingRow[] }>;
  packed: number;
  total: number;
};

export function buildPackingSections(
  rows: PackingRow[],
  members: Array<TravellerLike & { id: string }>,
  v: PackingViewer,
): PackingSections {
  const visible = rows.filter((r) => canSeePackingItem(r.ownerId, v));
  const mine = visible.filter((r) => r.ownerId === v.userId);
  const shared = visible.filter((r) => r.ownerId === null);
  const others = v.open
    ? members
        .filter((m) => m.id !== v.userId)
        .map((traveller) => ({ traveller, items: visible.filter((r) => r.ownerId === traveller.id) }))
    : [];
  const counted = [...mine, ...shared];
  return { mine, shared, others, packed: counted.filter((r) => r.done).length, total: counted.length };
}
