import { NO_SURPRISES, type PlaceholderItem, type SurpriseVisibility } from "@/lib/surprise-visibility";
import type { SurpriseView } from "@/lib/surprise";

/** A surprised viewer's view of a live Surprise (lib/surprise.ts `surpriseView`). */
export const SURPRISED_VIEW: SurpriseView = {
  plannerId: "u-planner",
  plannerName: "Pat",
  forIds: ["u-viewer"],
  forNames: ["Viv"],
  youAreSurprised: true,
};

/**
 * Each `where` fragment is a distinct marker, so a reader's test can assert
 * the right fragment reached the right query (`expect.objectContaining({ AND: [...] })`).
 */
export const MARKER_WHERE = {
  item: { AND: [{ surpriseMarker: "item" }] },
  accommodation: { AND: [{ surpriseMarker: "accommodation" }] },
  reminder: { AND: [{ surpriseMarker: "reminder" }] },
  dayTitle: { AND: [{ surpriseMarker: "dayTitle" }] },
  note: { AND: [{ surpriseMarker: "note" }] },
  attachment: { AND: [{ surpriseMarker: "attachment" }] },
  cost: { AND: [{ surpriseMarker: "cost" }] },
  activity: { AND: [{ surpriseMarker: "activity" }] },
};

export function placeholderItem(o: Partial<PlaceholderItem> & { id: string }): PlaceholderItem {
  return {
    tripId: "trip-1",
    forkId: null,
    stopId: null,
    date: null,
    startTime: null,
    endTime: null,
    title: "Surprise",
    category: "OTHER",
    address: null,
    link: null,
    booking: null,
    notes: null,
    lat: null,
    lng: null,
    countryCode: null,
    hiddenFromShares: false,
    sortOrder: 0,
    photoAttachmentId: null,
    sourceItemId: null,
    bookingState: "NONE",
    bookingStateSet: false,
    bookBy: null,
    slotTime: null,
    arriveByMinutes: null,
    refundable: null,
    openingHours: null,
    surprise: SURPRISED_VIEW,
    ...o,
  };
}

/** A viewer surprised by `hiddenStopIds` and by the Items behind `placeholders`. */
export function hiddenVisibility(opts: {
  viewerId?: string;
  hiddenStopIds?: string[];
  placeholders?: PlaceholderItem[];
}): SurpriseVisibility {
  const hiddenStopIds = opts.hiddenStopIds ?? [];
  const placeholders = opts.placeholders ?? [];
  return {
    ...NO_SURPRISES,
    viewerId: opts.viewerId ?? "u-viewer",
    isEmpty: false,
    hiddenStopIds,
    hiddenRootItemIds: placeholders.map((p) => p.id),
    hiddenItemIds: placeholders.map((p) => p.id),
    hiddenRootIds: [...hiddenStopIds, ...placeholders.map((p) => p.id)],
    hiddenTargetIds: [...hiddenStopIds, ...placeholders.map((p) => p.id)],
    hiddenOwnerIds: placeholders.map((p) => p.id),
    placeholderItems: placeholders,
    views: {
      stops: new Map(hiddenStopIds.map((id) => [id, SURPRISED_VIEW])),
      items: new Map(placeholders.map((p) => [p.id, p.surprise])),
    },
    where: MARKER_WHERE,
  };
}
