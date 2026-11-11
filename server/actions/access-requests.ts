"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { isUniqueConstraintError } from "@/lib/access-requests";
import { type ActionResult, ok, formFail } from "@/lib/action-result";
import { mailConfigured, sendMail } from "@/lib/mail";
import { renderApprovalEmail } from "@/lib/approval-email";
import { INVITE_EXPIRY_MS } from "@/lib/invite-expiry";
import { siteUrl } from "@/lib/site-url";
import { revalidateAdmin } from "@/lib/revalidate";
import { travellerName } from "@/lib/traveller";

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
  /** Unaccepted Trip Invites to this address; the inviter is the Trip's Owner. */
  invitedTo: { tripName: string; ownerName: string }[];
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

  const invites = await db.invite.findMany({
    where: { email: { in: rows.map((r) => r.email.trim().toLowerCase()) }, acceptedAt: null },
    select: {
      email: true,
      trip: {
        select: {
          name: true,
          members: {
            where: { role: "owner" },
            select: { user: { select: { id: true, name: true, image: true, displayName: true, email: true } } },
          },
        },
      },
    },
  });

  const invitedByEmail = new Map<string, AccessRequestView["invitedTo"]>();
  for (const invite of invites) {
    const owner = invite.trip.members[0]?.user;
    const list = invitedByEmail.get(invite.email) ?? [];
    list.push({ tripName: invite.trip.name, ownerName: owner ? travellerName(owner) : "Traveller" });
    invitedByEmail.set(invite.email, list);
  }

  const views = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt.toISOString(),
    attempts: row.attempts,
    invitedTo: invitedByEmail.get(row.email.trim().toLowerCase()) ?? [],
  }));

  return views.sort(
    (a, b) =>
      Number(b.invitedTo.length > 0) - Number(a.invitedTo.length > 0) ||
      a.createdAt.localeCompare(b.createdAt),
  );
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
 * Emails the address after the grant when mail is configured; the result's
 * `mailed` says whether it went.
 *
 * Does NOT set `status` — see listAccessRequests' doc comment.
 */
export async function approveAccessRequest(id: string): Promise<ActionResult<{ mailed: boolean }>> {
  const admin = await requireAdmin();

  const request = await db.accessRequest.findUnique({ where: { id } });
  if (!request) {
    return formFail("That access request no longer exists.");
  }
  if (request.resolvedAt) {
    return formFail("That request has already been resolved.");
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
    // Already allowlisted (a duplicate approve, or another path already
    // granted it). Fall through: the request
    // still needs resolving either way.
  }

  await db.accessRequest.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  const now = new Date();
  await db.invite.updateMany({
    where: { email, acceptedAt: null, expiresAt: { lt: now } },
    data: { expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS) },
  });

  // The email comes last and can never undo the approval above (spec
  // 2026-10-02 §B): a failed send is reported to the admin, not retried,
  // and never rolled back. Dismiss never emails — silence is what the
  // refusal screen promises (ADR 0057).
  let mailed = false;
  if (mailConfigured()) {
    const result = await sendMail({ to: email, ...renderApprovalEmail({ email, signInUrl: `${siteUrl()}/` }) });
    mailed = result.sent;
    if (!result.sent) console.error("[access-requests] approval email failed:", result.error);
  }

  revalidateAdmin();
  return ok({ mailed });
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
    return formFail("That access request no longer exists.");
  }
  if (request.resolvedAt) {
    return formFail("That request has already been resolved.");
  }

  await db.accessRequest.update({
    where: { id },
    data: { status: "dismissed", resolvedAt: new Date() },
  });

  revalidateAdmin();
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
 * Revoke an admitted address.
 *
 * Refuses an `env:`-prefixed id (an ALLOWED_EMAILS entry) outright — there is
 * no row to delete, and pretending a delete would work would be worse than
 * saying so, since the address would still sign in next time regardless.
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
    return formFail(
      "That address is set in the ALLOWED_EMAILS environment variable. Remove it from the deployment's environment instead.",
    );
  }

  const row = await db.allowedEmail.findUnique({ where: { id } });
  if (!row) {
    return ok();
  }

  const adminEmail = (admin.email ?? "").trim().toLowerCase();
  if (row.email.trim().toLowerCase() === adminEmail) {
    return formFail("You can't revoke your own address. It would lock you out. Ask another Admin.");
  }

  await db.allowedEmail.delete({ where: { id } });

  revalidateAdmin();
  return ok();
}
