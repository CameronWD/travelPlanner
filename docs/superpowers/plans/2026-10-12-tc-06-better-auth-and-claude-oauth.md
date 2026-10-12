# TC-06: Better Auth and OAuth for the Claude connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sign-in from the Auth.js v5 beta to Better Auth, keeping every door and ADR 0057's one-door rule, and let any Claude client (claude.ai, phone, Desktop, Code) connect to `/api/mcp` by OAuth sign-in instead of operator tokens, with a Connected apps panel on the Account page.

**Architecture:** `lib/auth.ts` builds one Better Auth instance (`authServer`) with the Prisma adapter, Google, the magic-link plugin for the Sign-in link, a local-only dev-login plugin, the `jwt` plugin and `@better-auth/mcp` (an OAuth 2.1 authorisation server with dynamic client registration). The one door lives in `lib/sign-in-door.ts` and is called from Better Auth's `validateUserInfo` hook, the `session.create.before` hook and the magic-link sender, so every way in makes the same decision. `lib/auth.ts` keeps exporting `auth()` with today's `{ user } | null` shape so guards, layouts and the tests that mock it don't change. `/api/mcp` is wrapped by `requireMcpAuth`, which verifies the OAuth access token and hands over the Traveller id; everything behind `runAsTraveller` is untouched.

**Tech Stack:** better-auth 1.7.7, @better-auth/prisma-adapter, @better-auth/mcp 1.7.7 (+ @better-auth/oauth-provider, pulled in by it), @better-auth/cli 1.4.21 (schema generation only), Prisma 7, Next.js route handlers, Vitest.

**Spec:** `docs/specs/2026-10-12-tc-06-better-auth-and-claude-oauth.md` (ADR 0071; CONTEXT.md **Claude connection**, **Connected apps**).

## Global Constraints

