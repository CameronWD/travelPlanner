import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Auth, type AuthConfig } from "@auth/core";

import { CALLBACK_URL_COOKIES, isValidHttpUrl } from "./proxy";

/**
 * Pins this proxy's assumptions about @auth/core against the actual
 * installed package, so a dependency bump that changes any of them fails
 * this test loudly instead of silently reintroducing the 500-lockout bug
 * that proxy.ts exists to prevent. Runs entirely offline against the
 * package already on disk in node_modules — no network involved.
 *
 * `defaultCookies` isn't part of @auth/core's public `exports` map in its
 * package.json (only ".", "./adapters", "./errors", "./jwt", "./providers"
 * and "./types" are), so importing it as `@auth/core/lib/utils/cookie.js`
 * fails with ERR_PACKAGE_PATH_NOT_EXPORTED. Instead we resolve the "."
 * entry point (which IS exported) via `require.resolve`, take its
 * directory as the package root, and `import()` the internal file by
 * absolute disk path. Node's `exports` restriction only applies to
 * resolving a bare package specifier, not to a path that's already been
 * resolved to an absolute file — so this is a legitimate way to reach an
 * internal module, not a hack around something forbidden.
 */
const require = createRequire(import.meta.url);
const authCoreRoot = path.dirname(require.resolve("@auth/core"));
const { defaultCookies } = (await import(
  path.join(authCoreRoot, "lib/utils/cookie.js")
)) as {
  defaultCookies: (useSecureCookies: boolean) => {
    callbackUrl: { name: string };
  };
};

const ORIGIN = "http://localhost:3000";

/** Silence @auth/core's own `[auth][error]` logging for the rows in the
 * table below that are *supposed* to trigger a Configuration error — that's
 * expected noise from a library working as designed, not a real test
 * failure, and it would otherwise clutter `vitest run` output. */
const SILENT_LOGGER: NonNullable<AuthConfig["logger"]> = {
  error() {},
  warn() {},
  debug() {},
};

/** Minimal config to drive real `assertConfig()` validation with no
 * provider/adapter/db setup required. */
const AUTH_CONFIG: AuthConfig = {
  providers: [],
  secret: "contract-test-secret-not-used-in-anger",
  trustHost: true,
  basePath: "/api/auth",
  logger: SILENT_LOGGER,
};

/**
 * Hits @auth/core's `Auth()` directly — bypassing this repo's proxy and the
 * next-auth wrapper entirely — with a `session` GET request carrying the
 * given callback-url cookie value, and reports whether @auth/core rejected
 * it with the InvalidCallbackUrl/"server configuration" failure.
 *
 * `session` is used (rather than e.g. `signin`) because it isn't one of
 * @auth/core's HTML pages, so a config error comes back as a plain JSON 500
 * rather than a rendered error page — the same shape as the real-world
 * repro this branch fixes (`GET /api/auth/session?callbackUrl=trips` 500ing).
 */
async function authRejectsCallbackUrlCookie(value: string): Promise<boolean> {
  const request = new Request(`${ORIGIN}/api/auth/session`, {
    headers: { cookie: `authjs.callback-url=${value}` },
  });
  const response = await Auth(request, AUTH_CONFIG);
  return response.status === 500;
}

/**
 * What proxy.ts's own guard considers "poisoned" for a given (already
 * decoded) cookie value. This mirrors the two-part gate in `proxy()`'s
 * `poisonedCookies` filter, not just the bare `isValidHttpUrl` call: an
 * empty value is never poisoned — proxy.ts short-circuits on `!raw` before
 * ever calling `isValidHttpUrl`, matching @auth/core's own
 * `if (callbackUrlCookie && ...)` truthy guard in `assertConfig` — so an
 * empty cookie is invisible to both, not "invalid". For every non-empty
 * value, poisoned is exactly `!isValidHttpUrl(value)`.
 */
function proxyConsidersPoisoned(value: string): boolean {
  if (!value) return false;
  return !isValidHttpUrl(value, ORIGIN);
}

describe("proxy.ts contract with the installed @auth/core", () => {
  it("guards the callback-url cookie name @auth/core actually sets (secure and non-secure)", () => {
    // The most important assertion in this file: if @auth/core ever renames
    // this cookie, proxy.ts's CALLBACK_URL_COOKIES list silently stops
    // matching anything, and the guard becomes a no-op.
    expect(CALLBACK_URL_COOKIES).toContain(defaultCookies(true).callbackUrl.name);
    expect(CALLBACK_URL_COOKIES).toContain(defaultCookies(false).callbackUrl.name);
  });

  it.each([
    ["root-relative path", "/trips"],
    ["absolute https URL", "https://example.com/somewhere"],
    ["garbage (no protocol)", "garbage"],
    ["invalid percent-encoding", "100%"],
    ["empty value", ""],
  ])(
    "%s: real Auth() rejection matches proxy.ts's isValidHttpUrl verdict",
    async (_label, value) => {
      const expectedRejection = proxyConsidersPoisoned(value);
      const actualRejection = await authRejectsCallbackUrlCookie(value);
      expect(actualRejection).toBe(expectedRejection);
    },
  );
});
