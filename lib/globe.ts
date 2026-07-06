import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";

/**
 * True for a Prisma unique-constraint violation (P2002). Checked structurally
 * (by `code`) rather than via `instanceof` so it stays driver-adapter-agnostic
 * and trivially mockable in tests.
 */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Return the id of the Globe this user belongs to, or null. */
export async function getUserGlobe(userId: string): Promise<{ id: string } | null> {
  const membership = await db.globeMember.findUnique({
    where: { userId },
    select: { globeId: true },
  });
  return membership ? { id: membership.globeId } : null;
}

/**
 * Return the user's Globe, lazily creating one (with the user as owner) if they
 * don't have one yet. A user belongs to at most one Globe (ADR 0023).
 *
 * If a concurrent request created the membership first, the unique constraint on
 * GlobeMember.userId trips (P2002); we recover by re-reading.
 */
export async function getOrCreateUserGlobe(userId: string): Promise<{ id: string }> {
  const existing = await getUserGlobe(userId);
  if (existing) return existing;

  try {
    const globe = await db.globe.create({
      data: {
        createdById: userId,
        members: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    return { id: globe.id };
  } catch (err) {
    // Only treat a Prisma unique-constraint violation (P2002) as a recoverable
    // create-race. Any other error is rethrown immediately.
    if (!isUniqueConstraintError(err)) throw err;
    // Lost a create race — the other request made the membership. Re-read.
    const now = await getUserGlobe(userId);
    if (now) return now;
    throw err;
  }
}

/**
 * Gate for Globe routes/actions: require an authed user and return their Globe,
 * creating it on first access.
 */
export async function requireGlobeAccess(): Promise<{
  user: { id: string };
  globe: { id: string };
}> {
  const user = await requireUser();
  const globe = await getOrCreateUserGlobe(user.id);
  return { user: { id: user.id }, globe };
}
