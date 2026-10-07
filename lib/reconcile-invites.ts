import { cache } from "react";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { acceptPendingGlobeInvitesForUser } from "@/lib/globe-invites";

/**
 * An Invite becomes membership when the matching person is signed in. The
 * Auth.js signIn event only fires on a fresh login, so an already-logged-in
 * partner would never join — the shells reconcile on every app-load too.
 * Idempotent and best-effort (ADR 0017).
 *
 * cache()d per request: layouts and pages render in parallel, so a page that
 * reads membership (New trip's firstTrip) awaits this itself, and the
 * layout's call and the page's call share one run.
 */
export const reconcilePendingInvites = cache(async (userId: string, email: string) => {
  // Independent tables (TripMember, GlobeMember), each best-effort with its
  // own try/catch — so in parallel (spec 2026-10-06 §C).
  await Promise.all([
    acceptPendingInvitesForUser(userId, email),
    acceptPendingGlobeInvitesForUser(userId, email),
  ]);
});
