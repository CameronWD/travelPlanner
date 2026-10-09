/**
 * The Traveller a Claude connection acts as, for the duration of one
 * /api/mcp request (spec 2026-10-09). requireUser() consults this before
 * auth(), so every server action called by an MCP tool runs the same guards
 * as the app, as this Traveller.
 *
 * NEVER add "use server" to this module: that would publish runAsTraveller
 * as a callable server action. Only app/api/mcp/route.ts may call
 * runAsTraveller, and only after verifying a token
 * (lib/mcp/acting-traveller-imports.test.ts enforces the importer list).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ActingUser } from "./tokens";

export const ACTIVITY_SOURCE_CLAUDE = "CLAUDE" as const;

const store = new AsyncLocalStorage<ActingUser>();

export function runAsTraveller<T>(user: ActingUser, fn: () => Promise<T>): Promise<T> {
  return store.run(user, fn);
}

export function getActingTraveller(): ActingUser | null {
  return store.getStore() ?? null;
}

export function currentActivitySource(): typeof ACTIVITY_SOURCE_CLAUDE | null {
  return store.getStore() ? ACTIVITY_SOURCE_CLAUDE : null;
}
