import type { MarkerView } from "@/components/globe/types";

/** The Wishlist-Item field values derived from a Globe Marker (ADR 0025). */
export interface WishlistItemSeed {
  title: string;
  category: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  link: string | null;
  notes: string | null;
}

/**
 * Map a Globe Marker onto the fields of a new unscheduled Wishlist Item.
 *
 * - `address` joins city + country (whichever are present), or null.
 * - `notes` = the Marker's note, with its rough `timing` folded in as
 *   "(when: …)" so the loose wish-timing isn't lost (the Item has no timing
 *   field). The copy is thereafter independent of the Marker.
 */
export function markerToWishlistItemData(marker: MarkerView): WishlistItemSeed {
  const address =
    [marker.city, marker.country].filter((v): v is string => Boolean(v)).join(", ") || null;

  const timingLine = marker.timing ? `(when: ${marker.timing})` : null;
  const notes =
    marker.note && timingLine
      ? `${marker.note}\n${timingLine}`
      : marker.note ?? timingLine;

  return {
    title: marker.title,
    category: marker.category,
    lat: marker.lat,
    lng: marker.lng,
    address,
    link: marker.link,
    notes,
  };
}
