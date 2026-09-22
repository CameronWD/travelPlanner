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

// I1 (fix round 1): ErrorReport is the one table this sink is designed to
// grow — every distinct failure signature is one more row, forever, until
// cleared. An unbounded findMany here means the one surface built to manage
// that (this list + Clear/Clear all below) fails exactly when the table is
// largest, leaving raw SQL as the only recovery path. 200 is generous for a
// list an admin is meant to actually read.
const LIST_LIMIT = 200;

export interface ErrorReportView {
  id: string;
  signature: string;
  message: string;
  route: string | null;
  source: string;
  /** React's error digest, when the report carried one — see ReportErrorContext.digest in lib/error-sink.ts. */
  digest: string | null;
  count: number;
  /** ISO. */
  firstSeen: string;
  /** ISO. */
  lastSeen: string;
}

/** Up to the LIST_LIMIT most recently seen ErrorReport rows, newest-seen first. */
export async function listErrorReports(): Promise<ErrorReportView[]> {
  await requireAdmin();

  const rows = await db.errorReport.findMany({
    orderBy: { lastSeen: "desc" },
    take: LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    signature: row.signature,
    message: row.message,
    route: row.route,
    source: row.source,
    digest: row.digest,
    count: row.count,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
  }));
}

/**
 * Clear one ErrorReport row.
 *
 * `deleteMany({ where: { id } })` rather than `findUnique` + `delete` (fix
 * round 1, M2): the two-step version threw P2025 when a second admin tab's
 * click raced this one's and won — `clearErrorReport` rejected, and
 * `ErrorReportsPanel.handleClear` has no try/catch around the call, so
 * `setPendingId(null)` never ran and that row's Clear button stayed stuck
 * loading. `deleteMany` is atomic (one round trip, not two) and simply
 * matches zero rows when the target is already gone, rather than erroring —
 * exactly the no-op-safe behaviour this action always intended.
 */
export async function clearErrorReport(id: string): Promise<ActionResult> {
  await requireAdmin();

  await db.errorReport.deleteMany({ where: { id } });

  revalidatePath("/admin");
  return ok();
}

/**
 * Clear every ErrorReport row (fix round 1, I1). The counterpart to
 * `LIST_LIMIT` above: per-row Clear alone can't keep pace with a table that
 * grows by design, so this is the bulk escape hatch that keeps raw SQL from
 * ever being the only way to empty it out.
 */
export async function clearAllErrorReports(): Promise<ActionResult> {
  await requireAdmin();

  await db.errorReport.deleteMany({});

  revalidatePath("/admin");
  return ok();
}
