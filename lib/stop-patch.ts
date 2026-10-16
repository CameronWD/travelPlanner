/**
 * A Stop's PATCH rules (ADR 0075, spec 2026-10-14 card 3.L): what a partial
 * update of a Stop means, for `updateStop`. A form's save (it always names
 * its mode and sends the whole Stop) runs through the same rules and comes
 * out as it went in.
 *
 *  - Mode: the patch's; else both dates → scheduled, nights with no dates on
 *    a scheduled Stop → rough (as `make_stop_rough`), else unchanged.
 *  - A lone date merges with the other on a scheduled Stop and is refused
 *    on one that ends up rough; nights sent with both dates must agree.
 *  - A timezone only applies to a scheduled result; none sent keeps the
 *    row's, else `stopTimezone` from the country.
 *  - The point (lat/lng/countryCode) is the row's unless the patch says
 *    where (country, countryCode, lat or lng); then only the patch's point
 *    counts and `updateStop` geocodes a missing one.
 *  - The Chapter (rough only): the patch's (`null` = none), else the row's.
 *
 * The refusals name tool fields; no form can send them (spec 3.L notes).
 * Pure: no Prisma, no zod (types only).
 */
import type { ActionFailure } from "@/lib/action-result";
import type { StopInput } from "@/lib/validations/stop";
import { nightsBetween } from "@/lib/dates";
import { patched } from "@/lib/patch";
import { stopTimezone } from "@/lib/tz";

export type StopPatch = {
  mode?: "rough" | "scheduled";
  name?: string;
  country?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  nights?: number;
  chapterId?: string | null;
  arriveDate?: string;
  departDate?: string;
  timezone?: string;
};

export type StopPatchRow = {
  name: string;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  nights: number | null;
  arriveDate: string | null;
  departDate: string | null;
  timezone: string | null;
  chapterId: string | null;
};

const refusal = (field: string, message: string): ActionFailure => ({ success: false, errors: { [field]: [message] } });

export const NIGHTS_REQUIRED = refusal("nights", "Nights is required for a rough stop.");
export const LONE_DATE = refusal("arriveDate", "Pass both arriveDate and departDate to schedule a Stop.");
export const TIMEZONE_ON_ROUGH = refusal(
  "timezone",
  "A timezone only applies to a Stop with dates. Pass arriveDate and departDate too, or leave timezone out.",
);

/** `nights` alongside both dates must agree with them; the dates win otherwise, so a mismatch would be dropped. */
export function nightsMismatch(nights: number | undefined, arriveDate: string, departDate: string): ActionFailure | null {
  if (nights === undefined) return null;
  const covered = nightsBetween(arriveDate, departDate);
  if (nights === covered) return null;
  return refusal("nights", `Those dates cover ${covered} nights, not ${nights}. Pass matching nights, or leave nights out.`);
}

export function mergeStopPatch(current: StopPatchRow, patch: StopPatch): StopInput | ActionFailure {
  const hasArrive = patch.arriveDate !== undefined;
  const hasDepart = patch.departDate !== undefined;
  const bothDates = hasArrive && hasDepart;
  const wasScheduled = current.arriveDate != null;
  const mode = patch.mode ?? (bothDates || (wasScheduled && patch.nights === undefined) ? "scheduled" : "rough");

  if (mode === "rough" && hasArrive !== hasDepart) return LONE_DATE;
  if (mode === "rough" && patch.timezone !== undefined) return TIMEZONE_ON_ROUGH;
  if (bothDates) {
    const mismatch = nightsMismatch(patch.nights, patch.arriveDate as string, patch.departDate as string);
    if (mismatch) return mismatch;
  }

  const saysWhere = [patch.country, patch.countryCode, patch.lat, patch.lng].some((v) => v !== undefined);
  const point = saysWhere
    ? { countryCode: patch.countryCode ?? undefined, lat: patch.lat ?? undefined, lng: patch.lng ?? undefined }
    : { countryCode: current.countryCode ?? undefined, lat: current.lat ?? undefined, lng: current.lng ?? undefined };
  const notes = patched(patch.notes, current.notes);
  const place = {
    name: patch.name ?? current.name,
    country: patched(patch.country, current.country),
    ...Object.fromEntries(Object.entries(point).filter(([, v]) => v !== undefined)),
    ...(notes !== undefined ? { notes } : {}),
  };

  if (mode === "scheduled") {
    // The schema refuses a missing date (a mode: "scheduled" patch on a rough Stop with no dates).
    const arriveDate = (patch.arriveDate ?? current.arriveDate ?? undefined) as string;
    const departDate = (patch.departDate ?? current.departDate ?? undefined) as string;
    const timezone = patch.timezone ?? current.timezone ?? stopTimezone({ countryCode: point.countryCode, country: place.country });
    return { mode, ...place, timezone, arriveDate, departDate } as StopInput;
  }

  const nights = patch.nights ?? current.nights ?? undefined;
  if (nights === undefined) return NIGHTS_REQUIRED;
  const chapterId = patched(patch.chapterId, current.chapterId);
  return { mode, ...place, nights, ...(chapterId !== undefined ? { chapterId } : {}) } as StopInput;
}
