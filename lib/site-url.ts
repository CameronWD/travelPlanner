/**
 * The app's own canonical URL, for resolving absolute URLs (og:image, etc.) from metadata that
 * Next.js otherwise falls back to "http://localhost:3000" for at build time.
 *
 * Order: `APP_URL` (the same repo variable the GitHub Actions cron already reads — see
 * docs/DEPLOY.md §5) → `https://${VERCEL_PROJECT_PRODUCTION_URL}` (Vercel's own System
 * Environment Variable, only present at runtime if "Automatically expose System Environment
 * Variables" is enabled on the project — nothing in this repo enables that today, so this branch
 * is a fallback, not the primary path) → "http://localhost:3000".
 */
export function siteUrl(): string {
  const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

  if (process.env.APP_URL) return stripTrailingSlash(process.env.APP_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return stripTrailingSlash(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return "http://localhost:3000";
}
