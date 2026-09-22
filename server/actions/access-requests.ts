"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { isUniqueConstraintError } from "@/lib/access-requests";
import { type ActionResult, ok, fail } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// The /admin route's actions (ARCH-TEN-3c).
//
// Every action calls requireAdmin() first, not just the page: hiding a nav
// link is not access control, and the page guard alone only stops browsing —
// it does nothing for someone who already has an action's id. requireAdmin()
// notFound()s a non-admin (see lib/guards.ts), so the rejection propagates
// straight out of these actions too.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// View shapes
// ---------------------------------------------------------------------------

export interface AccessRequestView {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  /** ISO. When this person first asked. */
  createdAt: string;
  /** ISO. Their most recent attempt (repeat sign-in tries bump this). */
  lastAttemptAt: string;
  attempts: number;
}

export interface AllowedEmailView {
  id: string;
  email: string;
  note: string | null;
  /** ISO, or null for an ALLOWED_EMAILS entry — it has no row and no date. */
  createdAt: string | null;
  /**
   * False for an ALLOWED_EMAILS (env-var) entry: it is not a database row,
   * there is nothing here to delete, and revokeAllowedEmail refuses it
   * rather than pretending a delete would work.
   */
  revocable: boolean;
}

// ---------------------------------------------------------------------------
// Access requests
// ---------------------------------------------------------------------------

/**
 * Every Access request still awaiting a decision.
 *
 * Filtered by `resolvedAt: null`, NOT `status: "pending"` — approving a
 * request deliberately never touches `status` (the AccessRequest table stays
 * an audit trail; approval must not add a third status value alongside
 * "pending" | "dismissed"), so a resolved-by-approval row is still
 * `status: "pending"` and would wrongly reappear here under a status filter.
 * `resolvedAt` is the one field both approve and dismiss always stamp.
 */
export async function listAccessRequests(): Promise<AccessRequestView[]> {
  await requireAdmin();

  const rows = await db.accessRequest.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt.toISOString(),
    attempts: row.attempts,
  }));
}

/**
 * Grant access: write the durable `AllowedEmail` row and stamp `resolvedAt`.
 *
 * Lowercases the email explicitly before writing it, rather than trusting
 * that `AccessRequest.email` already arrived lowercased from the capture
 * path (lib/access-requests.ts). `User.email` is never normalised anywhere
 * in this codebase, and `isAllowedEmail` (lib/allowlist.ts) matches on a
 * lowercased needle — a mixed-case row here is invisible to it, which would
 * permanently lock out the very person just approved, and the unique index
 * on `email` makes the two casings look like two different people rather
 * than raising an error that would catch the mistake.
 *
 * Idempotent: approving twice, or approving an address some other path
 * already allowlisted, catches the resulting P2002 and continues to resolve
 * the request — it must not throw and must not leave the request stuck
 * pending just because the grant was already in place.
 *
 * Refuses a request that is already resolved (`resolvedAt` set), whether by
 * this same action or by dismiss. `AccessRequest.email` is `@unique`, so
 * there is only ever one row per address — with two admin tabs open, a
 * dismiss in one followed by an unguarded approve in the other would grant
 * access AND overwrite `resolvedAt` while `status` stayed "dismissed",
 * leaving the one audit row contradicting itself (says declined, behaves
 * admitted). Acting only on a still-open request closes that race.
 *
 * Does NOT set `status` — see listAccessRequests' doc comment.
 */
