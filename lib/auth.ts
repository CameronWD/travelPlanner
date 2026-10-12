import "server-only";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { magicLink, jwt } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { mcp } from "@better-auth/mcp";
import { db } from "@/lib/db";
import { withBetterAuthLists } from "@/lib/auth-prisma";
import { siteUrl } from "@/lib/site-url";
import { decideSignIn, type DoorMethod } from "@/lib/sign-in-door";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { renderSignInEmail } from "@/lib/sign-in-email";
import { sendMail } from "@/lib/mail";
import { devLogin } from "@/lib/auth-dev-login";

/**
 * Sign-in on Better Auth (ADR 0071). Every door registers only when its env
 * is set, so the app runs locally without real credentials:
 *   - Google only when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set.
 *   - Sign-in link (magic link) only when AUTH_RESEND_KEY + AUTH_RESEND_FROM are set.
 *   - Dev login only when ALLOW_DEV_LOGIN === "true" and never in production.
 *
 * Who may sign in is decided in ONE place, lib/sign-in-door.ts (ADR 0057).
 * The hooks below only translate its decision into each Better Auth seam:
 *   - user.validateUserInfo runs before a User row is created, before Google
 *     is linked onto an existing User, and on every returning Google sign-in,
 *     so a refused or unverified Google profile, or a refused new link user,
 *     never gets a User row.
 *   - databaseHooks.session.create.before runs on EVERY sign-in, so a
 *     Traveller whose allowlist entry was revoked is refused on their next
 *     sign-in by link too, which validateUserInfo does not re-check.
 *   - the magic link's sendMagicLink runs the door's SEND pass.
 */

const base = siteUrl();
/** The protected resource Claude's access tokens are bound to (RFC 8707). */
export const MCP_RESOURCE = `${base}/api/mcp`;

/** The code a refused sign-in carries back to the Landing (?error=AccessDenied). */
const ACCESS_DENIED = { error: "AccessDenied" } as const;

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const resendKey = process.env.AUTH_RESEND_KEY;
const resendFrom = process.env.AUTH_RESEND_FROM;
const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";

export const authServer = betterAuth({
  baseURL: base,
  basePath: "/api/auth",
  // BETTER_AUTH_SECRET, falling back to AUTH_SECRET so today's deploy var keeps working.
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  // Through lib/auth-prisma.ts: Better Auth's nullable list columns (OAuth
  // scopes and resources) on Prisma's Postgres scalar lists.
  database: prismaAdapter(withBetterAuthLists(db), { provider: "postgresql" }),
  session: { modelName: "authSession", cookieCache: { enabled: true, maxAge: 5 * 60 } },
  account: {
    modelName: "authAccount",
    // A Traveller who first came in by Sign-in link and later presses the
    // Google button lands in the same account (spec 2026-10-01 §B2). Trusting
    // Google by address is safe only because the door refuses any Google
    // profile whose email is not verified (validateUserInfo below runs on
    // link-account too). OAuth tokens are NOT encrypted: the migration copied
    // Auth.js's Google tokens across in plaintext.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  verification: { modelName: "authVerification" },
  user: {
    modelName: "user",
    validateUserInfo: async ({ user, source }) => {
      let method: DoorMethod;
      if (source.method === "oauth") method = "google";
      else if (source.method === "magic-link") method = "magic-link";
      // Fail closed: this app offers no other way to create or link a User
      // (dev login only ever signs an existing User in).
      else return ACCESS_DENIED;
      const decision = await decideSignIn({
        email: user.email,
        method,
        // A Google sign-in has one pass, and a magic-link User is only ever
        // created on the click pass, after the token proved the mailbox.
        pass: "sign-in",
        profile: source.oauth?.profile ?? null,
      });
      return decision.allow ? undefined : ACCESS_DENIED;
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, ctx) => {
          // Runs the door a second time on a sign-in validateUserInfo already
          // admitted (a new User, or any Google sign-in). That is safe:
          // admitByTripInvite is idempotent (`created` is false the second
          // time) and admins are notified only when a row was created. The
          // Google profile check already ran in validateUserInfo, so this pass
          // asks as "magic-link" (no profile needed), except for dev login.
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          const decision = await decideSignIn({
            email: user?.email,
            method: ctx?.path === "/dev-login" ? "dev-login" : "magic-link",
            pass: "sign-in",
          });
          // false cancels the session (Review Focus 1).
          return decision.allow;
        },
        after: async (session) => {
          // Today's events.signIn: invited partners join their Trips on sign-in.
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          if (user?.email) await acceptPendingInvitesForUser(session.userId, user.email);
        },
      },
    },
  },
  socialProviders: googleConfigured
    ? { google: { clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! } }
    : {},
  // Every error, a refused sign-in included, lands on the Landing ("/"),
  // which renders its own denied panel for ?error=AccessDenied.
  onAPIError: { errorURL: "/" },
  plugins: [
    ...(resendKey && resendFrom
      ? [
          magicLink({
            expiresIn: 60 * 60,
            sendMagicLink: async ({ email, url }) => {
              // The send pass is not an oracle (ADR 0057): a refused address
              // gets no mail and exactly the response an accepted one gets.
              const decision = await decideSignIn({ email, method: "magic-link", pass: "send" });
              if (!decision.allow) return;
              const result = await sendMail(
                { to: email, ...renderSignInEmail({ url }) },
                { AUTH_RESEND_KEY: resendKey, AUTH_RESEND_FROM: resendFrom },
              );
              // The endpoint reports a failed send only if this throws.
              if (!result.sent) throw new Error(result.error);
            },
          }),
        ]
      : []),
    ...(devLoginEnabled ? [devLogin()] : []),
    jwt(),
    mcp({ loginPage: "/", consentPage: "/connect", resource: MCP_RESOURCE }),
    nextCookies(), // must be last
  ],
});

export type SessionUser = { id: string; email: string; name: string | null; image: string | null };

/** Today's shape, so guards, layouts and the tests that mock this module are unchanged. */
export async function auth(): Promise<{ user: SessionUser } | null> {
  const session = await authServer.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const { id, email, name, image } = session.user;
  return { user: { id, email, name: name ?? null, image: image ?? null } };
}
