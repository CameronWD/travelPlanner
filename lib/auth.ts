import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { acceptPendingInvitesForUser } from "@/lib/invites";

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

if (process.env.ALLOW_DEV_LOGIN === "true") {
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
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
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
