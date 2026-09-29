/** Auth.js sends a refused Google account to `/?error=AccessDenied`
 * (lib/auth.ts pages.error). Only that value opens the denied panel; every
 * other error is ignored, as the retired /signin page did. */
export function isAccessDenied(error: string | string[] | undefined): boolean {
  return Array.isArray(error) ? error.includes("AccessDenied") : error === "AccessDenied";
}
