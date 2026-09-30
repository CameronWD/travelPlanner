/**
 * Shared stop/thing-to-do shapes for the plan page. Moved here (verbatim)
 * from components/trip/stop-card.tsx, which re-exports them until Task 16
 * deletes the old file.
 */

import type { ItemCardItem } from "@/components/trip/item-card";
import type { StopDayItem } from "@/lib/stop-days";

export interface StopCardStop {
  id: string;
  name: string;
  country?: string | null;
  /** Null for rough (date-less) stops. */
  timezone: string | null;
  /** Null for rough (date-less) stops. */
  arriveDate: string | null;
  /** Null for rough (date-less) stops. */
  departDate: string | null;
  /** Rough nights estimate; null once scheduled. */
  nights: number | null;
  /** Whether the (scheduled) stop's dates are pinned. */
  pinned: boolean;
  /** Explicit chapter membership (used while rough); null when unassigned. */
  chapterId: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  sortOrder: number;
}

/** A minimal representation of a thing-to-do (plan-owned Item with date:null) */
export interface ThingToDo {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
  stopId?: string | null;
  /** CONTEXT.md "Share link" — never leaves via a share link (ADR 0051 floor); still fully visible to every Traveller. */
  hiddenFromShares?: boolean;
  /** CONTEXT.md "Item photo" (spec §I) — resolved by the loader via `lib/item-photo.ts`'s `itemPhotoUrl`. Null/absent = no photo. */
  photoUrl?: string | null;
}

/** The edit dialog's item shape from a day row or an idea (moved from components/trip/stop-day-list.tsx). */
export function toItemCardItem(it: StopDayItem | ThingToDo): ItemCardItem {
  return {
    id: it.id,
    title: it.title,
    category: it.category,
    date: it.date ?? null,
    startTime: it.startTime ?? null,
    endTime: it.endTime ?? null,
    address: it.address ?? null,
    link: it.link ?? null,
    booking: it.booking ?? null,
    notes: it.notes ?? null,
    stopId: it.stopId ?? null,
    hiddenFromShares: it.hiddenFromShares ?? false,
    photoUrl: it.photoUrl ?? null,
  };
}
