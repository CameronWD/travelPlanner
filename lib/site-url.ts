/**
 * The app's own canonical URL, for resolving absolute URLs (og:image, etc.) from metadata that
 * Next.js otherwise falls back to "http://localhost:3000" for at build time.
 *
 * Order: `APP_URL` → `https://${VERCEL_PROJECT_PRODUCTION_URL}` → "http://localhost:3000".
 *
 * - `APP_URL` is for a custom / canonical domain (the same value as the GitHub Actions cron
 *   variable — see docs/DEPLOY.md §4–§5). Set it in Vercel when the site is served from a domain
 *   other than the project's own production host.
 * - `VERCEL_PROJECT_PRODUCTION_URL` is Vercel's System Environment Variable for the project's
 *   production host. The project exposes System Environment Variables (the pulled Vercel env
 *   carries VERCEL_URL / VERCEL_ENV / VERCEL_GIT_*), so this is the expected production fallback
 *   when `APP_URL` is unset.
 * - On preview deployments (VERCEL_ENV=preview) Next.js resolves relative / file-convention
 *   og:image URLs against the deployment's own VERCEL_BRANCH_URL / VERCEL_URL instead of
 *   metadataBase (next/dist/lib/metadata/resolvers/resolve-url.js), so neither value decides
 *   previews' og host.
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
