/** AUDIT.md §2 — the meta line each PageHeader-migrated trip page carries. */

export function filesMeta(n: number): string | null {
  return n === 0 ? null : n === 1 ? "1 file" : `${n} files`;
}

/** The Activity page reads the newest 100 only, so at the cap it says so. */
export function activityMeta(n: number, cap = 100): string {
  if (n === 0) return "No changes yet";
  if (n >= cap) return `Last ${cap} changes`;
  return n === 1 ? "1 change" : `${n} changes`;
}

export function comparePlansMeta(n: number): string | null {
  return n < 2 ? null : `${n} plans`;
}
