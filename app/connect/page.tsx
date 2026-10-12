import type { Metadata } from "next";
import { headers } from "next/headers";
import { authServer } from "@/lib/auth";
import { requireUser } from "@/lib/guards";
import { signedOAuthQuery, toSearchParams, type SearchParamsRecord } from "@/lib/oauth-continuation";
import { Card } from "@/components/ui/card";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect Claude" };

/** The asking client's public name, or null when there is no such (enabled) client. */
async function clientName(clientId: string): Promise<string | null> {
  try {
    const client = await authServer.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() });
    return client.client_name || "Claude";
  } catch {
    return null;
  }
}

/**
 * Claude's consent screen (ADR 0071, lib/auth.ts `consentPage`). The OAuth
 * provider sends a signed-in Traveller here with the authorise request in a
 * signed query, the first time a client asks. Allow or Cancel posts that query
 * back to /oauth2/consent, which redirects to Claude with a code or with
 * access_denied.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const traveller = await requireUser();
  const params = toSearchParams(await searchParams);
  const clientId = params.get("client_id");
  const oauthQuery = signedOAuthQuery(params);
  const name = clientId && oauthQuery ? await clientName(clientId) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card className="flex flex-col gap-4 p-6">
        {name && oauthQuery ? (
          <>
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]">
              {name} wants to access your trips as {traveller.name || traveller.email}
            </h1>
            <p className="text-sm text-muted-foreground">
              It will see and change exactly what you can. Everything it does shows in Activity, marked via Claude.
            </p>
            <ConsentForm oauthQuery={oauthQuery} />
          </>
        ) : (
          <h1 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.03em]">Nothing is asking to connect.</h1>
        )}
      </Card>
    </main>
  );
}
