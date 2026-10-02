import { travellerFirstName, travellerName, type TravellerLike } from "@/lib/traveller";

export interface ShareTraveller {
  id: string;
  name: string;
  firstName: string;
  image: string | null;
  focalX: number | null;
  focalY: number | null;
  /** Only with the link's Contact details dial on (spec 2026-10-02 §E); absent otherwise. */
  mobile?: string | null;
  travelNumber?: string | null;
}

/**
 * A Traveller as a Share link may show them (ADR 0051 amendment 2026-09-30):
 * display name always, photo only when the link's showTravellers is on, and
 * an uploaded photo only via the link-scoped route — /api/avatars needs a
 * session a Share visitor never has. `email` is stripped before naming so
 * travellerName can never fall back to its local-part.
 */
export function shareTraveller(u: TravellerLike, opts: { token: string; showPhoto: boolean; contacts?: { mobile: string | null; travelNumber: string | null } }): ShareTraveller {
  const named = { ...u, email: null };
  let image: string | null = null;
  if (opts.showPhoto) {
    if (u.photoKey) {
      const v = u.photoUpdatedAt ? new Date(u.photoUpdatedAt).getTime() : 0;
      image = `/share/${opts.token}/traveller-photo/${u.id}?v=${v}`;
    } else {
      image = u.image ?? null;
    }
  }
  return {
    id: u.id,
    name: travellerName(named),
    firstName: travellerFirstName(named),
    image,
    // A focal point implies an uploaded photo, so it is dial-gated too.
    focalX: opts.showPhoto ? u.photoFocalX ?? null : null,
    focalY: opts.showPhoto ? u.photoFocalY ?? null : null,
    ...(opts.contacts ? { mobile: opts.contacts.mobile, travelNumber: opts.contacts.travelNumber } : {}),
  };
}

/** Feeds `TravellerAvatar`: `photoKey: null`, so `travellerImageUrl` returns the link-scoped `image`, never `/api/avatars`. */
export function avatarInput(t: ShareTraveller): TravellerLike {
  return { id: t.id, name: t.name, displayName: null, image: t.image, photoKey: null, photoFocalX: t.focalX, photoFocalY: t.focalY };
}
