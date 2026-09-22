import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/admin-notify";

export interface AccessRequestAttempt {
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * Record (or bump) an Access request from a refused sign-in attempt.
 *
 * The sign-in attempt IS the Access request: this is called from inside the
 * Auth.js `signIn` callback (lib/auth.ts), immediately before it returns
 * `false`, using Google's *verified* profile. There is deliberately no
 * public request form — a form would take typed input, and approving an
 * address nobody proved they control is a real hole.
 *
 * Unique on lowercased email, matching lib/allowlist.ts's `needle` — every
 * stored email on this branch is lowercased by the writer, never by a reader.
 *
 * A repeat attempt bumps `lastAttemptAt` and `attempts` only, and never
 * touches `status`: a dismissed request stays dismissed, or "dismiss" means
 * nothing and anyone declined can put themselves back at the top of the list
 * by clicking sign in again. Only a brand-new request notifies admins — a
 * repeat must not re-notify.
 *
 * Never throws: a failure here must not turn a clean refusal (the signIn
 * callback returning false) into a 500.
 */
export async function recordAccessRequest({
  email,
  name,
  image,
}: AccessRequestAttempt): Promise<void> {
  try {
    const needle = email.trim().toLowerCase();
    if (!needle) return;

    const existing = await db.accessRequest.findUnique({
      where: { email: needle },
    });

    if (existing) {
      await db.accessRequest.update({
        where: { id: existing.id },
        data: {
          lastAttemptAt: new Date(),
          attempts: existing.attempts + 1,
        },
      });
      return;
    }

    await db.accessRequest.create({
      data: {
        email: needle,
        name,
        image,
        status: "pending",
      },
    });

    await notifyAdmins(
      "New Access request",
      name ? `${name} (${needle}) asked to join TEEPEE.` : `${needle} asked to join TEEPEE.`,
      "/admin",
    );
  } catch (err) {
    console.error("[access-requests] recordAccessRequest failed:", err);
  }
}
