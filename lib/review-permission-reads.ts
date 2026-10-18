/**
 * Reads behind "may this account start a Review now?" (spec 2026-10-17 R12,
 * decisions 2 and 3). The rules are pure in lib/review-permission.ts; this
 * loads their inputs.
 *
 * A run counts against its starter when it is DONE, or RUNNING and not stale.
 * A FAILED run doesn't, and a RUNNING row older than REVIEW_STALE_AFTER_MS
 * counts as failed. The count is across every Trip.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { REVIEW_PERMISSIONS, type ReviewPermission } from "@/lib/enum-values";
import {
  REVIEW_STALE_AFTER_MS,
  countedSince,
  parseReviewPermission,
  reviewAllowance,
  type ReviewAllowance,
} from "@/lib/review-permission";

/** `db` or a transaction client (the start action passes its `tx`). */
export type ReviewStandingClient = Pick<Prisma.TransactionClient, "review" | "user" | "$queryRaw">;

/** The startedAt of this account's counted runs started after `since`, oldest first. */
export async function countedReviewStarts(
  userId: string,
  since: Date,
  opts: { now?: Date; client?: ReviewStandingClient } = {},
): Promise<Date[]> {
  const now = opts.now ?? new Date();
  const client = opts.client ?? db;
  const freshAfter = new Date(now.getTime() - REVIEW_STALE_AFTER_MS);
  const rows = await client.review.findMany({
    where: {
      startedById: userId,
      startedAt: { gt: since },
      OR: [{ status: "DONE" }, { status: "RUNNING", startedAt: { gt: freshAfter } }],
    },
    select: { startedAt: true },
    orderBy: { startedAt: "asc" },
  });
  return rows.map((r) => r.startedAt);
}

export interface ReviewStanding extends ReviewAllowance {
  permission: ReviewPermission;
}

/**
 * This account's permission and whether it may start a Review now. A missing
 * account is OFF. With `forUpdate` (inside the start action's transaction)
 * the User row is read with SELECT … FOR UPDATE, so one account's concurrent
 * starts run one after the other and can't both pass the count. Raw SQL
 * because Prisma can't express FOR UPDATE (as server/actions/items.ts
 * lockItemFamily).
 */
export async function loadReviewStanding(
  userId: string,
  opts: { now?: Date; client?: ReviewStandingClient; forUpdate?: boolean } = {},
): Promise<ReviewStanding> {
  // A row lock outside a transaction is released at once: it would serialise nothing.
  if (opts.forUpdate && !opts.client) {
    throw new Error("loadReviewStanding: forUpdate needs the transaction's client (opts.client = tx)");
  }
  const now = opts.now ?? new Date();
  const client = opts.client ?? db;
  let raw: string | null = null;
  if (opts.forUpdate) {
    const rows = await client.$queryRaw<{ reviewPermission: string }[]>`
      SELECT "reviewPermission" FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    raw = rows[0]?.reviewPermission ?? null;
  } else {
    raw = (await client.user.findUnique({ where: { id: userId }, select: { reviewPermission: true } }))?.reviewPermission ?? null;
  }
  const permission = parseReviewPermission(raw);
  const starts =
    permission === "LIMITED" ? await countedReviewStarts(userId, countedSince(now), { now, client }) : [];
  return { permission, ...reviewAllowance(permission, starts, now) };
}

/**
 * The account's own Review permission (R12), for the Reviews tab's run
 * panel (lib/review/reviews-page-loader.ts) and Section M's per-user
 * tool-listing gate. A missing user or an unknown stored value reads as
 * Off, the safe side.
 */
export async function reviewPermissionOf(userId: string): Promise<ReviewPermission> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { reviewPermission: true } });
  const value = row?.reviewPermission;
  return value && (REVIEW_PERMISSIONS as readonly string[]).includes(value) ? (value as ReviewPermission) : "OFF";
}
