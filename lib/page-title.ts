import { formatDayLabel } from "@/lib/dates";

/**
 * Browser-tab titles are page-first: "Days · Trip name · Teepee". The root
 * layout's template is "%s · Teepee"; a trip layout's `default` is augmented
 * by that, while its `template` is what the trip's subpages are augmented
 * by (and only by — Next applies the closest template), so it carries the
 * app name itself.
 */
export function tripTitle(name: string): { default: string; template: string } {
  const clean = name.trim();
  return { default: clean, template: `%s · ${clean} · Teepee` };
}

/** Single day page title, e.g. "Thu 10 Dec" — the year is in the trip name's context. */
export function dayTitle(dateISO: string): string {
  return formatDayLabel(dateISO);
}
