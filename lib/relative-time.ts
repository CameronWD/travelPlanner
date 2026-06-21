/**
 * Pure helper: format a past Date as a human-friendly relative string.
 *
 *   < 60 s   → "just now"
 *   < 60 m   → "Xm ago"
 *   < 24 h   → "Xh ago"
 *   < 7 d    → "Xd ago"
 *   otherwise → locale date string "D MMM YYYY"
 *
 * @param date  The timestamp to format.
 * @param now   The reference point (defaults to new Date()).
 */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1_000);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
