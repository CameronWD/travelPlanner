import { siteLabel, siteOf } from "@/lib/feedback-site";

/** A non-blocking heads-up when a note is resolved for a site it wasn't written on (ADR 0040, 2026-09-26). */
export function siteMismatchWarning(noteSite: string | null, resolvingFor: string | null): string | null {
  if (!resolvingFor) return null;
  const site = siteOf(noteSite);
  if (site === resolvingFor) return null;
  return `Warning: this note was written on ${siteLabel(site)}, but you're resolving for ${siteLabel(resolvingFor)}. Resolving anyway.`;
}
