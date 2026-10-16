/**
 * "1 night" / "3 nights" — the count, a space, then the noun (singular only
 * when n is exactly 1). Pass `many` for irregular plurals ("country" →
 * "countries") or labels that don't take a bare "s".
 */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
