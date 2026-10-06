/**
 * Cover-photo aspect helpers (spec F — cmuj4l1d9).
 *
 * `Trip.coverAspect` stores width/height for the trip's cover photo: set at
 * upload time by `server/actions/cover.ts` (via `lib/image-size.ts`'s
 * `readImageSize`), backfilled for older covers by the operator-run
 * `scripts/backfill-cover-aspect.ts`. A portrait cover gets a different
 * trips-list card layout (`components/trip/trip-card.tsx`) and a different
 * Home countdown treatment (Task 12) — both key off `isPortrait` so the two
 * surfaces can't disagree about what counts as portrait.
 */

/** Below this width/height ratio, a cover counts as portrait. */
const PORTRAIT_ASPECT_THRESHOLD = 0.9;

/**
 * True when `aspect` (width/height) is portrait enough to warrant the
 * portrait treatment. `null`/`undefined` — the aspect isn't known yet, e.g.
 * a not-yet-backfilled older cover — is never portrait; callers fall back to
 * their own detection (the trips-list card's client-side check on the trip
 * Home tile) or the plain landscape layout.
 */
export function isPortrait(aspect: number | null | undefined): boolean {
  if (aspect == null) return false;
  return aspect < PORTRAIT_ASPECT_THRESHOLD;
}

/**
 * Spec 2026-10-05 §I: on a phone (below sm) the Trip Home shows an uploaded
 * portrait photo whole, in a small frame beside the trip name, instead of the
 * full-width band. Needs a photo AND a known portrait aspect — no photo
 * (generated art) or an unknown/landscape/square aspect keeps the band.
 */
export function showsPortraitCoverFrame(trip: { coverImageKey: string | null; coverAspect: number | null | undefined }): boolean {
  return trip.coverImageKey != null && isPortrait(trip.coverAspect);
}

/** Spec 2026-10-06 §H: where a cover's ~480px WebP copy lives, beside the large one. */
export function coverSmallKeyFor(key: string): string {
  return `${key}-sm`;
}

/** Spec 2026-10-06 §H: a cover request for this many CSS px or fewer gets the small copy. */
export const COVER_SMALL_MAX_WIDTH = 600;
