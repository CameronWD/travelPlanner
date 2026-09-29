/**
 * A Trip's URL slug, derived from its name (ADR 0064): lowercase, accents
 * stripped, non-alphanumeric runs → single "-", trimmed, ≤ 60 chars, "trip"
 * if empty. Unique app-wide: a clash takes the next free "-2", "-3"…; "new"
 * is reserved (/trips/new is a static route). Pure — the DB side is
 * lib/trip-slug-store.ts.
 */
export const SLUG_MAX = 60;
export const RESERVED_TRIP_SLUGS: ReadonlySet<string> = new Set(["new"]);

export function slugifyTripName(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return s || "trip";
}

/** n = 1 → the base; n ≥ 2 → base-n, the base shortened so the whole stays ≤ 60. */
export function withSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const tail = `-${n}`;
  return `${base.slice(0, SLUG_MAX - tail.length).replace(/-+$/g, "")}${tail}`;
}

/** `count` candidates starting at suffix `from`, in order, reserved words left out. */
export function slugCandidates(base: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, k) => withSuffix(base, from + k)).filter((c) => !RESERVED_TRIP_SLUGS.has(c));
}
