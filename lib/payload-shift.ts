import { addDays, daysBetween, nightsBetween } from "./dates";
import { stopForDate } from "./itinerary";

/**
 * ADR 0038: a Stop's payload rides with it. Slotted Items keep their offset
 * from the arrive date (un-slotting when the day no longer fits the stay);
 * Accommodation check-in/out shift by the arrive-date delta. Pure date math —
 * the server action applies the returned shifts and keeps the pre-images for
 * Undo.
 */

export interface ItemShift {
  id: string;
  date: string | null;
  prevDate: string;
  /** Set only when the Item is re-filed onto a different Stop (ADR 0055). */
  stopId?: string;
  /**
   * The owning Stop the re-file moved the Item OFF, so Undo can put the Cost
   * back on the Budget line it came from. Set only alongside `stopId`, and
   * only when the caller supplied the Item's current `stopId` to shift from.
   */
  prevStopId?: string;
}

/** The minimum a Stop must expose to be asked whether it covers a day. */
export interface CoveringStop {
  id: string;
  arriveDate: string;
  departDate: string;
}

export interface AccommodationShift {
  id: string;
  checkIn: string;
  checkOut: string;
  prevCheckIn: string;
  prevCheckOut: string;
}

export interface PayloadShiftResult {
  items: ItemShift[];
  accommodations: AccommodationShift[];
}

export function shiftItemDates(
  items: readonly { id: string; date: string | null; stopId?: string | null }[],
  oldArrive: string,
  newArrive: string,
  newDepart: string,
  coveringStops: readonly CoveringStop[] = [],
): ItemShift[] {
  const shifts: ItemShift[] = [];
  const maxOffset = nightsBetween(newArrive, newDepart);
  // ADR 0055 extends rule 4 into the un-slot path ONLY where this Stop's
  // arrive date has not moved — i.e. it shortened away from a day the Item
  // still sits on, and that day is still that day. When the whole Stop moves,
  // every Item's date moves with it (ADR 0038) and an Item that falls off the
  // end has no calendar day left to be re-filed by; stranding it on the old
  // dates, re-filed onto an unrelated Stop, is worse than un-slotting.
  const dateIsUnmoved = newArrive === oldArrive;
  for (const item of items) {
    if (item.date == null) continue;
    const offset = daysBetween(oldArrive, item.date);
    const next = offset < 0 || offset > maxOffset ? null : addDays(newArrive, offset);
    if (next === null && dateIsUnmoved) {
      const owner = stopForDate(coveringStops, item.date);
      if (owner) {
        shifts.push({
          id: item.id,
          date: item.date,
          prevDate: item.date,
          stopId: owner.id,
          // Only when the caller told us where the Item came from; absent it,
          // the shift is still applied, just not reversible by owner.
          ...(item.stopId ? { prevStopId: item.stopId } : {}),
        });
        continue;
      }
    }
    if (next !== item.date) shifts.push({ id: item.id, date: next, prevDate: item.date });
  }
  return shifts;
}

export function shiftAccommodationDates(
  accommodations: readonly { id: string; checkIn: string; checkOut: string }[],
  deltaDays: number,
): AccommodationShift[] {
  if (deltaDays === 0) return [];
  return accommodations.map((a) => ({
    id: a.id,
    checkIn: addDays(a.checkIn, deltaDays),
    checkOut: addDays(a.checkOut, deltaDays),
    prevCheckIn: a.checkIn,
    prevCheckOut: a.checkOut,
  }));
}
