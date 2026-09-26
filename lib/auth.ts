import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { acceptPendingInvitesForUser } from "@/lib/invites";
import { isAllowedEmail, hasPendingTripInvite, admitByTripInvite } from "@/lib/allowlist";
import { recordAccessRequest } from "@/lib/access-requests";
import { notifyAdmins } from "@/lib/admin-notify";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Providers are built conditionally so the app runs locally without real
 * OAuth credentials:
 *   - Google only when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set.
 *   - A dev-only Credentials "dev login" only when ALLOW_DEV_LOGIN === "true".
 *
 * We use the JWT session strategy (not the adapter's database sessions): this
 * is required for the Credentials provider to work alongside the Prisma
 * adapter, and we still get DB-backed users/accounts from the adapter.
 */
const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

// Dev login is a passwordless sign-in-as-anyone door. The env var opts in,
// and a production build hard-refuses regardless — copying a repo with
// ALLOW_DEV_LOGIN in its .env to a host must never re-open it.
if (process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
  providers.push(
    // DEV ONLY. No password — this looks up a seeded user by email and signs
    // them in for local development. Never enable ALLOW_DEV_LOGIN in prod.
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : null;
        if (!email) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  // Trust the deployment host's forwarded headers (X-Forwarded-Host/Proto) so
  // OAuth callback URLs are correct behind Vercel's proxy.
  trustHost: true,
  session: { strategy: "jwt" },
  // BOTH keys point at /signin, not just `signIn`. `AccessDenied` (thrown
  // when the callback below returns false) extends AuthError directly and
  // carries no `kind: "signIn"`, so Auth.js resolves it against
  // `pages.error` — never `pages.signIn` — and without this key it redirects
  // to Auth.js's own unbranded /api/auth/error, past the explanatory card
  // app/signin/page.tsx renders for exactly this case. /signin already
  // ignores any error value other than "AccessDenied", so routing every
  // error here is safe.
  pages: { signIn: "/signin", error: "/signin" },
  providers,
  callbacks: {
    /**
     * The rollout gate (ADR 0057). Nothing else in the repo decides who may
     * sign in — this callback is the one door. It runs BEFORE sign-in
     * completes; returning false rejects it and no User row is created. (The
     * `events.signIn` hook below runs only AFTER a successful sign-in and
     * cannot block one — leave it alone.)
     */
    async signIn({ user, account, profile }) {
      // The dev-login provider is already unregistrable in production
      // (lib/auth.ts:35 — ALLOW_DEV_LOGIN *and* NODE_ENV !== "production"),
      // so this NODE_ENV check is belt-and-braces: a future refactor of the
      // provider list can't silently reopen a production dev-login door
      // through this callback alone. Auth.js runs this callback for EVERY
      // provider.
      if (account?.provider === "dev-login") {
        return process.env.NODE_ENV !== "production";
      }

      const email = user.email;
      if (!email) return false;

      // Fail-closed by construction: every OTHER provider — today just
      // Google, but any future one too — must present a verified email
      // rather than being trusted by default. Auth.js's own guidance for
      // this callback is to enforce verification rather than assume it.
      if (profile?.email_verified !== true) return false;

      if (await isAllowedEmail(email)) return true;

      if (await hasPendingTripInvite(email)) {
        // Admission by Invite is otherwise a one-shot ticket: the Invite
        // gets marked accepted moments after this (events.signIn below, and
        // app/(app)/layout.tsx again on every load), so a second
        // hasPendingTripInvite check for the same address would come back
        // false — locking out anyone whose session lapses or who signs out.
        // Promote them into the durable allowlist instead (lib/allowlist.ts,
        // admitByTripInvite).
        const { created } = await admitByTripInvite(email);
        if (created) {
          // Admission by Invite is transitive — anyone admitted can create a
          // Trip and invite others — which the operator has accepted on
          // condition that growth is visible rather than silent. Fire once,
          // on the admission that actually created the AllowedEmail row, not
          // on every subsequent sign-in. notifyAdmins never throws (see its
          // own doc comment), so awaiting it here cannot fail this sign-in.
          await notifyAdmins(
            "New Traveller joined by invitation",
            `${email} was admitted to Teepee via a Trip Invite.`,
            "/admin",
          );
        }
        return true;
      }

      // Refused: record (or bump) the Access request from Google's verified
      // profile, then decline. recordAccessRequest never throws — a failure
      // to record it must not turn this clean refusal into a 500.
      await recordAccessRequest({
        email,
        name: profile?.name ?? null,
        image: profile?.picture ?? null,
      });
      return false;
    },
    jwt({ token, user }) {
      // On sign-in, persist the DB user id onto the token.
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  events: {
    /**
     * Fires after a successful sign-in. We use it to auto-accept any pending
     * trip invites for this user's email so invited partners join immediately
     * on first sign-in.
     */
    async signIn({ user }) {
      if (user.id && user.email) {
        await acceptPendingInvitesForUser(user.id, user.email);
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
