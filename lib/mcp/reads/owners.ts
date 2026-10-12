/**
 * Shared owner-naming helper for Claude-connection reads that point at
 * something else in the trip (Costs: spec 2026-10-11 Task 2; Attachments:
 * Tasks 3-4). Resolves a batch of owner refs against the REAL PLAN only: a
 * ref whose row is missing, or whose row exists but is on a What-if plan
 * (Fork), is left out of `owners` — callers decide what that means (Costs
 * show "(removed)"; Attachments exclude fork-owned rows entirely).
 *
 * Fork detection: each owner table is queried by `{ tripId, id: { in: ids } }`
 * (no `forkId` in the where — REAL_PLAN is never assumed), selecting
 * `forkId` too, then split in memory by `forkId === null`. This is
 * deliberate: a plain `{ ...REAL_PLAN }` filter would make a fork-owned row
 * indistinguishable from a missing one, and callers need to tell those apart
 * (Review Focus 3 vs 4).
 */
import { db } from "@/lib/db";
import { formatDayLabel } from "@/lib/dates";

export type OwnerKind = "TRIP" | "STOP" | "ACCOMMODATION" | "TRANSPORT" | "ITEM" | "OTHER";

export interface OwnerRef {
  kind: OwnerKind;
  id: string | null;
}

export interface McpOwner {
  kind: OwnerKind;
  id: string | null;
  label: string;
  /** The owner's Stop, when it has one (Transport: its from-Stop). */
  stopId: string | null;
}

export const REMOVED_LABEL = "(removed)";

export function ownerKey(kind: OwnerKind, id: string): string {
  return `${kind}:${id}`;
}

function uniqueIds(refs: OwnerRef[], kind: OwnerKind): string[] {
  return Array.from(new Set(refs.filter((r) => r.kind === kind && r.id).map((r) => r.id as string)));
}

/** "home" / the Stop's name / a free-text place / "?" — the app's Transport-endpoint naming rule. */
function transportEndLabel(
  isHome: boolean,
  stopId: string | null,
  place: string | null,
  stopNameById: Map<string, string>,
): string {
  if (isHome) return "home";
  if (stopId) return stopNameById.get(stopId) ?? "?";
  if (place) return place;
  return "?";
}

export async function loadOwners(
  tripId: string,
  refs: OwnerRef[],
): Promise<{ owners: Map<string, McpOwner>; forkOwned: Set<string> }> {
  const owners = new Map<string, McpOwner>();
  const forkOwned = new Set<string>();

  const stopIds = uniqueIds(refs, "STOP");
  const accommodationIds = uniqueIds(refs, "ACCOMMODATION");
  const transportIds = uniqueIds(refs, "TRANSPORT");
  const itemIds = uniqueIds(refs, "ITEM");

  const [stopRows, accommodationRows, transportRows, itemRows] = await Promise.all([
    stopIds.length
      ? db.stop.findMany({ where: { tripId, id: { in: stopIds } }, select: { id: true, name: true, forkId: true } })
      : Promise.resolve([]),
    accommodationIds.length
      ? db.accommodation.findMany({
          where: { tripId, id: { in: accommodationIds } },
          select: { id: true, name: true, stopId: true, forkId: true },
        })
      : Promise.resolve([]),
    transportIds.length
      ? db.transport.findMany({
          where: { tripId, id: { in: transportIds } },
          select: {
            id: true,
            fromStopId: true,
            toStopId: true,
            depIsHome: true,
            arrIsHome: true,
            depPlace: true,
            arrPlace: true,
            forkId: true,
          },
        })
      : Promise.resolve([]),
    itemIds.length
      ? db.item.findMany({
          where: { tripId, id: { in: itemIds } },
          select: { id: true, title: true, stopId: true, date: true, forkId: true },
        })
      : Promise.resolve([]),
  ]);

  // Stop names needed for labels: the directly-referenced Stops, plus every
  // Stop an Accommodation/Transport/Item above points at (which may not have
  // been requested as an owner ref in its own right).
  const neededStopIds = new Set<string>(stopIds);
  for (const a of accommodationRows) if (a.stopId) neededStopIds.add(a.stopId);
  for (const t of transportRows) {
    if (t.fromStopId) neededStopIds.add(t.fromStopId);
    if (t.toStopId) neededStopIds.add(t.toStopId);
  }
  for (const i of itemRows) if (i.stopId) neededStopIds.add(i.stopId);

  const stopNameRows =
    neededStopIds.size > 0
      ? await db.stop.findMany({ where: { tripId, id: { in: Array.from(neededStopIds) } }, select: { id: true, name: true } })
      : [];
  const stopNameById = new Map(stopNameRows.map((s) => [s.id, s.name]));

  for (const s of stopRows) {
    const key = ownerKey("STOP", s.id);
    if (s.forkId !== null) {
      forkOwned.add(key);
      continue;
    }
    owners.set(key, { kind: "STOP", id: s.id, label: `Stop: ${s.name}`, stopId: s.id });
  }

  for (const a of accommodationRows) {
    const key = ownerKey("ACCOMMODATION", a.id);
    if (a.forkId !== null) {
      forkOwned.add(key);
      continue;
    }
    const stopName = a.stopId ? (stopNameById.get(a.stopId) ?? "?") : null;
    const label = stopName ? `Accommodation: ${a.name} at ${stopName}` : `Accommodation: ${a.name}`;
    owners.set(key, { kind: "ACCOMMODATION", id: a.id, label, stopId: a.stopId ?? null });
  }

  for (const t of transportRows) {
    const key = ownerKey("TRANSPORT", t.id);
    if (t.forkId !== null) {
      forkOwned.add(key);
      continue;
    }
    const from = transportEndLabel(t.depIsHome, t.fromStopId, t.depPlace, stopNameById);
    const to = transportEndLabel(t.arrIsHome, t.toStopId, t.arrPlace, stopNameById);
    owners.set(key, { kind: "TRANSPORT", id: t.id, label: `Transport: ${from} → ${to}`, stopId: t.fromStopId ?? null });
  }

  for (const i of itemRows) {
    const key = ownerKey("ITEM", i.id);
    if (i.forkId !== null) {
      forkOwned.add(key);
      continue;
    }
    const stopName = i.stopId ? stopNameById.get(i.stopId) : null;
    let label = `Thing to do: ${i.title}`;
    if (stopName) label += ` at ${stopName}`;
    if (i.date) label += `, ${formatDayLabel(i.date)}`;
    if (!stopName && !i.date) label += " (Wishlist)";
    owners.set(key, { kind: "ITEM", id: i.id, label, stopId: i.stopId ?? null });
  }

  // TRIP owners carry no row of their own to look up or fork-check — the
  // trip itself has no forkId, and access to it was already verified by the
  // caller's requireTripAccess before loadOwners was reached.
  for (const ref of refs) {
    if (ref.kind === "TRIP" && ref.id) {
      owners.set(ownerKey("TRIP", ref.id), { kind: "TRIP", id: ref.id, label: "Trip", stopId: null });
    }
  }

  return { owners, forkOwned };
}
