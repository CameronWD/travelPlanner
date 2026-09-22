import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { notifyAdmins } from "@/lib/admin-notify";

/**
 * The server-side error sink (ARCH-OBS-1, ADR 0059).
 *
 * Before this existed every server-side failure terminated in a bare
 * `console.*` with nothing downstream watching it — the operator WAS the
 * monitoring system, which stops working the moment there are more
 * Travellers than one household. `reportError` gives every caught failure
 * one more place to land: a deduped row in `ErrorReport`, plus one push to
 * the admins the first time a given failure is ever seen.
 *
 * Deduping is on SIGNATURE, not the full error: `name + message + first
 * stack frame`, hashed. Never the full stack — line numbers and async
 * frames vary between occurrences of what is really the same bug, so a
 * full-stack signature would mint a new row per request and the table
 * would become exactly the noise it exists to replace. A loop that throws
 * ten thousand times produces one row (its `count` climbing) and one push,
 * ever.
 *
 * Console logging is NOT redundant with the DB write, and both always
 * happen: a database-down failure cannot write a database row, so that
 * whole class of error reaches only the console and Vercel's runtime logs.
 * That gap is knowingly accepted (ADR 0059) rather than solved here — this
 * sink is a supplement to the console, not a replacement for it. The
 * console.error below fires before anything touches the database, so it
 * survives a DB outage even though the row it would have written does not.
 *
 * Never throws. The whole body is wrapped — a caller reporting a failure
 * can rely on this never being the reason their own operation fails too.
 */

const DEFAULT_SOURCE = "server";

export interface ReportErrorContext {
  route?: string;
  source?: "server" | "client";
  userId?: string;
}

interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
}

/** Coerces whatever was thrown into a stable {name, message, stack} shape. */
function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message, stack: err.stack };
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  try {
    return { name: "Error", message: JSON.stringify(err) ?? String(err) };
  } catch {
    return { name: "Error", message: String(err) };
  }
}

/**
 * The first `at ...` line of a stack trace, trimmed — the frame where the
 * throw actually happened, as opposed to whatever unwound above it. Used in
 * the signature instead of the full stack (see module doc).
 */
function firstStackFrame(stack?: string): string {
  if (!stack) return "";
  const frame = stack
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("at "));
  return frame ?? "";
}

/** A stable hash of name + message + first stack frame. Never the full stack. */
function computeSignature(normalized: NormalizedError): string {
  const key = JSON.stringify([
    normalized.name,
    normalized.message,
    firstStackFrame(normalized.stack),
  ]);
  return createHash("sha256").update(key).digest("hex");
}

export async function reportError(
  err: unknown,
  ctx: ReportErrorContext = {},
): Promise<void> {
  try {
    const normalized = normalizeError(err);

    // Always logged, independent of whatever happens below — see the module
    // doc for why this line, not the database write, is the one guaranteed
    // to survive a database outage.
    console.error(
      `[error-sink]${ctx.route ? ` ${ctx.route}` : ""}:`,
      err,
    );

    const signature = computeSignature(normalized);

    const existing = await db.errorReport.findUnique({ where: { signature } });

    if (existing) {
      // Seen before: bump the count and the last-seen timestamp, but never
      // push again for it — one notification per distinct failure, ever.
      await db.errorReport.update({
        where: { signature },
        data: { count: { increment: 1 }, lastSeen: new Date() },
      });
      return;
    }

    await db.errorReport.create({
      data: {
        signature,
        message: normalized.message,
        stack: normalized.stack ?? null,
        route: ctx.route ?? null,
        source: ctx.source ?? DEFAULT_SOURCE,
        userId: ctx.userId ?? null,
      },
    });

    const routeSuffix = ctx.route ? ` on ${ctx.route}` : "";
    await notifyAdmins(
      "New server error",
      `An error was reported${routeSuffix}: ${normalized.message}`,
      "/admin",
    );
  } catch (sinkErr) {
    // The sink must never become the outage — see module doc. This branch
    // covers the database (or notifyAdmins, though it has the same
    // never-throws contract) being unreachable; the console.error above has
    // already run regardless.
    console.error("[error-sink] reportError failed:", sinkErr);
  }
}
