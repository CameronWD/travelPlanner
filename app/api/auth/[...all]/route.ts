import { toNextJsHandler } from "better-auth/next-js";
import { authServer } from "@/lib/auth";

// Every Better Auth endpoint under /api/auth (Google's callback stays at
// /api/auth/callback/google).
export const { GET, POST } = toNextJsHandler(authServer);
