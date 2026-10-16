import { db } from "@/lib/db";

/**
 * Per-Traveller reads the app shell's server components need (spec
 * 2026-10-14 Q8: components never import lib/db). Each returns null for a
 * row that has gone missing; the callers then render nothing.
 */

/** The What's new stamp and the sign-up date — `unreadReleaseNotes` (lib/release-notes.ts) needs both. */
export function readWhatsNewSeen(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { whatsNewSeenAt: true, createdAt: true } });
}

/** The first-sign-in Welcome stamp and both names (`needsDisplayName`, lib/traveller.ts). */
export function readWelcomeState(userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { welcomeSeenAt: true, name: true, displayName: true } });
}