- Branch `feat/tc-06-claude-oauth-2026-10-12`. Never commit to `main`. Never push or deploy. Never run `feedback:*`, `mcp:token`, `db:seed*`, or anything that imports `scripts/load-env.ts` (it loads `.env.production.local`, i.e. production). `prisma migrate dev` is allowed only against the local docker Postgres that `.env`'s `DATABASE_URL` names (`host.docker.internal:5432/trip`); never set `DIRECT_URL`.
- **Pin exact versions:** `better-auth@1.7.7`, `@better-auth/prisma-adapter@1.7.7`, `@better-auth/mcp@1.7.7`, dev `@better-auth/cli@1.4.21`. Remove `next-auth` and `@auth/prisma-adapter` in Task 4 (not before: tests in flight still import them).
- **Every door stays:** Google (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, callback path `/api/auth/callback/google` unchanged), Sign-in link by email (`AUTH_RESEND_KEY`/`AUTH_RESEND_FROM`, sent through `lib/mail.ts` + `renderSignInEmail`), dev login (only when `ALLOW_DEV_LOGIN === "true"` **and** `NODE_ENV !== "production"`). Each registers only when its env is set, exactly as `lib/auth.ts` gates them today.
- **One door (ADR 0057), behaviour identical to today's `signIn` callback** (read it in `lib/auth.ts` before Task 2): lowercased/trimmed email; Google (any OAuth provider) must present `email_verified === true` or is refused without recording an access request; allowlisted ⇒ in; pending Trip Invite ⇒ in (on the magic-link **send** pass: permit the mail only, no promotion, no notify; on the click pass and for Google: `admitByTripInvite`, notify admins once when a row was created); otherwise record an access request (Google: name + picture; magic link: bare address, `notify: false`) and refuse. The magic-link send pass is **not an oracle**: a refused address gets the same response as an accepted one and no mail. Globe Invites never admit.
- After every successful sign-in, `acceptPendingInvitesForUser(user.id, user.email)` runs (today's `events.signIn`).
- Sessions in the database (Better Auth default) with `cookieCache` enabled (5 minutes). Secret: `BETTER_AUTH_SECRET`, falling back to `AUTH_SECRET` so today's Vercel var keeps working. `baseURL` = `siteUrl()` (`lib/site-url.ts`).
- `auth()` from `@/lib/auth` keeps returning `{ user: { id, email, name, image } } | null`; `requireUser` in `lib/guards.ts` keeps its acting-traveller-first logic.
- `/api/mcp` must: 401 with the RFC 9728 `WWW-Authenticate` challenge when unauthenticated; accept only OAuth access tokens bound to resource `${siteUrl()}/api/mcp`; run as the token's Traveller through `runAsTraveller`; rate-limit per Traveller (120/min, as today); never reveal token details in reported errors. GET/DELETE stay 405 for authenticated callers.
- Migration: additive for Auth.js tables (`Account`, `Session`, `VerificationToken` stay, dropped in TC-13); `McpToken` is dropped; Google links copied from `Account` into the new account table in SQL inside the migration.
- Copy style: no em dashes in traveller-facing text (`test/copy-style.test.ts`), no semicolons in new prose.
- Verification tiers (CLAUDE.md): inner loop `npx vitest run <files>`; task done `npx vitest related --run <changed source files>` + `npx tsc --noEmit` + `npx eslint <changed files>`. Never the full suite or `next build` per task (the controller runs them once at the end, plus `npm run test:integration`).
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Read before writing code:** `node_modules/next/dist/docs/` (this Next has breaking changes) and, for Better Auth, the type declarations in `node_modules/better-auth/dist/**/*.d.mts`, `node_modules/@better-auth/mcp/dist/index.d.mts`, `node_modules/@better-auth/oauth-provider/dist/{index,client}.d.mts` and `node_modules/@better-auth/core/dist/types/init-options.d.mts`. The API names below were checked against 1.7.7, but confirm each one where the plan says "confirm".

## Review Focus

1. A Traveller whose allowlist entry was **revoked** after they first signed in must be refused on their next sign-in (Google and magic link alike), not let through by a cached session or a hook that only runs for new users — Task 3 pins it (`session.create.before`).
2. A Google profile with `email_verified: false` must be refused **and leave no User row** — Task 3 pins it (`validateUserInfo` rejects before `create-user`).
3. An OAuth access token for a Traveller who has since been **removed from a trip** must still get `NOT_FOUND_TEXT` for that trip; one whose User row is gone must get a 401, not a 500 — Task 5 pins it.
4. **Disconnecting** in Connected apps must make the next `/api/mcp` call with the old access token fail (token revoked, not just consent deleted) — Task 6 pins it.
5. The Landing reached from an OAuth authorise redirect must, after sign-in, **continue the OAuth flow** back to the client instead of landing on `/trips` — Task 5 pins it.

---

### Task 1: Dependencies, schema and migration

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/auth.ts` is NOT touched here; create a minimal `lib/auth-schema-config.ts` only if the CLI needs an importable config (see Step 2) — otherwise none
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261012120000_better_auth/migration.sql`
- Test: `prisma/schema.test.ts` (new, tiny: asserts the models exist in the schema text) and `test/integration/migration-better-auth.test.ts` (new; see Step 6)

**Interfaces:**
- Produces Prisma models (and the Better Auth `modelName` each maps to): `AuthSession` (`authSession`), `AuthAccount` (`authAccount`), `AuthVerification` (`authVerification`), `Jwks` (`jwks`), `OauthClient` (`oauthClient`), `OauthResource`, `OauthClientResource`, `OauthAccessToken`, `OauthConsent`, `OauthClientAssertion` (plugin defaults). `User` gains `emailVerified Boolean @default(false)`, `emailVerifiedAt DateTime?` (renamed from today's `emailVerified`), `createdAt DateTime @default(now())`, `updatedAt DateTime @default(now()) @updatedAt`, and relations `authSessions AuthSession[]`, `authAccounts AuthAccount[]`. `McpToken` and `User.mcpTokens` removed.

- [ ] **Step 1: Install**

```bash
npm install --save-exact better-auth@1.7.7 @better-auth/prisma-adapter@1.7.7 @better-auth/mcp@1.7.7
npm install --save-exact --save-dev @better-auth/cli@1.4.21
```

(`@better-auth/mcp` pulls `@better-auth/oauth-provider` and `@better-auth/core`.) Keep `next-auth` and `@auth/prisma-adapter` installed for now.

- [ ] **Step 2: Generate the Better Auth schema.** Write a throwaway config `scripts/better-auth-schema.config.ts` (not committed) that constructs `betterAuth({ database: prismaAdapter(new PrismaClient(), { provider: "postgresql" }), session: { modelName: "authSession" }, account: { modelName: "authAccount" }, verification: { modelName: "authVerification" }, plugins: [magicLink({ sendMagicLink: async () => {} }), jwt(), mcp({ loginPage: "/", consentPage: "/connect", resource: "http://localhost:3000/api/mcp" })] })` and run

```bash
npx @better-auth/cli@1.4.21 generate --config scripts/better-auth-schema.config.ts --output prisma/better-auth.generated.prisma -y
```

Read the output. If the CLI refuses to load the config (Next/server-only imports, ESM issues), fall back to the plugin's own schema definitions: `node_modules/@better-auth/core/dist/db/*` for `user`/`session`/`account`/`verification`, `node_modules/better-auth/dist/plugins/jwt/*.mjs` (search `modelName: "jwks"`), and `node_modules/@better-auth/oauth-provider/dist/authorize-*.mjs` (search `modelName: "oauth`) — each lists its fields with types and `required`/`unique`. Delete the throwaway files afterwards.

- [ ] **Step 3: Merge into `prisma/schema.prisma`:**
  - `User`: rename `emailVerified DateTime?` → `emailVerifiedAt DateTime?` (nothing in `lib/app/server` reads it — grep confirmed), add `emailVerified Boolean @default(false)`, `createdAt DateTime @default(now())`, `updatedAt DateTime @default(now()) @updatedAt`, relations to the new tables. Keep `name String?` (Better Auth writes a string; a null read is fine at runtime — add a schema comment saying so).
  - Add the generated models, renaming core ones to `AuthSession`/`AuthAccount`/`AuthVerification` (Prisma model names; the Better Auth `modelName` in Task 3 is the camelCase form). Keep every field and index the generator emitted; add `@@index([userId])` on `AuthSession` and `AuthAccount` if missing.
  - Remove `model McpToken` and `User.mcpTokens`.
  - Leave `Account`, `Session`, `VerificationToken` exactly as they are (dropped in TC-13).

- [ ] **Step 4: Write the migration.** Generate with `npx prisma migrate dev --create-only --name better_auth` against the local DB, then edit the SQL: after the `CREATE TABLE`s and `ALTER TABLE "User"` statements, append the data steps and make the User changes non-destructive:

```sql
-- Rename, do not drop: Auth.js's DateTime "emailVerified" becomes "emailVerifiedAt".
ALTER TABLE "User" RENAME COLUMN "emailVerified" TO "emailVerifiedAt";
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "emailVerified" = true WHERE "emailVerifiedAt" IS NOT NULL;
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Carry Google links across so a Google sign-in lands in the same User (ADR 0071 §2).
INSERT INTO "AuthAccount" ("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "scope", "createdAt", "updatedAt")
SELECT "id", "providerAccountId", "provider", "userId", "access_token", "refresh_token", "id_token", "scope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" WHERE "provider" = 'google';

DROP TABLE "McpToken";
```

Check the generated `AuthAccount` column names against the INSERT (the generator may name them differently, e.g. `accessTokenExpiresAt`); check `Account`'s Auth.js column names in the schema (`refresh_token`, `access_token`, `id_token`, `scope`). If Prisma's generated SQL already contains a `DROP COLUMN "emailVerified"`/`ADD COLUMN`, replace that pair with the RENAME above. Apply locally: `npx prisma migrate dev` (local docker DB only), then `npx prisma generate`.

- [ ] **Step 5: Schema test** (`prisma/schema.test.ts`):

```ts
import { readFileSync } from "node:fs";
const schema = readFileSync("prisma/schema.prisma", "utf8");
it("has the Better Auth models and no McpToken", () => {
  for (const m of ["AuthSession", "AuthAccount", "AuthVerification", "Jwks", "OauthClient", "OauthAccessToken", "OauthConsent"]) {
    expect(schema).toMatch(new RegExp(`^model ${m} \\{`, "m"));
  }
  expect(schema).not.toMatch(/^model McpToken/m);
  expect(schema).toMatch(/emailVerified\s+Boolean\s+@default\(false\)/);
  expect(schema).toMatch(/emailVerifiedAt\s+DateTime\?/);
});
```

- [ ] **Step 6: Integration test** (`test/integration/migration-better-auth.test.ts`, `describe.skipIf(process.env.INTEGRATION !== "1")`): insert a User with an old-style `Account` row for `google` via `db.$executeRaw`, then assert `db.authAccount.findFirst({ where: { userId } })` has `providerId: "google"` and the same `accountId` — this only proves the copy statement's shape against a real Postgres when run after `migrate deploy` on a DB that had the row **before** migrating, which CI doesn't have. So instead the test asserts the SQL file contains the INSERT…SELECT with the right column names (read the migration file), and that `db.authAccount.create` with a minimal row round-trips. Keep it honest in its name.

- [ ] **Step 7: Checks and commit.** `npx tsc --noEmit` will fail until Task 3 replaces `lib/mcp/tokens.ts`'s `db.mcpToken` use — that is expected here: run `npx vitest run prisma/schema.test.ts` and `npx prisma validate`, note the tsc failure in the report (Task 3 clears it), commit:

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations/20261012120000_better_auth prisma/schema.test.ts test/integration/migration-better-auth.test.ts
git commit -m "feat(auth): Better Auth dependencies, schema and migration (ADR 0071)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The one door as a pure module

**Files:**
- Create: `lib/sign-in-door.ts`, `lib/sign-in-door.test.ts`

**Interfaces:**
- Produces:

```ts
export type DoorMethod = "google" | "magic-link" | "dev-login";
export type DoorPass = "send" | "sign-in"; // magic-link send pass vs any completed sign-in
export interface DoorInput {
  email: string | null | undefined;
  method: DoorMethod;
  pass: DoorPass;
  /** Raw OAuth profile for google (email_verified, name, picture). */
  profile?: { email_verified?: unknown; name?: unknown; picture?: unknown } | null;
  nodeEnv?: string; // defaults to process.env.NODE_ENV
}
export type DoorDecision =
  | { allow: true; email: string }
  | { allow: false; reason: "no-email" | "unverified" | "refused" | "dev-login-in-production" };
/** ADR 0057's one door. Performs the side effects today's signIn callback performs (admit, notify, record). */
export async function decideSignIn(input: DoorInput, deps?: DoorDeps): Promise<DoorDecision>;
export interface DoorDeps { isAllowedEmail; hasPendingTripInvite; admitByTripInvite; notifyAdmins; recordAccessRequest } // defaults to the real lib/* functions
```

- [ ] **Step 1: Port the tests.** Copy every case under `describe("signIn callback")` in `lib/auth.test.ts` (invite admit + promote; second sign-in after acceptance; Globe invite refused; Google unverified refused without access request, both `false` and missing; dev-login outside/inside production; `ALLOWED_EMAILS` alone; unlisted refused with access request from the verified profile; no email; allowlist lookup throws ⇒ refused; resend allowlisted with no profile; resend send pass refused ⇒ `{ allow: false, reason: "refused" }` **and** access request recorded without name/avatar/push; resend click pass refused; pending invite on send pass permits without promoting; click pass promotes and notifies; email lowercased and trimmed) as calls to `decideSignIn` with injected `deps` mocks. Add `it("the send pass never admits by invite more than the mail")` and `it("admitByTripInvite that created nothing does not notify")`.

Run: `npx vitest run lib/sign-in-door.test.ts` — FAIL (module missing).

- [ ] **Step 2: Implement** `decideSignIn` by transcribing the callback's logic (keep its comments where they explain a trap: the two passes, one-shot invite tickets, fail-closed verification). `method: "dev-login"` ⇒ `{ allow: nodeEnv !== "production" }`. Wrap the allowlist lookup so a throw refuses.

- [ ] **Step 3: Run** — PASS. **Step 4:** task-done checks (`npx vitest related --run lib/sign-in-door.ts`, tsc may still fail from Task 1 — note it, eslint on the two files); commit `feat(auth): the one sign-in door as a pure module`.

---

### Task 3: Better Auth instance, hooks, doors, dev login, `auth()` facade, route handler

**Files:**
- Rewrite: `lib/auth.ts`
- Create: `lib/auth-dev-login.ts` (plugin), `lib/auth-client.ts` (browser client)
- Rewrite: `app/api/auth/[...nextauth]/route.ts` → delete it; create `app/api/auth/[...all]/route.ts`
- Delete: `lib/mcp/tokens.ts`, `lib/mcp/tokens.test.ts` (Task 5 replaces the route; deleting here clears Task 1's tsc failure — temporarily make `app/api/mcp/route.ts` import nothing from tokens by stubbing `verifyToken` out? No: Task 5 runs right after; instead move `ActingUser` into `lib/mcp/acting-traveller.ts` here and leave `tokens.ts` in place until Task 5)
- Modify: `lib/mcp/acting-traveller.ts` (own the `ActingUser` type)
- Rewrite tests: `lib/auth.test.ts`, `lib/auth-dev-login.test.ts`, `lib/auth-sign-in-link.test.ts`

**Interfaces:**
- Produces from `lib/auth.ts`: `export const authServer` (the `betterAuth(...)` instance); `export async function auth(): Promise<{ user: { id: string; email: string; name: string | null; image: string | null } } | null>` (reads `authServer.api.getSession({ headers: await headers() })`); `export type SessionUser`.
- Produces from `lib/auth-client.ts`: `export const authClient = createAuthClient({ plugins: [magicLinkClient(), oauthProviderClient()] })` (`better-auth/react`, `better-auth/client/plugins`, `@better-auth/oauth-provider/client`).
- Produces from `lib/auth-dev-login.ts`: `export function devLogin()` — a plugin with `POST /dev-login` `{ email }`.
- Consumes: `decideSignIn` (Task 2); models from Task 1.

- [ ] **Step 1: Failing tests.** Rewrite `lib/auth.test.ts` to test the **wiring**, with `better-auth` real and `@/lib/db` mocked where needed, or by asserting on `authServer.options`:
  - `socialProviders.google` present only when both env vars set (port of `auth-sign-in-link.test.ts`'s pattern, which uses `vi.resetModules()` + env).
  - magic-link registered only when both Resend vars set; `sendMagicLink` with an allowed address calls `sendMail` with `renderSignInEmail({ url })` and `AUTH_RESEND_FROM`; with a refused address it **does not** call `sendMail` and **does not throw** (not an oracle); a Resend failure throws (so the endpoint reports it).
  - dev-login plugin present only when `ALLOW_DEV_LOGIN==="true"` and not production (port `auth-dev-login.test.ts`).
  - `user.validateUserInfo` calls `decideSignIn` with `method: "google"`, the raw profile, `pass: "sign-in"` for an oauth source, and returns `{ error: "..." }` on refusal; for `method: "magic-link"` it passes `pass: "sign-in"`.
  - `databaseHooks.session.create.before` refuses (returns `false`) when `decideSignIn` refuses for the user's email (Review Focus 1), and `session.create.after` calls `acceptPendingInvitesForUser`.
  - `auth()` maps a Better Auth session to `{ user: { id, email, name, image } }` and `null` when absent.
  Run: `npx vitest run lib/auth.test.ts lib/auth-dev-login.test.ts lib/auth-sign-in-link.test.ts` — FAIL.

- [ ] **Step 2: Implement `lib/auth.ts`:**

```ts
import "server-only";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { magicLink, jwt } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "@better-auth/mcp";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { decideSignIn } from "@/lib/sign-in-door";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { renderSignInEmail } from "@/lib/sign-in-email";
import { sendMail } from "@/lib/mail";
import { devLogin } from "@/lib/auth-dev-login";

const base = siteUrl();
export const MCP_RESOURCE = `${base}/api/mcp`;

export const authServer = betterAuth({
  baseURL: base,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  session: { modelName: "authSession", cookieCache: { enabled: true, maxAge: 5 * 60 } },
  account: {
    modelName: "authAccount",
    // Google onto a link-first account by email (spec 2026-10-01 §B2); verification is enforced in the door.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  verification: { modelName: "authVerification" },
  user: {
    modelName: "user",
    validateUserInfo: async ({ user, source }) => {
      const method = source.method === "oauth" ? "google" : source.method === "magic-link" ? "magic-link" : "dev-login";
      const decision = await decideSignIn({ email: user.email, method, pass: "sign-in", profile: source.oauth?.profile ?? null });
      if (!decision.allow) return { error: "AccessDenied" }; // confirm the ValidateUserInfoResult shape in init-options.d.mts
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          const decision = await decideSignIn({ email: user?.email, method: "magic-link", pass: "sign-in" });
          return decision.allow; // false cancels the session (Review Focus 1)
        },
        after: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          if (user?.email) await acceptPendingInvitesForUser(session.userId, user.email);
        },
      },
    },
  },
  socialProviders: process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? { google: { clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET } }
    : {},
  onAPIError: { errorURL: "/" }, // AccessDenied lands on the Landing's denied panel, as pages.error did
  plugins: [
    ...(process.env.AUTH_RESEND_KEY && process.env.AUTH_RESEND_FROM
      ? [magicLink({
          expiresIn: 60 * 60,
          sendMagicLink: async ({ email, url }) => {
            // The send pass is not an oracle (ADR 0057): a refused address gets no mail and the same response.
            const decision = await decideSignIn({ email, method: "magic-link", pass: "send" });
            if (!decision.allow) return;
            const result = await sendMail({ to: email, ...renderSignInEmail({ url }) },
              { AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY, AUTH_RESEND_FROM: process.env.AUTH_RESEND_FROM });
            if (!result.sent) throw new Error(result.error);
          },
        })]
      : []),
    ...(process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production" ? [devLogin()] : []),
    jwt(),
    mcp({ loginPage: "/", consentPage: "/connect", resource: MCP_RESOURCE }),
    nextCookies(), // must be last
  ],
});

export type SessionUser = { id: string; email: string; name: string | null; image: string | null };

/** Today's shape, so guards, layouts and the tests that mock this module are unchanged. */
export async function auth(): Promise<{ user: SessionUser } | null> {
  const s = await authServer.api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  const { id, email, name, image } = s.user;
  return { user: { id, email, name: name ?? null, image: image ?? null } };
}
```

  The session `before` hook: `decideSignIn` with `pass: "sign-in"` for an existing user must not re-run the Google verification check (there's no profile) — that's correct: the profile check happened in `validateUserInfo` for the OAuth sign-in. But the hook must not **double-admit** by invite on the same sign-in: `admitByTripInvite` is idempotent (`created` false on the second call), and `notifyAdmins` only fires when a row was created, so running the door twice on one sign-in is safe. Say so in a comment.

  Also confirm: whether `validateUserInfo` is called for the magic-link method on a **new** user (the d.mts says every method) — if it isn't, the `session.create.before` hook still covers it (the user row would exist briefly; note that in the report as a deviation from "no User row is created" and add a `user.create.before` hook that calls the door too, so a refused new magic-link user gets no row).

- [ ] **Step 3: `lib/auth-dev-login.ts`** (plugin), using `createAuthEndpoint` from `better-auth/api` and `setSessionCookie` from `better-auth/cookies` (confirm both export names):

```ts
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";

/** Local-only "sign in as anyone" door. Registered only when ALLOW_DEV_LOGIN === "true" and never in production (lib/auth.ts). */
export function devLogin(): BetterAuthPlugin {
  return {
    id: "dev-login",
    endpoints: {
      devLogin: createAuthEndpoint("/dev-login", { method: "POST", body: z.object({ email: z.string().email() }) }, async (ctx) => {
        if (process.env.NODE_ENV === "production") throw new APIError("FORBIDDEN");
        const email = ctx.body.email.trim().toLowerCase();
        const user = await ctx.context.internalAdapter.findUserByEmail(email);
        if (!user) throw new APIError("UNAUTHORIZED");
        const session = await ctx.context.internalAdapter.createSession(user.user.id, ctx);
        await setSessionCookie(ctx, { session, user: user.user });
        return ctx.json({ ok: true });
      }),
    },
  };
}
```

  Confirm `internalAdapter.findUserByEmail` / `createSession` signatures in `@better-auth/core/dist/db/*.d.mts` (`findUserByEmail` returns `{ user, accounts } | null`).

- [ ] **Step 4: `lib/auth-client.ts`** and the route handler:

```ts
// lib/auth-client.ts
"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
export const authClient = createAuthClient({ plugins: [magicLinkClient(), oauthProviderClient()] });
```

```ts
// app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { authServer } from "@/lib/auth";
export const { GET, POST } = toNextJsHandler(authServer);
```

  Delete `app/api/auth/[...nextauth]/route.ts`. Move `export type ActingUser` into `lib/mcp/acting-traveller.ts` and make `lib/mcp/tokens.ts` import it from there (tokens.ts itself is deleted in Task 5).

- [ ] **Step 5: Run** the three test files — PASS. `npx tsc --noEmit` should now pass except for `lib/mcp/tokens.ts`'s `db.mcpToken` (Task 5) — if so, add `// @ts-expect-error McpToken is gone; this file is deleted in Task 5` lines so the branch type-checks between tasks, and say so. **Step 6:** task-done checks; commit `feat(auth): sign-in on Better Auth with the one door, dev login and the auth() facade`.

---

### Task 4: Call sites — Landing, sign-out, dev login, trip-ref, proxy, test config; drop next-auth

**Files:**
- Modify: `app/landing/signin-buttons.tsx`, `app/landing/email-sign-in.tsx`, `components/ui/sign-out-button.tsx`, `lib/trip-ref.ts`, `proxy.ts` (+ `proxy.test.ts` if present), `vitest.integration.config.ts`, `package.json`
- Tests: `app/landing/signin-buttons.test.tsx`, `app/landing/email-sign-in.test.tsx`, `components/ui/sign-out-button.test.tsx`, `lib/trip-ref.test.ts` (if present), `proxy.test.ts`

**Interfaces:**
- Consumes `authClient` (Task 3). `auth()` consumers (`lib/guards.ts`, both layouts, `app/page.tsx`, `app/api/client-error/route.ts`) need **no change**; verify by running their tests.

- [ ] **Step 1: Failing tests.** In each UI test, replace the `next-auth/react` mock with a mock of `@/lib/auth-client` (`authClient.signIn.social`, `authClient.signIn.magicLink`, `authClient.signOut`, `authClient.$fetch`) and assert the calls:
  - Google button → `authClient.signIn.social({ provider: "google", callbackURL })`.
  - Email form → `authClient.signIn.magicLink({ email, callbackURL })`; the panel shows the same "check your email" state whether the result is ok or an error that is not a network failure (port today's neutral handling: `res.error` absent or AccessDenied ⇒ neutral).
  - Dev login → `authClient.$fetch("/dev-login", { method: "POST", body: { email } })` then navigate to `callbackURL`.
  - Sign out → `authClient.signOut()` then navigate to `/`.
  - `lib/trip-ref.ts` `viewerIdFromRequest` reads the cookie cache: mock `better-auth/cookies` `getCookieCache` → returns the user id, `null` when absent or throwing.
  - `proxy.ts`: remove `authCallbackCookieGuard`, `CALLBACK_URL_COOKIES` and `/api/auth/:path*` from the matcher (they guarded an Auth.js cookie that no longer exists); delete their tests; everything else in `proxy.ts` (request-path header etc.) unchanged and its tests green.
  Run — FAIL.

- [ ] **Step 2: Implement** each call site; `trip-ref.ts`:

```ts
import { getCookieCache } from "better-auth/cookies";
export async function viewerIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const cached = await getCookieCache(req, { secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET });
    return typeof cached?.user?.id === "string" ? cached.user.id : null;
  } catch { return null; }
}
```

  (The cache is at most 5 minutes stale after sign-out — acceptable for the share page's "is the viewer a member" nicety; note it in the comment.) `vitest.integration.config.ts`: replace the `inline: [/node_modules\/next-auth\//]` entry with `better-auth` if the integration run needs it (try without first; keep the comment accurate either way).

- [ ] **Step 3: Remove the old packages:** `npm uninstall next-auth @auth/prisma-adapter`; grep for any remaining `next-auth`/`authjs` import or string in `lib app components server test scripts` and remove or reword (comments in `lib/access.ts`, `lib/next-steps-builder.ts`, `lib/admin-notify.ts` mention next-auth — update the wording). `.env.example`: add `BETTER_AUTH_SECRET` (keep `AUTH_SECRET` with a note that either works).

- [ ] **Step 4: Run** the changed tests plus `app/(app)/layout.test.tsx`, `app/page.test.tsx`, `app/(focus)` tests, `lib/guards` tests — PASS. `npx tsc --noEmit` clean. **Step 5:** task-done checks; commit `feat(auth): Landing, sign-out, dev login, trip-ref and proxy on Better Auth; drop next-auth`.

---

### Task 5: OAuth for `/api/mcp` — discovery, consent page, Landing continuation, token removal

**Files:**
- Rewrite: `app/api/mcp/route.ts`, `app/api/mcp/route.test.ts`
- Create: `app/.well-known/oauth-authorization-server/route.ts`, `app/.well-known/oauth-protected-resource/route.ts`, `app/.well-known/oauth-protected-resource/api/mcp/route.ts` (path-aware variant some clients probe)
- Create: `app/connect/page.tsx`, `app/connect/consent-form.tsx` (client), `app/connect/page.test.tsx`
- Modify: `app/page.tsx` / `app/landing/*` so an OAuth-initiated visit continues the flow after sign-in
- Delete: `lib/mcp/tokens.ts`, `lib/mcp/tokens.test.ts`, `scripts/mcp-token.ts`, `scripts/mcp-token-run.ts`, `scripts/mcp-token-run.test.ts`, the `mcp:token` script in `package.json`
- Modify: `test/integration/mcp.test.ts`, `lib/rate-limit.ts` only if its key type needs widening (it takes a string — no change expected)

**Interfaces:**
- Consumes `authServer`, `MCP_RESOURCE` (Task 3); `runAsTraveller`, `ActingUser` from `lib/mcp/acting-traveller.ts`.
- Produces: `/api/mcp` POST = `requireMcpAuth(authServer, handler, { resource: MCP_RESOURCE })`.

- [ ] **Step 1: Read first:** `node_modules/@better-auth/mcp/dist/index.d.mts` (whole file) and `node_modules/@better-auth/oauth-provider/dist/index.d.mts` for `oauthProviderAuthServerMetadata` / `metadataResponse` / the protected-resource metadata helper, and `client.d.mts` for `oauth2.consent`, `oauth2.getClient`. Write down in the report the exact helper names you used.

- [ ] **Step 2: Failing tests** (`app/api/mcp/route.test.ts`, rewritten): mock `@better-auth/mcp`'s `requireMcpAuth` to call the handler with claims `{ sub: "user-1" }` when the request carries `authorization: Bearer good`, and to return the plugin's 401 shape otherwise; mock `@/lib/db` `user.findUnique`.
  - no header ⇒ 401 with a `WWW-Authenticate` header containing `resource_metadata` (whatever `requireMcpAuth` produces — assert presence, not exact text).
  - `sub` whose User row is gone ⇒ 401 `{ error: "Unauthorized" }`, no throw (Review Focus 3).
  - good token ⇒ initialize answers with the teepee server info; tools run as that Traveller (`getActingTraveller().id === "user-1"`).
  - rate limit: 121st request in a minute for the same `sub` ⇒ 429 with `Retry-After`.
  - a throwing user lookup ⇒ generic 500, reported, with no bearer token in the reported error (keep the `redacted` helper, scrubbing the raw token string only).
  - GET and DELETE ⇒ 405.
  `app/connect/page.test.tsx`: renders the asking client's name from `oauth2.getClient`, Allow calls `authClient.oauth2.consent({ accept: true, oauth_query })`, Cancel calls it with `accept: false`; a visit with no `client_id` in the query shows "Nothing is asking to connect". Run — FAIL.

- [ ] **Step 3: Implement `/api/mcp`:**

```ts
import { requireMcpAuth } from "@better-auth/mcp";
import { authServer, MCP_RESOURCE } from "@/lib/auth";
// ...existing imports minus tokens
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

const handler = async (req: Request, claims: { sub?: string }) => {
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (!userId) return unauthorized();
  let user: ActingUser | null;
  try {
    user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, image: true } });
  } catch (err) {
    await reportError(redacted(err, req.headers.get("authorization")), { route: "/api/mcp", source: "server" });
    return Response.json({ error: "Server error" }, { status: 500 });
  }
  if (!user) return unauthorized();
  if (!limiter.allow(user.id)) return tooMany();
  try {
    return await runAsTraveller(user, async () => { /* unchanged transport code */ });
  } catch (err) { /* unchanged, reported with userId */ }
};

export const POST = requireMcpAuth(authServer, handler, { resource: MCP_RESOURCE });
export const GET = notAllowed; export const DELETE = notAllowed;
```

  `unauthorized()` keeps the bare `{ error: "Unauthorized" }` body with `WWW-Authenticate: Bearer` for the user-gone case (the plugin's own 401 handles the no-token case). Discovery routes: each exports `GET` returning the plugin's metadata helper for `authServer` (confirm the helper; if the plugin serves these only under `/api/auth/.well-known/...`, the root routes return `Response.redirect` 302 to them, or proxy the JSON — prefer proxying the JSON so clients that don't follow redirects on discovery still work).

- [ ] **Step 4: Consent page** `app/connect/page.tsx` (server): `requireUser()`; read `client_id` from `searchParams`; load the client's name via `authServer.api` (confirm the endpoint, e.g. `oauth2GetClient` / `getOAuthClient`); render `<ConsentForm clientName=... />` inside the app's `Card` with the heading "Claude wants to access your trips as [travellerName]" and copy "It will see and change exactly what you can. Everything it does shows in Activity, marked via Claude." Buttons: **Allow** / **Cancel**. `consent-form.tsx` calls `authClient.oauth2.consent({ accept, oauth_query: window.location.search })` and follows the returned redirect (`window.location.assign(res.data.url)` — confirm the response shape). Use plain punctuation.

- [ ] **Step 5: Landing continuation (Review Focus 5).** When the Landing is opened by the OAuth plugin it carries the signed authorise query (`client_id`, `redirect_uri`, `sig`, `exp`, …). In `app/page.tsx`, if `searchParams` has `client_id` and `sig`, pass `callbackUrl = "/api/auth/oauth2/continue?" + <the original query string>` to the Landing so every sign-in button and the magic link return into the flow (confirm `/oauth2/continue` is the post-login continuation endpoint by reading `authorize-*.mjs` near `"/oauth2/continue"`; if the plugin expects a different continuation, use that). `safeCallbackPath` must accept this same-origin path (check `lib/safe-callback.ts`; if it strips query strings, extend it to keep the query for exactly the `/api/auth/oauth2/continue` path, with a test). Test in `app/page.test.tsx`: an OAuth query yields that callbackUrl; an ordinary visit is unchanged.

- [ ] **Step 6: Remove tokens** (files, script, `package.json` entry) and rewrite `test/integration/mcp.test.ts` to get an access token through the real flow against `authServer.handler`: dev-login (set `ALLOW_DEV_LOGIN=true` in the test env — check how the integration config sets env) ⇒ session cookie; `POST /api/auth/oauth2/register` (dynamic client, `redirect_uris: ["http://localhost/cb"]`, `token_endpoint_auth_method: "none"`); `GET /api/auth/oauth2/authorize?...code_challenge...` with the cookie ⇒ consent redirect ⇒ `POST /api/auth/oauth2/consent { accept: true, oauth_query }` ⇒ redirect with `code` ⇒ `POST /api/auth/oauth2/token` (PKCE verifier) ⇒ `access_token`. Then the existing three cases (add_stop as A; B on A's trip ⇒ `NOT_FOUND_TEXT`; a **revoked** token ⇒ 401: revoke via `POST /api/auth/oauth2/revoke`). Keep the helper that builds the chain in `test/integration/helpers/oauth-flow.ts` so Task 6 reuses it.

- [ ] **Step 7: Run** `npx vitest run app/api/mcp/route.test.ts app/connect app/page.test.tsx lib/mcp` — PASS; `npx tsc --noEmit` clean (tokens gone). Task-done checks; commit `feat(mcp): OAuth sign-in for the Claude connection; retire operator tokens`.

---

### Task 6: Connected apps on the Account page

**Files:**
- Create: `server/actions/connected-apps.ts`, `server/actions/connected-apps.test.ts`, `components/account/connected-apps-panel.tsx`, `components/account/connected-apps-panel.test.tsx`
- Modify: `app/(app)/account/page.tsx` (+ `page.test.tsx`)
- Test: `test/integration/connected-apps.test.ts`

**Interfaces:**
- Produces `listConnectedApps(): Promise<{ id: string; clientName: string; connectedAt: string; lastUsedAt: string | null }[]>` and `disconnectApp(clientId: string): Promise<ActionResult>`; both start with `requireUser()` and act only on that user's consents/tokens.

- [ ] **Step 1: Failing tests.** Actions: `listConnectedApps` maps the user's `OauthConsent` rows (join `OauthClient` for the name; `lastUsedAt` = latest `OauthAccessToken.createdAt` for that client+user, or null); `disconnectApp` deletes the consent **and** that client's access tokens for the user, through `authServer.api` endpoints (`oauth2DeleteConsent` / revoke — confirm names and whether delete-consent revokes tokens; if not, delete the token rows via `db.oauthAccessToken.deleteMany({ where: { userId, clientId } })`), and refuses a consent that isn't the user's (`NOT_FOUND`). Panel: lists apps with name, "Connected 12 Oct", "Last used 2 hours ago" (`relativeTime`), a Disconnect button with an inline confirm (no `confirm()`), empty state "Nothing is connected yet. Add Teepee in your Claude app and sign in to connect it." Account page renders the panel under a new "Connected apps" `Card` after Devices. Run — FAIL.
- [ ] **Step 2: Implement.** Follow `devices-panel.tsx` / `server/actions/devices.ts` for shape and style.
- [ ] **Step 3: Integration test** (reuse `test/integration/helpers/oauth-flow.ts`): connect, `listConnectedApps` shows the client, `disconnectApp`, then `/api/mcp` with the old access token ⇒ 401 (Review Focus 4).
- [ ] **Step 4: Run** the four test files — PASS. Task-done checks; commit `feat(account): Connected apps with disconnect`.

---

### Task 7: Docs, env, follow-ups, ADR 0070 note

**Files:**
- Rewrite: `docs/connect-claude.md`
- Modify: `docs/DEPLOY.md`, `docs/HANDOFF.md`, `.env.example`, `README.md` (any `mcp:token` mention), `docs/open-follow-ups.md`, `docs/adr/0070-*.md`, `docs/mobile-pwa-checklist.md`

- [ ] **Step 1: `docs/connect-claude.md`.** Replace "Getting a token", the Claude Code `--header` instructions and the Desktop `mcp-remote` block with: **Connect from claude.ai or the phone app** (Settings → Connectors → Add custom connector → URL `https://<site>/api/mcp` → Connect → sign in to Teepee → Allow), **Claude Desktop** (same connector settings, no `mcp-remote`), **Claude Code** (`claude mcp add --transport http teepee https://<site>/api/mcp`, then `/mcp` to sign in). Add **Connected apps** (Account page; disconnect ends access at once; reconnect by adding it again) and **If it stops working** (disconnect, then connect again). Remove the "Operator: mint, list, revoke" section. Keep the capability lists and prompts section from the read pass. Plain punctuation.
- [ ] **Step 2: Deploy docs.** `DEPLOY.md` and `HANDOFF.md`: `BETTER_AUTH_SECRET` (or the existing `AUTH_SECRET`), the "everyone signs in again once" note, the migration order (`prisma migrate deploy` runs in the build as today; the Google-link copy is inside it), and that the Auth.js tables are dropped later (TC-13). `.env.example` already updated in Task 4 — check.
- [ ] **Step 3: Follow-ups.** Strike TC-06 (`~~…~~ **Done 2026-10-12** (spec 2026-10-12-tc-06, ADR 0071): …`). Add `TC-13 · Drop the Auth.js tables (Account, Session, VerificationToken) and the migration's Google-link copy once main has run on Better Auth for a release.` Add to `docs/mobile-pwa-checklist.md` a "Claude connection (2026-10-12)" line: connect on the phone app, run a read, disconnect in Connected apps, confirm it stops.
- [ ] **Step 4: ADR 0070:** append "Closed 2026-10-12 by ADR 0071." under Status.
- [ ] **Step 5:** `npx vitest run test/copy-style.test.ts`; commit `docs: connect Claude by sign-in; env and deploy notes; TC-06 done, TC-13 logged`.

---

## Branch finish (main session, once)

`npm test` + `npm run build` + `npm run test:integration` (local DB via the 127.0.0.1:5432 forward). Whole-branch review on the most capable model with a security lens (the one door, session hooks, OAuth token verification, consent CSRF, discovery metadata). Then finishing-a-development-branch: report and wait. Cam's manual check after deploy is in the spec.
