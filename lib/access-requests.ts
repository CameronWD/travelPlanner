import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/admin-notify";

export interface AccessRequestAttempt {
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * True for a Prisma unique-constraint violation (P2002). Checked structurally
 * (by `code`) rather than via `instanceof` so it stays driver-adapter-agnostic
 * and trivially mockable in tests — same idiom as lib/globe.ts, lib/invites.ts.
 *
 * Exported (unlike the other four structurally-identical copies of this
 * function in the repo) so server/actions/access-requests.ts — the nearest
 * caller, in the same domain — can reuse it for `approveAccessRequest`'s
 * idempotent `AllowedEmail` create, rather than adding a sixth copy.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
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
 * REOPENING (final fix wave, I2). There is one repeat that must not be a
 * silent bump: someone who was approved and has since been **revoked**.
 * `listAccessRequests` filters on `resolvedAt: null`, so their row — resolved
 * at approval time — never comes back into `/admin`, which has no reopen
 * control and no add-an-address control either. They were stranded and
 * invisible: signing in again did nothing anyone could see, forever, with raw
 * SQL as the only way back. So a repeat attempt reopens the row (clears
 * `resolvedAt`) and notifies, but ONLY when all three hold:
 *
 *   1. the row is resolved (an open row is already in `/admin`, and
 *      re-notifying on every retry would be a self-service push primitive);
 *   2. `status !== "dismissed"` — dismiss must keep meaning dismissed, which
 *      is the whole reason repeats don't touch `status`;
 *   3. the address is not currently in `AllowedEmail` — the row was resolved
 *      by an approval whose grant is gone, i.e. genuinely revoked, rather
 *      than an approval that still stands.
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
      // Revoked-and-invisible check — see REOPENING in the docblock (I2).
      // The AllowedEmail lookup only runs for a resolved, non-dismissed row,
      // so the ordinary repeat still costs exactly one write.
      const reopen =
        existing.resolvedAt != null &&
        existing.status !== "dismissed" &&
        (await db.allowedEmail.findUnique({
          where: { email: needle },
          select: { id: true },
        })) === null;

      await db.accessRequest.update({
        where: { id: existing.id },
        data: {
          lastAttemptAt: new Date(),
          // Atomic increment (fix round 1, item 4) rather than a
          // read-modify-write off the row `findUnique` just returned —
          // that read is stale the instant a concurrent attempt for the
          // same address lands between the read and this write.
          attempts: { increment: 1 },
          // `status` is still never touched: reopening restores visibility,
          // it does not rewrite the audit trail of what was decided.
          ...(reopen ? { resolvedAt: null } : {}),
        },
      });

      if (reopen) {
        await notifyAdmins(
          "Access request reopened",
          name
            ? `${name} (${needle}) tried to sign in again — their access is no longer on the allowlist.`
            : `${needle} tried to sign in again — their access is no longer on the allowlist.`,
          "/admin",
        );
      }
      return;
    }

    try {
      await db.accessRequest.create({
        data: {
          email: needle,
          name,
          image,
          status: "pending",
        },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      // Fix round 1, item 5: lost a create race — a concurrent attempt for
      // this same address created the row between our `findUnique` above
      // and this `create`. Without this, the outer catch swallowed the
      // P2002 and this attempt vanished — not recorded at all — and every
      // later attempt would take the `existing` branch above regardless, so
      // it could never be recovered. Record it as a repeat instead (`email`
      // is unique, so this can update by it directly without re-reading for
      // an id), and do NOT notify: the winning create already will.
      await db.accessRequest.update({
        where: { email: needle },
        data: {
          lastAttemptAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      return;
    }

    await notifyAdmins(
      "New Access request",
      name ? `${name} (${needle}) asked to join Teepee.` : `${needle} asked to join Teepee.`,
      "/admin",
    );
  } catch (err) {
    console.error("[access-requests] recordAccessRequest failed:", err);
  }
}
