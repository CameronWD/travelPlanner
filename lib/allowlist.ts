import { db } from "@/lib/db";

/**
 * Sign-in allowlist (ADR 0057). ONE predicate, TWO sources:
 *
 *   - ALLOWED_EMAILS env var — bootstrap and break-glass against a wiped or
 *     restored-empty AllowedEmail table. It is NOT break-glass against a
 *     *down* database: the table lookup below, and the Prisma adapter one
 *     line after this callback runs in lib/auth/auth.ts, both need Postgres
 *     regardless, so an outage takes sign-in down either way. NEVER written
 *     by code.
 *   - AllowedEmail table — everyone admitted through the product, by
 *     approving an Access request. A pending Trip Invite does not admit
 *     (Teepee is Full); rows an Invite wrote before that still do.
 *
 * Revocation is NOT instant for either source. Sessions are Auth.js JWTs
 * with no maxAge override (Auth.js's default is 30 days), and nothing
 * re-checks the allowlist against an existing session — so deleting a row,
 * same as dropping an address from ALLOWED_EMAILS, only takes effect at that
 * person's next sign-in. The table is easier to edit than a redeploy; it is
 * not faster to take effect.
 *
 * "One door" means one predicate at one call site, not one storage location.
 * Shaped like isAdminEmail (lib/admin.ts): server-only, trimmed, lowercased.
 */
export function envAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export async function isAllowedEmail(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const needle = email.trim().toLowerCase();
  if (!needle) return false;

  if (envAllowedEmails().includes(needle)) return true;

  const row = await db.allowedEmail.findUnique({ where: { email: needle } });
  return row !== null;
}
