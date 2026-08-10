# Auth callback-url Cookie Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a single malformed `authjs.callback-url` cookie from permanently bricking sign-in for a browser with "There is a problem with the server configuration".

**Architecture:** A Next.js proxy (Next 16's replacement for middleware) intercepts `/api/auth/*`, validates the `callback-url` cookie and `?callbackUrl=` query param using the exact same predicate `@auth/core` uses, and strips whichever is malformed *before* the request reaches the Auth.js handler — then expires the bad cookie in the browser so it doesn't come back.

**Tech Stack:** Next.js 16.2.9 (App Router), next-auth v5 beta (`@auth/core`), TypeScript, Vitest + jsdom.

## Background — verified root cause

`@auth/core/src/index.ts:112` calls `assertConfig()` at the top of every `Auth()` invocation. `assertConfig` (`@auth/core/src/lib/utils/assert.ts`) returns `InvalidCallbackUrl` when either the `callbackUrl` query param **or** the `callback-url` cookie fails `isValidHttpUrl`:

```ts
function isValidHttpUrl(url: string, baseUrl: string) {
  try {
    return /^https?:/.test(
      new URL(url, url.startsWith("/") ? baseUrl : undefined).protocol
    )
  } catch {
    return false
  }
}
```

A value with no scheme **and** no leading `/` makes `new URL()` throw → invalid → `Auth()` bails out early and renders the `Configuration` error page. Because the cookie is `httpOnly` and sticky, the browser resends it forever.

Reproduced against production (`travel-planner-nine-olive.vercel.app`):

| Request | Result |
|---|---|
| `?callbackUrl=trips` | Configuration error |
| `Cookie: __Secure-authjs.callback-url=garbage` | Configuration error |
| `Cookie: __Secure-authjs.callback-url=/trips` | OK |
| `Cookie: __Secure-authjs.callback-url=https://…/trips` | OK |
| `Cookie: __Secure-authjs.callback-url=` (empty) | OK |
| no cookie | OK |

## Global Constraints

- **Next 16 file convention:** the file MUST be `proxy.ts` at the repo root. `middleware.ts` is deprecated (`next/dist/build/index.js:651`) and having both files throws a build error (`index.js:645`).
- **Export name:** `next/dist/build/templates/middleware.js` resolves the handler as `(isProxy ? mod.proxy : mod.middleware) || mod.default`. Export a **named `proxy`** function.
- **Do not modify `lib/auth.ts`.** The bug is in how `@auth/core` reacts to untrusted client input, not in the app's auth config. `trustHost: true` and `session.strategy: "jwt"` are correct and verified working in production.
- **Validation predicate must mirror `@auth/core` exactly.** If it diverges, the proxy will pass through values Auth.js still rejects (bug persists) or strip values Auth.js accepts (breaks legitimate redirects).
- **Preserve raw cookie encoding for cookies we keep.** Validate on the *decoded* value (`request.cookies.get()`), but remove from the *raw* `cookie` header string. Round-tripping every cookie through decode→encode would corrupt values such as the `__Host-authjs.csrf-token` pair (contains a `|` that travels percent-encoded).
- Cookie deletion attributes must match how Auth.js set them (`@auth/core/src/lib/utils/cookie.ts:72-79`): `path: "/"`, `httpOnly: true`, `sameSite: "lax"`, `secure` iff the name carries the `__Secure-` prefix.
- Tests run under `vitest` with `environment: 'jsdom'` and `include: ['**/*.test.{ts,tsx}']`, so a root-level `proxy.test.ts` is collected automatically. The `@` alias maps to the repo root.

## File Structure

| File | Responsibility |
|---|---|
| `proxy.ts` (create, repo root) | Sole responsibility: sanitise untrusted Auth.js callback-url input on `/api/auth/*`. Exports `proxy` and `config`. |
| `proxy.test.ts` (create, repo root) | Unit tests for the guard, asserting on forwarded request headers and `Set-Cookie`. |
| `.github/workflows/reminders-cron.yml` (modify) | Add a config guard so the job no-ops cleanly when `APP_URL`/`CRON_SECRET` are unset, then re-enable the schedule. |

**Verified — no action needed:** Vercel functions already run in `syd1` (confirmed via `x-vercel-id: syd1::syd1::…`), co-located with the Neon DB in `ap-southeast-2`. Do **not** add a `regions` key to `vercel.json`.

**Testing note.** `NextResponse.next({ request: { headers } })` does not expose the forwarded headers as a request object — it encodes them onto the response as `x-middleware-override-headers` (a comma-separated list of names) plus one `x-middleware-request-<name>` header per entry. Assert against `x-middleware-request-cookie`. This was verified empirically against the installed Next build.

---

### Task 1: The callback-url guard proxy

**Files:**
- Create: `proxy.ts`
- Test: `proxy.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export function proxy(request: NextRequest): NextResponse` and `export const config: { matcher: string[] }`. Nothing else imports these — Next wires them by convention.

- [ ] **Step 1: Write the failing test**

Create `proxy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { config, proxy } from "./proxy";

const COOKIE = "__Secure-authjs.callback-url";
const ORIGIN = "https://travel-planner-nine-olive.vercel.app";

function request(opts: { path?: string; cookie?: string } = {}): NextRequest {
  return new NextRequest(`${ORIGIN}${opts.path ?? "/api/auth/signin"}`, {
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  });
}

/** The cookie header the Auth.js handler will actually receive. */
function forwardedCookie(response: Response): string | null {
  return response.headers.get("x-middleware-request-cookie");
}

describe("proxy — Auth.js callback-url guard", () => {
  it("passes through a request with no cookies untouched", () => {
    const response = proxy(request());
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("leaves a valid absolute callback-url cookie alone", () => {
    const cookie = `${COOKIE}=${ORIGIN}/trips`;
    const response = proxy(request({ cookie }));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(forwardedCookie(response)).toBeNull();
  });

  it("leaves a valid root-relative callback-url cookie alone", () => {
    const response = proxy(request({ cookie: `${COOKIE}=/trips` }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("strips a malformed callback-url cookie from the forwarded request", () => {
    const response = proxy(request({ cookie: `${COOKIE}=garbage` }));
    expect(forwardedCookie(response)).toBe("");
  });

  it("expires the malformed cookie in the browser", () => {
    const response = proxy(request({ cookie: `${COOKIE}=garbage` }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });

  it("keeps other cookies, with their original encoding, when stripping", () => {
    const response = proxy(
      request({
        cookie: `__Host-authjs.csrf-token=abc%7Cdef; ${COOKIE}=garbage; keep=1`,
      }),
    );
    const forwarded = forwardedCookie(response);
    expect(forwarded).toContain("__Host-authjs.csrf-token=abc%7Cdef");
    expect(forwarded).toContain("keep=1");
    expect(forwarded).not.toContain("garbage");
  });

  it("also guards the non-secure cookie name used over http", () => {
    const insecure = new NextRequest("http://localhost:3000/api/auth/signin", {
      headers: { cookie: "authjs.callback-url=garbage" },
    });
    const response = proxy(insecure);
    expect(forwardedCookie(response)).toBe("");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("ignores an empty cookie value, matching @auth/core", () => {
    const response = proxy(request({ cookie: `${COOKIE}=` }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("strips a malformed callbackUrl query param", () => {
    const response = proxy(request({ path: "/api/auth/signin?callbackUrl=trips" }));
    const rewrite = response.headers.get("x-middleware-rewrite") ?? "";
    expect(rewrite).not.toContain("callbackUrl");
  });

  it("leaves a valid callbackUrl query param alone", () => {
    const response = proxy(request({ path: "/api/auth/signin?callbackUrl=/trips" }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("only runs on the Auth.js routes", () => {
    expect(config.matcher).toEqual(["/api/auth/:path*"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run proxy.test.ts`
Expected: FAIL — cannot resolve `./proxy`.

- [ ] **Step 3: Write the implementation**

Create `proxy.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard against a poisoned Auth.js callback-url.
 *
 * `assertConfig()` in @auth/core re-validates the `callback-url` cookie and the
 * `?callbackUrl=` query param on EVERY /api/auth/* request, and bails out with
 * `InvalidCallbackUrl` if either isn't a valid http(s) URL. That failure renders
 * the "There is a problem with the server configuration" page — so one malformed
 * cookie locks that browser out of signing in permanently, because the browser
 * keeps resending it.
 *
 * We strip the malformed value before the handler sees it, and expire the cookie
 * so it doesn't come back. Valid values are passed through untouched.
 */

const CALLBACK_URL_COOKIES = [
  "__Secure-authjs.callback-url",
  "authjs.callback-url",
];

/**
 * Mirrors `isValidHttpUrl` in @auth/core/src/lib/utils/assert.ts. Keep these in
 * lockstep: if this is stricter we break legitimate redirects, and if it's
 * looser the bad value reaches the handler and the 500 comes back.
 */
function isValidHttpUrl(url: string, baseUrl: string): boolean {
  try {
    return /^https?:/.test(
      new URL(url, url.startsWith("/") ? baseUrl : undefined).protocol,
    );
  } catch {
    return false;
  }
}

/**
 * Drop the named cookies from a raw Cookie header. Operates on the raw string
 * rather than re-serialising parsed cookies, so surviving cookies keep their
 * original percent-encoding.
 */
function stripCookies(rawCookieHeader: string, names: string[]): string {
  return rawCookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair && !names.includes(pair.split("=")[0].trim()))
    .join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const { origin, searchParams } = request.nextUrl;

  const poisonedCookies = CALLBACK_URL_COOKIES.filter((name) => {
    const value = request.cookies.get(name)?.value;
    return !!value && !isValidHttpUrl(value, origin);
  });

  const param = searchParams.get("callbackUrl");
  const poisonedParam = !!param && !isValidHttpUrl(param, origin);

  if (poisonedCookies.length === 0 && !poisonedParam) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  if (poisonedCookies.length > 0) {
    const kept = stripCookies(request.headers.get("cookie") ?? "", poisonedCookies);
    headers.set("cookie", kept);
  }

  // A rewrite (not a redirect) keeps the method and body intact, which matters
  // because the sign-in flow POSTs to /api/auth/signin/<provider>.
  let response: NextResponse;
  if (poisonedParam) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("callbackUrl");
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }

  for (const name of poisonedCookies) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }

  return response;
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run proxy.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Verify the build accepts the file convention**

Run: `npx next build`
Expected: build succeeds, with **no** "Both middleware file and proxy file are detected" error and **no** "`middleware` file convention is deprecated" warning. Confirm the build output lists a Proxy/Middleware entry.

- [ ] **Step 6: Run the full test suite for regressions**

Run: `npm test`
Expected: the suite passes at the same level as before the change. If a test was already failing on `main`, note it — do not fix unrelated failures in this task.

- [ ] **Step 7: Commit**

```bash
git add proxy.ts proxy.test.ts
git commit -m "fix(auth): strip malformed callback-url before it reaches Auth.js

A malformed authjs.callback-url cookie makes assertConfig() in @auth/core
return InvalidCallbackUrl, which 500s every /api/auth/* request and renders
'There is a problem with the server configuration'. Because the cookie is
httpOnly and sticky, the browser resends it and sign-in stays broken for
that browser forever.

Strip the malformed cookie or ?callbackUrl= param before the handler runs,
and expire the cookie so it does not come back."
```

---

### Task 2: Make the reminders cron safe to re-enable

**Files:**
- Modify: `.github/workflows/reminders-cron.yml`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing consumed by later tasks.

**Context:** The schedule is currently commented out. The in-file comment records why: it fired every 5 minutes and the `curl` errored (`${APP_URL}` and/or `${CRON_SECRET}` were unset), which spammed failure emails. Re-enabling the schedule without fixing that failure mode would restart the spam. The guard makes the job skip cleanly instead of failing when config is absent, which removes the reason it was disabled.

**Note:** GitHub only runs scheduled workflows from the repository's default branch, so this has no effect until the branch is merged.

- [ ] **Step 1: Add the config guard and re-enable the schedule**

Replace the whole of `.github/workflows/reminders-cron.yml` with:

```yaml
name: Reminders cron

# Trigger the push-reminder dispatcher on a schedule. Vercel Hobby cron only
# runs once per day, so we drive the every-5-minutes cadence from here instead.
# The endpoint is auth'd by CRON_SECRET (fail-closed if unset). GitHub may delay
# scheduled runs under load, and disables schedules after 60 days of repo
# inactivity — fine for a low-stakes reminder ping.
#
# The job skips cleanly when APP_URL or CRON_SECRET are missing rather than
# failing: an unconfigured repo should stay quiet, not email a failure every
# five minutes. See docs/DEPLOY.md §5 for the repo Secret + Variable to set.
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {}

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Check cron config is present
        id: config
        run: |
          if [ -z "${APP_URL}" ] || [ -z "${CRON_SECRET}" ]; then
            echo "APP_URL and/or CRON_SECRET are not configured — skipping."
            echo "configured=false" >> "$GITHUB_OUTPUT"
          else
            echo "configured=true" >> "$GITHUB_OUTPUT"
          fi
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL }}

      - name: Hit the reminders endpoint
        if: steps.config.outputs.configured == 'true'
        run: |
          curl --fail --silent --show-error \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            "${APP_URL}/api/cron/reminders"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          APP_URL: ${{ vars.APP_URL }}
```

- [ ] **Step 2: Verify the workflow is valid YAML**

Run: `npx --yes js-yaml .github/workflows/reminders-cron.yml > /dev/null && echo "valid yaml"`
Expected: `valid yaml`. If `js-yaml` cannot be fetched offline, use `node -e "require('fs').readFileSync('.github/workflows/reminders-cron.yml','utf8')"` and inspect the indentation by eye against the block above instead — do not skip the check silently, report which method you used.

- [ ] **Step 3: Confirm the guard logic**

Verify by reading, and state the conclusion in your report:
- With neither variable set, the first step prints the skip message and sets `configured=false`, so the `curl` step is skipped and the job succeeds (no failure email).
- With both set, `configured=true` and the `curl` runs exactly as it did before.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/reminders-cron.yml
git commit -m "ci(reminders): skip cron cleanly when unconfigured, re-enable schedule

The schedule was disabled because the curl failed every 5 minutes when
APP_URL/CRON_SECRET were unset, spamming failure emails. Guard on config
presence so an unconfigured repo stays quiet, which makes the schedule
safe to turn back on."
```

---

## Self-Review

**1. Spec coverage.**
- Malformed cookie bricking sign-in → Task 1. ✅
- Malformed `?callbackUrl=` query param (the other `InvalidCallbackUrl` branch) → Task 1, rewrite path. ✅
- Cron never firing → Task 2. ✅
- Region mismatch → investigated and disproved (already `syd1`); explicitly out of scope with a "do not add `regions`" instruction so a later engineer doesn't re-add it. ✅

**2. Placeholder scan.** No TBDs; every code step carries the full literal content, and both new files are given in full.

**3. Type consistency.** `proxy(request: NextRequest): NextResponse` is the only exported function, referenced identically in the test and the implementation. `config.matcher` is `string[]` in both. The cookie-name list is defined once and reused for detection, stripping, and expiry.

**Residual risk, to report rather than paper over:** this guard neutralises the *symptom* for every browser. It does not explain how the malformed value got written in the first place — the app's own call sites pass `callbackUrl: "/trips"` (`app/signin/signin-buttons.tsx:14`) and `"/signin"` (`components/ui/sign-out-button.tsx:31`), both valid. The Vercel function log for a failed request prints the rejected value (`InvalidCallbackUrl. Received: …`); if that value is ever recovered it's worth a follow-up to find the writer.
