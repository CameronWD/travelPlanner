import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (length-mismatch returns false early). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Shared auth gate for cron routes. Accepts either:
 *   - Query param:  ?secret=<CRON_SECRET>
 *   - Header:       Authorization: Bearer <CRON_SECRET>
 *
 * If CRON_SECRET is not set, every request is rejected (fail-closed).
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // Fail-closed: if CRON_SECRET is not set, reject all requests
  if (!secret) return false;

  // Check Authorization header (constant-time to avoid leaking the secret
  // byte-by-byte via response timing).
  const authHeader = req.headers.get("authorization");
  if (authHeader && safeEqual(authHeader, `Bearer ${secret}`)) return true;

  // Check query param. NOTE: a secret in the URL can land in access logs, so
  // this branch is only safe over HTTPS (Vercel enforces this; for other hosts
  // prefer the Authorization header).
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret && safeEqual(querySecret, secret)) return true;

  return false;
}
