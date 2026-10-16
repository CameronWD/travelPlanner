import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";

/**
 * DEV ONLY. A passwordless "sign in as anyone" door for local development:
 * it looks up an existing (seeded) User by email and signs them in. It never
 * creates a User.
 *
 * lib/auth/auth.ts registers it only when ALLOW_DEV_LOGIN === "true" and
 * NODE_ENV !== "production", so copying a repo with ALLOW_DEV_LOGIN in its
 * .env to a host must never re-open it. The NODE_ENV check below is
 * belt-and-braces, and the session hook in lib/auth/auth.ts runs the one door
 * (lib/auth/sign-in-door.ts) as "dev-login", which refuses in production too.
 */
export function devLogin() {
  return {
    id: "dev-login",
    endpoints: {
      devLogin: createAuthEndpoint(
        "/dev-login",
        { method: "POST", body: z.object({ email: z.string() }) },
        async (ctx) => {
          if (process.env.NODE_ENV === "production") throw new APIError("FORBIDDEN");
          const email = ctx.body.email.trim().toLowerCase();
          const found = email ? await ctx.context.internalAdapter.findUserByEmail(email) : null;
          if (!found) throw new APIError("UNAUTHORIZED");
          // null when databaseHooks.session.create.before refuses.
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          if (!session) throw new APIError("FORBIDDEN");
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
