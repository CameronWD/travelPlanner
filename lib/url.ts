/**
 * URL safety helpers.
 *
 * PURE — no Prisma, no React, no network. Used to sanitise user-supplied
 * links before they are rendered into an `href`, closing off `javascript:`,
 * `data:` and similar scheme-based XSS vectors.
 */

/**
 * Normalise a user-supplied web link to a safe `http(s)` href, or return null
 * when it can't be made safe.
 *
 *  - A scheme-less value (e.g. "example.com") is assumed to be `https://` so
 *    bare domains still produce a working link.
 *  - Anything whose resolved protocol is not http/https (`javascript:`,
 *    `data:`, `vbscript:`, `mailto:`, …) returns null and must NOT be rendered
 *    as a link.
 *
 *   safeWebHref("example.com")        → "https://example.com/"
 *   safeWebHref("https://x.com/a")    → "https://x.com/a"
 *   safeWebHref("javascript:alert(1)")→ null
 */
export function safeWebHref(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // A value with a leading scheme (e.g. "https:", "javascript:") keeps it;
  // otherwise assume https:// so scheme-less hosts still link.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.host) return null;
  return url.toString();
}
