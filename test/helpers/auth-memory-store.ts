/**
 * An in-memory database for Better Auth in unit tests: lib/auth/auth.ts's
 * prismaAdapter is mocked to `memoryAdapter(store)` so the real instance can
 * initialise (the MCP OAuth provider seeds its resource on init) and serve
 * requests without Postgres. Keys are the Prisma client's model names that
 * lib/auth/auth.ts and its plugins use.
 */
const AUTH_MODELS = [
  "user",
  "authSession",
  "authAccount",
  "authVerification",
  "jwks",
  "oauthClient",
  "oauthResource",
  "oauthClientResource",
  "oauthAccessToken",
  "oauthRefreshToken",
  "oauthConsent",
  "oauthClientAssertion",
] as const;

export type AuthMemoryStore = Record<string, Record<string, unknown>[]>;

/** Empties every model in place (the store object itself is shared with the adapter). */
export function resetAuthMemoryStore(store: AuthMemoryStore): AuthMemoryStore {
  for (const k of Object.keys(store)) delete store[k];
  for (const model of AUTH_MODELS) store[model] = [];
  return store;
}
