const BASE = "http://callback.invalid";
const MAX_DECODES = 4;

// Raw C0 controls and DEL anywhere in the input: browsers strip tabs/newlines
// before parsing, so "/\t/evil.example" can be followed as "//evil.example".
const RAW_CONTROL = /[\u0000-\u001f\u007f]/;

// Stricter set for the path: any Unicode whitespace, C1 controls, and
// zero-width/BOM characters too.
const UNSAFE_PATH_CHAR = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\ufeff]/;

/** Reads as off-site to a browser: "//host", or a backslash (which http(s)
 * URLs treat as "/") anywhere. */
function pathLooksOffsite(path: string): boolean {
  return path.startsWith("//") || path.includes("\\") || UNSAFE_PATH_CHAR.test(path);
}

/** The pathname `path` resolves to on our own origin, or null if it leaves it
 * or normalises (dot segments) into something off-site. */
function normalisedPath(path: string): string | null {
  const u = new URL(path, BASE);
  if (u.origin !== BASE || pathLooksOffsite(u.pathname)) return null;
  return u.pathname;
}

/**
 * A post-sign-in destination we are willing to redirect to: a same-origin
 * path only. Anything that could leave the site — "//host", a scheme, a
 * backslash trick, an encoded or dot-segment spelling of either, control
 * characters or whitespace in the path — is dropped, not repaired.
 *
 * The strict checks apply to the pathname (after normalisation, and again
 * after each percent-decode some later hop might apply). The query and hash
 * cannot change the origin, so they only lose raw control characters —
 * a share token with "%", "+" or "/" survives.
 */
export function safeCallbackPath(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  // The URL parser would quietly turn a path backslash into "/"; refuse it raw.
  if (v.split(/[?#]/, 1)[0].includes("\\")) return null;
  if (RAW_CONTROL.test(v)) return null;

  try {
    const u = new URL(v, BASE);
    if (u.origin !== BASE) return null;

    let path = normalisedPath(u.pathname);
    if (path === null) return null;
    // Decode-and-renormalise until stable: "/%2e%2e%2f%2fevil" decodes to
    // "/..//evil", which normalises to "//evil". Still changing after
    // MAX_DECODES rounds is refused, not trusted. Malformed escapes throw —
    // also refused.
    for (let i = 0; ; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      if (i === MAX_DECODES || pathLooksOffsite(decoded)) return null;
      path = normalisedPath(decoded);
      if (path === null) return null;
    }

    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

export function panelFromParam(raw: string | string[] | undefined): "sign-in" | "request" | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "sign-in" || v === "request" ? v : undefined;
}
