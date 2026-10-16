import type { PrismaClient } from "@prisma/client";

/**
 * Better Auth's OAuth provider stores some optional string-list columns and
 * gives `null` a meaning distinct from an empty list: a client with
 * `scopes: null` falls back to the provider's scopes, and a resource with
 * `allowedScopes: null` is unrestricted, while `[]` would allow nothing.
 * Prisma's Postgres scalar lists (`String[]`) cannot carry that difference:
 * Prisma refuses `null` in a write (so the provider's resource seed on boot
 * throws and every /api/auth request fails), and it reads a NULL column back
 * as `[]`.
 *
 * So, for the nullable list columns only, the Prisma client lib/auth/auth.ts hands
 * to Better Auth writes `null` as an empty list and reads an empty list back
 * as `null`. Nothing in this app stores a deliberately empty list in these
 * columns. `OauthClient.clientCredentialsScopes` is required and treats `[]`
 * as "none", so it is left alone.
 *
 * Keep in step with prisma/schema.prisma (lib/auth/prisma.test.ts checks).
 */
export const NULLABLE_LIST_FIELDS: Record<string, readonly string[]> = {
  OauthClient: ["scopes", "contacts", "redirectUris", "postLogoutRedirectUris", "grantTypes", "responseTypes"],
  OauthResource: ["allowedScopes"],
  OauthRefreshToken: ["resources", "requestedUserInfoClaims", "scopes"],
  OauthAccessToken: ["resources", "requestedUserInfoClaims", "scopes"],
  OauthConsent: ["resources", "requestedUserInfoClaims", "scopes"],
};

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

function nullListsToEmpty(data: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(data)) return data.map((d) => nullListsToEmpty(d, fields));
  if (!isRow(data)) return data;
  const out: Row = { ...data };
  for (const f of fields) if (out[f] === null) out[f] = [];
  return out;
}

function emptyListsToNull(result: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(result)) return result.map((r) => emptyListsToNull(r, fields));
  if (!isRow(result)) return result;
  const out: Row = { ...result };
  for (const f of fields) if (Array.isArray(out[f]) && (out[f] as unknown[]).length === 0) out[f] = null;
  return out;
}

/** Rewrites one Prisma operation's args for `model` (exported for tests). */
export function rewriteArgs(model: string, args: unknown): unknown {
  const fields = NULLABLE_LIST_FIELDS[model];
  if (!fields || !isRow(args)) return args;
  const out: Row = { ...args };
  for (const key of ["data", "create", "update"] as const) {
    if (key in out) out[key] = nullListsToEmpty(out[key], fields);
  }
  return out;
}

/** Rewrites one Prisma operation's result for `model` (exported for tests). */
export function rewriteResult(model: string, result: unknown): unknown {
  const fields = NULLABLE_LIST_FIELDS[model];
  return fields ? emptyListsToNull(result, fields) : result;
}

/** The Prisma client Better Auth's adapter is given. */
export function withBetterAuthLists(db: PrismaClient) {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          return rewriteResult(model, await query(rewriteArgs(model, args) as typeof args));
        },
      },
    },
  });
}
