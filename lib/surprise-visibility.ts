/**
 * Surprise (CONTEXT.md): the server side. Every reader that renders a Trip —
 * pages, loaders, MCP reads, the digest, the calendar feed, the share page —
 * calls `loadSurpriseVisibility` first, then spreads its `where.*` fragments
 * into its own Prisma queries and (where it renders Stops) runs the result
 * through `maskSurpriseStops`. lib/surprise.ts holds the pure rules this
 * module queries the database to apply.
 */
import "server-only";
import { db } from "@/lib/db";
import {
  SURPRISE_SELECT, isSurprisedBy, surpriseState, surpriseView,
  type SurpriseView,
} from "@/lib/surprise";
import { TRAVELLER_SELECT } from "@/lib/traveller";

export interface PlaceholderItem {
  id: string;
  tripId: string;
  forkId: string | null;
  stopId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  title: "Surprise";
  category: "OTHER";
  address: null;
  link: null;
  booking: null;
  notes: null;
  lat: null;
  lng: null;
  countryCode: null;
  hiddenFromShares: boolean; // the real Item's flag, so a Share link can drop the slot too
  sortOrder: number;
  photoAttachmentId: null;
  sourceItemId: null;
  // Spec 2026-10-17 R2–R4: masked like the title — a Surprise is never "To book", ticketed or hours-bearing to its audience.
  bookingState: "NONE";
  bookingStateSet: false;
  bookBy: null;
  slotTime: null;
  arriveByMinutes: null;
  refundable: null;
  openingHours: null;
  // Spec 2026-10-17 R6: no Try list either — its entries would give the Surprise away.
  tryList: null;
  surprise: SurpriseView;
}

export interface SurpriseVisibility {
  viewerId: string | null;
  isEmpty: boolean;
  hiddenStopIds: string[]; // Surprise Stops the viewer may not see inside
  hiddenRootItemIds: string[]; // Surprise Items the viewer may not see inside
  hiddenItemIds: string[]; // roots + every Item whose stopId is a hidden Stop
  hiddenAccommodationIds: string[]; // every Accommodation whose stopId is a hidden Stop
  hiddenRootIds: string[]; // hiddenStopIds + hiddenRootItemIds (where.activity uses hiddenStopIds + hiddenItemIds)
  hiddenTargetIds: string[]; // stops + items + accommodations (Note/Attachment targetId)
  hiddenOwnerIds: string[]; // items + accommodations (Cost ownerId)
  placeholderItems: PlaceholderItem[]; // one per hidden root Item, masked
  /** Every *live* Surprise (hidden or not) as a view for the viewer, so the planner's badge can show. */
  views: { stops: Map<string, SurpriseView>; items: Map<string, SurpriseView> };
  where: {
    item: object;
    accommodation: object;
    reminder: object;
    dayTitle: object;
    note: object;
    attachment: object;
    cost: object;
    activity: object;
  };
}

const EMPTY_WHERE = {
  item: {}, accommodation: {}, reminder: {}, dayTitle: {}, note: {}, attachment: {}, cost: {}, activity: {},
};

export const NO_SURPRISES: SurpriseVisibility = {
  viewerId: null,
  isEmpty: true,
  hiddenStopIds: [],
  hiddenRootItemIds: [],
  hiddenItemIds: [],
  hiddenAccommodationIds: [],
  hiddenRootIds: [],
  hiddenTargetIds: [],
  hiddenOwnerIds: [],
  placeholderItems: [],
  views: { stops: new Map(), items: new Map() },
  where: EMPTY_WHERE,
};

/** `{ OR: [{ col: null }, { col: { notIn: ids } }] }` — a nullable FK is never "inside" a hidden id it doesn't hold. */
function nullableNotIn(col: string, ids: string[]) {
  return { OR: [{ [col]: null }, { [col]: { notIn: ids } }] };
}

/**
 * Loads what the viewer may not see on this Trip because of a live
 * Surprise, across every fork (no forkId filter — a reader that wants only
 * real-plan placeholders filters `placeholderItems` by `forkId === null`
 * itself). Runs two queries up front regardless of outcome (the pre-query),
 * then — only when something is actually hidden from this viewer — the
 * Items/Accommodations inside each hidden Stop.
 */
