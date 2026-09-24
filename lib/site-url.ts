/**
 * The app's own canonical URL, for resolving absolute URLs (og:image, etc.) from metadata that
 * Next.js otherwise falls back to "http://localhost:3000" for at build time.
 *
 * Order: `APP_URL` (the same repo variable the GitHub Actions cron already reads — see
 * docs/DEPLOY.md §5) → `https://${VERCEL_PROJECT_PRODUCTION_URL}` (Vercel's own System
 * Environment Variable, only present at runtime if "Automatically expose System Environment
 * Variables" is enabled on the project — nothing in this repo enables that today, so this branch
 * is a fallback, not the primary path) → "http://localhost:3000".
 *
 * This runs unguarded at root-layout module scope (`metadataBase: new URL(siteUrl())`), so a
 * malformed candidate must never throw — it is skipped, with a warning naming which variable was
 * bad, and resolution falls through to the next source instead of taking every page down.
 */
export function siteUrl(): string {
  const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    if (URL.canParse(appUrl)) return stripTrailingSlash(appUrl);
    console.warn(
      `[site-url] Ignoring invalid APP_URL (${JSON.stringify(appUrl)}) — expected an absolute URL with a scheme, e.g. "https://example.com". Falling back to the next source.`,
    );
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProductionUrl) {
    const candidate = `https://${vercelProductionUrl}`;
    if (URL.canParse(candidate)) return stripTrailingSlash(candidate);
    console.warn(
      `[site-url] Ignoring invalid VERCEL_PROJECT_PRODUCTION_URL (${JSON.stringify(vercelProductionUrl)}) — expected a bare host, e.g. "my-app.vercel.app". Falling back to the next source.`,
    );
  }

  return "http://localhost:3000";
}
