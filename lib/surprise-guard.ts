/**
 * Surprise (CONTEXT.md) write side: which live Surprise is this thing inside
 * (the Stop, or the Item itself), and refuse a surprised viewer with
 * notFound() exactly as a non-member would be refused. Server-only; uses db.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SURPRISE_SELECT, isSurprisedBy, surpriseState, type SurpriseColumns, type SurpriseOver } from "@/lib/surprise";

export type SurpriseRoot = { type: "STOP" | "ITEM"; id: string };
export type SurpriseRef =
  | { stopId: string | null | undefined }
  | { itemId: string }
  | { accommodationId: string }
  | { target: { targetType: string; targetId: string | null | undefined } }
  | { costOwner: { ownerType: string; ownerId: string | null | undefined } };

/**
 * `root` is the innermost live Surprise (the Item when it is live, else its
 * Stop); `layers` are every live Surprise the thing is inside, so a Surprise
 * Item inside a Surprise Stop refuses a viewer surprised by either.
 */
type Layer = { row: SurpriseColumns; over: SurpriseOver };
type Hit = { root: SurpriseRoot; layers: Layer[] };

const STOP_SELECT = { id: true, departDate: true, timezone: true, ...SURPRISE_SELECT } as const;

async function stopRoot(stopId: string, now: Date): Promise<Hit | null> {
  const stop = await db.stop.findUnique({ where: { id: stopId }, select: STOP_SELECT });
  if (!stop) return null;
  const over = { endDate: stop.departDate, timezone: stop.timezone };
  return surpriseState(stop, over, now) === "live" ? { root: { type: "STOP", id: stop.id }, layers: [{ row: stop, over }] } : null;
}

async function itemRoot(itemId: string, now: Date): Promise<Hit | null> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, stopId: true, date: true, ...SURPRISE_SELECT, stop: { select: { timezone: true } } },
  });
  if (!item) return null;
  const over = { endDate: item.date, timezone: item.stop?.timezone ?? null };
  const stopHit = item.stopId ? await stopRoot(item.stopId, now) : null;
  if (surpriseState(item, over, now) === "live") {
    return { root: { type: "ITEM", id: item.id }, layers: [{ row: item, over }, ...(stopHit?.layers ?? [])] };
  }
  return stopHit;
}

async function resolve(ref: SurpriseRef, now: Date): Promise<Hit | null> {
  if ("stopId" in ref) return ref.stopId ? stopRoot(ref.stopId, now) : null;
  if ("itemId" in ref) return itemRoot(ref.itemId, now);
  if ("accommodationId" in ref) {
    const acc = await db.accommodation.findUnique({ where: { id: ref.accommodationId }, select: { stopId: true } });
    return acc?.stopId ? stopRoot(acc.stopId, now) : null;
  }
  if ("target" in ref) {
    const { targetType, targetId } = ref.target;
    if (!targetId) return null;
    if (targetType === "STOP") return stopRoot(targetId, now);
    if (targetType === "ITEM") return itemRoot(targetId, now);
    if (targetType === "ACCOMMODATION") return resolve({ accommodationId: targetId }, now);
    return null;
  }
  const { ownerType, ownerId } = ref.costOwner;
  if (!ownerId) return null;
  if (ownerType === "ITEM") return itemRoot(ownerId, now);
  if (ownerType === "ACCOMMODATION") return resolve({ accommodationId: ownerId }, now);
  return null;
}

/** The live Surprise the referenced thing is inside (the Stop, or the Item itself), or null. */
export async function surpriseRootFor(ref: SurpriseRef, now = new Date()): Promise<SurpriseRoot | null> {
  return (await resolve(ref, now))?.root ?? null;
}

/** notFound() when `viewerId` is surprised by the Surprise the thing is inside; otherwise returns that root (or null) so the caller can stamp its Activity. */
export async function requireOutsideSurprise(viewerId: string, ref: SurpriseRef, now = new Date()): Promise<SurpriseRoot | null> {
  const hit = await resolve(ref, now);
  if (!hit) return null;
  if (hit.layers.some((l) => isSurprisedBy(l.row, l.over, viewerId, now))) notFound();
  return hit.root;
}

/** For CREATED/UPDATED/NOTED rows, where the entity still exists. Deletes pass `surpriseOf` explicitly. */
export async function surpriseRootForEntity(entityType: string, entityId: string | null, now = new Date()): Promise<SurpriseRoot | null> {
  if (!entityId) return null;
  switch (entityType) {
    case "STOP":
      return surpriseRootFor({ stopId: entityId }, now);
    case "ITEM":
      return surpriseRootFor({ itemId: entityId }, now);
    case "ACCOMMODATION":
      return surpriseRootFor({ accommodationId: entityId }, now);
    case "COST": {
      const c = await db.cost.findUnique({ where: { id: entityId }, select: { ownerType: true, ownerId: true } });
      return c ? surpriseRootFor({ costOwner: c }, now) : null;
    }
    case "NOTE": {
      const n = await db.note.findUnique({ where: { id: entityId }, select: { targetType: true, targetId: true } });
      return n ? surpriseRootFor({ target: n }, now) : null;
    }
    case "ATTACHMENT": {
      const a = await db.attachment.findUnique({ where: { id: entityId }, select: { targetType: true, targetId: true } });
      return a ? surpriseRootFor({ target: a }, now) : null;
    }
    case "REMINDER": {
      const r = await db.reminder.findUnique({ where: { id: entityId }, select: { stopId: true, itemId: true } });
      if (!r) return null;
      return surpriseRootFor(r.itemId ? { itemId: r.itemId } : { stopId: r.stopId }, now);
    }
    case "DAY_TITLE": {
      const d = await db.dayTitle.findUnique({ where: { id: entityId }, select: { stopId: true } });
      return d ? surpriseRootFor({ stopId: d.stopId }, now) : null;
    }
    default:
      return null;
  }
}

/**
 * The ids of everything inside a Surprise, as Activity.entityId holds them:
 * for a Stop, the Stop, its Items, Accommodations, Day titles and Reminders
 * about it or its Items, the Notes and Attachments on any of those, and the
 * Costs of its Items and Accommodations; for an Item, the Item, its Notes,
 * Attachments, Reminders and the Costs it owns. setSurprise stamps the
 * Activity already written about them.
 */
export async function insideSurpriseEntityIds(kind: SurpriseRoot["type"], id: string): Promise<string[]> {
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  let owners = [id];
  let targets = [id];
  let rest: string[] = [];
  if (kind === "STOP") {
    const byStop = { where: { stopId: id }, select: { id: true } } as const;
    const [items, accs, dayTitles, reminders] = await Promise.all([
      db.item.findMany(byStop),
      db.accommodation.findMany(byStop),
      db.dayTitle.findMany(byStop),
      db.reminder.findMany({ where: { OR: [{ stopId: id }, { item: { stopId: id } }] }, select: { id: true } }),
    ]);
    owners = [...ids(items), ...ids(accs)];
    targets = [id, ...owners];
    rest = [...ids(dayTitles), ...ids(reminders)];
  } else {
    rest = ids(await db.reminder.findMany({ where: { itemId: id }, select: { id: true } }));
  }
  const [notes, attachments, costs] = await Promise.all([
    db.note.findMany({ where: { targetId: { in: targets } }, select: { id: true } }),
    db.attachment.findMany({ where: { targetId: { in: targets } }, select: { id: true } }),
    owners.length ? db.cost.findMany({ where: { ownerId: { in: owners } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  return [...new Set([...targets, ...rest, ...ids(notes), ...ids(attachments), ...ids(costs)])];
}
