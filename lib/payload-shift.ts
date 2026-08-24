import { addDays, daysBetween, nightsBetween } from "./dates";

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
  items: readonly { id: string; date: string | null }[],
  oldArrive: string,
  newArrive: string,
  newDepart: string,
): ItemShift[] {
  const shifts: ItemShift[] = [];
  const maxOffset = nightsBetween(newArrive, newDepart);
  for (const item of items) {
    if (item.date == null) continue;
    const offset = daysBetween(oldArrive, item.date);
    const next = offset < 0 || offset > maxOffset ? null : addDays(newArrive, offset);
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
