"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { reviewPermissionSchema, type ReviewPermission } from "@/lib/enums";
import { parseReviewPermission } from "@/lib/review-permission";
import { TRAVELLER_SELECT, travellerName } from "@/lib/traveller";
import { type ActionResult, ok, formFail } from "@/lib/action-result";
import { revalidateAdmin } from "@/lib/revalidate";

// The Admin page's Review permission control (spec 2026-10-17 R12). Every
// action calls requireAdmin() first, not just the page (as access-requests.ts):
// hiding a route is not access control.

export interface ReviewPermissionView {
  userId: string;
  email: string;
  /** lib/traveller.ts travellerName: display name, then provider name, then email local-part. */
  name: string;
  permission: ReviewPermission;
}

/** Every account and who may start a Review. A handful of accounts, so no paging. */
export async function listReviewPermissions(): Promise<ReviewPermissionView[]> {
  await requireAdmin();
  const rows = await db.user.findMany({
    select: { ...TRAVELLER_SELECT, email: true, reviewPermission: true },
    orderBy: { email: "asc" },
  });
  return rows.map((u) => ({
    userId: u.id,
    email: u.email,
    name: travellerName(u),
    permission: parseReviewPermission(u.reviewPermission),
  }));
}

/** Set one account's permission. updateMany so a deleted account reads as a message, not a thrown P2025. */
export async function setReviewPermission(
  userId: string,
  permission: string,
): Promise<ActionResult<{ permission: ReviewPermission }>> {
  await requireAdmin();
  const parsed = reviewPermissionSchema.safeParse(permission);
  if (!parsed.success) return formFail("Pick Off, Limited or Unlimited.");
  const { count } = await db.user.updateMany({ where: { id: userId }, data: { reviewPermission: parsed.data } });
  if (count === 0) return formFail("That account no longer exists.");
  revalidateAdmin();
  return ok({ permission: parsed.data });
}
