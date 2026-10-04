/**
 * Traveller display identity — display name, initials, and photo URL.
 *
 * A Traveller who has set neither a display name nor a Profile photo is
 * shown by what their sign-in provided (their Google picture and name), then
 * by initials; a name or photo the Traveller set is never overwritten by
 * signing in again (CONTEXT.md "Profile photo and display name"). These
 * helpers are the single place that resolution order lives — every place
 * that shows a Traveller (avatar, name beside a Note/Vote/Journal entry)
 * reads through them rather than reimplementing the fallback chain.
 */

export interface TravellerLike {
  id: string;
  name: string | null;
  image: string | null;
  displayName?: string | null;
  photoKey?: string | null;
  photoUpdatedAt?: Date | null;
  photoFocalX?: number | null;
  photoFocalY?: number | null;
  email?: string | null;
}

/** Prisma `select` for the fields these helpers read. Add `email` yourself when it's needed (not every caller has it, or should). */
export const TRAVELLER_SELECT = {
  id: true,
  name: true,
  image: true,
  displayName: true,
  photoKey: true,
  photoUpdatedAt: true,
  photoFocalX: true,
  photoFocalY: true,
} as const;

/** displayName → provider name → email local-part → "Traveller". */
export function travellerName(u: TravellerLike): string {
  const displayName = u.displayName?.trim();
  if (displayName) return displayName;

  const name = u.name?.trim();
  if (name) return name;

  const email = u.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }

  return "Traveller";
}

/**
 * True when nothing names this Traveller but their email: no display name
 * they set and no name from their sign-in (a Sign-in link carries none).
 * Such a Traveller is asked for a display name and cannot skip it
 * (CONTEXT.md "Profile photo and display name"; spec 2026-10-04 §E).
 */
export function needsDisplayName(u: Pick<TravellerLike, "name" | "displayName">): boolean {
  return !u.displayName?.trim() && !u.name?.trim();
}

/** The first word of `travellerName`. */
export function travellerFirstName(u: TravellerLike): string {
  return travellerName(u).split(/\s+/)[0]!;
}

/**
 * The Traveller's photo: an uploaded Profile photo (served through
 * `/api/avatars/:id`, so access is checked and the storage key never leaks)
 * beats the sign-in provider's picture, which beats nothing. `photoUpdatedAt`
 * is baked into the URL as a cache-buster so replacing/removing a photo is
 * visible immediately rather than waiting out a cached image.
 */
export function travellerImageUrl(u: TravellerLike): string | null {
  if (u.photoKey) {
    const v = u.photoUpdatedAt ? u.photoUpdatedAt.getTime() : 0;
    return `/api/avatars/${u.id}?v=${v}`;
  }
  if (u.image) return u.image;
  return null;
}

/** CSS object-position for the Traveller's Profile photo: the chosen focus point, or the centre. */
export function travellerImagePosition(u: TravellerLike): string {
  const x = u.photoFocalX ?? 0.5;
  const y = u.photoFocalY ?? 0.5;
  return `${x * 100}% ${y * 100}%`;
}

/** Up to 2 letters of `travellerName`; "?" if none. */
export function travellerInitials(u: TravellerLike): string {
  const words = travellerName(u)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const initials = words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return initials || "?";
}
