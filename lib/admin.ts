/**
 * Admin recognition.
 *
 * An admin is an email listed in the ADMIN_EMAILS env var (comma-separated).
 * Server-only: never import this into a client component, and never send the
 * result to the browser for anything but rendering an already-guarded control.
 *
 * Deliberately NOT a column on User: one operator does not justify a
 * migration, and an env var is revocable without a deploy of new code. See
 * ADR 0045 for why this grants no power over trips the admin isn't a member
 * of.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)
    .includes(needle);
}
