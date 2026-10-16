/**
 * Turn a stored user-agent string into something a reader can take in at a
 * glance (ADR 0040).
 *
 * The point of capturing the device is that a Feedback note is understandable
 * without asking the author where they were — a 200-character user-agent
 * string pasted into the inbox defeats that as thoroughly as capturing nothing.
 * So: platform and browser, nothing else.
 */

/** First match wins, so narrower patterns come first (an iPad is not a Mac). */
const PLATFORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone/i, "iPhone"],
  [/iPad/i, "iPad"],
  [/Android/i, "Android"],
  [/CrOS/i, "ChromeOS"],
  [/Macintosh|Mac OS X/i, "Mac"],
  [/Windows/i, "Windows"],
  [/Linux/i, "Linux"],
];

/**
 * Order matters: Edge and Opera both claim to be Chrome, Chrome claims to be
 * Safari, and the iOS builds of Chrome and Firefox claim to be all three.
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/(?:CriOS|Chrome)\//, "Chrome"],
  [/(?:FxiOS|Firefox)\//, "Firefox"],
  [/Safari\//, "Safari"],
];

/** An unrecognised agent is still worth showing — just not all of it. */
const FALLBACK_MAX = 60;

/**
 * "iPhone · Safari" — null when there is nothing to say.
 *
 * An agent string matching nothing known is truncated rather than dropped: a
 * fragment of an unfamiliar browser is a clue, and silence is not.
 */
export function describeDevice(userAgent: string | null): string | null {
  const ua = userAgent?.trim();
  if (!ua) return null;

  const platform = PLATFORMS.find(([pattern]) => pattern.test(ua))?.[1];
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const parts = [platform, browser].filter((part): part is string => Boolean(part));

  if (parts.length > 0) return parts.join(" · ");
  return ua.length > FALLBACK_MAX ? `${ua.slice(0, FALLBACK_MAX - 1)}…` : ua;
}