export async function approveAccessRequest(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const request = await db.accessRequest.findUnique({ where: { id } });
  if (!request) {
    return fail({ _form: ["That access request no longer exists."] });
  }
  if (request.resolvedAt) {
    return fail({ _form: ["That request has already been resolved."] });
  }

  const email = request.email.trim().toLowerCase();

  try {
    await db.allowedEmail.create({
      data: {
        email,
        addedById: admin.id,
        note: "Approved from an Access request",
      },
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    // Already allowlisted (a duplicate approve, or another path — e.g.
    // admitByTripInvite — already granted it). Fall through: the request
    // still needs resolving either way.
  }

  await db.accessRequest.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  revalidatePath("/admin");
  return ok();
}

/**
 * Decline: set `status: "dismissed"` and stamp `resolvedAt`. Never writes an
 * `AllowedEmail` row — dismissing must not grant access.
 *
 * Refuses an already-resolved request for the same two-tab reason as
 * approveAccessRequest above: approve-then-dismiss would set
 * `status: "dismissed"` on a row whose `AllowedEmail` grant survives (dismiss
 * never revokes), again leaving the audit row contradicting reality.
 */
export async function dismissAccessRequest(id: string): Promise<ActionResult> {
  await requireAdmin();

  const request = await db.accessRequest.findUnique({ where: { id } });
  if (!request) {
    return fail({ _form: ["That access request no longer exists."] });
  }
  if (request.resolvedAt) {
    return fail({ _form: ["That request has already been resolved."] });
  }

  await db.accessRequest.update({
    where: { id },
    data: { status: "dismissed", resolvedAt: new Date() },
  });

  revalidatePath("/admin");
  return ok();
}

// ---------------------------------------------------------------------------
// Allowlist (AllowedEmail) — read + revoke
//
// NEW requirement beyond the original brief: admission via a Trip Invite now
// writes an AllowedEmail row (the lockout fix on this branch), which made
// revocation two-sided. removeTripMember/leaveTrip delete the Invite, but
// nothing deletes the allowlist row it produced — so someone removed from
// the only Trip they were ever invited to keeps deployment-level sign-in,
// with no revocation path short of raw SQL. This closes that gap.
// ---------------------------------------------------------------------------

/**
 * Every current allowlist entry — both sources of `isAllowedEmail`
 * (lib/allowlist.ts): the `AllowedEmail` table, and the `ALLOWED_EMAILS` env
 * var. An address present in both is only listed once, as the (revocable)
 * database row — the env var is bootstrap/break-glass, and a row already
 * admits the same address on its own.
 */
export async function listAllowedEmails(): Promise<AllowedEmailView[]> {
  await requireAdmin();

  const rows = await db.allowedEmail.findMany({ orderBy: { createdAt: "asc" } });
  const dbViews: AllowedEmailView[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    revocable: true,
  }));

  // Lowercased defensively, same reasoning as approveAccessRequest's write:
  // every known writer of AllowedEmail.email already lowercases, but this
  // dedup must not silently double-list the same address (once revocable,
  // once "not revocable here") just because some row — hand-seeded, restored
  // from a pre-normalisation backup, or written by a future path that
  // forgets — isn't already lowercase.
  const dbEmails = new Set(dbViews.map((v) => v.email.trim().toLowerCase()));
  const raw = process.env.ALLOWED_EMAILS;
  const envEmails = raw
    ? raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0)
    : [];
  const envViews: AllowedEmailView[] = [...new Set(envEmails)]
    .filter((email) => !dbEmails.has(email))
    .map((email) => ({
      id: `env:${email}`,
      email,
      note: "Set via ALLOWED_EMAILS — not revocable here",
      createdAt: null,
      revocable: false,
    }));

  return [...dbViews, ...envViews];
}

/**
 * Revoke an admitted address.
 *
 * Refuses an `env:`-prefixed id (an ALLOWED_EMAILS entry, see
 * listAllowedEmails) outright — there is no row to delete, and pretending a
 * delete would work would be worse than saying so, since the address would
 * still sign in next time regardless.
 *
 * Refuses to let an admin revoke their own address — the exact lockout this
 * whole feature exists to fix, in reverse: revoking the address that lets
 * the acting admin sign in at all, with no path back short of raw SQL.
 * Compared case-insensitively on BOTH sides, matching every other email
 * comparison in this codebase (`isAllowedEmail`, `isAdminEmail`) — the admin's
 * own email is lowercased here same as always, but the stored row's email is
 * lowercased too rather than trusted as already-normalised. Every known
 * writer of `AllowedEmail.email` does lowercase it, but approveAccessRequest
 * (above) already declined to lean on that same invariant for its own write;
 * this read applies the same scepticism. A row that somehow isn't lowercase
 * (hand-seeded, restored from a pre-normalisation backup, a future writer
 * that forgets) would otherwise make this guard silently miss, and the
 * delete would run — exactly the lockout this exists to prevent.
 *
 * No-op-safe: revoking an already-gone row still returns success, same as
 * revokeShareLink (server/actions/share.ts).
 */
export async function revokeAllowedEmail(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (id.startsWith("env:")) {
    return fail({
      _form: [
        "That address is set via the ALLOWED_EMAILS environment variable — remove it from the deployment's environment instead.",
      ],
    });
  }

  const row = await db.allowedEmail.findUnique({ where: { id } });
  if (!row) {
    return ok();
  }

  const adminEmail = (admin.email ?? "").trim().toLowerCase();
  if (row.email.trim().toLowerCase() === adminEmail) {
    return fail({
      _form: [
        "You can't revoke your own address — ask another admin, or it locks you out with no way back in.",
      ],
    });
  }

  await db.allowedEmail.delete({ where: { id } });

  revalidatePath("/admin");
  return ok();
}
