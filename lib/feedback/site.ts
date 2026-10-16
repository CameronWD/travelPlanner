/**
 * The **site** a Feedback note was written on (CONTEXT.md; ADR 0040 amendment
 * 2026-09-26). Derived on the server from Vercel's own deployment variables —
 * the browser never supplies it, so a note can't claim to come from somewhere
 * it didn't.
 */
export function feedbackSite(
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.VERCEL_ENV === "production") return "main";
  if (env.VERCEL_ENV === "preview") return env.VERCEL_GIT_COMMIT_REF?.trim() || "preview";
  return "local";
}

/** Notes written before sites were recorded have none; they count as main. */
export function siteOf(stored: string | null): string {
  return stored ?? "main";
}

const LABELS: Record<string, string> = { main: "Main", beta: "Beta", local: "Local" };

/** How a site reads to a person: known sites capitalised, other branches as named. */
export function siteLabel(site: string): string {
  return LABELS[site] ?? site;
}
