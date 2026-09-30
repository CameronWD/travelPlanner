// ---------------------------------------------------------------------------
// LA-043: `text-balance` alone doesn't stop a short last word (often a bare
// year, e.g. "2026") orphaning onto its own line at narrow widths — it only
// evens out line lengths, it doesn't know some breaks read worse than
// others. Joining the last two words with a non-breaking space keeps them
// on the same line as each other, wherever the browser decides to wrap.
// ---------------------------------------------------------------------------

/**
 * Pure: joins the last two words of `name` with a non-breaking space (U+00A0)
 * so they never wrap apart from each other. A single-word name is returned
 * unchanged (there's no second word to tether it to).
 */
export function noOrphan(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return name;
  const last = words.pop()!;
  const secondLast = words.pop()!;
  return [...words, `${secondLast} ${last}`].join(" ");
}
