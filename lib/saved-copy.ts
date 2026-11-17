import type { Route } from "next";
import { formatDayLabel, isDateWithin } from "@/lib/dates";
import { SAVED_COPY_MESSAGE } from "@/lib/offline";
import { tripPath } from "@/lib/trip-path";
import { instantToZonedDateISO } from "@/lib/tz";

export interface SavedCopyInput {
  renderedToday: string;
  zone: string;
  now: Date;
  servedAsSavedCopy: boolean;
}

// A page is never rendered ahead of the real date, so a device date before the
// rendered one is a skewed device clock, not a saved copy.
export function savedCopyState({ renderedToday, zone, now, servedAsSavedCopy }: SavedCopyInput): {
  stale: boolean;
  deviceToday: string;
} {
  const deviceToday = instantToZonedDateISO(now, zone);
  return { stale: servedAsSavedCopy || deviceToday > renderedToday, deviceToday };
}

export interface SavedCopyLineInput {
  tripRef: string;
  startDate: string | null;
  endDate: string | null;
  renderedToday: string;
  deviceToday: string;
}

export interface SavedCopyLineContent {
  text: string;
  linkText: string | null;
  href: Route | null;
}

export function savedCopyLineContent({
  tripRef,
  startDate,
  endDate,
  renderedToday,
  deviceToday,
}: SavedCopyLineInput): SavedCopyLineContent {
  if (deviceToday <= renderedToday) {
    return { text: "Saved copy. Reload when you're back online", linkText: null, href: null };
  }
  const inTrip = startDate !== null && endDate !== null && isDateWithin(deviceToday, startDate, endDate);
  return {
    text: `Saved ${formatDayLabel(renderedToday)}.`,
    linkText: "Open today",
    href: inTrip ? tripPath(tripRef, `/day/${deviceToday}`) : tripPath(tripRef),
  };
}

export function isSavedCopyMessage(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === SAVED_COPY_MESSAGE;
}

export function savedCopyAnswer(data: unknown): boolean {
  return typeof data === "object" && data !== null && (data as { savedCopy?: unknown }).savedCopy === true;
}
