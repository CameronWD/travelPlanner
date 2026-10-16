import { db } from "@/lib/db";
import { tripPath } from "@/lib/trip-path";
import { serializePlanHash } from "@/lib/plan/plan-hash";
import type { TargetType } from "@/lib/enum-values";
import type { FileOwner } from "@/lib/attachment-view";

export interface OwnerRef {
  targetType: TargetType;
  targetId: string | null;
}

export const REMOVED_OWNER: FileOwner = { label: "(removed)", href: null };

export function ownerKey(targetType: TargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * Files is the Trip's complete index (CONTEXT.md "Attachment"; spec
 * 2026-10-02 §C): every non-Trip file names its owner and links to where
 * it lives. One query per owner type, scoped to the Trip and to the ids
 * actually present, plus one for Transport endpoints. An owner that no
 * longer exists is simply absent — the page shows REMOVED_OWNER.
 */
export async function loadFileOwners(tripId: string, ref: string, refs: OwnerRef[]): Promise<Map<string, FileOwner>> {
  const idsOf = (type: TargetType) =>
    refs.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId as string);

  const [stops, items, transports, accommodations] = await Promise.all([
    db.stop.findMany({ where: { tripId, id: { in: idsOf("STOP") } }, select: { id: true, name: true } }),
    db.item.findMany({ where: { tripId, id: { in: idsOf("ITEM") } }, select: { id: true, title: true, date: true, stopId: true } }),
    db.transport.findMany({ where: { tripId, id: { in: idsOf("TRANSPORT") } }, select: { id: true, fromStopId: true, toStopId: true } }),
    db.accommodation.findMany({ where: { tripId, id: { in: idsOf("ACCOMMODATION") } }, select: { id: true, name: true, stopId: true } }),
  ]);

  const legStopIds = transports.flatMap((t) => [t.fromStopId, t.toStopId]).filter((id): id is string => Boolean(id));
  const legStops =
    legStopIds.length > 0
      ? await db.stop.findMany({ where: { tripId, id: { in: legStopIds } }, select: { id: true, name: true } })
      : [];
  const stopName = new Map([...stops, ...legStops].map((s) => [s.id, s.name] as const));

  const planWith = (stopId: string | null | undefined) =>
    stopId ? tripPath(ref, `/plan#${serializePlanHash({ open: [stopId], day: null })}`) : tripPath(ref, "/plan");

  const owners = new Map<string, FileOwner>();
  for (const s of stops) owners.set(ownerKey("STOP", s.id), { label: s.name, href: planWith(s.id) });
  for (const i of items) {
    owners.set(ownerKey("ITEM", i.id), {
      label: i.title,
      href: i.date ? tripPath(ref, `/day/${i.date}`) : i.stopId ? planWith(i.stopId) : tripPath(ref, "/wishlist"),
    });
  }
  for (const t of transports) {
    // A leg with no Stop at one end (home-departure / return-home, or a Stop
    // since removed) names the end it has — never a bare "?" (LA-162).
    const from = t.fromStopId ? stopName.get(t.fromStopId) : undefined;
    const to = t.toStopId ? stopName.get(t.toStopId) : undefined;
    const label = from && to ? `${from} → ${to}` : to ? `→ ${to}` : from ? `${from} →` : "Transport";
    owners.set(ownerKey("TRANSPORT", t.id), { label, href: planWith(t.fromStopId) });
  }
  for (const a of accommodations) owners.set(ownerKey("ACCOMMODATION", a.id), { label: a.name, href: planWith(a.stopId) });
  for (const r of refs) {
    if (r.targetType === "JOURNAL" && r.targetId) {
      owners.set(ownerKey("JOURNAL", r.targetId), { label: `Journal · ${r.targetId}`, href: tripPath(ref, "/journal") });
    }
  }
  return owners;
}
