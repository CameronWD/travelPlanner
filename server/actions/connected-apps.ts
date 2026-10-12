"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { authServer } from "@/lib/auth";
import { fail, ok, type ActionResult } from "@/lib/action-result";

/**
 * One app on the Traveller's **Connected apps** list (CONTEXT.md): today, a
 * **Claude connection**. `id` is the consent row's id, which is what
 * Disconnect takes back.
 *
 * `returnsTo` is the host of the client's first redirect URI. Anyone can
 * register a client and call it anything (open DCR), so the host is what
 * lets a Traveller tell their real Claude from something else, exactly as
 * the consent page shows it (app/connect/page.tsx).
 */
export interface ConnectedApp {
  id: string;
  clientName: string;
  returnsTo: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
}

function hostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}

/**
 * Every app this Traveller has allowed to act as them, newest first.
 *
 * "Last used" is the newest access token the app holds for this Traveller:
 * a token is issued on connect and on every refresh (about hourly while
 * Claude is in use), so it is when the app last came back for access. It is
 * null once none is left.
 */
export async function listConnectedApps(): Promise<ConnectedApp[]> {
  const user = await requireUser();

  const consents = await db.oauthConsent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientId: true,
      createdAt: true,
      client: { select: { name: true, redirectUris: true } },
    },
  });
  if (consents.length === 0) return [];

  const used = await db.oauthAccessToken.groupBy({
    by: ["clientId"],
    where: { userId: user.id, clientId: { in: consents.map((c) => c.clientId) } },
    _max: { createdAt: true },
  });
  const lastUsed = new Map(used.map((u) => [u.clientId, u._max.createdAt]));

  return consents.map((c) => ({
    id: c.id,
    clientName: c.client.name?.trim() || "An app",
    returnsTo: hostOf(c.client.redirectUris[0]),
    // The provider always stamps createdAt on a consent; the column is only
    // nullable because its schema says so.
    connectedAt: (c.createdAt ?? new Date(0)).toISOString(),
    lastUsedAt: lastUsed.get(c.clientId)?.toISOString() ?? null,
  }));
}

/**
 * Disconnect one app (CONTEXT.md **Connected apps**): its access ends at
 * once and it has to ask again. Deletes this Traveller's refresh tokens,
 * access tokens and consent for that app (lib/auth-mcp-access.ts,
 * `disconnectMcpClient`), so the next /api/mcp call with an old access
 * token gets a 401 and the old refresh token is refused.
 *
 * Takes the consent id from `listConnectedApps`. One that is not this
 * Traveller's answers not found, the same as one that does not exist.
 */
export async function disconnectApp(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const consent = await db.oauthConsent.findFirst({
    where: { id, userId: user.id },
    select: { clientId: true },
  });
  if (!consent) notFound();

  try {
    await authServer.api.disconnectMcpClient({ body: { userId: user.id, clientId: consent.clientId } });
    revalidatePath("/account");
    return ok();
  } catch (err) {
    console.error("[disconnectApp] failed to disconnect an app:", err);
    return fail({ _: ["Couldn't disconnect that app. Try again."] });
  }
}