export async function loadSurpriseVisibility(
  tripId: string,
  viewerId: string | null,
  opts: { now?: Date } = {},
): Promise<SurpriseVisibility> {
  const now = opts.now ?? new Date();

  const [stops, items] = await Promise.all([
    db.stop.findMany({
      where: { tripId, surprisePlannerId: { not: null }, surpriseRevealedAt: null },
      select: { id: true, departDate: true, timezone: true, ...SURPRISE_SELECT },
    }),
    db.item.findMany({
      where: { tripId, surprisePlannerId: { not: null }, surpriseRevealedAt: null },
      select: {
        id: true, forkId: true, stopId: true, date: true, startTime: true, endTime: true, sortOrder: true,
        hiddenFromShares: true,
        ...SURPRISE_SELECT,
        stop: { select: { timezone: true } },
      },
    }),
  ]);

  const liveStops = stops.filter((s) => surpriseState(s, { endDate: s.departDate, timezone: s.timezone }, now) === "live");
  const liveItems = items.filter((i) => surpriseState(i, { endDate: i.date, timezone: i.stop?.timezone ?? null }, now) === "live");

  if (liveStops.length === 0 && liveItems.length === 0) {
    return { ...NO_SURPRISES, viewerId, views: { stops: new Map(), items: new Map() } };
  }

  const members = (await db.tripMember.findMany({ where: { tripId }, select: { user: { select: TRAVELLER_SELECT } } })).map((m) => m.user);

  const views = {
    stops: new Map(liveStops.map((s) => [s.id, surpriseView(s, { endDate: s.departDate, timezone: s.timezone }, viewerId, members, now)!])),
    items: new Map(liveItems.map((i) => [i.id, surpriseView(i, { endDate: i.date, timezone: i.stop?.timezone ?? null }, viewerId, members, now)!])),
  };

  const hiddenStops = liveStops.filter((s) => isSurprisedBy(s, { endDate: s.departDate, timezone: s.timezone }, viewerId, now));
  const hiddenRootItems = liveItems.filter((i) => isSurprisedBy(i, { endDate: i.date, timezone: i.stop?.timezone ?? null }, viewerId, now));

  if (hiddenStops.length === 0 && hiddenRootItems.length === 0) {
    return { ...NO_SURPRISES, viewerId, views };
  }

  const hiddenStopIds = hiddenStops.map((s) => s.id);

  // Membership is by stopId only: a dated Item with stopId null is never
  // inside a Surprise Stop, even when its date falls inside the Stop's
  // range — so this query filters by stopId, never by date.
  const [insideItems, insideAccs] = hiddenStopIds.length
    ? await Promise.all([
        db.item.findMany({ where: { tripId, stopId: { in: hiddenStopIds } }, select: { id: true } }),
        db.accommodation.findMany({ where: { tripId, stopId: { in: hiddenStopIds } }, select: { id: true } }),
      ])
    : [[], []];

  const hiddenRootItemIds = hiddenRootItems.map((i) => i.id);
  const hiddenItemIds = Array.from(new Set([...hiddenRootItemIds, ...insideItems.map((i) => i.id)]));
  const hiddenAccommodationIds = insideAccs.map((a) => a.id);
  const hiddenRootIds = [...hiddenStopIds, ...hiddenRootItemIds];
  const hiddenTargetIds = [...hiddenStopIds, ...hiddenItemIds, ...hiddenAccommodationIds];
  const hiddenOwnerIds = [...hiddenItemIds, ...hiddenAccommodationIds];

  const placeholderItems: PlaceholderItem[] = hiddenRootItems
    .filter((i) => !hiddenStopIds.includes(i.stopId ?? ""))
    .map((i) => ({
      id: i.id,
      tripId,
      forkId: i.forkId,
      stopId: i.stopId,
      date: i.date,
      startTime: i.startTime,
      endTime: i.endTime,
      title: "Surprise" as const,
      category: "OTHER" as const,
      address: null,
      link: null,
      booking: null,
      notes: null,
      lat: null,
      lng: null,
      countryCode: null,
      hiddenFromShares: i.hiddenFromShares,
      sortOrder: i.sortOrder,
      photoAttachmentId: null,
      sourceItemId: null,
      bookingState: "NONE" as const,
      bookingStateSet: false as const,
      bookBy: null,
      slotTime: null,
      arriveByMinutes: null,
      refundable: null,
      openingHours: null,
      tryList: null,
      surprise: views.items.get(i.id)!,
    }));

  return {
    viewerId,
    isEmpty: false,
    hiddenStopIds,
    hiddenRootItemIds,
    hiddenItemIds,
    hiddenAccommodationIds,
    hiddenRootIds,
    hiddenTargetIds,
    hiddenOwnerIds,
    placeholderItems,
    views,
    where: {
      item: { AND: [nullableNotIn("stopId", hiddenStopIds), { id: { notIn: hiddenRootItemIds } }] },
      accommodation: { AND: [{ stopId: { notIn: hiddenStopIds } }] },
      // F8: a Reminder about a hidden Stop or a hidden Item (a Surprise Item, or
      // any Item inside a hidden Stop) is hidden. Transport is outside every
      // Surprise, so a Reminder about a leg never is.
      reminder: { AND: [nullableNotIn("stopId", hiddenStopIds), nullableNotIn("itemId", hiddenItemIds)] },
      dayTitle: { AND: [{ stopId: { notIn: hiddenStopIds } }] },
      note: { AND: [{ targetId: { notIn: hiddenTargetIds } }] },
      attachment: { AND: [nullableNotIn("targetId", hiddenTargetIds)] },
      cost: { AND: [nullableNotIn("ownerId", hiddenOwnerIds)] },
      // Every hidden Item, not only the roots: a Surprise Item inside a hidden
      // Stop stamps its rows with itself, and those must stay hidden from a
      // Traveller surprised only by the Stop (or once the Item is revealed
      // while the Stop is still live).
      activity: { AND: [nullableNotIn("surpriseOfId", [...hiddenStopIds, ...hiddenItemIds])] },
    },
  };
}

/**
 * Blanks the inside-ish Stop fields (notes) of hidden Stops, and attaches
 * `surprise` — the view for every live Surprise Stop (planner view or
 * surprised view), null for a Stop that isn't one — so the planner's badge
 * can show even where nothing is hidden.
 */
export function maskSurpriseStops<T extends { id: string; notes?: string | null }>(
  stops: T[],
  v: SurpriseVisibility,
  views: Map<string, SurpriseView>,
): Array<T & { surprise: SurpriseView | null }> {
  const hidden = new Set(v.hiddenStopIds);
  return stops.map((s) => ({
    ...s,
    ...(hidden.has(s.id) && "notes" in s ? { notes: null } : {}),
    surprise: views.get(s.id) ?? null,
  }));
}
