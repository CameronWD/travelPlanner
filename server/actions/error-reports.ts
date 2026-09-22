"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { type ActionResult, ok } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// The /admin Errors section's actions (ARCH-OBS-2).
//
// Every action calls requireAdmin() first, not just the page: hiding a nav
// link is not access control (same reasoning as access-requests.ts) — an
// operator with an ErrorReport id but no admin standing must be refused
// here, not merely kept off the page that lists them.
// ---------------------------------------------------------------------------

export interface ErrorReportView {
  id: string;
  signature: string;
  message: string;
  route: string | null;
  source: string;
  count: number;
  /** ISO. */
  firstSeen: string;
  /** ISO. */
  lastSeen: string;
}

/** Every stored ErrorReport row, newest-seen first. */
export async function listErrorReports(): Promise<ErrorReportView[]> {
  await requireAdmin();

  const rows = await db.errorReport.findMany({
    orderBy: { lastSeen: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    signature: row.signature,
    message: row.message,
    route: row.route,
    source: row.source,
    count: row.count,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
  }));
}

/**
 * Clear one ErrorReport row. No-op-safe: clearing an already-gone row still
 * returns success, same as revokeAllowedEmail / revokeShareLink — an admin
 * whose click raced another tab's Clear shouldn't see a failure for a row
 * that's already gone the way they wanted it to.
 */
export async function clearErrorReport(id: string): Promise<ActionResult> {
  await requireAdmin();

  const row = await db.errorReport.findUnique({ where: { id } });
  if (!row) {
    return ok();
  }

  await db.errorReport.delete({ where: { id } });

  revalidatePath("/admin");
  return ok();
}
