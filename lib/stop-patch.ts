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
 *    row's — unless the patch says where (TU-02) or the row has none — and
 *    is otherwise UNCHOSEN_TIMEZONE, so `updateStop` derives it from the
 *    final point and country (`resolveStopTimezone`, F3).
 *  - The point (lat/lng/countryCode/region/placeId) is the row's unless the patch
 *    says where (a country, countryCode, lat, lng or placeId that differs
 *    from the row's, or a country sent with a new name); then only the
 *    patch's point counts and `updateStop` geocodes a missing one.
 *  - The Chapter (rough only): the patch's (`null` = none), else the row's.
 *
 * The refusals name tool fields; no form can send them (spec 3.L notes).
 * Pure: no Prisma, no zod (types only).
 */
import type { ActionFailure } from "@/lib/action-result";
import type { StopInput } from "@/lib/validations/stop";
import { nightsBetween } from "@/lib/dates";
import { patched } from "@/lib/patch";
import { UNCHOSEN_TIMEZONE } from "@/lib/tz";

export type StopPatch = {
  mode?: "rough" | "scheduled";
  name?: string;
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  localTravelMode?: "DRIVE" | "TRANSIT" | null;
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
  region?: string | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  localTravelMode?: string | null;
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

  // Forms resend the whole Stop, so only a value that differs from the row's
  // says where — else every save of an unchanged place would re-bill a lookup.
  // A sent country says where on a rename too: typing a new name re-locates.
  // Text compares trimmed and case-blind (zod trims later); a place ID is case-sensitive.
  const text = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() || null : (v ?? null));
  const differs = (sent: unknown, row: unknown) => sent !== undefined && text(sent) !== text(row);
  const renamed = differs(patch.name, current.name);
  const newPlaceId = patch.placeId !== undefined && (patch.placeId || null) !== current.placeId;
  const saysWhere =
    (patch.country !== undefined && (renamed || differs(patch.country, current.country))) ||
    [differs(patch.countryCode, current.countryCode), differs(patch.lat, current.lat), differs(patch.lng, current.lng), newPlaceId].some(Boolean);
  // A rename that keeps the point (today's rule) is no longer that place: its ID goes.
  const point = saysWhere
    ? { countryCode: patch.countryCode ?? undefined, region: patch.region ?? undefined, lat: patch.lat ?? undefined, lng: patch.lng ?? undefined, placeId: patch.placeId ?? undefined }
    : { countryCode: current.countryCode ?? undefined, region: current.region ?? undefined, lat: current.lat ?? undefined, lng: current.lng ?? undefined, placeId: renamed ? undefined : (current.placeId ?? undefined) };
  const notes = patched(patch.notes, current.notes);
  const localTravelMode = patched(patch.localTravelMode, current.localTravelMode);
  const place = {
    name: patch.name ?? current.name,
    country: patched(patch.country, current.country),
    ...Object.fromEntries(Object.entries(point).filter(([, v]) => v !== undefined)),
    ...(notes !== undefined ? { notes } : {}),
    ...(localTravelMode !== undefined ? { localTravelMode } : {}),
  };

  if (mode === "scheduled") {
    // The schema refuses a missing date (a mode: "scheduled" patch on a rough Stop with no dates).
    const arriveDate = (patch.arriveDate ?? current.arriveDate ?? undefined) as string;
    const departDate = (patch.departDate ?? current.departDate ?? undefined) as string;
    // TU-02: a patch that says where moves the Stop, so the row's zone no longer applies.
    const timezone = patch.timezone ?? (saysWhere ? undefined : current.timezone) ?? UNCHOSEN_TIMEZONE;
    return { mode, ...place, timezone, arriveDate, departDate } as StopInput;
  }

  const nights = patch.nights ?? current.nights ?? undefined;
  if (nights === undefined) return NIGHTS_REQUIRED;
  const chapterId = patched(patch.chapterId, current.chapterId);
  return { mode, ...place, nights, ...(chapterId !== undefined ? { chapterId } : {}) } as StopInput;
}
