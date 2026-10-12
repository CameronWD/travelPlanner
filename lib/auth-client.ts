"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/** The browser's Better Auth client (sign in, sign out, the OAuth consent screen). */
export const authClient = createAuthClient({ plugins: [magicLinkClient(), oauthProviderClient()] });
