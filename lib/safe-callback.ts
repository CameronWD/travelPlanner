const BASE = "http://callback.invalid";

// Control characters, any Unicode whitespace, and zero-width/BOM characters:
// browsers strip or reinterpret these, so "/\t/evil.example" can become
// "//evil.example" by the time it is followed.
const UNSAFE_CHAR = /[\s\u0000-\u001f\u007f-\u009f​-‏﻿]/;

/** Starts off-site once a browser reads it: "//host", or a backslash (which
 * http(s) URLs treat as "/"), anywhere. */
function looksOffsite(v: string): boolean {
  return v.startsWith("//") || v.includes("\\") || UNSAFE_CHAR.test(v);
}

/**
 * A post-sign-in destination we are willing to redirect to: a same-origin
 * path only. Anything that could leave the site — "//host", a scheme, a
 * backslash trick, an encoded or dot-segment spelling of either, control
 * characters or whitespace — is dropped, not repaired.
 */
export function safeCallbackPath(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string" || !v.startsWith("/") || looksOffsite(v)) return null;

  // Some hop downstream may decode again ("/%2F%2Fhost" → "//host"); refuse
  // anything that turns off-site after a decode or two. Malformed escapes
  // throw — also refused.
  let decoded = v;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (looksOffsite(decoded)) return null;
    }
  } catch {
    return null;
  }

  try {
    const u = new URL(v, BASE);
    if (u.origin !== BASE) return null;
    const out = u.pathname + u.search + u.hash;
    // Dot segments normalise too: "/..//host" parses to the path "//host".
    if (!out.startsWith("/") || looksOffsite(u.pathname)) return null;
    return out;
  } catch {
    return null;
  }
}

export function panelFromParam(raw: string | string[] | undefined): "sign-in" | "request" | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "sign-in" || v === "request" ? v : undefined;
}
